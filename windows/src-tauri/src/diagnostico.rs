//! `bifrost-desktop.exe --diagnostico [arquivo]`: escreve um JSON com o que o
//! Bifrost vê nesta máquina (versão, pipe dos hooks, servidor MCP, agentes e
//! programas detectados) e sai sem abrir janela. Usado por scripts/smoke-test.ps1.
//! Nunca inclui tokens, chaves nem o conteúdo de settings.json.

use serde_json::json;
use std::path::PathBuf;

/// O caminho pedido depois de `--diagnostico`, ou `%TEMP%\bifrost-diagnostico.json`.
pub fn requested(args: &[String]) -> Option<PathBuf> {
    let i = args.iter().position(|a| a == "--diagnostico")?;
    Some(match args.get(i + 1).filter(|a| !a.starts_with("--")) {
        Some(p) => PathBuf::from(p),
        None => std::env::temp_dir().join("bifrost-diagnostico.json"),
    })
}

pub fn run(out: PathBuf) -> i32 {
    let s = crate::settings::load();
    let agents = tauri::async_runtime::block_on(crate::agents_scan::scan());
    let scan = crate::mcp::catalog::scan(&crate::mcp::catalog::Env::current()).0;
    let programs: Vec<_> = scan.programs.iter().filter(|p| p.found).map(|p| p.name.clone()).collect();
    let report = json!({
        "versao": env!("CARGO_PKG_VERSION"),
        "geradoEm": chrono_now(),
        "pipe": pipe_name(),
        "mcpServidor": { "ligado": s.mcp_server_enabled, "porta": s.mcp_server_port },
        "mcpServidores": s.mcp_servers.keys().collect::<Vec<_>>(),
        "agentes": agents,
        "programas": programs,
    });
    match std::fs::write(&out, serde_json::to_vec_pretty(&report).unwrap_or_default()) {
        Ok(()) => 0,
        Err(_) => 1,
    }
}

#[cfg(windows)]
fn pipe_name() -> String {
    crate::pipe::pipe_name()
}
#[cfg(not(windows))]
fn pipe_name() -> String {
    String::new()
}

fn chrono_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn caminho_padrao_e_pedido() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(requested(&a(&["bifrost"])), None);
        assert_eq!(requested(&a(&["bifrost", "--diagnostico"])), Some(std::env::temp_dir().join("bifrost-diagnostico.json")));
        assert_eq!(requested(&a(&["bifrost", "--diagnostico", "C:/x.json"])), Some(PathBuf::from("C:/x.json")));
    }
}
