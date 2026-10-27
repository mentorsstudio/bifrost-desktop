// Bifrost — as peças visuais do hub, escritas do zero: a faixa de cada página
// (Yggdrasil + galho dos corvos), o painel entalhado que segura o conteúdo
// (no lugar do antigo cartão com partículas) e o estado vazio com um corvo SVG.
// Nada aqui usa canvas nem laço de quadros: só DOM, SVG e CSS (hub.css), então
// a janela não desenha nada quando está escondida.

import type { BotStateName } from "../core/layout";
import { toRunes } from "../bifrost/runes";
import type { Outfit } from "../huginn/wardrobe";
import { Mascot, type MascotState } from "../bifrost/mascots";

/** A janela do hub está à vista? Sem canvases, só pausa as animações CSS. */
export function windowShown(): boolean {
  return !document.documentElement.classList.contains("bf-hub-hidden");
}

export function setWindowShown(shown: boolean) {
  document.documentElement.classList.toggle("bf-hub-hidden", !shown);
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Quem pousa na faixa de cada página (cor de destaque, tamanho, quando chega). */
export interface RavenSpec { color: string; size: number; start: number; outfit?: Outfit; state?: BotStateName; roams?: boolean }

export interface Theme {
  color: string;
  cast: RavenSpec[];
}

const m = (color: string, size: number, start: number, extra: Partial<RavenSpec> = {}): RavenSpec => ({
  color, size, start, ...extra,
});

export const THEMES: Record<string, Theme> = {
  dictation: { color: "#FB923C", cast: [m("#F5F6F8", 66, 0.2), m("#FB923C", 52, 0.65), m("#F472B6", 44, 0.95, { outfit: "starCrown" })] },
  notes: { color: "#3B9EFF", cast: [m("#3B9EFF", 58, 0.1, { outfit: "runeBand" }), m("#34D399", 50, 0.5), m("#A78BFA", 46, 0.9)] },
  insights: { color: "#34D399", cast: [m("#F7B32B", 62, 0.3, { outfit: "starCrown" }), m("#34D399", 48, 0.75), m("#F5F6F8", 40, 1)] },
  dictionary: { color: "#A78BFA", cast: [m("#A78BFA", 60, 0.2, { outfit: "runeBand" }), m("#F5F6F8", 48, 0.8, { outfit: "helm" })] },
  snippets: { color: "#F7B32B", cast: [m("#F7B32B", 56, 0.15, { state: "working" }), m("#FB923C", 46, 0.6), m("#F5F6F8", 40, 0.95)] },
  styles: { color: "#F472B6", cast: [m("#F472B6", 60, 0.25, { outfit: "auroraHalo" }), m("#F5F6F8", 48, 0.7, { outfit: "starCrown" }), m("#22D3EE", 42, 1, { outfit: "helm" })] },
  flowsettings: { color: "#8E939C", cast: [m("#F5F6F8", 56, 0.3), m("#8E939C", 46, 0.95, { state: "sleeping", roams: false })] },
  general: { color: "#8E939C", cast: [m("#F5F6F8", 60, 0.4, { outfit: "frostScarf" }), m("#FB923C", 46, 0.85)] },
  pills: {
    color: "#F5A524",
    cast: [m("#F5A524", 44, 0.05), m("#3B9EFF", 44, 0.3), m("#34D399", 44, 0.55), m("#E07950", 44, 0.8), m("#A78BFA", 44, 1)],
  },
  agents: {
    color: "#3B9EFF",
    cast: [m("#3B9EFF", 56, 0.1, { state: "working", roams: false }), m("#E07950", 50, 0.5, { state: "thinking", roams: false }), m("#34D399", 50, 0.9)],
  },
  chat: { color: "#E07950", cast: [m("#E07950", 58, 0.3, { state: "thinking", roams: false }), m("#F5F6F8", 48, 0.85)] },
  integrations: { color: "#7C5CFF", cast: [m("#7C5CFF", 54, 0.15), m("#22D3EE", 46, 0.55), m("#F7B32B", 42, 0.95)] },
  phone: { color: "#3DDC84", cast: [m("#3DDC84", 56, 0.25), m("#F5F6F8", 46, 0.8, { outfit: "helm" })] },
  voice: { color: "#F97316", cast: [m("#F97316", 60, 0.3), m("#F5F6F8", 48, 0.85, { outfit: "runeBand" })] },
  shortcuts: { color: "#6366F1", cast: [m("#6366F1", 56, 0.2, { outfit: "runeBand" }), m("#F5F6F8", 46, 0.8)] },
};

/** Yggdrasil entalhada: tronco, galhos e raízes, em traço de ouro. */
const YGGDRASIL = `<svg class="bf-hero-tree" viewBox="0 0 220 160" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M110 150 V70"/><path d="M110 96 C90 84 70 80 46 62"/><path d="M110 88 C132 76 152 72 178 52"/>
    <path d="M110 74 C100 56 96 40 98 20"/><path d="M110 72 C122 52 128 38 132 16"/>
    <path d="M70 79 C60 66 58 54 60 40"/><path d="M152 72 C164 62 170 50 172 36"/>
    <path d="M110 150 C96 152 84 156 64 158"/><path d="M110 150 C124 152 138 156 158 158"/><path d="M110 150 C108 154 104 158 98 160"/>
  </g>
  <circle cx="110" cy="40" r="44" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 6" opacity=".6"/>
</svg>`;

/** A faixa de cada página: Yggdrasil ao fundo, runa e título, e o galho onde
 *  Huginn e Muninn pousam (SVG, com os estados do motor de movimento). */
export function hero(page: string, title: string, subtitle: string | null, actions: HTMLElement[] = [], compact = false): HTMLElement {
  const theme = THEMES[page] ?? THEMES.general;
  const el = document.createElement("div");
  el.className = compact ? "hub-hero bf-hero compact" : "hub-hero bf-hero";
  el.style.setProperty("--hero-accent", theme.color);
  el.style.setProperty("--hero-line", rgba(theme.color, 0.16));
  const sky = document.createElement("div");
  sky.className = "bf-hero-sky";
  sky.innerHTML = YGGDRASIL;
  const copy = document.createElement("div");
  copy.className = "copy bf-hero-copy";
  const kicker = document.createElement("div");
  kicker.className = "bf-hero-kicker";
  kicker.textContent = `${toRunes("huginn", " ")}  ·  ${toRunes("muninn", " ")}`;
  const h1 = document.createElement("h1");
  h1.textContent = title;
  copy.append(kicker, h1);
  if (subtitle) {
    const p = document.createElement("p");
    p.textContent = subtitle;
    copy.append(p);
  }
  if (actions.length) {
    const row = document.createElement("div");
    row.className = "actions";
    row.append(...actions);
    copy.append(row);
  }
  const perch = document.createElement("div");
  perch.className = "bf-hero-perch";
  const branch = document.createElement("div");
  branch.className = "bf-hero-branch";
  const huginn = new Mascot("huginn");
  const muninn = new Mascot("muninn");
  huginn.el.classList.add("bf-hero-h");
  muninn.el.classList.add("bf-hero-m");
  perch.append(huginn.el, muninn.el, branch);
  // Chegam voando quando a página abre e reagem ao cursor.
  huginn.set("flyIn");
  setTimeout(() => muninn.set("flyIn"), 160);
  setTimeout(() => { huginn.set(page === "chat" || page === "agents" ? "thinking" : "idle"); muninn.set("idle"); }, 900);
  el.addEventListener("pointerenter", () => { if (!compact) huginn.set("listening"); });
  el.addEventListener("pointerleave", () => huginn.set("idle"));
  el.append(sky, copy, perch);
  return el;
}

/** Do estado do motor para o estado do corvo SVG. */
function svgState(state: BotStateName): MascotState {
  switch (state) {
    case "sleeping": return "sleeping";
    case "working": case "thinking": case "searching": return "thinking";
    case "finished": return "success";
    case "error": return "error";
    case "question": case "approval": return "listening";
    default: return "idle";
  }
}

/** Painel entalhado: borda de ferro, cantos de nó em ouro, aurora no alto. */
export function glowCard(color: string, ...content: (HTMLElement | string)[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "hub-glow bf-panel";
  el.style.setProperty("--panel-accent", color);
  el.style.setProperty("--glow-line", rgba(color, 0.28));
  for (const c of ["tl", "tr", "bl", "br"]) {
    const k = document.createElement("i");
    k.className = `bf-panel-knot ${c}`;
    el.append(k);
  }
  const inner = document.createElement("div");
  inner.className = "inner";
  inner.append(...content);
  el.append(inner);
  return el;
}

/** Página vazia: um corvo (dormindo, pensando…) e uma linha. */
export function emptyState(text: string, state: BotStateName = "sleeping", _color = "#F5F6F8"): HTMLElement {
  const el = document.createElement("div");
  el.className = "hub-empty bf-empty";
  const raven = new Mascot(state === "idle" ? "muninn" : "huginn");
  raven.set(svgState(state));
  const p = document.createElement("div");
  p.textContent = text;
  el.append(raven.el, p);
  return el;
}

/** O Huginn da marca, na barra lateral. */
export function liveRaven(host: HTMLElement, state: BotStateName = "idle"): Mascot {
  const raven = new Mascot("huginn", host);
  raven.set(svgState(state));
  return raven;
}
