// Catálogo do Bifrost: os servidores MCP que já vêm prontos, a detecção dos
// programas e IAs instalados no PC e a importação dos servidores que outros
// apps (Claude Desktop, Claude Code, Cursor, VS Code) já configuraram.
//
// Nada aqui pede chave de API. Serviços na nuvem usam o servidor MCP oficial
// deles por Streamable HTTP com login OAuth no navegador — feito pelo
// `mcp-remote` (npx), que guarda a sessão sozinho. Programas locais são
// lançados por stdio.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;

use super::config::{valid_name, McpServer};

/// Onde procurar: o PATH e as pastas do usuário. Injetável para os testes.
#[derive(Debug, Clone, Default)]
pub struct Env {
    pub path: Vec<PathBuf>,
    pub home: PathBuf,
    pub appdata: PathBuf,
    pub local_appdata: PathBuf,
    pub program_files: Vec<PathBuf>,
    pub windows: bool,
}

impl Env {
    pub fn current() -> Env {
        let var = |k: &str| std::env::var_os(k).map(PathBuf::from);
        let home = crate::platform::home_dir();
        let windows = cfg!(windows);
        Env {
            path: std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default(),
            appdata: var("APPDATA").unwrap_or_else(|| home.join(".config")),
            local_appdata: var("LOCALAPPDATA").unwrap_or_else(|| home.join(".local/share")),
            program_files: ["ProgramFiles", "ProgramFiles(x86)"].iter().filter_map(|k| var(k)).collect(),
            home,
            windows,
        }
    }

    /// Um executável no PATH (com as extensões do Windows).
    fn on_path(&self, stem: &str) -> Option<PathBuf> {
        let exts: &[&str] = if self.windows { &[".exe", ".cmd", ".bat", ""] } else { &[""] };
        for dir in &self.path {
            for ext in exts {
                let p = dir.join(format!("{stem}{ext}"));
                if p.is_file() {
                    return Some(p);
                }
            }
        }
        None
    }

    /// Expande `%LOCALAPPDATA%`, `%APPDATA%`, `%PROGRAMFILES%`, `~`.
    fn candidates(&self, pattern: &str) -> Vec<PathBuf> {
        let rel = |p: &str| p.trim_start_matches(['\\', '/']).replace('\\', "/");
        if let Some(r) = pattern.strip_prefix("%LOCALAPPDATA%") {
            vec![self.local_appdata.join(rel(r))]
        } else if let Some(r) = pattern.strip_prefix("%APPDATA%") {
            vec![self.appdata.join(rel(r))]
        } else if let Some(r) = pattern.strip_prefix("%PROGRAMFILES%") {
            self.program_files.iter().map(|pf| pf.join(rel(r))).collect()
        } else if let Some(r) = pattern.strip_prefix('~') {
            vec![self.home.join(rel(r))]
        } else {
            vec![PathBuf::from(pattern)]
        }
    }
}

/// Um programa ou IA que o Bifrost sabe reconhecer.
pub struct Program {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: &'static str,
    /// Nomes no PATH.
    pub commands: &'static [&'static str],
    /// Arquivos ou pastas típicos de instalação.
    pub folders: &'static [&'static str],
}

pub const PROGRAMS: &[Program] = &[
    Program { id: "claude", name: "Claude Code", kind: "ia", commands: &["claude"], folders: &["~/.local/bin/claude.exe", "%APPDATA%/npm/claude.cmd"] },
    Program { id: "codex", name: "Codex CLI", kind: "ia", commands: &["codex"], folders: &["%LOCALAPPDATA%/Programs/OpenAI/Codex/bin/codex.exe", "%APPDATA%/npm/codex.cmd"] },
    Program { id: "gemini", name: "Gemini CLI", kind: "ia", commands: &["gemini"], folders: &["%APPDATA%/npm/gemini.cmd"] },
    Program { id: "ollama", name: "Ollama", kind: "ia", commands: &["ollama"], folders: &["%LOCALAPPDATA%/Programs/Ollama/ollama.exe"] },
    Program { id: "lmstudio", name: "LM Studio", kind: "ia", commands: &["lms"], folders: &["%LOCALAPPDATA%/Programs/LM Studio/LM Studio.exe", "~/.lmstudio/bin/lms.exe"] },
    Program { id: "claude-desktop", name: "Claude Desktop", kind: "ia", commands: &[], folders: &["%LOCALAPPDATA%/AnthropicClaude", "%APPDATA%/Claude/claude_desktop_config.json"] },
    Program { id: "vscode", name: "VS Code", kind: "editor", commands: &["code"], folders: &["%LOCALAPPDATA%/Programs/Microsoft VS Code/Code.exe"] },
    Program { id: "cursor", name: "Cursor", kind: "editor", commands: &["cursor"], folders: &["%LOCALAPPDATA%/Programs/cursor/Cursor.exe"] },
    Program { id: "antigravity", name: "Antigravity", kind: "editor", commands: &["antigravity"], folders: &["%LOCALAPPDATA%/Programs/antigravity"] },
    Program { id: "node", name: "Node.js / npx", kind: "runtime", commands: &["npx", "node"], folders: &["%PROGRAMFILES%/nodejs/npx.cmd"] },
    Program { id: "uv", name: "uv / uvx", kind: "runtime", commands: &["uvx"], folders: &["~/.local/bin/uvx.exe"] },
    Program { id: "python", name: "Python", kind: "runtime", commands: &["python", "python3"], folders: &[] },
    Program { id: "docker", name: "Docker Desktop", kind: "runtime", commands: &["docker"], folders: &["%LOCALAPPDATA%/Programs/DockerDesktop/resources/bin/docker.exe", "%PROGRAMFILES%/Docker/Docker/resources/bin/docker.exe"] },
    Program { id: "git", name: "Git", kind: "runtime", commands: &["git"], folders: &["%PROGRAMFILES%/Git/cmd/git.exe"] },
    Program { id: "gh", name: "GitHub CLI", kind: "runtime", commands: &["gh"], folders: &["%PROGRAMFILES%/GitHub CLI/gh.exe"] },
    Program { id: "blender", name: "Blender", kind: "criativo", commands: &["blender"], folders: &["%PROGRAMFILES%/Blender Foundation"] },
    Program { id: "obs", name: "OBS Studio", kind: "criativo", commands: &[], folders: &["%PROGRAMFILES%/obs-studio"] },
    Program { id: "davinci", name: "DaVinci Resolve", kind: "criativo", commands: &[], folders: &["%PROGRAMFILES%/Blackmagic Design/DaVinci Resolve/Resolve.exe"] },
    Program { id: "orca", name: "Orca", kind: "ia", commands: &["orca"], folders: &["%LOCALAPPDATA%/orca/bin/orca.exe", "%LOCALAPPDATA%/Programs/orca"] },
    Program { id: "hermes", name: "Hermes", kind: "ia", commands: &["hermes"], folders: &["%LOCALAPPDATA%/hermes/bin/hermes.exe"] },
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Detected {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub found: bool,
    pub path: Option<String>,
}

pub fn detect(env: &Env) -> Vec<Detected> {
    PROGRAMS
        .iter()
        .map(|p| {
            let hit = p
                .commands
                .iter()
                .find_map(|c| env.on_path(c))
                .or_else(|| p.folders.iter().flat_map(|f| env.candidates(f)).find(|c| c.exists()));
            Detected {
                id: p.id.into(),
                name: p.name.into(),
                kind: p.kind.into(),
                found: hit.is_some(),
                path: hit.map(|h| h.display().to_string()),
            }
        })
        .collect()
}

/// Uma entrada pronta do catálogo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub label: String,
    /// "nuvem" (OAuth), "local" (programa no PC) ou "importado".
    pub origin: String,
    /// O programa de que depende (id de PROGRAMS), se houver.
    pub needs: Option<String>,
    pub detected: bool,
    pub note: String,
    pub config: McpServer,
}

/// Serviços com servidor MCP oficial remoto (Streamable HTTP + OAuth).
/// Endereços conferidos na documentação de cada fornecedor (out/2026).
pub const REMOTE: &[(&str, &str, &str)] = &[
    ("github", "GitHub", "https://api.githubcopilot.com/mcp/"),
    ("gitlab", "GitLab", "https://gitlab.com/api/v4/mcp"),
    ("notion", "Notion", "https://mcp.notion.com/mcp"),
    ("stripe", "Stripe", "https://mcp.stripe.com"),
    ("vercel", "Vercel", "https://mcp.vercel.com"),
    ("resend", "Resend", "https://mcp.resend.com/mcp"),
    ("sentry", "Sentry", "https://mcp.sentry.dev/mcp"),
    ("linear", "Linear", "https://mcp.linear.app/mcp"),
    ("cloudflare", "Cloudflare", "https://mcp.cloudflare.com/mcp"),
    ("supabase", "Supabase", "https://mcp.supabase.com/mcp"),
    ("figma", "Figma", "https://mcp.figma.com/mcp"),
    ("calcom", "Cal.com", "https://mcp.cal.com/mcp"),
];

fn stdio(command: &str, args: &[&str], disabled: bool) -> McpServer {
    McpServer::Stdio {
        command: command.into(),
        args: args.iter().map(|a| a.to_string()).collect(),
        env: BTreeMap::new(),
        disabled,
    }
}

/// `npx` pelo cmd no Windows (npx é um .cmd, que não abre sem o shell).
fn npx(env: &Env, args: &[&str], disabled: bool) -> McpServer {
    if env.windows {
        let mut a = vec!["/c", "npx", "-y"];
        a.extend_from_slice(args);
        stdio("cmd", &a, disabled)
    } else {
        let mut a = vec!["-y"];
        a.extend_from_slice(args);
        stdio("npx", &a, disabled)
    }
}

/// O catálogo inteiro, já ajustado ao que foi detectado.
pub fn entries(env: &Env, found: &[Detected]) -> Vec<Entry> {
    let has = |id: &str| found.iter().find(|d| d.id == id && d.found);
    let path_of = |id: &str, fallback: &str| has(id).and_then(|d| d.path.clone()).unwrap_or_else(|| fallback.into());
    let node = has("node").is_some();
    let uv = has("uv").is_some();
    let mut out = Vec::new();
    let mut push = |name: &str, label: &str, origin: &str, needs: Option<&str>, detected: bool, note: &str, config: McpServer| {
        out.push(Entry {
            name: name.into(),
            label: label.into(),
            origin: origin.into(),
            needs: needs.map(Into::into),
            detected,
            note: note.into(),
            config,
        })
    };

    // Nuvem: desligados até o usuário ligar — ao ligar, o navegador abre o login OAuth.
    for (name, label, url) in REMOTE {
        push(name, label, "nuvem", Some("node"), node, "Login OAuth no navegador ao ligar (mcp-remote). Sem chave.", npx(env, &["mcp-remote", url], true));
    }
    // Sem login nenhum: já ligados.
    push("deepwiki", "DeepWiki", "nuvem", None, true, "Documentação de repositórios públicos, sem login.", McpServer::Http { url: "https://mcp.deepwiki.com/mcp".into(), headers: BTreeMap::new(), disabled: false });
    push("cloudflare-docs", "Cloudflare Docs", "nuvem", None, true, "Busca na documentação da Cloudflare, sem login.", McpServer::Http { url: "https://docs.mcp.cloudflare.com/mcp".into(), headers: BTreeMap::new(), disabled: false });
    // n8n: cada instância tem o seu endereço (Settings → Instance-level MCP).
    push("n8n", "n8n", "nuvem", Some("node"), false, "Troque pelo Server URL da sua instância (termina em /mcp-server/http).", npx(env, &["mcp-remote", "https://SUA-INSTANCIA-N8N/mcp-server/http"], true));

    // IAs instaladas que também servem MCP.
    let claude = has("claude").is_some();
    push("claude-code", "Claude Code", "local", Some("claude"), claude, "As ferramentas do Claude Code (claude mcp serve).", stdio(&path_of("claude", "claude"), &["mcp", "serve"], !claude));
    let codex = has("codex").is_some();
    push("codex", "Codex CLI", "local", Some("codex"), codex, "O Codex como agente MCP (codex mcp-server).", stdio(&path_of("codex", "codex"), &["mcp-server"], !codex));

    // Ferramentas locais de referência do projeto MCP.
    push("memoria", "Memória", "local", Some("node"), node, "Grafo de memória persistente (@modelcontextprotocol/server-memory).", npx(env, &["@modelcontextprotocol/server-memory"], !node));
    let home = env.home.display().to_string();
    push("arquivos", "Arquivos", "local", Some("node"), node, "Lê e escreve na sua pasta de usuário — ligue só se quiser.", npx(env, &["@modelcontextprotocol/server-filesystem", &home], true));
    push("fetch", "Fetch (web)", "local", Some("uv"), uv, "Baixa páginas da web como texto (mcp-server-fetch).", stdio(&path_of("uv", "uvx"), &["mcp-server-fetch"], !uv));
    let git = uv && has("git").is_some();
    push("git", "Git", "local", Some("git"), git, "Repositórios Git locais (mcp-server-git).", stdio(&path_of("uv", "uvx"), &["mcp-server-git"], !git));
    push("playwright", "Navegador (Playwright)", "local", Some("node"), node, "Controla um navegador (@playwright/mcp).", npx(env, &["@playwright/mcp@latest"], true));
    let docker = has("docker").is_some();
    push("docker", "Docker MCP Toolkit", "local", Some("docker"), docker, "Gateway do Docker MCP Toolkit (ative o Toolkit no Docker Desktop).", stdio(&path_of("docker", "docker"), &["mcp", "gateway", "run"], true));

    // Programas criativos com servidor MCP.
    let blender = has("blender").is_some() && uv;
    push("blender", "Blender", "local", Some("blender"), has("blender").is_some(), "Precisa do addon do Blender MCP (uvx mcp-for-blender setup).", stdio(&path_of("uv", "uvx"), &["mcp-for-blender"], !blender));
    let obs = has("obs").is_some();
    push("obs", "OBS Studio", "local", Some("obs"), obs, "Ligue o WebSocket do OBS (Ferramentas → WebSocket) e defina OBS_WS_PASSWORD.", npx(env, &["obs-mcp-server"], true));
    let resolve = has("davinci").is_some();
    push("davinci", "DaVinci Resolve", "local", Some("davinci"), resolve, "Só no Resolve Studio, com scripting externo Local.", npx(env, &["davinci-resolve-mcp", "server"], true));
    out
}

// ── Importação ───────────────────────────────────────────────────────────────

/// Arquivos de configuração MCP de outros apps.
pub fn config_files(env: &Env) -> Vec<(&'static str, PathBuf)> {
    vec![
        ("Claude Desktop", env.appdata.join("Claude").join("claude_desktop_config.json")),
        ("Claude Code", env.home.join(".claude.json")),
        ("Cursor", env.home.join(".cursor").join("mcp.json")),
        ("VS Code", env.appdata.join("Code").join("User").join("mcp.json")),
    ]
}

/// Um nome aceitável a partir de qualquer coisa (`makenotion/notion-mcp-server` → `makenotion-notion-mcp-server`).
pub fn sanitize_name(raw: &str) -> String {
    let s: String = raw
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' })
        .collect();
    let s = s.trim_matches('-').chars().take(64).collect::<String>();
    if s.is_empty() { "servidor".into() } else { s }
}

/// Um servidor importado e o segredo que veio no cabeçalho Authorization
/// (vai para o cofre do sistema, nunca para o settings.json).
pub struct Imported {
    pub name: String,
    pub source: String,
    pub config: McpServer,
    pub secret: Option<String>,
}

/// Lê um arquivo `mcpServers` (Claude/Cursor) ou `servers` (VS Code).
pub fn parse_foreign(source: &str, text: &str) -> Vec<Imported> {
    let Ok(v) = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) else { return vec![] };
    let map = v.get("mcpServers").or_else(|| v.get("servers")).and_then(Value::as_object);
    let Some(map) = map else { return vec![] };
    let mut out = Vec::new();
    for (raw, entry) in map {
        let mut entry = entry.clone();
        let mut secret = None;
        if let Some(obj) = entry.as_object_mut() {
            // VS Code usa "type": "http"/"sse"/"stdio"; o resto é igual.
            obj.remove("type");
            if let Some(Value::Object(h)) = obj.get_mut("headers") {
                let key = h.keys().find(|k| k.eq_ignore_ascii_case("authorization")).cloned();
                if let Some(k) = key {
                    secret = h.remove(&k).and_then(|v| v.as_str().map(|s| s.trim_start_matches("Bearer ").to_string()));
                }
            }
        }
        // Valores ${input:...} do VS Code não existem fora dele.
        if entry.to_string().contains("${input:") {
            continue;
        }
        let Ok(config) = serde_json::from_value::<McpServer>(entry) else { continue };
        if config.validate().is_err() {
            continue;
        }
        let name = sanitize_name(raw);
        if !valid_name(&name) {
            continue;
        }
        out.push(Imported { name, source: source.into(), config, secret });
    }
    out
}

pub fn import_all(env: &Env) -> Vec<Imported> {
    config_files(env)
        .into_iter()
        .filter_map(|(src, p)| std::fs::read_to_string(&p).ok().map(|t| parse_foreign(src, &t)))
        .flatten()
        .collect()
}

/// O que a tela "Servidores MCP" mostra sobre a origem de cada servidor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan {
    pub programs: Vec<Detected>,
    pub catalog: Vec<Entry>,
    pub imported: Vec<ImportedView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedView {
    pub name: String,
    pub source: String,
}

/// Junta o catálogo e os importados aos servidores do usuário. Nunca troca um
/// servidor que já existe, e não traz de volta o que o usuário removeu
/// (`known` guarda tudo que já foi oferecido uma vez).
pub fn merge(
    servers: &mut BTreeMap<String, McpServer>,
    known: &mut std::collections::BTreeSet<String>,
    catalog: &[Entry],
    imported: &[Imported],
) -> Vec<(String, String)> {
    let mut secrets = Vec::new();
    let urls: Vec<String> = servers.values().filter_map(url_of).collect();
    for e in catalog {
        if known.insert(e.name.clone()) && !servers.contains_key(&e.name) {
            servers.insert(e.name.clone(), e.config.clone());
        }
    }
    for i in imported {
        let key = format!("importado:{}", i.name);
        if !known.insert(key) || servers.contains_key(&i.name) {
            continue;
        }
        if url_of(&i.config).is_some_and(|u| urls.contains(&u)) {
            continue;
        }
        servers.insert(i.name.clone(), i.config.clone());
        if let Some(s) = &i.secret {
            secrets.push((i.name.clone(), s.clone()));
        }
    }
    secrets
}

fn url_of(s: &McpServer) -> Option<String> {
    match s {
        McpServer::Http { url, .. } => Some(url.trim_end_matches('/').to_string()),
        McpServer::Stdio { args, .. } => args.iter().find(|a| a.starts_with("https://")).map(|a| a.trim_end_matches('/').to_string()),
    }
}

pub fn scan(env: &Env) -> (Scan, Vec<Imported>) {
    let programs = detect(env);
    let catalog = entries(env, &programs);
    let imported = import_all(env);
    let views = imported.iter().map(|i| ImportedView { name: i.name.clone(), source: i.source.clone() }).collect();
    (Scan { programs, catalog, imported: views }, imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake() -> (tempfile_dir::Dir, Env) {
        let d = tempfile_dir::Dir::new();
        let bin = d.0.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        for f in ["claude.exe", "npx.cmd", "uvx.exe", "git.exe"] {
            std::fs::write(bin.join(f), "").unwrap();
        }
        let pf = d.0.join("pf");
        std::fs::create_dir_all(pf.join("obs-studio")).unwrap();
        let env = Env {
            path: vec![bin],
            home: d.0.join("home"),
            appdata: d.0.join("roaming"),
            local_appdata: d.0.join("local"),
            program_files: vec![pf],
            windows: true,
        };
        (d, env)
    }

    mod tempfile_dir {
        pub struct Dir(pub std::path::PathBuf);
        impl Dir {
            pub fn new() -> Dir {
                let p = std::env::temp_dir().join(format!("bifrost-cat-{}-{:?}", std::process::id(), std::thread::current().id()));
                let _ = std::fs::remove_dir_all(&p);
                std::fs::create_dir_all(&p).unwrap();
                Dir(p)
            }
        }
        impl Drop for Dir {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
    }

    #[test]
    fn detects_by_path_and_folder() {
        let (_d, env) = fake();
        let found = detect(&env);
        let on: Vec<_> = found.iter().filter(|d| d.found).map(|d| d.id.as_str()).collect();
        assert_eq!(on, ["claude", "node", "uv", "git", "obs"]);
    }

    #[test]
    fn catalog_enables_what_was_found_and_never_asks_for_keys() {
        let (_d, env) = fake();
        let found = detect(&env);
        let cat = entries(&env, &found);
        let get = |n: &str| cat.iter().find(|e| e.name == n).unwrap();
        assert!(!get("claude-code").config.disabled());
        assert!(get("claude-code").detected);
        assert!(get("codex").config.disabled());
        assert!(!get("git").config.disabled());
        assert!(get("obs").detected && get("obs").config.disabled());
        assert!(!get("deepwiki").config.disabled());
        // Nuvem: OAuth via mcp-remote, desligado até o usuário ligar.
        assert!(matches!(&get("github").config, McpServer::Stdio { command, args, disabled: true, .. }
            if command == "cmd" && args.contains(&"https://api.githubcopilot.com/mcp/".to_string())));
        assert!(cat.iter().all(|e| e.config.validate().is_ok() && valid_name(&e.name)));
        let all = serde_json::to_string(&cat).unwrap().to_lowercase();
        assert!(!all.contains("api key") && !all.contains("api_key"));
    }

    #[test]
    fn imports_claude_cursor_and_vscode_files() {
        let claude = r#"{"mcpServers":{"notion":{"url":"https://mcp.notion.com/sse","headers":{"Authorization":"Bearer abc"}},
            "x y":{"command":"npx","args":["-y","pkg"]}}, "projects": {"D:/a":{}, "d:/a":{}}}"#;
        let got = parse_foreign("Claude Code", claude);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].secret.as_deref(), Some("abc"));
        assert_eq!(got[1].name, "x-y");
        let vscode = r#"{"servers":{"makenotion/notion-mcp-server":{"type":"http","url":"https://mcp.notion.com/sse"},
            "seg":{"type":"stdio","command":"x","env":{"K":"${input:k}"}}}}"#;
        let got = parse_foreign("VS Code", vscode);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].name, "makenotion-notion-mcp-server");
        assert!(parse_foreign("x", "{oops").is_empty());
    }

    #[test]
    fn merge_keeps_user_choices() {
        let (_d, env) = fake();
        let cat = entries(&env, &detect(&env));
        let mut servers = BTreeMap::new();
        let mut known = Default::default();
        merge(&mut servers, &mut known, &cat, &[]);
        assert!(servers.contains_key("claude-code"));
        servers.remove("claude-code");
        merge(&mut servers, &mut known, &cat, &[]);
        assert!(!servers.contains_key("claude-code"), "removido não volta");
        let imp = parse_foreign("Cursor", r#"{"mcpServers":{"meu":{"url":"https://mcp.deepwiki.com/mcp"},"outro":{"command":"a"}}}"#);
        merge(&mut servers, &mut known, &cat, &imp);
        assert!(!servers.contains_key("meu"), "mesmo endereço do catálogo não duplica");
        assert!(servers.contains_key("outro"));
    }
}
