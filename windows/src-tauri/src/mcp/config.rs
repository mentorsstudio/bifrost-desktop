// The MCP servers Coucou may talk to, as written in settings.json:
//
//   "mcpServers": {
//     "hermes":     { "command": "hermes.exe", "args": ["mcp-serve", "--tools"], "env": {} },
//     "hermes-vps": { "url": "https://…/mcp", "headers": { "X-Foo": "bar" } }
//   }
//
// The same shape Claude Desktop, Cursor and Grok Bot use. A bearer token for a
// remote server is never written here: it lives in the credential store under
// `mcp-token:<name>` (secrets.rs) and is added to the request by client.rs.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One configured server: a command to spawn (stdio) or an address (Streamable HTTP).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum McpServer {
    Stdio {
        command: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        args: Vec<String>,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        env: BTreeMap<String, String>,
        #[serde(default, skip_serializing_if = "is_false")]
        disabled: bool,
    },
    Http {
        url: String,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        headers: BTreeMap<String, String>,
        #[serde(default, skip_serializing_if = "is_false")]
        disabled: bool,
    },
}

fn is_false(b: &bool) -> bool {
    !*b
}

impl McpServer {
    pub fn disabled(&self) -> bool {
        match self {
            McpServer::Stdio { disabled, .. } | McpServer::Http { disabled, .. } => *disabled,
        }
    }

    /// Checks what serde cannot: a command or an http(s) address that is there.
    pub fn validate(&self) -> Result<(), String> {
        match self {
            McpServer::Stdio { command, .. } if command.trim().is_empty() => {
                Err("comando vazio".into())
            }
            McpServer::Http { url, .. } => {
                let u = url.trim();
                if !(u.starts_with("https://") || u.starts_with("http://")) {
                    return Err(format!("endereço inválido: {u}"));
                }
                // Plain http only to this computer: a token must never cross a network unencrypted.
                if u.starts_with("http://") && !is_loopback_url(u) {
                    return Err("use https:// para servidores remotos (http:// só para localhost)".into());
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

/// Presets for Paulo's PC, used when settings.json has no `mcpServers` yet.
/// Only Hermes (local) and Alethe start enabled; the rest need something the
/// user must confirm first (credentials, entry command), so they come disabled.
pub fn default_servers() -> BTreeMap<String, McpServer> {
    let stdio = |command: &str, args: &[&str], disabled: bool| McpServer::Stdio {
        command: command.into(),
        args: args.iter().map(|a| a.to_string()).collect(),
        env: BTreeMap::new(),
        disabled,
    };
    let http = |url: &str| McpServer::Http { url: url.into(), headers: BTreeMap::new(), disabled: true };
    BTreeMap::from([
        ("hermes".into(), stdio(r"C:\Users\paulo\AppData\Local\hermes\bin\hermes.exe", &["mcp-serve", "--tools"], false)),
        // Behind Traefik basic auth (HTTP 401 for every path): fill the credentials, then enable.
        ("hermes-vps".into(), http("https://mcp.srv2096709.hstgr.cloud/mcp")),
        ("alethe".into(), stdio(r"C:\Users\paulo\AppData\Local\Alethe\alethe-orchestrator-mcp.exe", &[], false)),
        // Orca's CLI lives in %LOCALAPPDATA%\orca\bin and serves MCP with `orca mcp`; confirm on the PC.
        ("orca".into(), stdio(r"C:\Users\paulo\AppData\Local\orca\bin\orca.exe", &["mcp"], true)),
        // Entry command of the bridge not confirmed: edit before enabling.
        ("freya".into(), stdio(r"C:\Users\paulo\Freya\ponte-grokbot\CONFIRME-O-COMANDO.exe", &[], true)),
    ])
}

/// A stdio command given as a path (has a separator) that is not on disk.
pub fn missing_command(command: &str) -> bool {
    let c = command.trim();
    (c.contains('\\') || c.contains('/')) && !std::path::Path::new(c).exists()
}

fn is_loopback_url(url: &str) -> bool {
    let rest = url.trim_start_matches("http://");
    let host = rest.split(['/', '?']).next().unwrap_or("");
    let host = host.rsplit_once(':').map(|(h, _)| h).unwrap_or(host);
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

/// A server's name: what the settings, the keychain entry and the UI key it by.
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Parses pasted JSON: either `{"mcpServers": {...}}` (the usual file) or the
/// inner map alone. Every entry is checked; the first bad one is reported by name.
pub fn parse_servers(json: &str) -> Result<BTreeMap<String, McpServer>, String> {
    let value: Value = serde_json::from_str(json.trim_start_matches('\u{feff}'))
        .map_err(|e| format!("JSON inválido: {e}"))?;
    let map = match value.get("mcpServers") {
        Some(inner) => inner.clone(),
        None => value,
    };
    let Value::Object(entries) = map else {
        return Err("esperado um objeto com os servidores".into());
    };
    let mut out = BTreeMap::new();
    for (name, entry) in entries {
        if !valid_name(&name) {
            return Err(format!("nome inválido: {name:?} (use letras, números, - _ .)"));
        }
        let server: McpServer = serde_json::from_value(entry)
            .map_err(|_| format!("{name}: precisa de \"command\" (stdio) ou \"url\" (HTTP)"))?;
        server.validate().map_err(|e| format!("{name}: {e}"))?;
        out.insert(name, server);
    }
    Ok(out)
}

/// How the "mcp" chat provider reaches an agent. Picked in Settings → MCP.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct McpChat {
    /// The server, a key of `mcpServers`.
    pub server: String,
    /// "tool": one call whose result is the answer. "task": a start tool that
    /// returns a job id, then a status tool polled until the job ends (Hermes).
    pub mode: String,
    /// The tool called with the message (`hermes_task_start` for Hermes).
    pub tool: String,
    /// The argument the message goes in (`prompt`, `message`, `query`…).
    pub argument: String,
    /// Extra fixed arguments, merged in (e.g. `{"skills": "…"}`).
    pub extra_args: serde_json::Map<String, Value>,
    /// Task mode: the status tool and its id argument.
    pub status_tool: String,
    pub id_argument: String,
    /// Task mode: how long to wait for the answer, in seconds.
    pub timeout_secs: u64,
    /// Send the earlier turns along with the message (as plain text).
    pub include_history: bool,
}

impl Default for McpChat {
    fn default() -> Self {
        Self {
            server: "hermes".into(),
            mode: "task".into(),
            tool: "hermes_task_start".into(),
            argument: "prompt".into(),
            extra_args: serde_json::Map::new(),
            status_tool: "hermes_task_status".into(),
            id_argument: "job_id".into(),
            timeout_secs: 600,
            include_history: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_standard_file_and_the_bare_map() {
        let json = r#"{"mcpServers": {
            "hermes": {"command": "C:\\hermes.exe", "args": ["mcp-serve", "--tools"]},
            "vps": {"type": "http", "url": "https://mcp.example.com/mcp", "headers": {"X-A": "b"}}
        }}"#;
        let s = parse_servers(json).unwrap();
        assert_eq!(
            s["hermes"],
            McpServer::Stdio {
                command: "C:\\hermes.exe".into(),
                args: vec!["mcp-serve".into(), "--tools".into()],
                env: BTreeMap::new(),
                disabled: false
            }
        );
        assert!(matches!(&s["vps"], McpServer::Http { url, headers, .. } if url.ends_with("/mcp") && headers["X-A"] == "b"));
        let bare = parse_servers(r#"{"x": {"url": "http://127.0.0.1:9/mcp"}}"#).unwrap();
        assert!(bare.contains_key("x"));
    }

    #[test]
    fn refuses_what_it_cannot_use() {
        assert!(parse_servers("[]").is_err());
        assert!(parse_servers("{oops").is_err());
        assert!(parse_servers(r#"{"a b": {"command": "x"}}"#).unwrap_err().contains("nome"));
        assert!(parse_servers(r#"{"a": {"args": []}}"#).unwrap_err().starts_with("a:"));
        assert!(parse_servers(r#"{"a": {"command": "  "}}"#).is_err());
        assert!(parse_servers(r#"{"a": {"url": "ftp://x"}}"#).is_err());
        // A token must not travel over plain http to another machine.
        assert!(parse_servers(r#"{"a": {"url": "http://example.com/mcp"}}"#).is_err());
        assert!(parse_servers(r#"{"a": {"url": "http://localhost:8080/mcp"}}"#).is_ok());
    }

    #[test]
    fn round_trips_without_noise() {
        let s = McpServer::Stdio { command: "x".into(), args: vec![], env: BTreeMap::new(), disabled: false };
        assert_eq!(serde_json::to_string(&s).unwrap(), r#"{"command":"x"}"#);
        let back: McpServer = serde_json::from_str(r#"{"command":"x","disabled":true}"#).unwrap();
        assert!(back.disabled());
    }

    #[test]
    fn presets_enable_only_hermes_and_alethe() {
        let d = default_servers();
        let on: Vec<_> = d.iter().filter(|(_, s)| !s.disabled()).map(|(n, _)| n.as_str()).collect();
        assert_eq!(on, ["alethe", "hermes"]);
        assert!(d.values().all(|s| s.validate().is_ok()));
        assert!(missing_command(r"C:\nao\existe\x.exe"));
        assert!(!missing_command("hermes.exe"));
    }

    #[test]
    fn chat_defaults_to_hermes_tasks() {
        let c: McpChat = serde_json::from_str("{}").unwrap();
        assert_eq!(c, McpChat::default());
        assert_eq!(c.tool, "hermes_task_start");
        let c: McpChat = serde_json::from_str(r#"{"mode":"tool","tool":"chat","argument":"message"}"#).unwrap();
        assert_eq!((c.mode.as_str(), c.server.as_str()), ("tool", "hermes"));
    }
}
