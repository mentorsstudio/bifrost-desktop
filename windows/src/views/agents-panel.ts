// O painel de agentes no cartão da direita da ilha: uma linha por sessão viva,
// com ícone, status, o que fez por último, onde está, tempo, e ações que levam
// ao lugar certo (a janela do terminal/editor, a pasta, o chat do Bifrost).
// Nunca fica vazio: sem sessão, mostra um estado vazio com o que fazer.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { Bridge } from "../core/bridge";
import { State, type AgentTask } from "../core/state";
import { t, tl } from "../i18n/i18n";
import type { ViewActions } from "./views";
import {
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
  let lastMinute = -1;
  return {
    el,
    sync() {
      const now = Date.now();
      const sessions = sortSessions(State.tasks.filter(isLive));
      clock.prune(sessions.map((s) => s.id));
      const minute = Math.floor(now / 10_000);
      const k = sessions.map((s) => [s.id, s.state, s.pillBadge, s.stepIndex, s.steps.length, s.finalLine, s.sessionCwd].join(":")).join("|") + `@${minute}`;
      if (k === key && minute === lastMinute) return;
      key = k; lastMinute = minute;
      list.replaceChildren(...sessions.map((s) => row(s, a, now)));
      el.classList.toggle("is-empty", sessions.length === 0);
    },
  };
}
