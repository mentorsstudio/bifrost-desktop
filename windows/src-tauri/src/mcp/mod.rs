// MCP (Model Context Protocol) — the Paulo build of Coucou.
//
// Instead of API keys, the chat can talk to agents through MCP servers the
// user configures (Hermes, Alethe, Orca, Freya…), and Coucou itself exposes a
// small MCP server so those agents (and Grok Bot) can drive Mochi.
//
// * config.rs — the `mcpServers` entries of settings.json and their parser;
// * client.rs — the connection manager (stdio child process or Streamable HTTP);
// * chat.rs   — the "mcp" chat provider;
// * server.rs — the embedded server (Streamable HTTP on 127.0.0.1, with a token).

pub mod chat;
pub mod client;
pub mod config;
pub mod server;

pub use client::Manager;
pub use config::{McpChat, McpServer};
