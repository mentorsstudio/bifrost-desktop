// As pílulas de serviço (Stripe, GitHub, Spotify…) sob o painel de agentes:
// mini-corvo, nome e selo. A aparência sai de funções puras e testadas.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import type { AgentTask } from "../core/state";
import { createMiniBot } from "../huginn/minibots";
import { pillDefinition } from "../core/pills";
import type { ViewActions } from "./views";

export function lighten(hex: string, amount: number): string {
  const v = parseInt(hex.replace("#", ""), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.min(255, Math.round(x + amount * 255)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function pillLook(color: string, hovered: boolean) {
  return hovered
    ? { background: `${color}2e`, border: `${color}8c`, shadow: `0 2px 10px ${color}59`, label: lighten(color, 0.3) }
    : { background: "", border: `${color}24`, shadow: "", label: "" };
}

const BADGE = {
  approval: { color: "#C9DCCF", icon: "bang", stroke: 0 },
  finished: { color: "#22C55E", icon: "check", stroke: 3 },
  error: { color: "#F4505E", icon: "xmark", stroke: 0 },
} as const;
export function badgeLook(kind: keyof typeof BADGE) { return BADGE[kind]; }

export function buildPill(task: AgentTask, actions: ViewActions): HTMLElement {
  const name = task.id === "integration_claude" ? pillDefinition(task.id)!.name : task.name;
  const lbl = h("span", { class: "lbl", text: name });
  const pill = h("div", { class: "pill", title: name, onclick: () => actions.setFocus(task.id) }, createMiniBot(task, 24), lbl);
  const paint = (hovered: boolean) => {
    const l = pillLook(task.color, hovered);
    pill.style.background = l.background;
    pill.style.borderColor = l.border;
    pill.style.boxShadow = l.shadow;
    lbl.style.color = l.label;
  };
  paint(false);
  pill.addEventListener("mouseenter", () => paint(true));
  pill.addEventListener("mouseleave", () => paint(false));
  if (task.pillBadge) {
    const b = badgeLook(task.pillBadge);
    const inner = h("i", { style: `background:${b.color}` }, svg(ICONS[b.icon], 6, { stroke: b.stroke }));
    const badge = h("div", { class: "pill-badge" }, inner);
    badge.style.boxShadow = `0 0 4px ${b.color}99`;
    pill.append(badge);
  }
  return pill;
}
