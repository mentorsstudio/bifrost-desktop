// Para onde leva o botão ↗ de uma pílula (o mesmo destino do macOS).

import { SPOTIFY_ID } from "../core/spotify";

export const CLAUDE_DESKTOP_ID = "agent_claude-desktop";

export const INTEGRATION_URLS: Readonly<Record<string, string>> = {
  integration_resend: "https://resend.com/emails",
  integration_vercel: "https://vercel.com/dashboard",
  integration_github: "https://github.com/pulls",
  integration_stripe: "https://dashboard.stripe.com/payments",
  integration_notion: "https://notion.so",
  integration_calcom: "https://app.cal.com/bookings",
  // Sem app do WhatsApp para trazer à frente como no Mac: o WhatsApp Web.
  integration_whatsapp: "https://web.whatsapp.com",
};

export type Target =
  | { kind: "claudeDesktop" }
  | { kind: "terminal"; sessionId: string | null; cwd: string | null }
  | { kind: "n8n" } | { kind: "gitea" } | { kind: "spotify" }
  | { kind: "url"; url: string }
  | { kind: "none" };

export interface TargetTask { id: string; sessionId?: string | null; sessionCwd?: string | null }

/** O ↗ de uma pílula. */
export function targetOf(task: TargetTask | null): Target {
  if (!task) return { kind: "none" };
  if (task.id === CLAUDE_DESKTOP_ID) return { kind: "claudeDesktop" };
  if (task.id === "integration_claude" || task.sessionId) return { kind: "terminal", sessionId: task.sessionId ?? null, cwd: task.sessionCwd ?? null };
  if (task.id === "integration_n8n") return { kind: "n8n" };
  if (task.id === "integration_gitea") return { kind: "gitea" };
  if (task.id === SPOTIFY_ID) return { kind: "spotify" };
  const url = INTEGRATION_URLS[task.id];
  return url ? { kind: "url", url } : { kind: "none" };
}

/** "Abrir terminal": o app do Claude, ou a sessão no terminal. */
export function terminalOf(task: TargetTask | null): Target {
  if (task?.id === CLAUDE_DESKTOP_ID) return { kind: "claudeDesktop" };
  return { kind: "terminal", sessionId: task?.sessionId ?? null, cwd: task?.sessionCwd ?? null };
}
