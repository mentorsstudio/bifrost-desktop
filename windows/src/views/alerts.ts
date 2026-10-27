// Os cartões de aviso e permissão da ilha — permissão, pergunta, erro, fim,
// "confuso" e nota — reescritos sobre alert-model.ts. Mesmas classes de
// sempre (.card.wash, .who-row, .code, .actions, .btn, .kbd…), que o CSS nórdico veste.

import { h, svg, clear, dot } from "./dom";
import { ICONS } from "./icons";
import { State, type AgentTask } from "../core/state";
import { washRGBA, type Wash } from "../core/layout";
import { lastTextStep } from "../core/diff";
import { t, tl, type Msg } from "../i18n/i18n";
import { whereOf } from "./agents-model";
import type { ViewActions, ViewHost } from "./views";
import {
  ClickGuard, QuestionFlow, approvalLine, errorTitleKey, errorWho, finishedTitle, finishedWhoKey, openLabelKey,
} from "./alert-model";

/** Recuo à esquerda: o lugar do Huginn no cartão. */
const RAVEN_GUTTER = 116;

export function alertCard(wash: Wash, ...kids: (Node | string | null)[]): HTMLElement {
  const el = h("div", { class: wash ? "card wash" : "card" }, ...kids);
  if (wash) el.style.setProperty("--wash", washRGBA(wash));
  return el;
}

export function alertButton(label: string | Msg, kind: "primary" | "secondary", run: () => void, key?: string): HTMLElement {
  return h("button", { class: `btn ${kind}`, onclick: run }, h("span", { text: label }), key ? h("span", { class: "kbd", text: key }) : null);
}

/** Ponto colorido + nome da sessão + o que ela quer. */
export function whoRow(task: AgentTask | null, label: string): HTMLElement {
  const row = h("div", { class: "who-row" });
  if (task) row.append(dot(task.color, 8), h("span", { class: "n", text: task.name }));
  row.append(h("span", { text: label }));
  return row;
}

function body(left: number, ...kids: Node[]): HTMLElement {
  const el = h("div", { class: "stack" }, ...kids);
  el.style.padding = `4px 16px 4px ${left}px`;
  return el;
}

/** O ⌃ do canto: dobra a ilha e deixa o pedido esperando (nada é respondido). */
function foldButton(a: ViewActions): HTMLElement {
  return h("button", { class: "icon-btn fold", title: tl("Later — keep it waiting"), onclick: () => a.foldApproval() },
    svg(ICONS.chevronUp, 8, { stroke: 2.4 }));
}

function setWho(slot: HTMLElement, task: AgentTask | null, label: string): void {
  clear(slot);
  slot.append(whoRow(task, label));
}

export function approvalView(a: ViewActions): ViewHost {
  const who = h("div");
  const code = h("div", { class: "code" });
  const guard = new ClickGuard();
  const press = (d: "allow" | "deny") => () => { if (guard.open(performance.now())) a.decide(d); };
  // Os dois botões nascem uma vez: refazê-los entre o apertar e o soltar engoliria o clique.
  const row = h("div", { class: "actions" },
    alertButton(tl("Deny"), "secondary", press("deny"), "N"),
    alertButton(tl("Allow"), "primary", press("allow"), "Y"));
  const el = h("div", { class: "view" }, alertCard("amber", body(RAVEN_GUTTER, who, code, row), foldButton(a)));
  return {
    el,
    sync() {
      guard.seen(State.pendingApproval?.requestId ?? null, performance.now());
      setWho(who, State.focusTask, t("needs permission"));
      code.textContent = approvalLine(State.pendingApproval);
    },
  };
}

export function questionView(a: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title question-text" });
  const row = h("div", { class: "actions options" });
  const fold = foldButton(a);
  const el = h("div", { class: "view" }, alertCard("cyan", body(RAVEN_GUTTER, who, title, row), fold));
  const flow = new QuestionFlow();
  let built = "";

  const finish = (q: string, v: string | string[], total: number) => {
    const all = flow.answer(q, v, total);
    if (all) a.answer(all);
    else State.notify();
  };

  return {
    el,
    sync() {
      const qs = State.pendingApproval?.questions;
      fold.style.display = State.pendingApproval ? "" : "none";
      // Uma pergunta que veio como aviso não tem o que escolher.
      if (!qs) {
        setWho(who, State.focusTask, t("is asking a question"));
        const task = State.focusTask;
        title.textContent = (task && lastTextStep(task.steps)) ?? t("Claude needs an answer.");
        if (built !== "terminal") {
          built = "terminal";
          row.replaceChildren(h("div", { class: "sub", text: tl("Answer it in your terminal.") }));
        }
        return;
      }
      flow.track(State.pendingApproval!.requestId);
      const q = flow.current(qs);
      const n = flow.counter(qs);
      setWho(who, State.focusTask, n ? t("is asking ({index} of {total})", n) : t("is asking"));
      title.textContent = q.question;
      title.title = q.question;
      const key = flow.key();
      if (built === key) return;
      built = key;
      const buttons: HTMLElement[] = q.options.map((o) => {
        const on = flow.picked.has(o.label);
        const b = alertButton(o.label, on ? "primary" : "secondary", () => {
          if (!q.multiSelect) { finish(q.question, o.label, qs.length); return; }
          flow.toggle(o.label);
          State.notify();
        });
        if (o.description) b.title = o.description;
        return b;
      });
      if (q.multiSelect) {
        const done = alertButton(tl("Done"), "primary", () => { if (flow.picked.size) finish(q.question, [...flow.picked], qs.length); });
        if (!flow.picked.size) done.classList.add("off");
        buttons.push(done);
      }
      buttons.push(h("button", { class: "link-btn", style: "color:#8e939c", text: tl("Answer in terminal"), onclick: () => a.answerInTerminal() }));
      row.replaceChildren(...buttons);
    },
  };
}

export function errorView(a: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title" });
  const detail = h("div", { class: "detail" });
  const row = h("div", { class: "actions" },
    alertButton(tl("Retry"), "primary", () => a.setView(State.defaultView())),
    alertButton(tl("Open in n8n"), "secondary", () => a.openUrl("")));
  const el = h("div", { class: "view" }, alertCard("red", body(RAVEN_GUTTER, who, title, detail, row)));
  return {
    el,
    sync() {
      const task = State.focusTask;
      const w = errorWho(task);
      setWho(who, task, w === "n8n" || w === "Claude Code" ? w : t(w));
      title.textContent = t(errorTitleKey(task));
      detail.textContent = (task && lastTextStep(task.steps)) ?? t("No detail available.");
    },
  };
}

export function finishedView(a: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title one-line" });
  const open = alertButton(tl("Open terminal"), "primary", () => a.openTerminal());
  const row = h("div", { class: "actions" }, open, alertButton(tl("OK"), "secondary", () => a.collapse()));
  const el = h("div", { class: "view" }, alertCard("green", body(RAVEN_GUTTER, who, title, row)));
  return {
    el,
    sync() {
      const task = State.focusTask;
      const where = whereOf(task?.sessionCwd);
      setWho(who, task, where ? t("finished in {where}", { where }) : t(finishedWhoKey(task)));
      title.textContent = finishedTitle(task, task ? lastTextStep(task.steps) ?? null : null, t("Session finished"));
      const span = open.firstElementChild as HTMLElement;
      const label = t(openLabelKey(task));
      if (span.textContent !== label) span.textContent = label;
    },
  };
}

export function confusedView(): ViewHost {
  const b = h("div", { class: "stack", style: "padding:0 18px 0 128px" },
    h("div", { class: "title", text: tl("Too many hits at once.") }),
    h("div", { class: "sub", text: tl("Give me a sec — back to work in three seconds.") }));
  return { el: h("div", { class: "view" }, alertCard("pink", b)), sync() {} };
}

export function noteView(): ViewHost {
  const title = h("div", { class: "title" });
  const el = h("div", { class: "view" }, alertCard(null, h("div", { class: "stack", style: "padding:0 18px 0 98px" }, title)));
  return { el, sync() { title.textContent = State.noteMessage ?? ""; } };
}
