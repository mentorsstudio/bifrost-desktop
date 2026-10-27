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
    // Fase 19: mais agentes reconhecidos (só detecção: nada é instalado nem executado).
    Program { id: "aider", name: "Aider", kind: "ia", commands: &["aider"], folders: &["~/.local/bin/aider.exe"] },
    Program { id: "goose", name: "Goose", kind: "ia", commands: &["goose"], folders: &["%LOCALAPPDATA%/Programs/Goose", "%LOCALAPPDATA%/Goose"] },
    Program { id: "qwen", name: "Qwen Code", kind: "ia", commands: &["qwen"], folders: &["%APPDATA%/npm/qwen.cmd"] },
    Program { id: "crush", name: "Crush", kind: "ia", commands: &["crush"], folders: &[] },
    Program { id: "opencode", name: "OpenCode", kind: "ia", commands: &["opencode"], folders: &["%APPDATA%/npm/opencode.cmd"] },
    Program { id: "amp", name: "Amp", kind: "ia", commands: &["amp"], folders: &["%APPDATA%/npm/amp.cmd"] },
    Program { id: "copilot", name: "Copilot CLI", kind: "ia", commands: &["copilot"], folders: &["%APPDATA%/npm/copilot.cmd"] },
    Program { id: "cline", name: "Cline (VS Code)", kind: "ia", commands: &[], folders: &["%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev"] },
    Program { id: "roo", name: "Roo Code (VS Code)", kind: "ia", commands: &[], folders: &["%APPDATA%/Code/User/globalStorage/rooveterinaryinc.roo-cline"] },
    Program { id: "continue", name: "Continue", kind: "ia", commands: &[], folders: &["~/.continue"] },
    Program { id: "windsurf", name: "Windsurf", kind: "editor", commands: &["windsurf"], folders: &["%LOCALAPPDATA%/Programs/Windsurf/Windsurf.exe"] },
    Program { id: "kiro", name: "Kiro", kind: "editor", commands: &["kiro"], folders: &["%LOCALAPPDATA%/Programs/Kiro/Kiro.exe"] },
    Program { id: "zed", name: "Zed", kind: "editor", commands: &["zed"], folders: &["%LOCALAPPDATA%/Programs/Zed/Zed.exe"] },
    Program { id: "warp", name: "Warp", kind: "editor", commands: &["warp"], folders: &["%LOCALAPPDATA%/Programs/Warp/warp.exe"] },
    Program { id: "jetbrains", name: "JetBrains (AI Assistant)", kind: "editor", commands: &[], folders: &["%APPDATA%/JetBrains"] },
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
        // Fase 19: outros clientes com o mesmo formato `mcpServers`.
        ("Windsurf", env.home.join(".codeium").join("windsurf").join("mcp_config.json")),
        ("Gemini CLI", env.home.join(".gemini").join("settings.json")),
        ("Kiro", env.home.join(".kiro").join("settings").join("mcp.json")),
        ("LM Studio", env.home.join(".lmstudio").join("mcp.json")),
        ("Cline", env.appdata.join("Code").join("User").join("globalStorage").join("saoudrizwan.claude-dev").join("settings").join("cline_mcp_settings.json")),
        ("Roo Code", env.appdata.join("Code").join("User").join("globalStorage").join("rooveterinaryinc.roo-cline").join("settings").join("mcp_settings.json")),
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
/// O que identifica um servidor além do nome: a URL (HTTP ou mcp-remote), o
/// pacote rodado por npx/uvx/bunx/pnpm dlx, ou o comando com os argumentos.
pub fn identity(s: &McpServer) -> String {
    if let Some(u) = url_of(s) {
        return u.to_lowercase();
    }
    let McpServer::Stdio { command, args, .. } = s else { return String::new() };
    let base = command.rsplit(['/', '\\']).next().unwrap_or(command).to_lowercase();
    let base = base.trim_end_matches(".exe").trim_end_matches(".cmd").trim_end_matches(".bat").to_string();
    if matches!(base.as_str(), "npx" | "uvx" | "bunx" | "pnpx" | "pnpm" | "uv" | "pipx") {
        let pkg = args.iter().map(|a| a.as_str()).find(|a| !a.starts_with('-') && !matches!(*a, "dlx" | "run" | "tool" | "x"));
        if let Some(pkg) = pkg {
            // "pacote@latest" → "pacote" (o escopo "@org/pacote" fica).
            let cut = pkg[1..].find('@').map(|i| i + 1).unwrap_or(pkg.len());
            return format!("pkg:{}", pkg[..cut].to_lowercase());
        }
    }
    format!("cmd:{}|{}", command.to_lowercase().replace('\\', "/"), args.join(" ").to_lowercase())
}

/// Um importado que é o mesmo servidor de uma entrada do catálogo com outro nome:
/// mesma identidade, ou o nome do catálogo mais só palavras genéricas
/// ("blender-mcp", "DaVinci-Resolve", "makenotion-notion-mcp-server") com o
/// nome do catálogo também no pacote/comando. "n8n-vault" não é o "n8n".
fn same_as_builtin(builtin: &str, builtin_cfg: &McpServer, name: &str, cfg: &McpServer) -> bool {
    let id = identity(cfg);
    if !id.is_empty() && id == identity(builtin_cfg) {
        return true;
    }
    let b = builtin.to_lowercase();
    let tokens: Vec<String> = name.to_lowercase().split(['-', '_', '.', ' ']).filter(|t| !t.is_empty()).map(str::to_string).collect();
    const NOISE: &[&str] = &["mcp", "server", "resolve", "makenotion", "official", "ai"];
    tokens.iter().any(|t| *t == b) && tokens.iter().all(|t| *t == b || NOISE.contains(&t.as_str())) && id.contains(&b)
}

/// Junta o catálogo e os importados aos servidores. Um importado igual a uma
/// entrada do catálogo vira uma só: fica o nome do catálogo com a configuração do
/// usuário (a importada) e a origem anotada em `sources`. `renamed` recebe
/// (nome antigo, nome que ficou) para quem já tinha entrado duplicado.
pub fn merge(
    servers: &mut BTreeMap<String, McpServer>,
    known: &mut std::collections::BTreeSet<String>,
    sources: &mut BTreeMap<String, String>,
    renamed: &mut Vec<(String, String)>,
    catalog: &[Entry],
    imported: &[Imported],
) -> Vec<(String, String)> {
    let mut secrets = Vec::new();
    for e in catalog {
        if known.insert(e.name.clone()) && !servers.contains_key(&e.name) {
            servers.insert(e.name.clone(), e.config.clone());
        }
    }
    for i in imported {
        let key = format!("importado:{}", i.name);
        let first = known.insert(key);
        let twin = catalog.iter().find(|e| {
            e.name != i.name && servers.contains_key(&e.name) && same_as_builtin(&e.name, &servers[&e.name], &i.name, &i.config)
        }).map(|e| e.name.clone())
            .or_else(|| {
                // Mesma URL/pacote de outro servidor já configurado (não do catálogo).
                let id = identity(&i.config);
                servers.iter().find(|(n, c)| **n != i.name && !id.is_empty() && identity(c) == id).map(|(n, _)| n.clone())
            });
        if let Some(keep) = twin {
            let was_there = servers.remove(&i.name).is_some();
            if first || was_there {
                let disabled = is_disabled(&servers[&keep]);
                let mut cfg = i.config.clone();
                set_disabled(&mut cfg, disabled);
                servers.insert(keep.clone(), cfg);
                if let Some(sec) = &i.secret {
                    secrets.push((keep.clone(), sec.clone()));
                }
            }
            if was_there {
                renamed.push((i.name.clone(), keep.clone()));
            }
            sources.insert(keep, i.source.clone());
            continue;
        }
        if servers.contains_key(&i.name) {
            if identity(&servers[&i.name]) == identity(&i.config) {
                sources.entry(i.name.clone()).or_insert_with(|| i.source.clone());
            }
            continue;
        }
        if !first {
            continue; // removido pelo usuário depois de importado: não volta.
        }
        servers.insert(i.name.clone(), i.config.clone());
        sources.insert(i.name.clone(), i.source.clone());
        if let Some(sec) = &i.secret {
            secrets.push((i.name.clone(), sec.clone()));
        }
    }
    secrets
}

fn is_disabled(s: &McpServer) -> bool {
    match s {
        McpServer::Stdio { disabled, .. } | McpServer::Http { disabled, .. } => *disabled,
    }
}

fn set_disabled(s: &mut McpServer, v: bool) {
    match s {
        McpServer::Stdio { disabled, .. } | McpServer::Http { disabled, .. } => *disabled = v,
    }
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
    fn phase19_more_agents_and_config_sources() {
        let ids: Vec<&str> = PROGRAMS.iter().map(|p| p.id).collect();
        for id in ["aider", "goose", "qwen", "crush", "opencode", "amp", "copilot", "cline", "roo", "continue", "windsurf", "kiro", "zed", "warp", "jetbrains"] {
            assert!(ids.contains(&id), "{id}");
        }
        let mut seen = std::collections::HashSet::new();
        assert!(ids.iter().all(|i| seen.insert(*i)), "ids únicos");
        let (_d, env) = fake();
        let names: Vec<&str> = config_files(&env).into_iter().map(|c| c.0).collect();
        for n in ["Windsurf", "Gemini CLI", "Kiro", "LM Studio", "Cline", "Roo Code"] { assert!(names.contains(&n), "{n}"); }
        // O formato comum: mcpServers com command/args.
        let got = parse_foreign("Windsurf", r#"{"mcpServers":{"fs":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem"]}}}"#);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].source, "Windsurf");
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
        let (mut src, mut ren) = (BTreeMap::new(), Vec::new());
        merge(&mut servers, &mut known, &mut src, &mut ren, &cat, &[]);
        assert!(servers.contains_key("claude-code"));
        servers.remove("claude-code");
        merge(&mut servers, &mut known, &mut src, &mut ren, &cat, &[]);
        assert!(!servers.contains_key("claude-code"), "removido não volta");
        let imp = parse_foreign("Cursor", r#"{"mcpServers":{"meu":{"url":"https://mcp.deepwiki.com/mcp"},"outro":{"command":"a"}}}"#);
        merge(&mut servers, &mut known, &mut src, &mut ren, &cat, &imp);
        assert!(!servers.contains_key("meu"), "mesmo endereço do catálogo não duplica");
        assert!(servers.contains_key("outro"));
        assert_eq!(src.get("outro").map(String::as_str), Some("Cursor"));
        assert_eq!(src.get("deepwiki").map(String::as_str), Some("Cursor"), "a origem fica no nome do catálogo");
    }

    #[test]
    fn imported_twins_of_builtins_are_merged() {
        let (_d, env) = fake();
        let cat = entries(&env, &detect(&env));
        let mut servers = BTreeMap::new();
        let mut known = Default::default();
        let (mut src, mut ren) = (BTreeMap::new(), Vec::new());
        merge(&mut servers, &mut known, &mut src, &mut ren, &cat, &[]);
        // Como no PC do Paulo: os duplicados já tinham entrado numa versão anterior.
        let imp = parse_foreign("Claude Desktop", r#"{"mcpServers":{
            "blender-mcp":{"command":"uvx","args":["blender-mcp"]},
            "DaVinci-Resolve":{"command":"C:/Tools/davinci-resolve-mcp/run.bat"},
            "makenotion-notion-mcp-server":{"command":"npx","args":["-y","@notionhq/notion-mcp-server"]},
            "n8n-vault":{"command":"node","args":["C:/n8n/vault.js"]},
            "higgsfield":{"url":"https://mcp.higgsfield.ai/mcp"}}}"#);
        for i in &imp { servers.insert(i.name.clone(), i.config.clone()); }
        merge(&mut servers, &mut known, &mut src, &mut ren, &cat, &imp);
        for gone in ["blender-mcp", "DaVinci-Resolve", "makenotion-notion-mcp-server"] {
            assert!(!servers.contains_key(gone), "{gone} juntado");
        }
        assert!(servers.contains_key("n8n-vault") && servers.contains_key("higgsfield"));
        assert_eq!(identity(&servers["blender"]), "pkg:blender-mcp", "fica a configuração do usuário");
        assert_eq!(src.get("notion").map(String::as_str), Some("Claude Desktop"));
        assert_eq!(src.get("higgsfield").map(String::as_str), Some("Claude Desktop"));
        assert_eq!(ren.len(), 3);
        // Rodar de novo não muda nada.
        let before = servers.clone();
        merge(&mut servers, &mut known, &mut src, &mut ren, &cat, &imp);
        assert_eq!(before, servers);
    }

    #[test]
    fn identity_of_packages_and_urls() {
        let npx = McpServer::Stdio { command: "C:/nodejs/npx.cmd".into(), args: vec!["-y".into(), "@notionhq/notion-mcp-server@latest".into()], env: Default::default(), disabled: false };
        assert_eq!(identity(&npx), "pkg:@notionhq/notion-mcp-server");
        let remote = McpServer::Stdio { command: "npx".into(), args: vec!["-y".into(), "mcp-remote".into(), "https://mcp.notion.com/mcp/".into()], env: Default::default(), disabled: false };
        assert_eq!(identity(&remote), "https://mcp.notion.com/mcp");
    }
}
