// Huginn (pensamento) e Muninn (memória): os dois corvos de Odin, desenhados
// do zero em SVG para o Bifrost. Cada estado é uma classe CSS em nordic.css
// (bf-state-*), com coreografia própria; piscar é sorteado pelo motor.

import { reducedMotion } from "./motion";
import { RAVEN } from "./raven-shape";
import { currentTheme, onThemeChange, type RavenLook, type RavenMark, type Theme } from "../theme/themes";

export type MascotName = "huginn" | "muninn";
export type MascotState = "idle" | "blink" | "flyIn" | "flyOut" | "thinking" | "listening" | "success" | "error" | "sleeping";

export const MASCOT_STATES: readonly MascotState[] = ["idle", "blink", "flyIn", "flyOut", "thinking", "listening", "success", "error", "sleeping"];

// (A paleta fixa de v16 saiu: cada tema define a sua.)
// Fase 18: as cores e a marca de cada corvo vêm do tema ativo (src/theme/themes.ts).
// Huginn (pensamento) mantém a crista; Muninn (memória) a lua. O tema soma a sua marca
// (coroa, brasa, geada, folha, elmo, raio) — simétrica, na testa, sem tocar olhos e bico.
export interface MascotPalette { body: string; lit: string; wing: string; belly: [string, string]; eye: string; accent: string; rune: string; label: string }
export function palette(name: MascotName, theme: Theme = currentTheme()): MascotPalette {
  const L = name === "huginn" ? theme.huginn : theme.muninn;
  return { body: L.dark, lit: L.lit, wing: L.wing, belly: L.belly, eye: L.eye, accent: L.quill, rune: L.rune, label: name === "huginn" ? "Huginn" : "Muninn" };
}

export function markSvg(m: RavenMark, L: RavenLook, huginn: boolean): string {
  const c = L.markColor;
  switch (m) {
    case "crown": { const y = huginn ? 28 : 31.5; return `<path class="bf-mark" d="M51 ${y + 5} L51 ${y} L54.5 ${y + 2.6} L60 ${y - 2.4} L65.5 ${y + 2.6} L69 ${y} L69 ${y + 5} Q60 ${y + 6.4} 51 ${y + 5} Z" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`; }
    case "ember": return `<path class="bf-mark bf-mark-ember" d="M60 41 C63.2 44 63.4 48.6 60 50.4 C56.6 48.6 56.8 44 60 41 Z" fill="${c}" opacity=".85"/>`;
    case "frost": return `<path class="bf-mark" d="M56.4 44 L63.6 44 M58.2 40.9 L61.8 47.1 M61.8 40.9 L58.2 47.1" stroke="${c}" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>`;
    case "leaf": return `<path class="bf-mark" d="M60 40.5 C63.6 42.6 63.6 47 60 49.5 C56.4 47 56.4 42.6 60 40.5 Z" fill="${c}" opacity=".92"/><path d="M60 41.6 L60 48.6" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`;
    case "helm": return `<path class="bf-mark" d="M44 38 Q60 31 76 38 L75 41.4 Q60 35 45 41.4 Z M58.6 38.4 Q60 36.6 61.4 38.4 L61.4 48.6 Q60 50.4 58.6 48.6 Z" fill="${c}" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>`;
    case "storm": return `<path class="bf-mark bf-mark-storm" d="M61.4 39.5 L57.2 45.6 L60 45.6 L58.6 50.2 L62.8 44 L60 44 Z" fill="${c}"/>`;
    default: return "";
  }
}

export function mascotSvg(name: MascotName, T: Theme = currentTheme()): string {
  const p = palette(name, T);
  const huginn = name === "huginn";
  const L = huginn ? T.huginn : T.muninn;
  const uid = `${name}-${T.id}`;
  // Fase 17: aro de luz para ler em qualquer fundo; pontas de pena nas asas.
  const rim = L.rim;
  const tipsInk = L.tips;
  const tips = (s: -1 | 1) => [[-3.2, 89], [-1, 91.6], [1.6, 93.2]].map(([ox, oy]) => `M${60 + s * (30 + ox)} ${oy - 3.2} L${60 + s * (30 + ox) + s * 0.6} ${oy}`).join(" ");
  const ex = RAVEN.eyes.dx, ey = RAVEN.eyes.y;
  // Uma pena de destaque em cada asa: curva fina da cor da aurora (Huginn) ou prata (Muninn).
  const quill = (s: -1 | 1) => `M${60 + s * 26.6} 70 C${60 + s * 29.4} 76 ${60 + s * 29.6} 83 ${60 + s * 28} 88.6`;
  const lid = huginn ? "" : `<path class="bf-lid" d="M${60 - ex - 4.6} ${ey - 2.2} C${60 - ex - 2} ${ey - 5.6} ${60 - ex + 2} ${ey - 5.6} ${60 - ex + 4.6} ${ey - 2.2} Z M${60 + ex - 4.6} ${ey - 2.2} C${60 + ex - 2} ${ey - 5.6} ${60 + ex + 2} ${ey - 5.6} ${60 + ex + 4.6} ${ey - 2.2} Z" fill="${p.body}"/>`;
  return `<svg class="bf-raven" viewBox="0 0 120 120" role="img" aria-label="${p.label}">
  <defs>
    <radialGradient id="g-${uid}" cx="42%" cy="30%" r="78%"><stop offset="0" stop-color="${p.lit}"/><stop offset="1" stop-color="${p.body}"/></radialGradient>
    <linearGradient id="w-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.lit}"/><stop offset="1" stop-color="${p.wing}"/></linearGradient>
    <radialGradient id="b-${uid}" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="${p.belly[0]}" stop-opacity=".55"/><stop offset="1" stop-color="${p.belly[1]}" stop-opacity=".25"/></radialGradient>
    <filter id="glow-${uid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="${L.glow ?? "transparent"}" flood-opacity="1"/></filter>
    <radialGradient id="sheen-${uid}"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold-${uid}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${L.beak[0]}"/><stop offset="1" stop-color="${L.beak[1]}"/></linearGradient>
  </defs>
  <g class="bf-raven-shadow"><ellipse cx="60" cy="110" rx="26" ry="3.6" fill="#000" opacity=".32"/></g>
  <g class="bf-raven-body">
    <path class="bf-tail" d="${RAVEN.tail}" fill="${p.wing}" stroke="${rim}" stroke-width="1.2"/>
    <ellipse cx="${60 - RAVEN.feet.dx}" cy="${RAVEN.feet.y}" rx="4.2" ry="2.2" fill="url(#gold-${uid})"/>
    <ellipse cx="${60 + RAVEN.feet.dx}" cy="${RAVEN.feet.y}" rx="4.2" ry="2.2" fill="url(#gold-${uid})"/>
    ${L.marks.includes("crest") && !L.marks.includes("crown") && !L.marks.includes("helm") ? `<path class="bf-crest" d="${RAVEN.crest}" fill="${p.lit}" stroke="${rim}" stroke-width=".8"/>` : ""}
    <path d="${RAVEN.body}" fill="url(#g-${uid})" stroke="${rim}" stroke-width="${huginn ? 1.6 : 1.2}"${L.glow ? ` filter="url(#glow-${uid})"` : ""}/>
    <path d="${RAVEN.belly}" fill="url(#b-${uid})"/>
    <ellipse cx="52" cy="34" rx="13" ry="10" fill="url(#sheen-${uid})"/>
    <text x="60" y="88" text-anchor="middle" font-size="11" fill="${L.runeInk}" class="bf-raven-rune">${p.rune}</text>
    <g class="bf-wing bf-wing-back"><path d="${RAVEN.wingL}" fill="url(#w-${uid})" stroke="${rim}" stroke-width="1"/><path d="${tips(-1)}" fill="none" stroke="${tipsInk}" stroke-width="1" stroke-linecap="round"/><path d="${quill(-1)}" fill="none" stroke="${p.accent}" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/></g>
    <g class="bf-wing bf-wing-front"><path d="${RAVEN.wingR}" fill="url(#w-${uid})" stroke="${rim}" stroke-width="1"/><path d="${tips(1)}" fill="none" stroke="${tipsInk}" stroke-width="1" stroke-linecap="round"/><path d="${quill(1)}" fill="none" stroke="${p.accent}" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/></g>
    <g class="bf-head">
      ${L.marks.includes("moon") ? `<path d="${RAVEN.moon}" fill="${L.markColor}" stroke="rgba(0,0,0,.35)" stroke-width=".6" opacity=".95"/>` : ""}
      <g class="bf-eyes">
        <ellipse class="bf-eye" cx="${60 - ex}" cy="${ey}" rx="4.4" ry="5" fill="${p.eye}"/>
        <ellipse class="bf-eye" cx="${60 + ex}" cy="${ey}" rx="4.4" ry="5" fill="${p.eye}"/>
        <circle cx="${60 - ex + 1.4}" cy="${ey - 1.8}" r="1.4" fill="#fff" opacity=".92"/><circle cx="${60 + ex + 1.4}" cy="${ey - 1.8}" r="1.4" fill="#fff" opacity=".92"/>
        ${lid}
      </g>
      <ellipse cx="${60 - 14.5}" cy="54.5" rx="3.4" ry="1.8" fill="${L.quill}" opacity=".16"/>
      <ellipse cx="${60 + 14.5}" cy="54.5" rx="3.4" ry="1.8" fill="${L.quill}" opacity=".16"/>
      <path class="bf-beak" d="${RAVEN.beak}" fill="url(#gold-${uid})"/>
      ${L.marks.map((m) => markSvg(m, L, huginn)).join("")}
    </g>
  </g>
  <g class="bf-fx">
    <circle class="bf-dot d1" cx="94" cy="26" r="3"/><circle class="bf-dot d2" cx="102.5" cy="19" r="3"/><circle class="bf-dot d3" cx="111" cy="12" r="3"/>
    <path class="bf-check" d="M94 20 l6 6 l13 -14" fill="none" stroke="${T.ok}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text class="bf-err" x="104" y="28" font-size="22" text-anchor="middle" fill="${T.error}">ᚾ</text>
    <path class="bf-wave" d="M18 34 q-5 8 0 16 M11 29 q-8 13 0 26" fill="none" stroke="${T.aurora[1]}" stroke-width="2.5" stroke-linecap="round"/>
    <text class="bf-zzz" x="94" y="30" font-size="14" fill="${T.tones.sleeping}">ᛉ</text>
  </g>
</svg>`;
}

// Corvos vivos: quando o tema troca, cada um é redesenhado no lugar (o estado fica).
const LIVE = new Set<WeakRef<Mascot>>();
onThemeChange(() => {
  for (const r of LIVE) {
    const m = r.deref();
    if (!m || !m.el.isConnected) { if (!m) LIVE.delete(r); continue; }
    m.el.innerHTML = mascotSvg(m.name);
  }
});

/** Um corvo vivo: estado atual + piscar sorteado no idle. */
export class Mascot {
  readonly el: HTMLElement;
  private blinkTimer: ReturnType<typeof setTimeout> | null = null;
  state: MascotState = "idle";
  readonly name: MascotName;
  /** Fixo num tema (as prévias da galeria); sem ele, segue o tema ativo. */
  readonly theme: Theme | null;

  constructor(name: MascotName, host?: HTMLElement, theme?: Theme) {
    this.name = name;
    this.theme = theme ?? null;
    this.el = document.createElement("div");
    this.el.className = `bf-mascot bf-${name}`;
    this.el.innerHTML = mascotSvg(name, theme);
    host?.append(this.el);
    if (!theme) LIVE.add(new WeakRef(this));
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
