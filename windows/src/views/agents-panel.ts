// O painel de agentes no cartão da direita da ilha: uma linha por sessão viva,
// com ícone, status, o que fez por último, onde está, tempo, e ações que levam
// ao lugar certo (a janela do terminal/editor, a pasta, o chat do Bifrost).
// Nunca fica vazio: sem sessão, mostra um estado vazio com o que fazer.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { Bridge, type DetectedAgent } from "../core/bridge";
import { State, type AgentTask } from "../core/state";
import { t, tl } from "../i18n/i18n";
import type { ViewActions } from "./views";
import {
  AGENT_COLOR, DETECTED_LABEL, HOOKABLE, mergeDetected,
  STATUS_COLOR, STATUS_LABEL, SessionClock, elapsed, isLive, agentLabel, lastDid, monogram, sortSessions, statusOf, whereOf,
} from "./agents-model";

const clock = new SessionClock();

function iconButton(title: string, path: string, run: () => void): HTMLElement {
  const b = h("button", { class: "icon-btn ag-act", title, onclick: (e: Event) => { e.stopPropagation(); run(); } }, svg(path, 9));
  b.setAttribute("aria-label", title);
  return b;
}

function row(task: AgentTask, a: ViewActions, now: number): HTMLElement {
  const st = statusOf(task);
  const where = whereOf(task.sessionCwd);
  const since = clock.start(task.id, now);
  const icon = h("span", { class: "ag-icon", text: monogram(agentLabel(task)) });
  icon.style.setProperty("--ag", task.color);
  const status = h("span", { class: `ag-status s-${st}`, text: t(STATUS_LABEL[st]) });
  status.style.setProperty("--st", STATUS_COLOR[st]);
  const did = lastDid(task);
  const meta = [where ? `📁 ${where}` : null, elapsed((now - since) / 1000)].filter(Boolean).join(" · ");
  const actions = h("span", { class: "ag-actions" },
    iconButton(t("Go to the window"), ICONS.arrowUpRight, () => {
      if (task.id === "agent_claude-desktop") void Bridge.openClaudeDesktop();
      else void Bridge.openSession(task.sessionId ?? null, task.sessionCwd ?? null);
    }),
    ...(task.sessionCwd ? [iconButton(t("Open the folder"), ICONS.folder, () => void Bridge.openInVSCode(task.sessionCwd ?? null))] : []),
    iconButton(t("Talk in Bifrost"), ICONS.bubble, () => {
      State.promptContext = null;
      a.setView("prompt");
    }),
  );
  const el = h("div", { class: `ag-row s-${st}`, onclick: () => a.setFocus(task.id) },
    icon,
    h("span", { class: "ag-text" },
      h("span", { class: "ag-line" }, h("b", { text: agentLabel(task) }), status),
      h("span", { class: "ag-sub" },
        h("span", { class: "ag-did", text: did ?? t("No activity yet") }),
        h("span", { class: "ag-meta", text: meta }))),
    actions);
  el.title = did ?? task.name;
  return el;
}

/** Um agente sem hooks: rodando num terminal, um editor aberto, um modelo do Ollama. */
function detectedRow(d: DetectedAgent, a: ViewActions, now: number, hooked: Set<string>, refresh: () => void): HTMLElement {
  const since = clock.start(d.id, now);
  const icon = h("span", { class: "ag-icon", text: monogram(d.name) });
  icon.style.setProperty("--ag", AGENT_COLOR[d.agent] ?? "#9AA3B8");
  const status = h("span", { class: "ag-status s-found", text: t(d.kind === "ollama" && !d.folder ? DETECTED_LABEL.cli : DETECTED_LABEL[d.kind]) });
  status.style.setProperty("--st", AGENT_COLOR[d.agent] ?? "#9AA3B8");
  const where = d.kind === "ollama" ? (d.folder ?? t("No model loaded")) : [d.folder ? `📁 ${d.folder}` : null, d.host].filter(Boolean).join(" · ");
  const acts: HTMLElement[] = [];
  let hookBtn: HTMLElement | null = null;
  if (d.window != null) acts.push(iconButton(t("Go to the window"), ICONS.arrowUpRight, () => void Bridge.agentsFocus(d.window!)));
  if (d.kind === "cli" && HOOKABLE.has(d.agent) && !hooked.has(d.agent)) {
    const b = h("button", { class: "ag-hook", text: tl("Install hooks"), title: t("So Bifrost sees what it does and can answer its permission requests.") });
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      b.setAttribute("disabled", "");
      b.textContent = t("Installing…");
      try {
        const plan = await Bridge.agentHooksPreview(d.agent, true);
        await Bridge.agentHooksApply(d.agent, true, plan.fingerprint);
        hooked.add(d.agent);
        b.textContent = t("Hooks installed");
      } catch (err) {
        b.textContent = t("Failed — see Settings");
        b.title = String(err);
      }
      refresh();
    });
    hookBtn = b;
  }
  acts.push(iconButton(t("Talk in Bifrost"), ICONS.bubble, () => { State.promptContext = null; a.setView("prompt"); }));
  const el = h("div", { class: `ag-row s-found k-${d.kind}` },
    icon,
    h("span", { class: "ag-text" },
      h("span", { class: "ag-line" }, h("b", { text: d.name }), hookBtn ?? status),
      h("span", { class: "ag-sub" },
        h("span", { class: "ag-did", text: where || t("No activity yet") }),
        h("span", { class: "ag-meta", text: d.kind === "editor" ? "" : elapsed((now - since) / 1000) }))),
    h("span", { class: "ag-actions" }, ...acts));
  if (d.window != null) el.addEventListener("click", () => void Bridge.agentsFocus(d.window!));
  return el;
}

export interface AgentsPanel { el: HTMLElement; sync(): void }

export function agentsPanel(a: ViewActions): AgentsPanel {
  const list = h("div", { class: "ag-list" });
  const empty = h("div", { class: "ag-empty" },
    h("span", { class: "ag-empty-rune", text: "ᛖ" }),
    h("span", { class: "ag-empty-text" },
      h("b", { text: tl("No agent working right now") }),
      h("span", { text: tl("Start Claude Code, Codex, Gemini or another agent: it shows up here.") })),
    h("button", { class: "btn secondary", onclick: () => a.setView("prompt") }, h("span", { text: tl("Open the chat") })));
  const el = h("div", { class: "ag-panel" }, h("div", { class: "ag-head", text: tl("Agents on this PC") }), list, empty);
  let key = "";
  let found: DetectedAgent[] = [];
  const hooked = new Set<string>();
  let scanning = false;
  let lastScan = 0;
  const scan = async () => {
    if (scanning || !el.isConnected || Date.now() - lastScan < 4000) return;
    scanning = true;
    lastScan = Date.now();
    try {
      const [list, hooks] = await Promise.all([Bridge.agentsDetect(), Bridge.agentHooksList()]);
      found = Array.isArray(list) ? list : [];
      for (const hs of hooks ?? []) if (hs.installed) hooked.add(hs.id);
    } catch { found = []; } finally { scanning = false; }
    key = "";
    panel.sync();
  };
  // A cada 5 s: novo retrato dos agentes sem hooks e o tempo andando (não fica "0s").
  window.setInterval(() => {
    if (!el.isConnected) return;
    key = "";
    State.notify(); // o cartão da esquerda e o painel recontam o tempo
    void scan();
  }, 5000);
  const panel: AgentsPanel = {
    el,
    sync() {
      const now = Date.now();
      const sessions = sortSessions(State.tasks.filter(isLive));
      const extra = mergeDetected(sessions, found);
      clock.prune([...sessions.map((s) => s.id), ...extra.map((d) => d.id)]);
      const k = sessions.map((s) => [s.id, s.state, s.pillBadge, s.stepIndex, s.steps.length, s.finalLine, s.sessionCwd].join(":")).join("|")
        + "#" + extra.map((d) => d.id).join("|");
      if (k === key) return;
      key = k;
      if (found.length === 0 && !scanning && el.isConnected) void scan();
      list.replaceChildren(...sessions.map((s) => row(s, a, now)), ...extra.map((d) => detectedRow(d, a, now, hooked, () => { key = ""; panel.sync(); })));
      el.classList.toggle("is-empty", sessions.length + extra.length === 0);
    },
  };
  return panel;
}
