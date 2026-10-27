// Who the chat can talk to — the island's side of chat.rs. The Mac's
// ChatProvider (IslandTypes.swift) plus OpenRouter and any OpenAI-compatible
// server. Pure data and helpers, so they can be tested without a webview.

import type { Settings } from "./state";
import { N_ } from "../i18n/i18n";

export type ProviderId =
  | "cli" | "mcp"
  | "anthropic" | "openai" | "google" | "openrouter"
  | "ollama" | "lmstudio" | "custom";

export interface ProviderDef {
  id: ProviderId;
  /** Shown on the chip in the chat's model picker. */
  name: string;
  accent: string;
  /** Credential store entry of its key; null for the model servers. */
  key: string | null;
  /** Settings field holding a model server's address. */
  urlField: "ollamaUrl" | "lmstudioUrl" | "customUrl" | null;
  defaultModel: string;
  /** When the saved model is not offered, the first one containing this is picked. */
  prefer: string | null;
}

export const PROVIDERS: readonly ProviderDef[] = [
  // Paulo build: no API key — the chat goes to an agent through an MCP server
  // (Settings → Servidores MCP). Its "models" are the configured servers.
  // Bifrost: as IAs instaladas no PC (Claude Code, Codex, Gemini CLI), sem chave.
  { id: "cli", name: "IA do PC", accent: "#F2C14E", key: null, urlField: null, defaultModel: "claude", prefer: "claude" },
  { id: "mcp", name: "MCP", accent: "#8B5CF6", key: null, urlField: null, defaultModel: "", prefer: null },
  { id: "anthropic", name: "Anthropic", accent: "#E07950", key: "anthropic-api-key", urlField: null, defaultModel: "claude-opus-5", prefer: "opus" },
  { id: "google", name: "Google", accent: "#4285F4", key: "google-api-key", urlField: null, defaultModel: "gemini-2.0-flash", prefer: "flash" },
  { id: "openai", name: "OpenAI", accent: "#10A37F", key: "openai-api-key", urlField: null, defaultModel: "gpt-4o", prefer: "mini" },
  { id: "openrouter", name: "OpenRouter", accent: "#6467F2", key: "openrouter-api-key", urlField: null, defaultModel: "openrouter/auto", prefer: null },
  { id: "ollama", name: "Ollama", accent: "#FACC15", key: null, urlField: "ollamaUrl", defaultModel: "", prefer: null },
  { id: "lmstudio", name: "LM Studio", accent: "#A3E635", key: null, urlField: "lmstudioUrl", defaultModel: "", prefer: null },
  { id: "custom", name: N_("Custom server"), accent: "#C0C4CC", key: null, urlField: "customUrl", defaultModel: "", prefer: null },
];

/** Credential store entry of the custom server's optional key. */
export const CUSTOM_SERVER_KEY = "openai-compatible-key";

export function providerDef(id: string): ProviderDef {
  // Um id desconhecido (ou vazio) cai na IA do PC, como o Rust (chat.rs: "" → cli).
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

/** The model the chat uses for the active provider. */
export function activeModel(settings: Settings): string {
  const p = providerDef(settings.chatProvider);
  if (p.id === "anthropic") return settings.model || p.defaultModel;
  return settings.chatModels[p.id] || p.defaultModel;
}

/** `settings` with `model` picked for `provider`. */
export function withModel(settings: Settings, provider: ProviderId, model: string): Settings {
  if (provider === "anthropic") return { ...settings, model };
  return { ...settings, chatModels: { ...settings.chatModels, [provider]: model } };
}

/**
 * The chips of the picker: every cloud provider (one without a key says so
 * when picked), and a model server once it is connected — or while it is the
 * active one, so the picker never hides where the chat goes.
 */
export function visibleProviders(settings: Settings): ProviderDef[] {
  // Provedores com chave de API não aparecem mais: tudo por MCP ou IA local.
  return PROVIDERS.filter(
    (p) => settings.chatProvider === p.id || (p.key === null && (!p.urlField || settings[p.urlField] !== "")),
  );
}

/** The model to keep once the list arrives: the saved one if offered, else a sensible one. */
export function pickModel(provider: ProviderDef, offered: string[], current: string): string | null {
  if (offered.length === 0) return null;
  if (offered.includes(current)) return current;
  const preferred = provider.prefer ? offered.find((id) => id.includes(provider.prefer!)) : undefined;
  if (preferred) return preferred;
  return offered.includes(provider.defaultModel) ? provider.defaultModel : offered[0];
}

// ── Where an address points ───────────────────────────────────────────────────

/** Mirrors net.rs: this machine, by name or address. */
export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return h === "0.0.0.0" || h === "::1" || h === "::" || h === "::ffff:127.0.0.1" || h === "::ffff:7f00:1";
}

/**
 * Where a server address sends what you type: this machine, another one over
 * https, another one in clear text (http), or nowhere valid. An empty field
 * means the usual address on this machine.
 */
export type Exposure = "local" | "remote" | "remote-http" | "invalid";

export function urlExposure(raw: string): Exposure {
  const text = raw.trim();
  if (!text) return "local";
  let url: URL;
  try {
    url = new URL(text.includes("://") ? text : `http://${text}`);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "invalid";
  if (!url.hostname || url.username || url.password) return "invalid";
  if (isLoopbackHost(url.hostname)) return "local";
  return url.protocol === "https:" ? "remote" : "remote-http";
}

/**
 * Trocar de provedor no seletor: aplica o provedor e já fixa um modelo válido
 * (o salvo, se ainda é oferecido; senão o preferido), numa única gravação.
 */
export function switchProvider(settings: Settings, id: ProviderId, offered: string[] | null): Settings {
  const p = providerDef(id);
  let next: Settings = { ...settings, chatProvider: p.id };
  const keep = offered ? pickModel(p, offered, activeModel(next)) : null;
  if (keep && keep !== activeModel(next)) next = withModel(next, p.id, keep);
  return next;
}

/** O nome que o cabeçalho mostra: o rótulo do modelo, não o id cru. */
export function modelLabel(id: string, list: readonly { id: string; label: string }[] | undefined): string {
  return list?.find((m) => m.id === id)?.label ?? id;
}

// ── Fase 19: o seletor único (todas as IAs num popover) ─────────────────────

/** Escolher um modelo de QUALQUER seção troca o provedor junto (o bug antigo: só o modelo mudava). */
export function chooseModel(settings: Settings, provider: ProviderId, model: string): Settings {
  return { ...withModel(settings, provider, model), chatProvider: provider };
}

export type PickerGroup = "pc" | "mcp" | "remote";
export function providerGroup(id: string): PickerGroup {
  if (id === "cli" || id === "ollama" || id === "lmstudio") return "pc";
  if (id === "mcp") return "mcp";
  return "remote";
}

export interface PickerRow { provider: ProviderId; model: string; label: string; sub: string; group: PickerGroup }

/** Busca sem acento nem caixa, no nome, no id e no provedor. */
export function filterRows(rows: readonly PickerRow[], query: string): PickerRow[] {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = n(query.trim());
  if (!q) return [...rows];
  return rows.filter((r) => n(`${r.label} ${r.model} ${r.sub}`).includes(q));
}

/** Setas no seletor: anda e dá a volta. */
export function stepIndex(i: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (i < 0) return delta > 0 ? 0 : count - 1;
  return (i + delta + count) % count;
}
