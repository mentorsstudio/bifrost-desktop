//! Claude plan usage straight from Anthropic, for people whose Claude Code never
//! runs its status line (the VS Code extension, `claude -p`, the desktop app).
//!
//! Uses the sign-in Claude Code already keeps in `~/.claude/.credentials.json`,
//! only while it is still valid: Bifrost never refreshes it (that would rotate
//! Claude Code's own tokens) and never stores or logs it. GET only.

use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

const URL: &str = "https://api.anthropic.com/api/oauth/usage";

fn home() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(Into::into)
}

/// The sign-in Claude Code keeps, while still valid (never refreshed here).
fn token() -> Result<String, &'static str> {
    let path = home().map(|h| h.join(".claude").join(".credentials.json")).ok_or("no-login")?;
    let text = std::fs::read_to_string(path).map_err(|_| "no-login")?;
    let v: Value = serde_json::from_str(&text).map_err(|_| "no-login")?;
    let o = &v["claudeAiOauth"];
    let token = o["accessToken"].as_str().filter(|t| !t.is_empty()).ok_or("no-login")?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    if o["expiresAt"].as_i64().is_some_and(|e| e <= now + 30_000) {
        return Err("expired");
    }
    Ok(token.to_string())
}

/// `{ "ok": <usage body> }`, or `{ "error": "no-login" | "expired" | "http-<code>" | "network" }`.
pub async fn read() -> Value {
    let token = match token() { Ok(t) => t, Err(e) => return err(e) };
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(8)).build() { Ok(c) => c, Err(_) => return err("network") };
    let res = client.get(URL).bearer_auth(token).header("anthropic-beta", "oauth-2025-04-20").header("User-Agent", "bifrost-desktop").send().await;
    match res {
        Ok(r) if r.status().is_success() => match r.json::<Value>().await { Ok(v) => serde_json::json!({ "ok": v }), Err(_) => err("network") },
        Ok(r) => err(&format!("http-{}", r.status().as_u16())),
        Err(_) => err("network"),
    }
}

fn err(code: &str) -> Value {
    serde_json::json!({ "error": code })
}
