// The "mcp" chat provider: no API key, the message goes to an agent through a
// tool of an MCP server picked in the settings (`mcpChat`).
//
// Two modes:
// * "tool" — one call (`chat`, `ask`, `messages_send`…), its text is the answer;
// * "task" — a start tool that returns a job id, then a status tool polled
//   until the job ends. That is Hermes: `hermes_task_start` / `hermes_task_status`.

use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};

use super::client::{is_error, result_text, Manager};
use super::config::McpChat;
use crate::chat::{plain_question, Chat, ChatContext, ChatReply};
use crate::settings::Settings;

pub const PROVIDER: &str = "mcp";
const POLL_EVERY: Duration = Duration::from_secs(2);

/// The text sent to the agent: the earlier turns (when asked for) and the question.
pub fn compose(history: &[Value], question: &str, include_history: bool) -> String {
    if !include_history || history.is_empty() {
        return question.to_string();
    }
    let mut out = String::from("Conversa anterior com o usuário (pelo Mochi, no Coucou):\n");
    for turn in history {
        let who = if turn["role"] == "user" { "Usuário" } else { "Assistente" };
        out.push_str(&format!("{who}: {}\n", turn["content"].as_str().unwrap_or_default()));
    }
    out.push_str(&format!("\nNova mensagem do usuário:\n{question}"));
    out
}

/// One chat turn through MCP.
pub async fn send(
    manager: &Manager,
    chat: &Chat,
    settings: &Settings,
    query: String,
    context: Option<ChatContext>,
) -> Result<ChatReply, String> {
    // The chat view's picker lists the servers as "models": a server picked
    // there wins over the one in the settings.
    let mut cfg = settings.mcp_chat.clone();
    if let Some(picked) = settings.chat_models.get(PROVIDER).filter(|m| settings.mcp_servers.contains_key(*m)) {
        cfg.server = picked.clone();
    }
    let cfg = &cfg;
    let server = settings
        .mcp_servers
        .get(&cfg.server)
        .ok_or_else(|| format!("Servidor MCP \"{}\" não configurado — veja Configurações → Servidores MCP.", cfg.server))?;
    let turn = chat.begin(PROVIDER);
    let question = plain_question(turn.first, context.as_ref(), &query);
    let message = compose(&turn.history, &question, cfg.include_history);

    let mut args = cfg.extra_args.clone();
    args.insert(nonempty(&cfg.argument, "message"), Value::String(message));
    let first = manager.call_tool(&cfg.server, server, &cfg.tool, args).await?;
    let first_text = result_text(&first);
    if is_error(&first) {
        return Err(format!("{}: {first_text}", cfg.tool));
    }

    let answer = if cfg.mode == "task" {
        let id = job_id(&first_text, first.structured_content.as_ref())
            .ok_or_else(|| format!("{} não devolveu um id de tarefa: {first_text}", cfg.tool))?;
        poll(manager, &cfg.server, server, cfg, &id).await?
    } else {
        first_text
    };
    let answer = answer.trim().to_string();
    chat.commit(
        &turn,
        json!({"role": "user", "content": question}),
        json!({"role": "assistant", "content": answer}),
        &question,
        &answer,
    );
    Ok(ChatReply { text: answer })
}

fn nonempty(s: &str, fallback: &str) -> String {
    if s.trim().is_empty() { fallback.to_string() } else { s.trim().to_string() }
}

async fn poll(
    manager: &Manager,
    name: &str,
    server: &super::McpServer,
    cfg: &McpChat,
    id: &str,
) -> Result<String, String> {
    let deadline = Instant::now() + Duration::from_secs(cfg.timeout_secs.clamp(10, 7200));
    let status_tool = nonempty(&cfg.status_tool, "hermes_task_status");
    loop {
        tokio::time::sleep(POLL_EVERY).await;
        let mut args = Map::new();
        args.insert(nonempty(&cfg.id_argument, "job_id"), Value::String(id.to_string()));
        let r = manager.call_tool(name, server, &status_tool, args).await?;
        let text = result_text(&r);
        if is_error(&r) {
            return Err(format!("{status_tool}: {text}"));
        }
        match interpret_status(&text, r.structured_content.as_ref()) {
            Status::Done(answer) => return Ok(answer),
            Status::Failed(why) => return Err(format!("A tarefa falhou: {why}")),
            Status::Running => {}
        }
        if Instant::now() > deadline {
            return Err(format!("A tarefa {id} ainda está rodando — tempo de espera esgotado."));
        }
    }
}

/// The job id in a start tool's answer: a `job_id` / `task_id` / `id` field of
/// its JSON, or the word after "job_id" in plain text.
pub fn job_id(text: &str, structured: Option<&Value>) -> Option<String> {
    let parsed = structured.cloned().or_else(|| serde_json::from_str::<Value>(text.trim()).ok());
    if let Some(v) = parsed {
        for key in ["job_id", "jobId", "task_id", "taskId", "id"] {
            match &v[key] {
                Value::String(s) if !s.is_empty() => return Some(s.clone()),
                Value::Number(n) => return Some(n.to_string()),
                _ => {}
            }
        }
    }
    let lower = text.to_lowercase();
    let at = ["job_id", "job id", "task_id"].iter().find_map(|k| lower.find(k).map(|i| i + k.len()))?;
    let rest = &text[at..];
    let id: String = rest
        .trim_start_matches(|c: char| c == ':' || c == '=' || c == '"' || c.is_whitespace())
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    (!id.is_empty()).then_some(id)
}

#[derive(Debug, PartialEq)]
pub enum Status {
    Running,
    Done(String),
    Failed(String),
}

const DONE: &[&str] = &["done", "completed", "complete", "finished", "success", "succeeded", "concluido", "concluída", "concluida"];
const FAILED: &[&str] = &["failed", "error", "errored", "cancelled", "canceled", "stopped", "timeout", "falhou"];

/// What a status tool says: still running, finished (with the answer) or failed.
pub fn interpret_status(text: &str, structured: Option<&Value>) -> Status {
    let parsed = structured.cloned().or_else(|| serde_json::from_str::<Value>(text.trim()).ok());
    if let Some(v) = parsed.filter(Value::is_object) {
        let state = ["status", "state"]
            .iter()
            .find_map(|k| v[*k].as_str())
            .unwrap_or_default()
            .to_lowercase();
        let output = ["output", "result", "answer", "response", "final", "text", "stdout"]
            .iter()
            .find_map(|k| match &v[*k] {
                Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
                Value::Null => None,
                other if !other.is_null() && !other.is_string() => Some(other.to_string()),
                _ => None,
            });
        if DONE.contains(&state.as_str()) {
            return Status::Done(output.unwrap_or_default());
        }
        if FAILED.contains(&state.as_str()) {
            let why = v["error"].as_str().map(str::to_string).or(output).unwrap_or(state);
            return Status::Failed(why);
        }
        return Status::Running;
    }
    // Plain text: look for a "status: X" line, the rest is the answer.
    let mut state = String::new();
    let mut body = Vec::new();
    for line in text.lines() {
        let l = line.trim().to_lowercase();
        if state.is_empty() && (l.starts_with("status") || l.starts_with("state")) {
            state = l.split([':', '=']).nth(1).unwrap_or("").trim().trim_matches('"').to_string();
        } else {
            body.push(line);
        }
    }
    let first_word = state.split_whitespace().next().unwrap_or("");
    if DONE.contains(&first_word) {
        Status::Done(body.join("\n").trim().to_string())
    } else if FAILED.contains(&first_word) {
        Status::Failed(body.join("\n").trim().to_string())
    } else {
        Status::Running
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_job_id() {
        assert_eq!(job_id(r#"{"job_id":"abc-1","status":"queued"}"#, None).as_deref(), Some("abc-1"));
        assert_eq!(job_id("x", Some(&json!({"id": 42}))).as_deref(), Some("42"));
        assert_eq!(job_id("Tarefa iniciada. job_id: 7f3a_b2\nUse hermes_task_status.", None).as_deref(), Some("7f3a_b2"));
        assert_eq!(job_id("nada aqui", None), None);
    }

    #[test]
    fn reads_json_and_text_statuses() {
        assert_eq!(interpret_status(r#"{"status":"running"}"#, None), Status::Running);
        assert_eq!(interpret_status(r#"{"status":"done","output":"Oi!"}"#, None), Status::Done("Oi!".into()));
        assert_eq!(interpret_status(r#"{"state":"failed","error":"boom"}"#, None), Status::Failed("boom".into()));
        assert_eq!(interpret_status("status: completed\nResposta final", None), Status::Done("Resposta final".into()));
        assert_eq!(interpret_status("status: running\n...", None), Status::Running);
        assert!(matches!(interpret_status("Status: error\nfalhou", None), Status::Failed(_)));
    }

    #[test]
    fn history_rides_along_as_text() {
        assert_eq!(compose(&[], "oi", true), "oi");
        let h = vec![json!({"role":"user","content":"a"}), json!({"role":"assistant","content":"b"})];
        let m = compose(&h, "c", true);
        assert!(m.contains("Usuário: a\nAssistente: b\n") && m.ends_with("c"));
        assert_eq!(compose(&h, "c", false), "c");
    }
}
