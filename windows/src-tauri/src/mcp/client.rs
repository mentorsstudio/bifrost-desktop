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

/// The secret stored for a remote server: a bearer token, or a whole
/// `Basic <base64>` value (servers behind a reverse proxy's basic auth).
#[derive(Debug, PartialEq)]
pub enum Auth {
    Bearer(String),
    Basic(String),
}

impl Auth {
    pub fn from_secret(secret: &str) -> Auth {
        let s = secret.trim();
        match s.get(..6) {
            Some(p) if p.eq_ignore_ascii_case("basic ") => Auth::Basic(format!("Basic {}", s[6..].trim())),
            _ => Auth::Bearer(s.strip_prefix("Bearer ").unwrap_or(s).to_string()),
        }
    }
}

/// `user:password` → the `Basic <base64>` value kept in the credential store.
pub fn basic_value(user: &str, password: &str) -> String {
    use base64::Engine;
    format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(format!("{user}:{password}")))
}

/// rmcp refuses `Authorization` as a custom header, so Basic auth rides as a
/// default header of the HTTP client. No redirects: the header must not travel.
fn basic_client(value: &str) -> Result<reqwest_mcp::Client, String> {
    let mut v = reqwest_mcp::header::HeaderValue::from_str(value).map_err(|_| "credencial inválida".to_string())?;
    v.set_sensitive(true);
    let mut headers = reqwest_mcp::header::HeaderMap::new();
    headers.insert(reqwest_mcp::header::AUTHORIZATION, v);
    reqwest_mcp::Client::builder()
        .default_headers(headers)
        .redirect(reqwest_mcp::redirect::Policy::none())
        .pool_max_idle_per_host(0)
        .build()
        .map_err(|e| e.to_string())
}

/// Opens a connection to `config`. `token` is the bearer for a remote server.
pub async fn connect(config: &McpServer, token: Option<&str>) -> Result<Client, String> {
    config.validate()?;
    let fut = async {
        match config {
            McpServer::Stdio { command, args, env, .. } => {
                if crate::mcp::config::missing_command(command) {
                    return Err(format!("programa não encontrado: {command} — confira o caminho ou desative este servidor"));
                }
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
                let auth = token.map(Auth::from_secret);
                if let Some(Auth::Bearer(t)) = &auth {
                    cfg.auth_header = Some(t.clone());
                }
                for (k, v) in headers {
                    let name = reqwest::header::HeaderName::from_bytes(k.as_bytes())
                        .map_err(|_| format!("cabeçalho inválido: {k}"))?;
                    let value = reqwest::header::HeaderValue::from_str(v)
                        .map_err(|_| format!("valor inválido no cabeçalho {k}"))?;
                    cfg.custom_headers.insert(name, value);
                }
                let transport = match auth {
                    Some(Auth::Basic(value)) => {
                        let client = basic_client(&value)?;
                        StreamableHttpClientTransport::with_client(client, cfg)
                    }
                    _ => StreamableHttpClientTransport::from_config(cfg),
                };
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

#[cfg(test)]
mod tests {
    use super::{basic_value, Auth};

    #[test]
    fn basic_and_bearer_secrets() {
        assert_eq!(basic_value("u", "p"), "Basic dTpw");
        assert_eq!(Auth::from_secret("Basic dTpw"), Auth::Basic("Basic dTpw".into()));
        assert_eq!(Auth::from_secret("basic  dTpw"), Auth::Basic("Basic dTpw".into()));
        assert_eq!(Auth::from_secret("abc"), Auth::Bearer("abc".into()));
        assert_eq!(Auth::from_secret("Bearer abc"), Auth::Bearer("abc".into()));
        assert!(super::basic_client("Basic dTpw").is_ok());
    }

    /// End to end against real servers behind basic auth. Run by hand:
    /// MCP_E2E_URLS="https://a/mcp https://b/mcp" MCP_E2E_BASIC_FILE=<user:pass file>
    /// cargo test e2e_basic -- --ignored --nocapture. Prints tool names only.
    #[test]
    #[ignore]
    fn e2e_basic_auth_tools_list() {
        let file = std::env::var("MCP_E2E_BASIC_FILE").expect("MCP_E2E_BASIC_FILE");
        let raw = std::fs::read_to_string(file).unwrap();
        let (user, pass) = raw.trim().split_once(':').expect("user:pass");
        let secret = basic_value(user, pass);
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        for url in std::env::var("MCP_E2E_URLS").unwrap().split_whitespace() {
            let cfg = crate::mcp::McpServer::Http { url: url.into(), headers: Default::default(), disabled: false };
            let tools = rt.block_on(super::test(&cfg, Some(&secret))).unwrap_or_else(|e| panic!("{url}: {e}"));
            let names: Vec<_> = tools.iter().map(|t| t.name.as_str()).collect();
            println!("{url} -> {names:?}");
        }
    }
}
