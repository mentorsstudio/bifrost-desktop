// O cartão da esquerda para um agente de sessão (Claude Code, Codex, Gemini…).
// Ativo: uma linha de contexto sob o ticker (pasta · branch · tempo).
// Parado: a última sessão (resumo, projeto, branch, quando) e o que fazer —
// nunca o cartão pelado de "Integração · Hooks instalados".

import { h } from "./dom";
import { Bridge } from "../core/bridge";
import type { AgentTask } from "../core/state";
import { t, tl } from "../i18n/i18n";
import { agentLabel, elapsed, lastDid, statusOf, STATUS_COLOR, STATUS_LABEL, whereOf } from "./agents-model";

const KEY = "bf-last-sessions";

export interface Remembered { summary: string | null; cwd: string | null; at: number; started: number }

/** O que cada agente fez por último, para o cartão parado. Puro e testável. */
export class SessionMemory {
  private m: Map<string, Remembered>;
  private store: Pick<Storage, "getItem" | "setItem"> | null;
  constructor(store: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
    this.store = store;
    let saved: [string, Remembered][] = [];
    try { saved = JSON.parse(this.store?.getItem(KEY) ?? "[]"); } catch { saved = []; }
    this.m = new Map(Array.isArray(saved) ? saved : []);
  }
  note(task: Pick<AgentTask, "id" | "finalLine" | "sessionCwd" | "steps" | "stepIndex" | "state">, now: number): Remembered {
    const prev = this.m.get(task.id);
    const summary = lastDid(task as never) ?? prev?.summary ?? null;
    const r: Remembered = { summary, cwd: task.sessionCwd ?? prev?.cwd ?? null, at: now, started: prev?.started ?? now };
    this.m.set(task.id, r);
    // Só grava quando o resumo ou a pasta mudam (não a cada quadro).
    if (prev?.summary !== r.summary || prev?.cwd !== r.cwd) {
      try { this.store?.setItem(KEY, JSON.stringify([...this.m].slice(-20))); } catch { /* cheio ou bloqueado */ }
    }
    return r;
  }
  get(id: string): Remembered | undefined { return this.m.get(id); }
}

const branches = new Map<string, string | null>();
function branchOf(cwd: string | null, onReady: () => void): string | null {
  if (!cwd) return null;
  if (branches.has(cwd)) return branches.get(cwd)!;
  branches.set(cwd, null);
  void Bridge.gitBranch(cwd).then((b) => { branches.set(cwd, b ?? null); if (b) onReady(); }, () => undefined);
  return null;
}

export function contextLine(cwd: string | null, since: number | null, now: number, onReady: () => void): string {
  const where = whereOf(cwd);
  const branch = branchOf(cwd, onReady);
  return [where ? `📁 ${where}` : null, branch ? `⎇ ${branch}` : null, since != null ? elapsed((now - since) / 1000) : null]
    .filter(Boolean).join("  ·  ");
}

export function buildSessionCard(memory: SessionMemory, open: { settings: () => void; chat: () => void }, redraw: () => void) {
  const head = h("div", { class: "sc-head" });
  const summary = h("div", { class: "sc-summary" });
  const meta = h("div", { class: "sc-meta" });
  const folderBtn = h("button", { class: "btn secondary sc-btn", text: tl("Open the folder") });
  const chatBtn = h("button", { class: "btn secondary sc-btn", text: tl("Talk in Bifrost"), onclick: () => open.chat() });
  const setBtn = h("button", { class: "btn secondary sc-btn", text: tl("Settings…"), onclick: () => open.settings() });
  const el = h("div", { class: "sc-card" }, head, summary, meta, h("div", { class: "sc-actions" }, folderBtn, chatBtn, setBtn));
  let cwd: string | null = null;
  folderBtn.addEventListener("click", () => { if (cwd) void Bridge.openInVSCode(cwd); });
  return {
    el,
    sync(task: AgentTask, now: number) {
      const st = statusOf(task);
      const r = memory.get(task.id);
      cwd = task.sessionCwd ?? r?.cwd ?? null;
      const chip = h("span", { class: "ag-status", text: t(STATUS_LABEL[st]) });
      chip.style.setProperty("--st", STATUS_COLOR[st]);
      head.replaceChildren(h("i", { class: "sc-dot" }), h("b", { text: agentLabel(task) }), chip);
      (head.firstChild as HTMLElement).style.background = task.color;
      summary.textContent = r?.summary ?? t("No session yet. When it works, its last summary shows up here.");
      summary.title = r?.summary ?? "";
      summary.classList.toggle("is-empty", !r?.summary);
      const line = contextLine(cwd, null, now, redraw);
      meta.textContent = r ? [line, `${t("last activity")} ${elapsed((now - r.at) / 1000)}`].filter(Boolean).join("  ·  ") : line;
      meta.title = meta.textContent ?? "";
      for (const b of [folderBtn, chatBtn, setBtn]) b.title = b.textContent ?? "";
      folderBtn.style.display = cwd ? "" : "none";
    },
  };
}
