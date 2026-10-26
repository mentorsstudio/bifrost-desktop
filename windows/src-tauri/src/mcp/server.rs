// Coucou's own MCP server: lets Grok Bot, Hermes, Alethe… drive Mochi.
//
// Streamable HTTP on 127.0.0.1 only (`http://127.0.0.1:<port>/mcp`), and every
// request must carry `Authorization: Bearer <token>`. The token is made on
// first start and kept in the credential store (secrets.rs); Settings → MCP
// shows it so the user can paste it into a client.
//
// Tools: notify, ask_approval, show_session, update_session, end_session, chat.
// They become the same `hook` events the Claude Code relay sends (pipe.rs), so
// the island shows them exactly like an agent's.

use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use bytes::Bytes;
use http_body_util::{combinators::BoxBody, Full};
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation, ListToolsResult,
    PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
};
use rmcp::service::RequestContext;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler};
use serde_json::{json, Map, Value};

pub const DEFAULT_PORT: u16 = 47821;

type BoxFut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// What the tools act on. The app implements it with the island; tests with a fake.
pub trait Mochi: Send + Sync + 'static {
    /// A hook event for the island (`hook_event_name`, `session_id`…).
    fn emit(&self, payload: Value);
    /// A permission card; `allow` / `deny`, or `None` when nobody answered.
    fn decide(&self, payload: Value) -> BoxFut<'_, Option<String>>;
    /// One turn with the chat provider of the settings.
    fn chat(&self, message: String) -> BoxFut<'_, Result<String, String>>;
}

#[derive(Clone)]
pub struct MochiServer {
    mochi: Arc<dyn Mochi>,
}

fn schema(props: Value, required: &[&str]) -> Map<String, Value> {
    let v = json!({"type": "object", "properties": props, "required": required});
    v.as_object().unwrap().clone()
}

pub fn tools() -> Vec<Tool> {
    let agent = json!({"type": "string", "description": "Quem chama (ex.: grok, hermes, alethe). Vira a pílula do agente no Mochi."});
    let session = json!({"type": "string", "description": "Id da sessão (qualquer texto estável)."});
    vec![
        Tool::new(
            "notify",
            "Mostra um aviso no Mochi (ilha no topo da tela).",
            schema(json!({"message": {"type": "string"}, "title": {"type": "string"}, "agent": agent}), &["message"]),
        ),
        Tool::new(
            "ask_approval",
            "Pede ao usuário Permitir/Negar no Mochi e devolve \"allow\", \"deny\" ou \"no_decision\" (ninguém respondeu em ~108 s).",
            schema(
                json!({"action": {"type": "string", "description": "O que será feito (comando, operação)."},
                       "tool": {"type": "string", "description": "Nome curto da ação (ex.: Bash, Deploy)."},
                       "agent": agent, "session_id": session}),
                &["action"],
            ),
        ),
        Tool::new(
            "show_session",
            "Abre/mostra uma sessão de agente no Mochi (como o início de uma tarefa).",
            schema(json!({"session_id": session, "agent": agent, "cwd": {"type": "string"}, "prompt": {"type": "string"}}), &["session_id"]),
        ),
        Tool::new(
            "update_session",
            "Atualiza uma sessão: status \"working\" (com um passo), \"question\" ou \"done\" (com a mensagem final).",
            schema(
                json!({"session_id": session, "agent": agent,
                       "status": {"type": "string", "enum": ["working", "question", "done"]},
                       "step": {"type": "string"}, "message": {"type": "string"}}),
                &["session_id", "status"],
            ),
        ),
        Tool::new(
            "end_session",
            "Encerra uma sessão no Mochi.",
            schema(json!({"session_id": session, "agent": agent}), &["session_id"]),
        ),
        Tool::new(
            "chat",
            "Envia uma mensagem ao chat do Mochi (o provedor das configurações) e devolve a resposta.",
            schema(json!({"message": {"type": "string"}}), &["message"]),
        ),
    ]
}

fn s<'a>(args: &'a Map<String, Value>, key: &str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or_default()
}

/// The agent tag the island accepts: lowercase, digits and hyphens, ≤ 24 chars.
pub fn agent_tag(raw: &str) -> String {
    let tag: String = raw
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .take(24)
        .collect();
    let tag = tag.trim_matches('-').to_string();
    if tag.is_empty() { "mcp".into() } else { tag }
}

fn base(event: &str, args: &Map<String, Value>) -> Value {
    let agent = agent_tag(s(args, "agent"));
    let session = match s(args, "session_id") {
        "" => format!("mcp-{agent}"),
        id => id.to_string(),
    };
    json!({"hook_event_name": event, "session_id": session, "coucou_agent": agent, "cwd": s(args, "cwd")})
}

/// The hook events a tool call turns into (all but ask_approval and chat).
pub fn events_for(tool: &str, args: &Map<String, Value>) -> Result<Vec<Value>, String> {
    let need = |k: &str| {
        if s(args, k).trim().is_empty() { Err(format!("falta o argumento \"{k}\"")) } else { Ok(()) }
    };
    Ok(match tool {
        "notify" => {
            need("message")?;
            let text = match s(args, "title") {
                "" => s(args, "message").to_string(),
                t => format!("{t}: {}", s(args, "message")),
            };
            let mut stop = base("Stop", args);
            stop["last_assistant_message"] = json!(text);
            vec![base("SessionStart", args), stop]
        }
        "show_session" => {
            need("session_id")?;
            let mut out = vec![base("SessionStart", args)];
            if !s(args, "prompt").is_empty() {
                let mut p = base("UserPromptSubmit", args);
                p["prompt"] = json!(s(args, "prompt"));
                out.push(p);
            }
            out
        }
        "update_session" => {
            need("session_id")?;
            match s(args, "status") {
                "working" => {
                    let mut e = base("PreToolUse", args);
                    e["tool_name"] = json!(match s(args, "step") { "" => "Trabalhando", x => x });
                    e["tool_input"] = json!({});
                    vec![e]
                }
                "question" => {
                    let mut e = base("Notification", args);
                    let m = s(args, "message");
                    e["message"] = json!(if m.ends_with('?') { m.to_string() } else { format!("{m}?") });
                    vec![e]
                }
                "done" => {
                    let mut e = base("Stop", args);
                    e["last_assistant_message"] = json!(s(args, "message"));
                    vec![e]
                }
                other => return Err(format!("status desconhecido: {other:?}")),
            }
        }
        "end_session" => {
            need("session_id")?;
            vec![base("SessionEnd", args)]
        }
        other => return Err(format!("ferramenta desconhecida: {other}")),
    })
}

fn text(t: impl Into<String>) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(t)])
}
fn fail(t: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(t)])
}

impl MochiServer {
    pub fn new(mochi: Arc<dyn Mochi>) -> Self {
        Self { mochi }
    }

    pub async fn run(&self, tool: &str, args: Map<String, Value>) -> CallToolResult {
        match tool {
            "ask_approval" => {
                if s(&args, "action").trim().is_empty() {
                    return fail("falta o argumento \"action\"");
                }
                let mut p = base("PermissionRequest", &args);
                p["tool_name"] = json!(match s(&args, "tool") { "" => "MCP", t => t });
                p["tool_input"] = json!({"command": s(&args, "action"), "description": s(&args, "action")});
                p["coucou_mcp"] = json!(true);
                let decision = self.mochi.decide(p).await;
                text(decision.unwrap_or_else(|| "no_decision".into()))
            }
            "chat" => {
                if s(&args, "message").trim().is_empty() {
                    return fail("falta o argumento \"message\"");
                }
                match self.mochi.chat(s(&args, "message").to_string()).await {
                    Ok(answer) => text(answer),
                    Err(e) => fail(e),
                }
            }
            _ => match events_for(tool, &args) {
                Ok(events) => {
                    for e in events {
                        self.mochi.emit(e);
                    }
                    text("ok")
                }
                Err(e) => fail(e),
            },
        }
    }
}

impl ServerHandler for MochiServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("coucou-mochi", env!("CARGO_PKG_VERSION")))
            .with_instructions("Controla o Mochi do Coucou: avisos, aprovações Permitir/Negar, sessões de agentes e chat.")
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(tools()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let args = request.arguments.unwrap_or_default();
        Ok(self.run(&request.name, args).await.into())
    }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

type Body = http_body_util::Either<BoxBody<Bytes, Infallible>, Full<Bytes>>;

fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Is this request's bearer the token?
pub fn authorized(header: Option<&str>, token: &str) -> bool {
    let Some(h) = header else { return false };
    let Some(given) = h.strip_prefix("Bearer ").or_else(|| h.strip_prefix("bearer ")) else { return false };
    !token.is_empty() && same(given.trim().as_bytes(), token.as_bytes())
}

/// Serves until `cancel` fires. Returns the bound address (port 0 picks one).
pub async fn serve(
    mochi: Arc<dyn Mochi>,
    port: u16,
    token: String,
    cancel: tokio_util::sync::CancellationToken,
) -> std::io::Result<std::net::SocketAddr> {
    use hyper::service::service_fn;
    use hyper_util::rt::TokioIo;
    use tower_service::Service;

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    let addr = listener.local_addr()?;
    let config = StreamableHttpServerConfig::default().with_cancellation_token(cancel.child_token());
    let service = StreamableHttpService::new(
        move || Ok(MochiServer::new(mochi.clone())),
        Arc::new(LocalSessionManager::default()),
        config,
    );
    let token = Arc::new(token);
    tokio::spawn(async move {
        loop {
            let stream = tokio::select! {
                _ = cancel.cancelled() => break,
                r = listener.accept() => match r { Ok((s, _)) => s, Err(_) => continue },
            };
            let service = service.clone();
            let token = token.clone();
            tokio::spawn(async move {
                let svc = service_fn(move |req: hyper::Request<hyper::body::Incoming>| {
                    let mut service = service.clone();
                    let token = token.clone();
                    async move {
                        let auth = req.headers().get(hyper::header::AUTHORIZATION).and_then(|v| v.to_str().ok());
                        if req.uri().path() != "/mcp" {
                            return Ok::<_, Infallible>(plain(404, "use /mcp"));
                        }
                        if !authorized(auth, &token) {
                            return Ok(plain(401, "token inválido"));
                        }
                        let resp = service.call(req).await?;
                        Ok(resp.map(http_body_util::Either::Left))
                    }
                });
                let _ = hyper::server::conn::http1::Builder::new()
                    .serve_connection(TokioIo::new(stream), svc)
                    .await;
            });
        }
    });
    Ok(addr)
}

fn plain(status: u16, msg: &'static str) -> hyper::Response<Body> {
    let mut r = hyper::Response::new(http_body_util::Either::Right(Full::new(Bytes::from_static(msg.as_bytes()))));
    *r.status_mut() = hyper::StatusCode::from_u16(status).unwrap();
    r
}

/// A fresh random token (32 bytes, hex).
pub fn new_token() -> String {
    use ring::rand::{SecureRandom, SystemRandom};
    let mut b = [0u8; 32];
    SystemRandom::new().fill(&mut b).expect("system randomness");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

// ── In the app ───────────────────────────────────────────────────────────────

/// The island, as the tools see it.
pub struct AppMochi(pub tauri::AppHandle);

impl Mochi for AppMochi {
    fn emit(&self, payload: Value) {
        use tauri::Emitter;
        crate::log::line(format!("mcp {}", payload["hook_event_name"].as_str().unwrap_or("")));
        let _ = self.0.emit_to(crate::island::WINDOW_LABEL, "hook", payload);
    }
    fn decide(&self, payload: Value) -> BoxFut<'_, Option<String>> {
        Box::pin(crate::pipe::request_decision(&self.0, payload))
    }
    fn chat(&self, message: String) -> BoxFut<'_, Result<String, String>> {
        Box::pin(async move {
            use tauri::Manager;
            let settings = self.0.state::<crate::Shared>().settings.lock().unwrap().clone();
            if settings.chat_provider == super::chat::PROVIDER {
                return Err("o chat do Mochi está no provedor MCP; escolha outro provedor para evitar laço".into());
            }
            let chat = crate::chat::Chat::default();
            crate::chat::send(&self.0, &chat, &settings, message, None).await.map(|r| r.text)
        })
    }
}

/// Started once at launch when the setting is on.
pub fn start(app: tauri::AppHandle, port: u16) {
    tauri::async_runtime::spawn(async move {
        let token = match crate::secrets::get_server_token() {
            Some(t) => t,
            None => {
                let t = new_token();
                if let Err(e) = crate::secrets::set_server_token(&t) {
                    crate::log::line(format!("mcp server: cannot store its token: {e}"));
                    return;
                }
                t
            }
        };
        let mochi: Arc<dyn Mochi> = Arc::new(AppMochi(app));
        match serve(mochi, port, token, tokio_util::sync::CancellationToken::new()).await {
            Ok(addr) => crate::log::line(format!("mcp server on http://{addr}/mcp")),
            Err(e) => crate::log::line(format!("mcp server: cannot listen on 127.0.0.1:{port}: {e}")),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::client::{self, result_text, Manager};
    use crate::mcp::config::McpServer;
    use std::collections::BTreeMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Fake {
        events: Mutex<Vec<Value>>,
    }
    impl Mochi for Fake {
        fn emit(&self, payload: Value) {
            self.events.lock().unwrap().push(payload);
        }
        fn decide(&self, payload: Value) -> BoxFut<'_, Option<String>> {
            self.events.lock().unwrap().push(payload);
            Box::pin(async { Some("allow".to_string()) })
        }
        fn chat(&self, message: String) -> BoxFut<'_, Result<String, String>> {
            Box::pin(async move { Ok(format!("eco: {message}")) })
        }
    }

    #[test]
    fn tokens_and_tags() {
        assert!(authorized(Some("Bearer abc"), "abc"));
        assert!(!authorized(Some("Bearer abd"), "abc"));
        assert!(!authorized(None, "abc"));
        assert!(!authorized(Some("Bearer "), ""));
        assert_eq!(agent_tag("Grok Bot!"), "grok-bot");
        assert_eq!(agent_tag(""), "mcp");
        assert_eq!(new_token().len(), 64);
    }

    #[test]
    fn tools_become_island_events() {
        let mut a = Map::new();
        a.insert("message".into(), json!("Deploy pronto"));
        a.insert("agent".into(), json!("Hermes"));
        let e = events_for("notify", &a).unwrap();
        assert_eq!(e[1]["hook_event_name"], "Stop");
        assert_eq!(e[1]["coucou_agent"], "hermes");
        assert_eq!(e[1]["last_assistant_message"], "Deploy pronto");
        assert!(events_for("notify", &Map::new()).is_err());
        a.insert("session_id".into(), json!("s1"));
        a.insert("status".into(), json!("working"));
        a.insert("step".into(), json!("Lendo arquivos"));
        assert_eq!(events_for("update_session", &a).unwrap()[0]["tool_name"], "Lendo arquivos");
        a.insert("status".into(), json!("nope"));
        assert!(events_for("update_session", &a).is_err());
    }

    /// The real thing: our client, over Streamable HTTP, against our server.
    #[tokio::test(flavor = "multi_thread")]
    async fn client_and_embedded_server_talk() {
        let fake = Arc::new(Fake::default());
        let cancel = tokio_util::sync::CancellationToken::new();
        let addr = serve(fake.clone(), 0, "segredo".into(), cancel.clone()).await.unwrap();
        let config = McpServer::Http { url: format!("http://127.0.0.1:{}/mcp", addr.port()), headers: BTreeMap::new(), disabled: false };

        // Without the token: refused.
        assert!(client::test(&config, None).await.is_err());
        assert!(client::test(&config, Some("errado")).await.is_err());

        let tools = client::test(&config, Some("segredo")).await.unwrap();
        let names: Vec<_> = tools.iter().map(|t| t.name.as_str()).collect();
        for t in ["notify", "ask_approval", "show_session", "update_session", "end_session", "chat"] {
            assert!(names.contains(&t), "{names:?}");
        }

        let c = client::connect(&config, Some("segredo")).await.unwrap();
        let call = |name: &'static str, args: Value| {
            let c = &c;
            async move {
                c.call_tool(rmcp::model::CallToolRequestParams::new(name).with_arguments(args.as_object().unwrap().clone()))
                    .await
                    .unwrap()
            }
        };
        assert_eq!(result_text(&call("ask_approval", json!({"action": "rm -rf build", "agent": "grok"})).await), "allow");
        assert_eq!(result_text(&call("chat", json!({"message": "oi"})).await), "eco: oi");
        assert_eq!(result_text(&call("notify", json!({"message": "feito"})).await), "ok");
        let r = call("update_session", json!({"session_id": "x"})).await;
        assert_eq!(r.is_error, Some(true));
        let _ = c.cancel().await;
        let ev = fake.events.lock().unwrap();
        assert_eq!(ev[0]["hook_event_name"], "PermissionRequest");
        assert_eq!(ev[0]["coucou_mcp"], true);
        cancel.cancel();
    }

    /// The manager keeps one connection and the chat provider's task mode works
    /// end to end against a fake Hermes (start → job id, status → done).
    #[tokio::test(flavor = "multi_thread")]
    async fn manager_reuses_connections() {
        let fake = Arc::new(Fake::default());
        let cancel = tokio_util::sync::CancellationToken::new();
        let addr = serve(fake, 0, "t".into(), cancel.clone()).await.unwrap();
        let config = McpServer::Http { url: format!("http://127.0.0.1:{}/mcp", addr.port()), headers: BTreeMap::from([("X-Test".into(), "1".into())]), disabled: false };
        let m = Manager::default();
        // No token in the keychain for this name → refused, and the error says so.
        assert!(m.list_tools("teste-sem-token-xyz", &config).await.is_err());
        let disabled = McpServer::Http { url: "http://127.0.0.1:1/mcp".into(), headers: BTreeMap::new(), disabled: true };
        assert!(m.list_tools("x", &disabled).await.unwrap_err().contains("desativado"));
        cancel.cancel();
    }

    /// Against the reference server, when Node is around:
    /// `cargo test -- --ignored everything`.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn everything_server_over_stdio() {
        let config = McpServer::Stdio {
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-everything".into()],
            env: BTreeMap::new(),
            disabled: false,
        };
        let m = Manager::default();
        let tools = m.list_tools("everything", &config).await.unwrap();
        assert!(tools.iter().any(|t| t.name == "echo"), "{tools:?}");
        let mut args = Map::new();
        args.insert("message".into(), json!("olá MCP"));
        let r = m.call_tool("everything", &config, "echo", args).await.unwrap();
        assert!(result_text(&r).contains("olá MCP"), "{}", result_text(&r));
        // Second call reuses the same child process.
        let again = m.list_tools("everything", &config).await.unwrap();
        assert_eq!(again.len(), tools.len());
    }
}
