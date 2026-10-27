// As regras dos cartões de aviso e permissão, sem DOM (testadas em
// tests/alerts.test.mjs): rótulos, títulos, a trava de clique, e o passo a
// passo das perguntas do Claude Code.

import type { AskedQuestion } from "../core/state";
import { N_ } from "../i18n/i18n";

/** Por quanto tempo um cartão novo de permissão ignora cliques nos botões. */
export const CLICK_GUARD_MS = 600;

/** A trava contra o clique que vinha para a janela de baixo. */
export class ClickGuard {
  private shownFor: string | null = null;
  private shownAt = 0;
  /** Um pedido apareceu (ou o mesmo continua): reinicia a trava só se for novo. */
  seen(requestId: string | null, now: number): void {
    if (requestId !== this.shownFor) { this.shownFor = requestId; this.shownAt = now; }
  }
  open(now: number): boolean { return now - this.shownAt >= CLICK_GUARD_MS; }
}

export interface TaskLike { id?: string; source?: string; finalLine?: string | null }

/** A linha de quem fala, nos cartões de erro. */
export const errorWho = (task: TaskLike | null) =>
  task?.source === "n8n" ? "n8n" : task?.source === "agent" ? N_("Agent") : "Claude Code";
export const errorTitleKey = (task: TaskLike | null) =>
  task?.source === "n8n" ? N_("Workflow stopped.") : N_("Session stopped on an error.");
export const finishedWhoKey = (task: TaskLike | null) => (task?.source === "agent" ? N_("finished") : N_("Claude Code finished"));
export const openLabelKey = (task: TaskLike | null) => (task?.id === "agent_claude-desktop" ? N_("Open Claude") : N_("Open terminal"));

/** O título do cartão de fim: a frase final, senão o último passo em texto. */
export const finishedTitle = (task: TaskLike | null, lastText: string | null, fallback: string) =>
  task?.finalLine || lastText || fallback;

/** O comando aprovado — o que importa aprovar aqui e não no terminal. */
export const approvalLine = (p: { command?: string | null; tool?: string | null } | null) => p?.command || p?.tool || "…";

export type Answers = Record<string, string | string[]>;

/** Onde estamos nas perguntas de um pedido. */
export class QuestionFlow {
  requestId = "";
  index = 0;
  answers: Answers = {};
  picked = new Set<string>();

  /** Um pedido novo recomeça do zero. */
  track(requestId: string): void {
    if (requestId === this.requestId) return;
    this.requestId = requestId;
    this.index = 0;
    this.answers = {};
    this.picked = new Set();
  }

  current(qs: readonly AskedQuestion[]): AskedQuestion {
    return qs[Math.min(this.index, qs.length - 1)];
  }

  /** "(2 de 3)" quando há mais de uma. */
  counter(qs: readonly AskedQuestion[]): { index: number; total: number } | null {
    return qs.length > 1 ? { index: this.index + 1, total: qs.length } : null;
  }

  /** Responde a atual; devolve as respostas completas quando era a última. */
  answer(question: string, value: string | string[], total: number): Answers | null {
    this.answers[question] = value;
    this.picked = new Set();
    this.index += 1;
    return this.index >= total ? this.answers : null;
  }

  toggle(label: string): void {
    if (this.picked.has(label)) this.picked.delete(label);
    else this.picked.add(label);
  }

  /** Muda quando os botões precisam ser refeitos. */
  key(): string { return `${this.requestId}:${this.index}:${[...this.picked].join("|")}`; }
}
