// Peças do Bifrost para as vistas da ilha e os formulários: cartão, botão,
// interruptor, controle segmentado, selo de status e linha de formulário.
// Cada peça devolve o elemento e um set() para refletir o estado sem recriar DOM.

import { h, dot } from "./dom";
import { washRGBA, type Wash } from "../core/layout";
import type { Msg } from "../i18n/i18n";

export function card(wash: Wash, ...children: (Node | string)[]): HTMLElement {
  const el = h("div", { class: wash ? "card wash" : "card" }, ...children);
  if (wash) el.style.setProperty("--wash", washRGBA(wash));
  return el;
}

export function btn(label: string | Msg, kind: "primary" | "secondary", onClick: () => void, kbd?: string): HTMLButtonElement {
  return h("button", { class: `btn ${kind}`, onclick: onClick },
    h("span", { text: label }), kbd ? h("span", { class: "kbd", text: kbd }) : null) as HTMLButtonElement;
}

export interface Toggle { el: HTMLButtonElement; set(on: boolean): void }
/** Interruptor acessível (role=switch, aria-checked). */
export function toggle(label: string, onFlip: () => void): Toggle {
  const el = h("button", { class: "switch", onclick: onFlip }) as HTMLButtonElement;
  el.setAttribute("role", "switch");
  el.setAttribute("aria-label", label);
  return {
    el,
    set(on) { el.classList.toggle("on", on); el.setAttribute("aria-checked", String(on)); },
  };
}

export interface Segmented<T> { el: HTMLElement; set(value: T): void }
/** Controle segmentado: um valor entre poucos. */
export function segmented<T>(options: readonly { value: T; label: string }[], onPick: (v: T) => void): Segmented<T> {
  const buttons = options.map((o) => {
    const b = h("button", { onclick: () => onPick(o.value), text: o.label });
    b.setAttribute("role", "radio");
    return b;
  });
  const el = h("div", { class: "seg", role: "radiogroup" }, ...buttons);
  return {
    el,
    set(value) {
      buttons.forEach((b, i) => {
        const on = options[i].value === value;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      });
    },
  };
}

export interface Badge { el: HTMLElement; set(ok: boolean, text: string): void }
export function statusBadge(): Badge {
  const el = h("span", { class: "status-badge" });
  return {
    el,
    set(ok, text) { el.replaceChildren(dot(ok ? "#22C55E" : "#F4505E", 6), h("span", { text })); el.title = text; },
  };
}

export function formRow(...children: (Node | null)[]): HTMLElement {
  return h("div", { class: "settings-row" }, ...children);
}

/** Ação discreta em texto, na cor da pílula (cartões das integrações). */
export function linkBtn(label: string, color: string, onClick: () => void): HTMLButtonElement {
  return h("button", { class: "link-btn", style: `color:${color}`, text: label, onclick: onClick }) as HTMLButtonElement;
}
