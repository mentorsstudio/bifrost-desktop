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

/// Junta processos e janelas numa lista de agentes.
pub fn detect(procs: &[(u32, u32, String)], windows: &[(isize, u32, String)]) -> Vec<Detected> {
    let table: HashMap<u32, (u32, &str)> = procs.iter().map(|(pid, par, exe)| (*pid, (*par, exe.as_str()))).collect();
    let mut out = Vec::new();
    for (pid, _, exe) in procs {
        let Some((agent, name)) = cli_of(exe) else { continue };
        // Sobe pelos pais até achar quem tem janela (o terminal ou o editor).
        let mut cur = *pid;
        let mut hops = 0;
        let mut found: Option<(isize, &str, &str)> = None;
        while hops < 12 {
            let Some((parent, _)) = table.get(&cur) else { break };
            if let Some((h, _, title)) = windows.iter().find(|(_, owner, _)| *owner == *parent) {
                found = Some((*h, table.get(parent).map(|p| p.1).unwrap_or(""), title.as_str()));
                break;
            }
            if *parent == 0 || *parent == cur { break; }
            cur = *parent;
            hops += 1;
        }
        // Um claude.exe que é filho de outro claude.exe é o mesmo agente.
        if table.get(pid).and_then(|(par, _)| table.get(par)).is_some_and(|(_, e)| cli_of(e).map(|c| c.0) == Some(agent)) {
            continue;
        }
        let folder = found.and_then(|(_, hexe, title)| editor_of(hexe).and_then(|e| folder_from_title(title, e.2)));
        out.push(Detected {
            id: format!("cli:{agent}:{pid}"),
            agent: agent.into(),
            kind: "cli",
            name: name.into(),
            folder,
            window: found.map(|f| f.0),
            host: found.map(|f| host_of(f.1)),
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

/// O retrato completo, com o Ollama (meio segundo no máximo).
pub async fn scan() -> Vec<Detected> {
    let (procs, windows) = crate::platform::agent_snapshot();
    let mut out = detect(&procs, &windows);
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_millis(500)).build();
    if let Ok(client) = client {
        if let Ok(r) = client.get("http://127.0.0.1:11434/api/ps").send().await {
            if let Ok(json) = r.json::<serde_json::Value>().await {
                for m in ollama_models(&json) {
                    out.push(Detected {
                        id: format!("ollama:{m}"),
                        agent: "ollama".into(),
                        kind: "ollama",
                        name: "Ollama".into(),
                        folder: Some(m),
                        window: None,
                        host: Some("127.0.0.1:11434".into()),
                    });
                }
            }
        }
    }
    out
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
        let d = detect(&procs, &windows);
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
