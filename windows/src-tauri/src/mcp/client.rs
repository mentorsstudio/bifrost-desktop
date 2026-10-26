// The MCP client: one live connection per configured server, opened on first
// use and kept until its configuration changes or it closes.

use std::collections::HashMap;
use std::process::Stdio;
use std::time::Duration;

use rmcp::model::{CallToolRequestParams, CallToolResult, ContentBlock};
use rmcp::service::RunningService;
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::{StreamableHttpClientTransport, TokioChildProcess};
use rmcp::{RoleClient, ServiceExt};
use serde::Serialize;
use serde_json::{Map, Value};
use tokio::sync::Mutex;

use super::config::McpServer;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const CALL_TIMEOUT: Duration = Duration::from_secs(120);

type Client = RunningService<RoleClient, ()>;

struct Conn {
    config: McpServer,
    token: Option<String>,
    client: Client,
}

/// The connections, by server name. Managed by Tauri as app state.
#[derive(Default)]
pub struct Manager {
    conns: Mutex<HashMap<String, Conn>>,
}

/// A tool as the settings show it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
}

/// Opens a connection to `config`. `token` is the bearer for a remote server.
pub async fn connect(config: &McpServer, token: Option<&str>) -> Result<Client, String> {
    config.validate()?;
    let fut = async {
        match config {
            McpServer::Stdio { command, args, env, .. } => {
                let mut cmd = tokio::process::Command::new(command);
                cmd.args(args).envs(env).kill_on_drop(true);
                #[cfg(windows)]
                {
                    // CREATE_NO_WINDOW: no console flashing up for the server.
                    cmd.creation_flags(0x0800_0000);
                }
                let (transport, _stderr) = TokioChildProcess::builder(cmd)
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| format!("não foi possível iniciar {command}: {e}"))?;
                ().serve(transport).await.map_err(|e| format!("falha ao inicializar: {e}"))
            }
            McpServer::Http { url, headers, .. } => {
                let mut cfg = StreamableHttpClientTransportConfig::with_uri(url.trim().to_string());
                cfg.auth_header = token.map(str::to_string);
                for (k, v) in headers {
                    let name = reqwest::header::HeaderName::from_bytes(k.as_bytes())
                        .map_err(|_| format!("cabeçalho inválido: {k}"))?;
                    let value = reqwest::header::HeaderValue::from_str(v)
                        .map_err(|_| format!("valor inválido no cabeçalho {k}"))?;
                    cfg.custom_headers.insert(name, value);
                }
                let transport = StreamableHttpClientTransport::from_config(cfg);
                ().serve(transport).await.map_err(|e| format!("falha ao conectar: {e}"))
            }
        }
    };
    tokio::time::timeout(CONNECT_TIMEOUT, fut)
        .await
        .map_err(|_| "tempo esgotado ao conectar".to_string())?
}

pub async fn list_tools_of(client: &Client) -> Result<Vec<ToolInfo>, String> {
    let tools = client.list_all_tools().await.map_err(|e| e.to_string())?;
    Ok(tools
        .into_iter()
        .map(|t| ToolInfo {
            name: t.name.to_string(),
            description: t.description.map(|d| d.to_string()).unwrap_or_default(),
        })
        .collect())
}

impl Manager {
    /// Runs `f` with the live connection to `name`, opening it if needed.
    async fn with_client<T>(
        &self,
        name: &str,
        config: &McpServer,
        f: impl AsyncFnOnce(&Client) -> Result<T, String>,
    ) -> Result<T, String> {
        if config.disabled() {
            return Err(format!("o servidor {name} está desativado"));
        }
        let token = crate::secrets::get_mcp_token(name);
        let mut conns = self.conns.lock().await;
        let stale = match conns.get(name) {
            Some(c) => c.config != *config || c.token != token || c.client.is_closed(),
            None => true,
        };
        if stale {
            if let Some(old) = conns.remove(name) {
                let _ = old.client.cancel().await;
            }
            let client = connect(config, token.as_deref()).await?;
            conns.insert(name.to_string(), Conn { config: config.clone(), token, client });
        }
        let client = &conns.get(name).expect("just inserted").client;
        let out = f(client).await;
        if out.is_err() && client.is_closed() {
            conns.remove(name);
        }
        out
    }

    pub async fn list_tools(&self, name: &str, config: &McpServer) -> Result<Vec<ToolInfo>, String> {
        self.with_client(name, config, async |c| list_tools_of(c).await).await
    }

    pub async fn call_tool(
        &self,
        name: &str,
        config: &McpServer,
        tool: &str,
        args: Map<String, Value>,
    ) -> Result<CallToolResult, String> {
        let tool = tool.to_string();
        self.with_client(name, config, async move |c| {
            let params = CallToolRequestParams::new(tool).with_arguments(args);
            tokio::time::timeout(CALL_TIMEOUT, c.call_tool(params))
                .await
                .map_err(|_| "a ferramenta não respondeu a tempo".to_string())?
                .map_err(|e| e.to_string())
        })
        .await
    }

    /// Forgets a connection (its server was edited or removed).
    pub async fn drop_conn(&self, name: &str) {
        if let Some(old) = self.conns.lock().await.remove(name) {
            let _ = old.client.cancel().await;
        }
    }
}

/// Settings → "Testar": a fresh connection, its tools, then closed.
pub async fn test(config: &McpServer, token: Option<&str>) -> Result<Vec<ToolInfo>, String> {
    let client = connect(config, token).await?;
    let tools = list_tools_of(&client).await;
    let _ = client.cancel().await;
    tools
}

/// The text of a tool result: its text blocks joined, or its structured content.
pub fn result_text(result: &CallToolResult) -> String {
    let texts: Vec<String> = result
        .content
        .iter()
        .filter_map(|b: &ContentBlock| match b {
            ContentBlock::Text(t) => Some(t.text.clone()),
            _ => None,
        })
        .collect();
    if !texts.is_empty() {
        return texts.join("\n");
    }
    result.structured_content.as_ref().map(|v| v.to_string()).unwrap_or_default()
}

pub fn is_error(result: &CallToolResult) -> bool {
    result.is_error.unwrap_or(false)
}
