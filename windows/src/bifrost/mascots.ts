// Huginn (pensamento) e Muninn (memória): os dois corvos de Odin, desenhados
// do zero em SVG para o Bifrost. Cada estado é uma classe CSS em nordic.css
// (bf-state-*), com coreografia própria; piscar é sorteado pelo motor.

import { reducedMotion } from "./motion";
import { RAVEN } from "./raven-shape";

export type MascotName = "huginn" | "muninn";
export type MascotState = "idle" | "blink" | "flyIn" | "flyOut" | "thinking" | "listening" | "success" | "error" | "sleeping";

export const MASCOT_STATES: readonly MascotState[] = ["idle", "blink", "flyIn", "flyOut", "thinking", "listening", "success", "error", "sleeping"];

// Fase 16 (Freya): Huginn é o corvo Pinheiro (corpo #1D3C34, peito Sálvia, olhos Marfim);
// Muninn é o corvo Sálvia (corpo claro, peito Marfim, olhos Pinheiro). Nada de ouro.
// Fase 11: os dois corvos redesenhados do zero — um grão macio só (cabeça e corpo
// sem emenda), asas em gota nos lados, cauda em leque de três penas, pés de ouro.
// O que separa os dois à primeira vista:
//   Huginn (pensamento): azul-fiorde, topete de três penas, olhos de aurora (verde-água),
//     peito com reflexo de aurora e runa Ansuz (ᚨ).
//   Muninn (memória): ameixa-ferro, sem topete — uma lua crescente de prata na testa —,
//     olhos âmbar com pálpebra mansa, peito prateado e runa Mannaz (ᛗ).
export const PALETTE: Record<MascotName, { body: string; lit: string; wing: string; belly: [string, string]; eye: string; accent: string; rune: string; label: string }> = {
  huginn: { body: "#1D3C34", lit: "#2B5246", wing: "#173129", belly: ["#91B5A0", "#416A59"], eye: "#F0EADB", accent: "#91B5A0", rune: "ᚨ", label: "Huginn" },
  muninn: { body: "#7FA390", lit: "#A9C6B4", wing: "#6C907D", belly: ["#F0EADB", "#91B5A0"], eye: "#142D28", accent: "#F0EADB", rune: "ᛗ", label: "Muninn" },
};

export function mascotSvg(name: MascotName): string {
  const p = PALETTE[name];
  const huginn = name === "huginn";
  const ex = RAVEN.eyes.dx, ey = RAVEN.eyes.y;
  // Uma pena de destaque em cada asa: curva fina da cor da aurora (Huginn) ou prata (Muninn).
  const quill = (s: -1 | 1) => `M${60 + s * 26.6} 70 C${60 + s * 29.4} 76 ${60 + s * 29.6} 83 ${60 + s * 28} 88.6`;
  const lid = huginn ? "" : `<path class="bf-lid" d="M${60 - ex - 4.6} ${ey - 2.2} C${60 - ex - 2} ${ey - 5.6} ${60 - ex + 2} ${ey - 5.6} ${60 - ex + 4.6} ${ey - 2.2} Z M${60 + ex - 4.6} ${ey - 2.2} C${60 + ex - 2} ${ey - 5.6} ${60 + ex + 2} ${ey - 5.6} ${60 + ex + 4.6} ${ey - 2.2} Z" fill="${p.body}"/>`;
  return `<svg class="bf-raven" viewBox="0 0 120 120" role="img" aria-label="${p.label}">
  <defs>
    <radialGradient id="g-${name}" cx="42%" cy="30%" r="78%"><stop offset="0" stop-color="${p.lit}"/><stop offset="1" stop-color="${p.body}"/></radialGradient>
    <linearGradient id="w-${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.lit}"/><stop offset="1" stop-color="${p.wing}"/></linearGradient>
    <radialGradient id="b-${name}" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="${p.belly[0]}" stop-opacity=".55"/><stop offset="1" stop-color="${p.belly[1]}" stop-opacity=".25"/></radialGradient>
    <radialGradient id="sheen-${name}"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold-${name}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#C9DCCF"/><stop offset="1" stop-color="#91B5A0"/></linearGradient>
  </defs>
  <g class="bf-raven-shadow"><ellipse cx="60" cy="110" rx="26" ry="3.6" fill="#000" opacity=".32"/></g>
  <g class="bf-raven-body">
    <ellipse cx="${60 - RAVEN.feet.dx}" cy="${RAVEN.feet.y}" rx="4.2" ry="2.2" fill="url(#gold-${name})"/>
    <ellipse cx="${60 + RAVEN.feet.dx}" cy="${RAVEN.feet.y}" rx="4.2" ry="2.2" fill="url(#gold-${name})"/>
    ${huginn ? `<path class="bf-crest" d="${RAVEN.crest}" fill="${p.lit}"/>` : ""}
    <path d="${RAVEN.body}" fill="url(#g-${name})"/>
    <path d="${RAVEN.belly}" fill="url(#b-${name})"/>
    <ellipse cx="52" cy="34" rx="13" ry="10" fill="url(#sheen-${name})"/>
    <text x="60" y="88" text-anchor="middle" font-size="11" fill="${huginn ? "#91B5A0" : "#142D28"}" class="bf-raven-rune">${p.rune}</text>
    <g class="bf-wing bf-wing-back"><path d="${RAVEN.wingL}" fill="url(#w-${name})"/><path d="${quill(-1)}" fill="none" stroke="${p.accent}" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/></g>
    <g class="bf-wing bf-wing-front"><path d="${RAVEN.wingR}" fill="url(#w-${name})"/><path d="${quill(1)}" fill="none" stroke="${p.accent}" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/></g>
    <g class="bf-head">
      ${huginn ? "" : `<path d="${RAVEN.moon}" fill="${p.accent}" opacity=".85"/>`}
      <g class="bf-eyes">
        <ellipse class="bf-eye" cx="${60 - ex}" cy="${ey}" rx="4.4" ry="5" fill="${p.eye}"/>
        <ellipse class="bf-eye" cx="${60 + ex}" cy="${ey}" rx="4.4" ry="5" fill="${p.eye}"/>
        <circle cx="${60 - ex + 1.4}" cy="${ey - 1.8}" r="1.4" fill="#fff" opacity=".92"/><circle cx="${60 + ex + 1.4}" cy="${ey - 1.8}" r="1.4" fill="#fff" opacity=".92"/>
        ${lid}
      </g>
      <ellipse cx="${60 - 14.5}" cy="54.5" rx="3.4" ry="1.8" fill="${huginn ? "#91B5A0" : "#C9DCCF"}" opacity=".16"/>
      <ellipse cx="${60 + 14.5}" cy="54.5" rx="3.4" ry="1.8" fill="${huginn ? "#91B5A0" : "#C9DCCF"}" opacity=".16"/>
      <path class="bf-beak" d="${RAVEN.beak}" fill="url(#gold-${name})"/>
    </g>
  </g>
  <g class="bf-fx">
    <circle class="bf-dot d1" cx="94" cy="26" r="3"/><circle class="bf-dot d2" cx="102.5" cy="19" r="3"/><circle class="bf-dot d3" cx="111" cy="12" r="3"/>
    <path class="bf-check" d="M94 20 l6 6 l13 -14" fill="none" stroke="#91B5A0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text class="bf-err" x="104" y="28" font-size="22" text-anchor="middle" fill="#91B5A0">ᚾ</text>
    <path class="bf-wave" d="M18 34 q-5 8 0 16 M11 29 q-8 13 0 26" fill="none" stroke="#91B5A0" stroke-width="2.5" stroke-linecap="round"/>
    <text class="bf-zzz" x="94" y="30" font-size="14" fill="#91B5A0">ᛉ</text>
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
