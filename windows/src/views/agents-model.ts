// Painel de agentes da ilha, sem DOM: status, onde está, há quanto tempo, e a
// ordem. Uma linha por sessão viva de qualquer agente do PC (Claude Code,
// Codex, Gemini, Hermes, Ollama, Cursor, Antigravity, VS Code, terminais…).

import type { BotStateName } from "../core/layout";
import { N_ } from "../i18n/i18n";

export type AgentStatus = "working" | "waiting" | "finished" | "error" | "idle";

export interface SessionLike {
  id: string; name: string; state: BotStateName; source: string; isIntegration: boolean;
  steps: string[]; stepIndex: number; sessionCwd?: string | null; sessionId?: string | null;
  finalLine?: string | null; pillBadge?: "approval" | "finished" | "error" | null;
}

export function statusOf(s: SessionLike): AgentStatus {
  if (s.pillBadge === "approval" || s.state === "approval" || s.state === "question") return "waiting";
  if (s.pillBadge === "error" || s.state === "error") return "error";
  if (s.pillBadge === "finished" || s.state === "finished") return "finished";
  if (s.state === "working" || s.state === "thinking" || s.state === "searching" || s.state === "ratelimit") return "working";
  return "idle";
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: N_("working"),
  waiting: N_("waiting for you"),
  finished: N_("finished"),
  error: N_("error"),
  idle: N_("idle"),
};

export const STATUS_COLOR: Record<AgentStatus, string> = {
  working: "#91B5A0", waiting: "#C9DCCF", finished: "#7ee08a", error: "#ff6b6b", idle: "#91B5A0",
};

/** É uma sessão de agente (não um cartão de serviço como Stripe ou Spotify)? */
export function isSession(s: SessionLike): boolean {
  if (s.sessionId || s.sessionCwd) return true;
  if (s.source === "agent" && !s.isIntegration) return true;
  return s.id.startsWith("agent_") || s.id === "integration_claude" || /^(vscode|cursor|antigravity|windsurf|terminal)/.test(s.id);
}

/** Sessão viva para o painel: tem sessão real ou está fazendo algo (uma integração parada não conta). */
export function isLive(s: SessionLike & { state?: string; steps?: unknown[] }): boolean {
  if (!isSession(s)) return false;
  return Boolean(s.sessionId || s.sessionCwd) || (s.state !== undefined && s.state !== "idle") || (s.steps?.length ?? 0) > 0;
}

/** Pasta do projeto: "C:\\Users\\p\\projetos\\bifrost" → "projetos/bifrost". */
export function whereOf(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  const parts = cwd.replace(/[\\/]+$/, "").split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/") || null;
}

/** O que fez por último. */
export function lastDid(s: SessionLike): string | null {
  if (s.finalLine) return s.finalLine;
  const step = s.steps[Math.min(s.stepIndex, s.steps.length - 1)] ?? s.steps[s.steps.length - 1];
  return step ? step.replace(/\s+/g, " ").trim() : null;
}

/** 42 → "42s", 125 → "2min", 3700 → "1h02". */
export function elapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

const RANK: Record<AgentStatus, number> = { waiting: 0, error: 1, working: 2, finished: 3, idle: 4 };

/** Quem precisa de você primeiro, depois quem trabalha, depois o resto. */
export function sortSessions<T extends SessionLike>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => RANK[statusOf(a)] - RANK[statusOf(b)] || a.name.localeCompare(b.name));
}

/** Monograma do agente para o ícone. */
export function monogram(name: string): string {
  const w = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? "")).toUpperCase();
}

/** Desde quando cada sessão existe (para o tempo decorrido). */
export class SessionClock {
  private since = new Map<string, number>();
  start(id: string, now: number): number {
    if (!this.since.has(id)) this.since.set(id, now);
    return this.since.get(id)!;
  }
  prune(alive: Iterable<string>): void {
    const keep = new Set(alive);
    for (const k of [...this.since.keys()]) if (!keep.has(k)) this.since.delete(k);
  }
}

/** Nome do agente na linha: sessões do Claude Code levam o nome da pasta; mostramos o agente. */
export function agentLabel(s: { id: string; name: string }): string {
  if (s.id.startsWith("agent_")) return s.name;
  if (/^(integration_claude|vscode|cursor|terminal|claude)/.test(s.id) || !/^[a-z]+_/.test(s.id)) return "Claude Code";
  return s.name;
}

export interface DetectedLike { id: string; agent: string; kind: "cli" | "editor" | "ollama"; folder: string | null }

/** Id da pílula de sessão com hooks que cobre esse agente. */
function hookedId(agent: string): string[] {
  if (agent === "claude") return ["integration_claude", "vscode", "cursor"];
  return [`agent_${agent}`];
}

/**
 * Os achados sem hooks que não repetem uma sessão com hooks: um Codex com hooks
 * já está no painel; um editor só aparece se nenhuma sessão roda naquela pasta.
 */
export function mergeDetected<T extends DetectedLike>(live: SessionLike[], found: readonly T[]): T[] {
  const folders = new Set(live.map((s) => (s.sessionCwd ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop()?.toLowerCase()).filter(Boolean));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const d of found) {
    if (d.kind === "cli" && live.some((s) => hookedId(d.agent).some((id) => s.id === id || s.id.startsWith(`${id}_`)))) continue;
    if (d.kind === "editor" && d.folder && folders.has(d.folder.toLowerCase())) continue;
    const k = `${d.kind}:${d.agent}:${d.folder ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  const rank = { cli: 0, ollama: 1, editor: 2 } as const;
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export const DETECTED_LABEL = { cli: N_("running"), editor: N_("open"), ollama: N_("model loaded") } as const;
export const AGENT_COLOR: Record<string, string> = {
  claude: "#E07950", codex: "#2DD4BF", gemini: "#8AB4F8", ollama: "#F5F5F5",
  vscode: "#3EA6FF", cursor: "#C0C4CC", antigravity: "#F0EADB", windsurf: "#91B5A0",
};
/** Codex e Gemini aceitam hooks do Bifrost; um clique instala. */
export const HOOKABLE = new Set(["codex", "gemini"]);
