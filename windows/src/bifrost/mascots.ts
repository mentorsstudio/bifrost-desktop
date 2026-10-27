// Huginn (pensamento) e Muninn (memória): os dois corvos de Odin, desenhados
// do zero em SVG para o Bifrost. Cada estado é uma classe CSS em nordic.css
// (bf-state-*), com coreografia própria; piscar é sorteado pelo motor.

import { reducedMotion } from "./motion";

export type MascotName = "huginn" | "muninn";
export type MascotState = "idle" | "blink" | "flyIn" | "flyOut" | "thinking" | "listening" | "success" | "error" | "sleeping";

export const MASCOT_STATES: readonly MascotState[] = ["idle", "blink", "flyIn", "flyOut", "thinking", "listening", "success", "error", "sleeping"];

const PALETTE: Record<MascotName, { body: string; wing: string; eye: string; rune: string; label: string }> = {
  // Huginn: corvo azul-fiorde, olho de aurora, runa Ansuz (ᚨ, palavra/pensamento).
  huginn: { body: "#13203f", wing: "#1d2f5c", eye: "#5ef2c9", rune: "ᚨ", label: "Huginn" },
  // Muninn: corvo cinza-ferro, olho âmbar-dourado, runa Mannaz (ᛗ, memória/humano).
  muninn: { body: "#2a2730", wing: "#3b3644", eye: "#f2b84b", rune: "ᛗ", label: "Muninn" },
};

export function mascotSvg(name: MascotName): string {
  const p = PALETTE[name];
  return `<svg class="bf-raven" viewBox="0 0 120 120" role="img" aria-label="${p.label}">
  <defs>
    <radialGradient id="g-${name}" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="${p.wing}"/><stop offset="1" stop-color="${p.body}"/></radialGradient>
    <linearGradient id="gold-${name}" x1="0" x2="1"><stop offset="0" stop-color="#f6d27a"/><stop offset="1" stop-color="#b8862f"/></linearGradient>
  </defs>
  <g class="bf-raven-shadow"><ellipse cx="60" cy="108" rx="26" ry="4" fill="#000" opacity=".35"/></g>
  <g class="bf-raven-body">
    <path class="bf-wing bf-wing-back" d="M38 62 C14 52 8 34 12 24 C24 36 34 42 50 48 Z" fill="${p.wing}"/>
    <path class="bf-tail" d="M50 88 L40 104 L56 96 L60 106 L64 96 L80 104 L70 88 Z" fill="${p.body}"/>
    <path d="M60 26 C82 26 92 46 90 66 C88 86 74 96 60 96 C46 96 32 86 30 66 C28 46 38 26 60 26 Z" fill="url(#g-${name})"/>
    <path class="bf-knot" d="M46 70 q14 10 28 0 M50 78 q10 6 20 0" stroke="url(#gold-${name})" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>
    <text x="60" y="88" text-anchor="middle" font-size="11" fill="url(#gold-${name})" class="bf-raven-rune">${p.rune}</text>
    <path class="bf-crest" d="M56 27 L52 16 L60 24 L62 12 L66 26 Z" fill="${p.wing}"/>
    <g class="bf-eyes">
      <ellipse class="bf-eye" cx="50" cy="52" rx="5" ry="6" fill="${p.eye}"/>
      <ellipse class="bf-eye" cx="70" cy="52" rx="5" ry="6" fill="${p.eye}"/>
      <circle cx="51.5" cy="50" r="1.6" fill="#fff" opacity=".9"/><circle cx="71.5" cy="50" r="1.6" fill="#fff" opacity=".9"/>
    </g>
    <path class="bf-beak" d="M54 60 L60 72 L66 60 Q60 57 54 60 Z" fill="url(#gold-${name})"/>
    <path class="bf-wing bf-wing-front" d="M82 62 C106 52 112 34 108 24 C96 36 86 42 70 48 Z" fill="${p.wing}"/>
  </g>
  <g class="bf-fx">
    <circle class="bf-dot d1" cx="92" cy="22" r="3"/><circle class="bf-dot d2" cx="100" cy="16" r="3"/><circle class="bf-dot d3" cx="108" cy="10" r="3"/>
    <path class="bf-check" d="M88 22 l6 6 l12 -14" fill="none" stroke="#5ef2c9" stroke-width="4" stroke-linecap="round"/>
    <text class="bf-err" x="98" y="26" font-size="22" text-anchor="middle" fill="#ff6b6b">ᚾ</text>
    <path class="bf-wave" d="M14 50 q-6 10 0 20 M6 44 q-10 16 0 32" fill="none" stroke="#5ef2c9" stroke-width="2.5" stroke-linecap="round"/>
    <text class="bf-zzz" x="96" y="24" font-size="14" fill="#9aa6c8">z</text>
  </g>
</svg>`;
}

/** Um corvo vivo: estado atual + piscar sorteado no idle. */
export class Mascot {
  readonly el: HTMLElement;
  private blinkTimer: ReturnType<typeof setTimeout> | null = null;
  state: MascotState = "idle";
  readonly name: MascotName;

  constructor(name: MascotName, host?: HTMLElement) {
    this.name = name;
    this.el = document.createElement("div");
    this.el.className = `bf-mascot bf-${name}`;
    this.el.innerHTML = mascotSvg(name);
    host?.append(this.el);
    this.set("idle");
  }

  set(state: MascotState): void {
    for (const s of MASCOT_STATES) this.el.classList.remove(`bf-state-${s}`);
    this.el.classList.add(`bf-state-${state}`);
    this.state = state;
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (state === "idle" && !reducedMotion()) this.scheduleBlink();
  }

  private scheduleBlink(): void {
    this.blinkTimer = setTimeout(() => {
      this.el.classList.add("bf-blinking");
      setTimeout(() => this.el.classList.remove("bf-blinking"), 160);
      this.scheduleBlink();
    }, 2200 + Math.random() * 3200);
  }
}
