//! Agentes que rodam no PC sem hooks: o painel da ilha os mostra mesmo assim.
//!
//! - CLIs (`claude.exe`, `codex.exe`, `gemini.exe`) e a janela de terminal ou
//!   editor que os hospeda (o primeiro ancestral com janela);
//! - editores abertos (VS Code, Cursor, Antigravity, Windsurf) e a pasta do título;
//! - Ollama: os modelos carregados agora (`GET /api/ps` em 127.0.0.1:11434).
//!
//! Só leitura: nada é instalado nem alterado aqui.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Detected {
    /// `cli:codex:1234`, `editor:cursor:99`, `ollama:llama3.2`.
    pub id: String,
    /// `claude` · `codex` · `gemini` · `vscode` · `cursor` · `antigravity` · `windsurf` · `ollama`.
    pub agent: String,
    pub kind: &'static str,
    pub name: String,
    pub folder: Option<String>,
    /// Janela a trazer para a frente.
    pub window: Option<isize>,
    /// Onde roda: "Windows Terminal", "PowerShell", "VS Code"…
    pub host: Option<String>,
}

pub fn cli_of(exe: &str) -> Option<(&'static str, &'static str)> {
    match exe.to_ascii_lowercase().as_str() {
        "claude.exe" | "claude" => Some(("claude", "Claude Code")),
        "codex.exe" | "codex" => Some(("codex", "Codex")),
        "gemini.exe" | "gemini" => Some(("gemini", "Gemini CLI")),
        _ => None,
    }
}

pub fn editor_of(exe: &str) -> Option<(&'static str, &'static str, &'static str)> {
    // (id, nome, sufixo do título)
    match exe.to_ascii_lowercase().as_str() {
        "code.exe" => Some(("vscode", "VS Code", "Visual Studio Code")),
        "cursor.exe" => Some(("cursor", "Cursor", "Cursor")),
        "antigravity.exe" => Some(("antigravity", "Antigravity", "Antigravity")),
        "windsurf.exe" => Some(("windsurf", "Windsurf", "Windsurf")),
        _ => None,
    }
}

pub fn host_of(exe: &str) -> String {
    match exe.to_ascii_lowercase().as_str() {
        "windowsterminal.exe" => "Windows Terminal".into(),
        "powershell.exe" | "pwsh.exe" => "PowerShell".into(),
        "cmd.exe" => "Prompt de Comando".into(),
        "conhost.exe" | "openconsole.exe" => "Console".into(),
        other => editor_of(other).map(|e| e.1.to_string()).unwrap_or_else(|| other.trim_end_matches(".exe").to_string()),
    }
}

/// "● main.rs - bifrost - Visual Studio Code" → "bifrost"; "bifrost - Cursor" → "bifrost".
pub fn folder_from_title(title: &str, suffix: &str) -> Option<String> {
    let t = title.trim().trim_start_matches('●').trim();
    let t = t.strip_suffix(suffix)?.trim_end().strip_suffix('-')?.trim_end();
    let parts: Vec<&str> = t.split(" - ").map(str::trim).filter(|s| !s.is_empty()).collect();
    let last = parts.last()?;
    let last = last.trim_end_matches(" [WSL]").trim_end_matches(" (Workspace)");
    if last.is_empty() || last.eq_ignore_ascii_case("Welcome") || last.eq_ignore_ascii_case("Boas-vindas") {
        return None;
    }
    Some(last.to_string())
}

/// Modelos carregados no Ollama, do JSON de `/api/ps`.
pub fn ollama_models(json: &serde_json::Value) -> Vec<String> {
    json.get("models")
        .and_then(|m| m.as_array())
        .map(|a| a.iter().filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from)).collect())
        .unwrap_or_default()
}

/// Quem pode hospedar uma sessão de CLI: um terminal ou um editor (não o app
/// do Codex, nem serviços como `codex-windows-sandbox-service`).
pub fn is_host(exe: &str) -> bool {
    matches!(
        exe.to_ascii_lowercase().as_str(),
        "windowsterminal.exe" | "powershell.exe" | "pwsh.exe" | "cmd.exe" | "conhost.exe" | "openconsole.exe"
            | "wezterm-gui.exe" | "alacritty.exe" | "mintty.exe" | "tabby.exe" | "hyper.exe" | "warp.exe"
    ) || editor_of(exe).is_some()
}

/// CLIs instaladas pelo npm rodam como `node.exe`: a linha de comando diz qual.
pub fn cli_of_cmdline(cmd: &str) -> Option<(&'static str, &'static str)> {
    let c = cmd.to_ascii_lowercase().replace('\\', "/");
    if c.contains("@anthropic-ai/claude-code") || c.contains("/claude-code/cli") { return Some(("claude", "Claude Code")); }
    if c.contains("@openai/codex") || c.contains("/codex/bin/codex") { return Some(("codex", "Codex")); }
    if c.contains("@google/gemini-cli") || c.contains("/gemini-cli/") || c.ends_with("/bin/gemini") || c.contains("/bin/gemini ") { return Some(("gemini", "Gemini CLI")); }
    None
}

fn agent_of(pid: u32, exe: &str, cmdlines: &HashMap<u32, String>) -> Option<(&'static str, &'static str)> {
    if exe.eq_ignore_ascii_case("node.exe") || exe.eq_ignore_ascii_case("node") {
        return cmdlines.get(&pid).and_then(|c| cli_of_cmdline(c));
    }
    cli_of(exe)
}

/// Junta processos e janelas numa lista de agentes. `cmdlines`: linhas de
/// comando dos `node.exe` (pode vir vazio).
pub fn detect(procs: &[(u32, u32, String)], windows: &[(isize, u32, String)], cmdlines: &HashMap<u32, String>) -> Vec<Detected> {
    let table: HashMap<u32, (u32, &str)> = procs.iter().map(|(pid, par, exe)| (*pid, (*par, exe.as_str()))).collect();
    let mut out = Vec::new();
    let mut taken = std::collections::HashSet::new();
    for (pid, _, exe) in procs {
        let Some((agent, name)) = agent_of(*pid, exe, cmdlines) else { continue };
        // Sobe pelos pais: um ancestral do mesmo agente = o mesmo agente (filhos,
        // shims do npm); o primeiro terminal/editor com janela é onde ele roda.
        let mut cur = *pid;
        let mut found: Option<(isize, &str, &str)> = None;
        let mut nested = false;
        for _ in 0..16 {
            let Some((parent, _)) = table.get(&cur) else { break };
            let parent = *parent;
            if parent == 0 || parent == cur { break; }
            let pexe = table.get(&parent).map(|p| p.1).unwrap_or("");
            if agent_of(parent, pexe, cmdlines).map(|c| c.0) == Some(agent) { nested = true; break; }
            if is_host(pexe) {
                if let Some((h, _, title)) = windows.iter().find(|(_, owner, _)| *owner == parent) {
                    found = Some((*h, pexe, title.as_str()));
                    break;
                }
            }
            cur = parent;
        }
        if nested { continue; }
        // Sem terminal nem editor: é um processo auxiliar (o app do Codex, um serviço).
        let Some(f) = found else { continue };
        if !taken.insert((agent, f.0)) { continue; }
        let folder = editor_of(f.1).and_then(|e| folder_from_title(f.2, e.2));
        out.push(Detected {
            id: format!("cli:{agent}:{pid}"),
            agent: agent.into(),
            kind: "cli",
            name: name.into(),
            folder,
            window: Some(f.0),
            host: Some(host_of(f.1)),
        });
    }
    let mut seen = std::collections::HashSet::new();
    for (h, owner, title) in windows {
        let Some((_, exe)) = table.get(owner) else { continue };
        let Some((id, name, suffix)) = editor_of(exe) else { continue };
        let Some(folder) = folder_from_title(title, suffix) else { continue };
        if !seen.insert((id, folder.clone())) { continue; }
        out.push(Detected {
            id: format!("editor:{id}:{folder}"),
            agent: id.into(),
            kind: "editor",
            name: name.into(),
            folder: Some(folder),
            window: Some(*h),
            host: None,
        });
    }
    out
}

/// O Ollama numa linha só: os modelos carregados juntos, ou "pronto" sem nenhum.
pub fn ollama_row(models: Option<Vec<String>>, running: bool) -> Option<Detected> {
    if models.is_none() && !running { return None; }
    let list = models.unwrap_or_default();
    Some(Detected {
        id: "ollama".into(),
        agent: "ollama".into(),
        kind: "ollama",
        name: "Ollama".into(),
        folder: (!list.is_empty()).then(|| list.join(", ")),
        window: None,
        host: Some("127.0.0.1:11434".into()),
    })
}

/// Linhas de comando dos `node.exe` (só no Windows; cache de 30 s).
#[cfg(windows)]
async fn node_cmdlines(procs: &[(u32, u32, String)]) -> HashMap<u32, String> {
    use std::sync::Mutex;
    static CACHE: Mutex<Option<(std::time::Instant, HashMap<u32, String>)>> = Mutex::new(None);
    if !procs.iter().any(|(_, _, e)| e.eq_ignore_ascii_case("node.exe")) { return HashMap::new(); }
    if let Some((at, map)) = CACHE.lock().unwrap().as_ref() {
        if at.elapsed() < std::time::Duration::from_secs(30) { return map.clone(); }
    }
    let mut cmd = tokio::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"]);
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let map = match tokio::time::timeout(std::time::Duration::from_secs(4), cmd.output()).await {
        Ok(Ok(o)) => parse_cmdlines(&String::from_utf8_lossy(&o.stdout)),
        _ => HashMap::new(),
    };
    *CACHE.lock().unwrap() = Some((std::time::Instant::now(), map.clone()));
    map
}
#[cfg(not(windows))]
async fn node_cmdlines(_procs: &[(u32, u32, String)]) -> HashMap<u32, String> { HashMap::new() }

pub fn parse_cmdlines(text: &str) -> HashMap<u32, String> {
    text.lines().filter_map(|l| { let (a, b) = l.split_once('\t')?; Some((a.trim().parse().ok()?, b.trim().to_string())) }).collect()
}

/// O retrato completo, com o Ollama (meio segundo no máximo).
pub async fn scan() -> Vec<Detected> {
    let (procs, windows) = crate::platform::agent_snapshot();
    let cmdlines = node_cmdlines(&procs).await;
    let mut out = detect(&procs, &windows, &cmdlines);
    let running = procs.iter().any(|(_, _, e)| e.eq_ignore_ascii_case("ollama.exe") || e.eq_ignore_ascii_case("ollama"));
    let mut models = None;
    if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_millis(500)).build() {
        if let Ok(r) = client.get("http://127.0.0.1:11434/api/ps").send().await {
            if let Ok(json) = r.json::<serde_json::Value>().await { models = Some(ollama_models(&json)); }
        }
    }
    out.extend(ollama_row(models, running));
    let exes: Vec<String> = procs.iter().map(|(_, _, e)| e.to_ascii_lowercase()).collect();
    let present: Vec<String> = out.iter().map(|d| d.agent.clone()).collect();
    out.extend(installed_rows(&installed_cached(), &exes, &present));
    out
}

/// Um agente instalado no PC (mesmo parado). `last` = a última sessão, se houver.
#[derive(Debug, Clone, PartialEq)]
pub struct Installed {
    pub agent: &'static str,
    pub name: &'static str,
    /// Executáveis que, rodando, fazem a linha dizer "em execução".
    pub procs: &'static [&'static str],
    pub last: Option<String>,
    pub note: Option<String>,
}

/// Instalados → linhas: os que já aparecem (CLI num terminal, editor aberto,
/// Ollama) não repetem; os demais saem como `app` (rodando) ou `installed`.
pub fn installed_rows(list: &[Installed], exes: &[String], present: &[String]) -> Vec<Detected> {
    list.iter()
        .filter(|i| !present.iter().any(|p| p == i.agent))
        .map(|i| {
            let running = i.procs.iter().any(|p| exes.iter().any(|e| e == p));
            Detected {
                id: format!("installed:{}", i.agent),
                agent: i.agent.into(),
                kind: if running { "app" } else { "idle" },
                name: i.name.into(),
                folder: i.last.clone(),
                window: None,
                host: i.note.clone(),
            }
        })
        .collect()
}

/// A pasta da sessão mais recente de um diretório de transcrições `.jsonl`
/// (Claude Code: `~/.claude/projects/*/*.jsonl`; Codex: `~/.codex/sessions/…`).
/// Lê só o começo do arquivo, atrás de `"cwd":"…"`.
pub fn cwd_in(text: &str) -> Option<String> {
    let i = text.find("\"cwd\":")?;
    let rest = text[i + 6..].trim_start().strip_prefix('"')?;
    let mut out = String::new();
    let mut esc = false;
    for c in rest.chars() {
        if esc { out.push(c); esc = false; } else if c == '\\' { esc = true; } else if c == '"' { break; } else { out.push(c); }
    }
    (!out.is_empty()).then_some(out)
}

fn newest_jsonl(dir: &std::path::Path, depth: u32) -> Option<(std::time::SystemTime, std::path::PathBuf)> {
    let mut best: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        let Ok(m) = e.metadata() else { continue };
        let cand = if m.is_dir() { if depth == 0 { None } else { newest_jsonl(&p, depth - 1) } }
            else if p.extension().is_some_and(|x| x == "jsonl") { m.modified().ok().map(|t| (t, p.clone())) } else { None };
        if let Some(c) = cand { if best.as_ref().is_none_or(|b| c.0 > b.0) { best = Some(c); } }
    }
    best
}

fn last_session(dir: &std::path::Path, depth: u32) -> Option<String> {
    use std::io::Read;
    let (when, file) = newest_jsonl(dir, depth)?;
    let mut buf = vec![0u8; 64 * 1024];
    let n = std::fs::File::open(&file).ok()?.read(&mut buf).ok()?;
    let cwd = cwd_in(&String::from_utf8_lossy(&buf[..n]));
    let folder = cwd.as_deref().map(|c| c.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or(c).to_string());
    let ago = when.elapsed().ok().map(|d| ago_text(d.as_secs())).unwrap_or_default();
    Some(match folder { Some(f) => format!("última sessão: {f} · {ago}"), None => format!("última sessão {ago}") })
}

pub fn ago_text(secs: u64) -> String {
    match secs {
        0..=59 => "agora".into(),
        60..=3599 => format!("há {} min", secs / 60),
        3600..=86_399 => format!("há {} h", secs / 3600),
        _ => format!("há {} d", secs / 86_400),
    }
}

/// O que está instalado (cache de 60 s: só olha pastas, nada roda).
fn installed_cached() -> Vec<Installed> {
    use std::sync::Mutex;
    static CACHE: Mutex<Option<(std::time::Instant, Vec<Installed>)>> = Mutex::new(None);
    if let Some((at, v)) = CACHE.lock().unwrap().as_ref() {
        if at.elapsed() < std::time::Duration::from_secs(60) { return v.clone(); }
    }
    let v = installed_now();
    *CACHE.lock().unwrap() = Some((std::time::Instant::now(), v.clone()));
    v
}

fn on_path(names: &[&str]) -> bool {
    let Some(path) = std::env::var_os("PATH") else { return false };
    std::env::split_paths(&path).any(|d| names.iter().any(|n| d.join(n).is_file()))
}

fn installed_now() -> Vec<Installed> {
    use std::path::PathBuf;
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    let home = env("USERPROFILE").or_else(|| env("HOME")).unwrap_or_default();
    let appdata = env("APPDATA").unwrap_or_else(|| home.join("AppData/Roaming"));
    let local = env("LOCALAPPDATA").unwrap_or_else(|| home.join("AppData/Local"));
    let progs = local.join("Programs");
    let any = |ps: &[PathBuf]| ps.iter().any(|p| p.exists());
    let vsext = |needle: &str| [".vscode", ".cursor", ".windsurf"].iter().any(|d| {
        std::fs::read_dir(home.join(d).join("extensions")).map(|r| r.flatten().any(|e| e.file_name().to_string_lossy().to_ascii_lowercase().starts_with(needle))).unwrap_or(false)
    });
    let mut v = Vec::new();
    let mut add = |agent, name, procs, ok: bool, last: Option<String>, note: Option<String>| {
        if ok { v.push(Installed { agent, name, procs, last, note }); }
    };
    let claude_cli = any(&[home.join(".local/bin/claude.exe"), home.join(".local/bin/claude"), appdata.join("npm/claude.cmd")]) || on_path(&["claude.exe", "claude.cmd", "claude"]);
    let claude_ext = vsext("anthropic.claude-code");
    add("claude", "Claude Code", &[], claude_cli || claude_ext, last_session(&home.join(".claude/projects"), 1),
        (claude_ext && !claude_cli).then(|| "extensão do VS Code".to_string()).or_else(|| (claude_cli && claude_ext).then(|| "CLI + extensão do VS Code".into())));
    let claude_app = any(&[local.join("AnthropicClaude"), progs.join("Claude")])
        || std::fs::read_dir(local.join("Packages")).map(|r| r.flatten().any(|e| e.file_name().to_string_lossy().to_ascii_lowercase().starts_with("claude"))).unwrap_or(false);
    add("claude-app", "Claude (app)", &["claude.exe"], claude_app, None, None);
    add("codex", "Codex", &["codex.exe"], any(&[progs.join("OpenAI/Codex"), appdata.join("npm/codex.cmd")]) || on_path(&["codex.exe", "codex.cmd"]),
        last_session(&home.join(".codex/sessions"), 3), None);
    add("gemini", "Gemini CLI", &[], any(&[appdata.join("npm/gemini.cmd")]) || on_path(&["gemini.exe", "gemini.cmd", "gemini"]), None, None);
    add("ollama", "Ollama", &["ollama.exe", "ollama app.exe"], any(&[progs.join("Ollama")]) || on_path(&["ollama.exe", "ollama"]), None, None);
    add("vscode", "VS Code", &["code.exe"], any(&[progs.join("Microsoft VS Code")]) || on_path(&["code.cmd"]),
        None, { let mut x = Vec::new(); for (n, l) in [("github.copilot", "Copilot"), ("saoudrizwan.claude-dev", "Cline"), ("continue.continue", "Continue"), ("rooveterinaryinc.roo-cline", "Roo")] { if vsext(n) { x.push(l); } } (!x.is_empty()).then(|| x.join(", ")) });
    add("cursor", "Cursor", &["cursor.exe"], any(&[progs.join("cursor")]), None, None);
    add("windsurf", "Windsurf", &["windsurf.exe"], any(&[progs.join("Windsurf")]), None, None);
    add("antigravity", "Antigravity", &["antigravity.exe"], any(&[progs.join("Antigravity")]), None, None);
    add("lmstudio", "LM Studio", &["lm studio.exe"], any(&[progs.join("LM Studio"), home.join(".lmstudio")]), None, None);
    add("hermes", "Hermes", &["hermes.exe"], any(&[local.join("hermes/bin/hermes.exe")]) || on_path(&["hermes.exe"]), None, None);
    add("grok", "Grok", &["grok.exe"], any(&[home.join(".grok/bin/grok.exe")]) || on_path(&["grok.exe"]), None, None);
    v
}

/// O branch do repositório que contém `dir` (lendo `.git/HEAD`, subindo pastas).
pub fn git_branch(dir: &std::path::Path) -> Option<String> {
    let mut cur = Some(dir);
    while let Some(d) = cur {
        let git = d.join(".git");
        let head = if git.is_dir() {
            std::fs::read_to_string(git.join("HEAD")).ok()
        } else if git.is_file() {
            // worktree: "gitdir: <caminho>"
            let link = std::fs::read_to_string(&git).ok()?;
            let target = link.trim().strip_prefix("gitdir:")?.trim().to_string();
            std::fs::read_to_string(std::path::Path::new(&target).join("HEAD")).ok()
        } else {
            None
        };
        if let Some(h) = head {
            return branch_from_head(&h);
        }
        cur = d.parent();
    }
    None
}

pub fn branch_from_head(head: &str) -> Option<String> {
    let h = head.trim();
    if let Some(r) = h.strip_prefix("ref: refs/heads/") { return Some(r.to_string()); }
    (h.len() >= 7).then(|| h[..7].to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn installed_rows_and_cwd() {
        assert_eq!(cwd_in(r#"{"type":"x","cwd":"D:\\Projetos\\blade","y":1}"#).as_deref(), Some("D:\\Projetos\\blade"));
        assert_eq!(cwd_in("nada"), None);
        let list = vec![
            Installed { agent: "claude", name: "Claude Code", procs: &[], last: Some("última sessão: blade · há 2 h".into()), note: None },
            Installed { agent: "ollama", name: "Ollama", procs: &["ollama.exe"], last: None, note: None },
            Installed { agent: "hermes", name: "Hermes", procs: &["hermes.exe"], last: None, note: None },
        ];
        let rows = installed_rows(&list, &["hermes.exe".into()], &["ollama".into()]);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].kind, "idle");
        assert_eq!(rows[1].kind, "app");
        assert_eq!(ago_text(7200), "há 2 h");
    }

    #[test]
    fn head_gives_branch() {
        assert_eq!(super::branch_from_head("ref: refs/heads/paulo-mcp\n").as_deref(), Some("paulo-mcp"));
        assert_eq!(super::branch_from_head("0123456789abcdef").as_deref(), Some("0123456"));
        let d = std::env::temp_dir().join("bf-branch-test/a/b");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::create_dir_all(d.parent().unwrap().parent().unwrap().join(".git")).unwrap();
        std::fs::write(d.parent().unwrap().parent().unwrap().join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        assert_eq!(super::git_branch(&d).as_deref(), Some("main"));
    }
    use super::*;

    #[test]
    fn helpers_and_the_codex_app_are_not_sessions() {
        // O que o PC do Paulo mostra: codex.exe do app (sem terminal), auxiliares, ollama.
        let procs = vec![
            (1, 0, "explorer.exe".to_string()),
            (50, 1, "Codex.exe".to_string()),
            (51, 50, "codex.exe".to_string()),
            (52, 51, "codex-code-mode-host.exe".to_string()),
            (53, 0, "codex-windows-sandbox-service.exe".to_string()),
            (54, 51, "codex-computer-use-swift.exe".to_string()),
            (10, 1, "WindowsTerminal.exe".to_string()),
            (11, 10, "pwsh.exe".to_string()),
            (12, 11, "node.exe".to_string()),
            (13, 12, "codex.exe".to_string()),
            (60, 1, "ollama app.exe".to_string()),
            (61, 60, "ollama.exe".to_string()),
        ];
        let windows = vec![(500, 50, "Codex".to_string()), (100, 10, "pwsh".to_string())];
        let mut cmd = HashMap::new();
        cmd.insert(12, "node C:\\Users\\p\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js".to_string());
        let d = detect(&procs, &windows, &cmd);
        let codex: Vec<_> = d.iter().filter(|x| x.agent == "codex").collect();
        assert_eq!(codex.len(), 1, "{d:?}");
        assert_eq!(codex[0].window, Some(100));
        assert!(d.iter().all(|x| !x.name.contains("host") && !x.name.contains("service")));
        assert!(ollama_row(Some(vec![]), true).is_some());
        assert_eq!(ollama_row(Some(vec!["a".into(), "b".into()]), true).unwrap().folder.as_deref(), Some("a, b"));
        assert!(ollama_row(None, false).is_none());
    }

    #[test]
    fn npm_clis_by_command_line() {
        assert_eq!(cli_of_cmdline("node C:/x/npm/node_modules/@google/gemini-cli/dist/index.js").map(|c| c.0), Some("gemini"));
        assert_eq!(cli_of_cmdline("\"node\" C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js").map(|c| c.0), Some("claude"));
        assert_eq!(cli_of_cmdline("node server.js"), None);
        assert_eq!(parse_cmdlines("12\tnode a.js\n13\tnode b.js\n").get(&13).map(String::as_str), Some("node b.js"));
    }

    #[test]
    fn titles_give_the_folder() {
        assert_eq!(folder_from_title("● main.rs - bifrost - Visual Studio Code", "Visual Studio Code").as_deref(), Some("bifrost"));
        assert_eq!(folder_from_title("site-loja - Cursor", "Cursor").as_deref(), Some("site-loja"));
        assert_eq!(folder_from_title("Welcome - Visual Studio Code", "Visual Studio Code"), None);
        assert_eq!(folder_from_title("Visual Studio Code", "Visual Studio Code"), None);
        assert_eq!(folder_from_title("notas.txt - Bloco de Notas", "Cursor"), None);
    }

    #[test]
    fn ollama_ps_lists_loaded_models() {
        let j = serde_json::json!({"models":[{"name":"llama3.2:latest"},{"name":"qwen2.5"}]});
        assert_eq!(ollama_models(&j), vec!["llama3.2:latest", "qwen2.5"]);
        assert!(ollama_models(&serde_json::json!({})).is_empty());
    }

    #[test]
    fn a_cli_is_found_with_its_terminal_and_editors_with_their_folder() {
        let procs = vec![
            (10, 1, "WindowsTerminal.exe".to_string()),
            (11, 10, "pwsh.exe".to_string()),
            (12, 11, "codex.exe".to_string()),
            (13, 12, "codex.exe".to_string()),
            (20, 1, "Code.exe".to_string()),
            (21, 20, "claude.exe".to_string()),
        ];
        let windows = vec![(100, 10, "PowerShell".to_string()), (200, 20, "lib.rs - bifrost - Visual Studio Code".to_string())];
        let d = detect(&procs, &windows, &HashMap::new());
        let codex: Vec<_> = d.iter().filter(|x| x.agent == "codex").collect();
        assert_eq!(codex.len(), 1, "o filho codex é o mesmo agente");
        assert_eq!(codex[0].window, Some(100));
        assert_eq!(codex[0].host.as_deref(), Some("Windows Terminal"));
        let claude = d.iter().find(|x| x.agent == "claude").unwrap();
        assert_eq!(claude.folder.as_deref(), Some("bifrost"));
        assert_eq!(claude.host.as_deref(), Some("VS Code"));
        assert!(d.iter().any(|x| x.kind == "editor" && x.folder.as_deref() == Some("bifrost")));
    }
}
