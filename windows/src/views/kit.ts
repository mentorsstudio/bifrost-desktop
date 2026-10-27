// Peças do Bifrost para as vistas da ilha e os formulários: cartão, botão,
// interruptor, controle segmentado, selo de status e linha de formulário.
// Cada peça devolve o elemento e um set() para refletir o estado sem recriar DOM.

import { h, dot } from "./dom";
import { washRGBA, type Wash } from "../core/layout";
import type { Msg } from "../i18n/i18n";
import { slidingInk } from "../theme/interact";

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
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") slidingInk(el, "button.on", "seg");
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
export function linkBtn(label: string | Msg, color: string, onClick: () => void): HTMLButtonElement {
  return h("button", { class: "link-btn", style: `color:${color}`, text: label, onclick: onClick }) as HTMLButtonElement;
}

// ── Formulários (janela de ajustes) ───────────────────────────────────────────

export type ActionKind = "primary" | "danger" | "plain";
/** Botão de formulário: primário, perigoso (remover) ou simples. */
export function formBtn(label: string, kind: ActionKind = "plain", onClick?: () => void): HTMLButtonElement {
  const el = h("button", { class: kind === "plain" ? "" : kind, text: label }) as HTMLButtonElement;
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
/** Campo de texto, número, senha ou faixa. */
export function textField(attrs: Attrs): HTMLInputElement {
  return h("input", attrs as never) as HTMLInputElement;
}

/** Lista de escolha; options = [valor, rótulo, lang?]. */
export function choice(options: readonly (readonly [string, string, string?])[] = [], value?: string, onChange?: (v: string) => void): HTMLSelectElement {
  const el = h("select", {}) as HTMLSelectElement;
  for (const [v, label, lang] of options) el.append(h("option", lang ? { value: v, text: label, lang } : { value: v, text: label }));
  if (value != null) el.value = value;
  if (onChange) el.addEventListener("change", () => onChange(el.value));
  return el;
}

/** Interruptor de formulário (role=switch); desabilitado quando não cabe mais um. */
export function switchEl(on: boolean, opts: { title?: string; disabled?: boolean; label?: string } = {}): HTMLButtonElement {
  const el = h("button", { class: on ? "switch on" : "switch" }) as HTMLButtonElement;
  el.setAttribute("role", "switch");
  el.setAttribute("aria-checked", String(on));
  if (opts.title) el.title = opts.title;
  if (opts.label) el.setAttribute("aria-label", opts.label);
  if (opts.disabled) el.disabled = true;
  // Quem liga/desliga mexe na classe "on": o aria-checked acompanha.
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(() => el.setAttribute("aria-checked", String(el.classList.contains("on")))).observe(el, { attributes: true, attributeFilter: ["class"] });
  }
  return el;
}

/** Tecla de atalho clicável (grava um novo atalho). */
export function keycapBtn(text: string): HTMLButtonElement {
  return h("button", { class: "keycap", text }) as HTMLButtonElement;
}

/** Amostra de cor de uma paleta. */
export function swatchBtn(hex: string, on: boolean): HTMLButtonElement {
  const el = h("button", { class: on ? "swatch on" : "swatch", style: `background:${hex}`, title: hex }) as HTMLButtonElement;
  el.setAttribute("aria-pressed", String(on));
  el.setAttribute("aria-label", hex);
  return el;
}
