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
  // Camadas, de trás para a frente: sombra · asa de trás · cauda · corpo · peito
  // · asa da frente · cabeça (crista, olhos, bico). Nada cruza o rosto: a cabeça
  // é desenhada por último e as asas ficam abaixo da linha do pescoço (y ≥ 58).
  // Os efeitos ficam num canto livre (x ≥ 90, y ≤ 30), longe da cabeça (x ≤ 78).
  const ink = "#070b16";
  return `<svg class="bf-raven" viewBox="0 0 120 120" role="img" aria-label="${p.label}">
  <defs>
    <radialGradient id="g-${name}" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="${p.wing}"/><stop offset="1" stop-color="${p.body}"/></radialGradient>
    <linearGradient id="gold-${name}" x1="0" x2="1"><stop offset="0" stop-color="#f6d27a"/><stop offset="1" stop-color="#b8862f"/></linearGradient>
  </defs>
  <g class="bf-raven-shadow"><ellipse cx="60" cy="110" rx="24" ry="3.5" fill="#000" opacity=".35"/></g>
  <g class="bf-raven-body" stroke="${ink}" stroke-width="2" stroke-linejoin="round">
    <path class="bf-wing bf-wing-back" d="M42 62 C30 62 20 70 16 84 C26 82 34 80 42 76 Z" fill="${p.wing}"/>
    <path class="bf-tail" d="M50 94 L44 108 L56 102 L60 110 L64 102 L76 108 L70 94 Z" fill="${p.body}"/>
    <ellipse cx="60" cy="76" rx="22" ry="22" fill="url(#g-${name})"/>
    <text x="60" y="86" text-anchor="middle" font-size="12" stroke="none" fill="url(#gold-${name})" class="bf-raven-rune">${p.rune}</text>
    <path class="bf-wing bf-wing-front" d="M78 62 C90 62 100 70 104 84 C94 82 86 80 78 76 Z" fill="${p.wing}"/>
    <g class="bf-head">
      <path class="bf-crest" d="M54 26 L50 14 L58 22 L61 10 L65 22 L70 15 L67 27 Z" fill="${p.wing}"/>
      <circle cx="60" cy="40" r="17" fill="url(#g-${name})"/>
      <g class="bf-eyes" stroke="none">
        <ellipse class="bf-eye" cx="53" cy="37" rx="3.6" ry="4.2" fill="${p.eye}"/>
        <ellipse class="bf-eye" cx="67" cy="37" rx="3.6" ry="4.2" fill="${p.eye}"/>
        <circle cx="54.2" cy="35.6" r="1.2" fill="#fff" opacity=".9"/><circle cx="68.2" cy="35.6" r="1.2" fill="#fff" opacity=".9"/>
      </g>
      <path class="bf-beak" d="M56 44 L60 53 L64 44 Q60 42.5 56 44 Z" fill="url(#gold-${name})" stroke-width="1.2"/>
    </g>
  </g>
  <g class="bf-fx">
    <circle class="bf-dot d1" cx="92" cy="28" r="3"/><circle class="bf-dot d2" cx="101" cy="21" r="3"/><circle class="bf-dot d3" cx="110" cy="14" r="3"/>
    <path class="bf-check" d="M92 20 l6 6 l13 -14" fill="none" stroke="#5ef2c9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text class="bf-err" x="102" y="28" font-size="22" text-anchor="middle" fill="#ff6b6b">ᚾ</text>
    <path class="bf-wave" d="M10 34 q-5 8 0 16 M3 29 q-8 13 0 26" fill="none" stroke="#5ef2c9" stroke-width="2.5" stroke-linecap="round"/>
    <text class="bf-zzz" x="96" y="26" font-size="14" fill="#9aa6c8">z</text>
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
