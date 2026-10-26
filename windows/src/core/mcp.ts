// MCP (Paulo build): pure helpers for the "Servidores MCP" settings, so they
// can be tested without a webview. The Rust side (mcp/config.rs) checks again.

import type { McpServerConfig } from "./bridge";

export const MCP_NAME = /^[A-Za-z0-9._-]{1,64}$/;

/** Splits a command line's arguments: spaces separate, "quotes" group. */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function joinArgs(args: string[] = []): string {
  return args.map((a) => (/\s/.test(a) || a === "" ? `"${a}"` : a)).join(" ");
}

/** `KEY=valor` lines → an object; blank lines and # comments are skipped. */
export function parsePairs(text: string, sep = "="): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(sep);
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function pairsText(obj: Record<string, string> = {}, sep = "="): string {
  return Object.entries(obj).map(([k, v]) => `${k}${sep}${v}`).join("\n");
}

export interface McpForm {
  kind: "stdio" | "http";
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  disabled: boolean;
}

/** The form → a server entry, or an error message in Portuguese. */
export function configFromForm(f: McpForm): McpServerConfig | string {
  if (f.kind === "stdio") {
    if (!f.command.trim()) return "Informe o comando (ex.: hermes.exe).";
    const cfg: McpServerConfig = { command: f.command.trim() };
    const args = splitArgs(f.args);
    if (args.length) cfg.args = args;
    const env = parsePairs(f.env);
    if (Object.keys(env).length) cfg.env = env;
    if (f.disabled) cfg.disabled = true;
    return cfg;
  }
  const url = f.url.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Endereço inválido.";
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    return "Use https:// (http:// só para localhost).";
  }
  const cfg: McpServerConfig = { url };
  const headers = parsePairs(f.headers, ":");
  if (Object.keys(headers).length) cfg.headers = headers;
  if (f.disabled) cfg.disabled = true;
  return cfg;
}

export function formFromConfig(c: McpServerConfig | null): McpForm {
  if (c && "url" in c) {
    return { kind: "http", command: "", args: "", env: "", url: c.url, headers: pairsText(c.headers, ": "), disabled: !!c.disabled };
  }
  return {
    kind: "stdio",
    command: c?.command ?? "",
    args: joinArgs(c?.args),
    env: pairsText(c?.env),
    url: "",
    headers: "",
    disabled: !!c?.disabled,
  };
}

/** The JSON block to paste into Grok Bot / Claude / Cursor for Coucou's own server. */
export function clientSnippet(url: string, token: string): string {
  return JSON.stringify(
    { mcpServers: { coucou: { url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );
}

/** Which credential the form's fields describe: Basic (user + password), a bearer token, or none. */
export function credentialFromForm(user: string, password: string, token: string):
  { kind: "basic"; user: string; password: string } | { kind: "token"; token: string } | { kind: "none" } | string {
  const u = user.trim();
  if (u || password) {
    if (!u) return "Preencha o usuário.";
    if (u.includes(":")) return "O usuário não pode ter ':'.";
    if (!password) return "Preencha a senha.";
    return { kind: "basic", user: u, password };
  }
  return token.trim() ? { kind: "token", token: token.trim() } : { kind: "none" };
}
