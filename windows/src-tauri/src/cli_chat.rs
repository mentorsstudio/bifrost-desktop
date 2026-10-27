// O chat pelas IAs instaladas no PC, sem chave de API: Claude Code, Codex CLI
// ou Gemini CLI, cada um com o login que o próprio programa já tem.
// A conversa vai como texto pelo stdin; a resposta é o stdout.

use std::process::Stdio;
use std::time::Duration;

use serde_json::json;
use tokio::io::AsyncWriteExt;

use crate::chat::{plain_question, Chat, ChatContext, ChatReply, ModelInfo};
use crate::mcp::catalog::{detect, Env};

pub const PROVIDER: &str = "cli";
const TIMEOUT: Duration = Duration::from_secs(600);

/// Provedores antigos que pediam chave de API: o chat sai deles na abertura.
pub fn needs_migration(provider: &str) -> bool {
    matches!(provider, "" | "anthropic" | "openai" | "google" | "openrouter")
}

/// Pílulas que só funcionavam com chave de API: agora são servidores MCP.
pub const KEYED_PILLS: &[&str] = &[
    "integration_stripe", "integration_github", "integration_gitlab", "integration_gitea",
    "integration_vercel", "integration_n8n", "integration_resend", "integration_notion", "integration_calcom",
];

/// (id, nome, argumentos). O prompt sempre vai pelo stdin.
pub const CLIS: &[(&str, &str, &[&str])] = &[
    ("claude", "Claude Code", &["-p", "--output-format", "text"]),
    ("codex", "Codex CLI", &["exec", "--skip-git-repo-check", "-"]),
    ("gemini", "Gemini CLI", &[]),
];

pub fn models() -> Vec<ModelInfo> {
    let found = detect(&Env::current());
    CLIS.iter()
        .filter(|(id, ..)| found.iter().any(|d| d.id == *id && d.found))
        .map(|(id, name, _)| ModelInfo { id: (*id).into(), label: (*name).into() })
        .collect()
}

pub async fn send(chat: &Chat, model: &str, query: String, context: Option<ChatContext>) -> Result<ChatReply, String> {
    let found = detect(&Env::current());
    let pick = |id: &str| found.iter().find(|d| d.id == id && d.found).and_then(|d| d.path.clone());
    let (id, path) = CLIS
        .iter()
        .map(|(id, ..)| *id)
        .filter(|id| model.is_empty() || *id == model)
        .find_map(|id| pick(id).map(|p| (id, p)))
        .ok_or_else(|| "Nenhuma IA instalada encontrada (Claude Code, Codex ou Gemini CLI).".to_string())?;
    let args = CLIS.iter().find(|(i, ..)| *i == id).map(|c| c.2).unwrap_or(&[]);

    let turn = chat.begin(PROVIDER);
    let question = plain_question(turn.first, context.as_ref(), &query);
    let message = crate::mcp::chat::compose(&turn.history, &question, true);
    let answer = run(&path, args, &message).await?;
    chat.commit(
        &turn,
        json!({"role": "user", "content": question}),
        json!({"role": "assistant", "content": answer}),
        &question,
        &answer,
    );
    Ok(ChatReply { text: answer })
}

async fn run(path: &str, args: &[&str], input: &str) -> Result<String, String> {
    let mut std_cmd = if path.to_ascii_lowercase().ends_with(".cmd") {
        let mut c = std::process::Command::new("cmd");
        c.arg("/c").arg(path);
        c
    } else {
        std::process::Command::new(path)
    };
    std_cmd.args(args);
    crate::platform::no_console(&mut std_cmd);
    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    let mut child = cmd.spawn().map_err(|e| format!("não abriu {path}: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input.as_bytes()).await.map_err(|e| e.to_string())?;
    }
    let out = tokio::time::timeout(TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| "a IA demorou demais para responder".to_string())?
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() && text.is_empty() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().chars().take(400).collect());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_keyed_providers_move_to_cli() {
        for p in ["anthropic", "openai", "google", "openrouter", ""] {
            assert!(needs_migration(p));
        }
        for p in ["mcp", "cli", "ollama", "lmstudio", "custom"] {
            assert!(!needs_migration(p));
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn runs_a_cli_through_stdin() {
        let out = run("/bin/cat", &[], "olá Huginn").await.unwrap();
        assert_eq!(out, "olá Huginn");
    }
}
