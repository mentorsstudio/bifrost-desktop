// Fase 18 — o motor de temas do Bifrost. Um tema é um conjunto de tokens (as
// famílias de cor das folhas CSS, a aurora/ponte, acentos, erro/limite, brilhos)
// mais a identidade dos dois corvos (corpo, peito, olhos, marca, runa e o
// "jeito" de respirar). Aplica ao vivo em todas as janelas, sem reiniciar:
// cada janela importa este módulo; a escolha fica guardada (localStorage do
// WebView2, que todas as janelas compartilham) e é avisada às outras por evento.

import { CSS_FAMILIES } from "./css-families";

export type ThemeId = "bifrost" | "asgard" | "muspelheim" | "niflheim" | "yggdrasil" | "valhalla" | "ragnarok";
export type Family = "night" | "ink" | "dim" | "gold" | "ember" | "teal" | "sky" | "violet" | "rose" | "red";
/** A marca de cada corvo: sempre dentro da silhueta, simétrica, sem colidir com os olhos. */
export type RavenMark = "crest" | "moon" | "crown" | "ember" | "frost" | "leaf" | "helm" | "storm";

export interface RavenLook {
  lit: string; dark: string; wing: string; belly: [string, string];
  eye: string; halo: string; rim: string; quill: string; tips: string;
  beak: [string, string]; rune: string; runeInk: string; glow: string | null;
  /** Marcas extras desenhadas por cima (a crista do Huginn e a lua do Muninn ficam). */
  marks: RavenMark[]; markColor: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  /** Uma linha em pt-BR. */
  tagline: string;
  rune: string;
  /** Alvos das famílias; ausente = cor original (v13–v15). */
  families: Partial<Record<Family, string>>;
  /** Paradas da aurora/ponte (da esquerda para a direita). */
  aurora: [string, string, string, string];
  accent: string; onAccent: string; error: string; errorText: string; limit: string; ok: string;
  ink: string; dim: string; night: string;
  /** Tons de estado do corvo. */
  tones: { working: string; thinking: string; searching: string; question: string; approval: string; finished: string; sleeping: string; idle: string; dizzy: string };
  huginn: RavenLook; muninn: RavenLook;
  /** Personalidade: multiplica o período da respiração/balanço (1 = padrão). */
  tempo: number;
}

const BASE: Record<Family, string> = {
  night: "#0b1022", ink: "#eef2ff", dim: "#93a1c6", gold: "#e2b55a", ember: "#ff7a4a",
  teal: "#5ef2c9", sky: "#6aa8ff", violet: "#9d7bff", rose: "#ff6fae", red: "#ff5c7a",
};

const BIFROST_TONES = { idle: "#DFE9FF", working: "#6AA8FF", thinking: "#B47CFF", searching: "#7C8CFF", approval: "#F2B84B", question: "#5EF2C9", finished: "#4BE3A0", sleeping: "#6B7AA8", dizzy: "#FF7AC0" };

export const THEMES: readonly Theme[] = [
  {
    id: "bifrost", name: "Bifröst", rune: "ᚱ", tagline: "A ponte de aurora: noite de fiorde, verde-água, violeta e ouro.",
    families: { red: "#f0746f" },
    aurora: ["#2fd3a6", "#5ef2c9", "#6f8dff", "#9a6bff"],
    accent: "#f6d27a", onAccent: "#1a1205", error: "#f0746f", errorText: "#ffb0a8", limit: "#f2a54b", ok: "#4be3a0",
    ink: "#eef2ff", dim: "#9aa6c8", night: "#0a0f1f", tones: BIFROST_TONES, tempo: 1,
    huginn: { lit: "#2E4A86", dark: "#0B1430", wing: "#1a2c5a", belly: ["#5ef2c9", "#1d3566"], eye: "#d6fff4", halo: "rgba(94,242,201,0.9)", rim: "rgba(200,230,255,0.6)", quill: "#5ef2c9", tips: "rgba(214,255,244,0.45)", beak: ["#F6D27A", "#B8862F"], rune: "ᚨ", runeInk: "#F6D27A", glow: "rgba(94,242,201,0.45)", marks: ["crest"], markColor: "#5ef2c9" },
    muninn: { lit: "#6a5688", dark: "#1A1422", wing: "#352a44", belly: ["#cfd6ea", "#5a4d6e"], eye: "#ffe2a0", halo: "rgba(242,184,75,0.85)", rim: "rgba(230,215,255,0.5)", quill: "#cfd6ea", tips: "rgba(230,215,255,0.4)", beak: ["#F6D27A", "#B8862F"], rune: "ᛗ", runeInk: "#F6D27A", glow: null, marks: ["moon"], markColor: "#cfd6ea" },
  },
  {
    id: "asgard", name: "Asgard", rune: "ᛟ", tagline: "O salão dos deuses: azul real e ouro, corvos coroados.",
    families: { night: "#0b1640", ink: "#f7f1e1", dim: "#b4bad2", gold: "#f0c75e", teal: "#f3d27a", sky: "#5b8cff", violet: "#a9b8ff", rose: "#ffd39a", red: "#ff7a6e", ember: "#f0b45e" },
    aurora: ["#f3d27a", "#ffe9a8", "#5b8cff", "#a9b8ff"],
    accent: "#f0c75e", onAccent: "#1b1405", error: "#ff7a6e", errorText: "#ffb7ad", limit: "#f2a54b", ok: "#7fe0a6",
    ink: "#f7f1e1", dim: "#b4bad2", night: "#0b1640", tempo: 1.15,
    tones: { idle: "#F7F1E1", working: "#5B8CFF", thinking: "#A9B8FF", searching: "#7FA2FF", approval: "#F0C75E", question: "#FFE9A8", finished: "#7FE0A6", sleeping: "#6E78A8", dizzy: "#FFD39A" },
    huginn: { lit: "#3159c4", dark: "#0c1a4a", wing: "#1c3380", belly: ["#ffe9a8", "#1c3380"], eye: "#fff2c4", halo: "rgba(240,199,94,0.9)", rim: "rgba(255,236,180,0.62)", quill: "#f0c75e", tips: "rgba(255,236,180,0.5)", beak: ["#ffe08a", "#b8862f"], rune: "ᚨ", runeInk: "#ffe08a", glow: "rgba(240,199,94,0.4)", marks: ["crest", "crown"], markColor: "#f0c75e" },
    muninn: { lit: "#9aa3c4", dark: "#2c3360", wing: "#4a5280", belly: ["#f7f1e1", "#4a5280"], eye: "#0c1a4a", halo: "rgba(91,140,255,0.8)", rim: "rgba(12,26,74,0.5)", quill: "#f0c75e", tips: "rgba(12,26,74,0.4)", beak: ["#ffe08a", "#b8862f"], rune: "ᛗ", runeInk: "#0c1a4a", glow: null, marks: ["moon", "crown"], markColor: "#f0c75e" },
  },
  {
    id: "muspelheim", name: "Muspelheim", rune: "ᚲ", tagline: "O reino do fogo: brasa, lava e obsidiana; olhos em brasa.",
    families: { night: "#170b08", ink: "#fff1e6", dim: "#d1ab98", gold: "#ffb347", teal: "#ff8a3d", sky: "#ff5a2e", violet: "#ffcf5a", rose: "#ff7a5c", red: "#ff6b9a", ember: "#ff7a3a" },
    aurora: ["#ff5a2e", "#ff8a3d", "#ffcf5a", "#ff5a2e"],
    accent: "#ffb347", onAccent: "#1d0c03", error: "#ff6b9a", errorText: "#ffb3cd", limit: "#ffd27a", ok: "#9be07f",
    ink: "#fff1e6", dim: "#d1ab98", night: "#170b08", tempo: 0.85,
    tones: { idle: "#FFE6D2", working: "#FF8A3D", thinking: "#FFCF5A", searching: "#FF9F6A", approval: "#FFD27A", question: "#FFB347", finished: "#9BE07F", sleeping: "#8A5A48", dizzy: "#FF7A5C" },
    huginn: { lit: "#4a2a22", dark: "#110806", wing: "#2a1612", belly: ["#ff8a3d", "#3a1a10"], eye: "#ffb15c", halo: "rgba(255,106,42,0.95)", rim: "rgba(255,170,110,0.62)", quill: "#ff8a3d", tips: "rgba(255,190,140,0.5)", beak: ["#ffcf5a", "#c2551c"], rune: "ᚨ", runeInk: "#ffb347", glow: "rgba(255,106,42,0.5)", marks: ["crest", "ember"], markColor: "#ff7a2a" },
    muninn: { lit: "#6e5a54", dark: "#1c1412", wing: "#3e302c", belly: ["#ffd2b0", "#4a3a34"], eye: "#ffd27a", halo: "rgba(255,138,61,0.85)", rim: "rgba(255,200,160,0.5)", quill: "#ffb347", tips: "rgba(255,200,160,0.4)", beak: ["#ffcf5a", "#c2551c"], rune: "ᛗ", runeInk: "#ffb347", glow: null, marks: ["moon", "ember"], markColor: "#ff8a3d" },
  },
  {
    id: "niflheim", name: "Niflheim", rune: "ᛁ", tagline: "O reino do gelo: branco de geada e azul de geleira; corvos de neve.",
    families: { night: "#081a28", ink: "#f2fbff", dim: "#a6c2d2", gold: "#bfe6ff", teal: "#9fe8ff", sky: "#cfefff", violet: "#7fb2ff", rose: "#c9d8ff", red: "#ff8a9a", ember: "#a9c9dc" },
    aurora: ["#7fb2ff", "#9fe8ff", "#eafaff", "#9fe8ff"],
    accent: "#bfe6ff", onAccent: "#06202e", error: "#ff8a9a", errorText: "#ffc0c9", limit: "#ffd99a", ok: "#8ff0c8",
    ink: "#f2fbff", dim: "#a6c2d2", night: "#081a28", tempo: 1.3,
    tones: { idle: "#F2FBFF", working: "#9FE8FF", thinking: "#7FB2FF", searching: "#CFEFFF", approval: "#FFD99A", question: "#BFE6FF", finished: "#8FF0C8", sleeping: "#5E7E94", dizzy: "#C9D8FF" },
    huginn: { lit: "#7fa6c8", dark: "#1d3550", wing: "#3d6080", belly: ["#eafaff", "#3d6080"], eye: "#f2fbff", halo: "rgba(159,232,255,0.95)", rim: "rgba(234,250,255,0.75)", quill: "#eafaff", tips: "rgba(255,255,255,0.7)", beak: ["#eafaff", "#7fb2ff"], rune: "ᚨ", runeInk: "#eafaff", glow: "rgba(159,232,255,0.45)", marks: ["crest", "frost"], markColor: "#eafaff" },
    muninn: { lit: "#dbe7f3", dark: "#7083a0", wing: "#a3b5cc", belly: ["#ffffff", "#a3b5cc"], eye: "#1d3550", halo: "rgba(127,178,255,0.8)", rim: "rgba(29,53,80,0.5)", quill: "#ffffff", tips: "rgba(29,53,80,0.45)", beak: ["#eafaff", "#7fb2ff"], rune: "ᛗ", runeInk: "#1d3550", glow: null, marks: ["moon", "frost"], markColor: "#ffffff" },
  },
  {
    id: "yggdrasil", name: "Yggdrasil", rune: "ᛒ", tagline: "A árvore do mundo: floresta e musgo (a paleta Freya), corvos com folha.",
    families: { night: "#142d28", ink: "#f0eadb", dim: "#a9c6b4", gold: "#91b5a0", teal: "#91b5a0", sky: "#c9dccf", violet: "#f0eadb", rose: "#c9dccf", red: "#d08a7e", ember: "#a9c6b4" },
    aurora: ["#416a59", "#91b5a0", "#f0eadb", "#91b5a0"],
    accent: "#91b5a0", onAccent: "#142d28", error: "#d08a7e", errorText: "#e6b6ac", limit: "#c8b67e", ok: "#9fd3b1",
    ink: "#f0eadb", dim: "#a9c6b4", night: "#142d28", tempo: 1.1,
    tones: { idle: "#F0EADB", working: "#C9DCCF", thinking: "#F0EADB", searching: "#A9C6B4", approval: "#F0EADB", question: "#91B5A0", finished: "#9FD3B1", sleeping: "#6E8F7E", dizzy: "#C9DCCF" },
    huginn: { lit: "#2B5246", dark: "#142D28", wing: "#173129", belly: ["#91B5A0", "#416A59"], eye: "#F0EADB", halo: "rgba(145,181,160,0.9)", rim: "rgba(240,234,219,0.62)", quill: "#91B5A0", tips: "rgba(240,234,219,0.42)", beak: ["#F0EADB", "#91B5A0"], rune: "ᚨ", runeInk: "#91B5A0", glow: "rgba(145,181,160,0.55)", marks: ["crest", "leaf"], markColor: "#9fd3b1" },
    muninn: { lit: "#A9C6B4", dark: "#6C907D", wing: "#6C907D", belly: ["#F0EADB", "#91B5A0"], eye: "#142D28", halo: "rgba(145,181,160,0.85)", rim: "rgba(20,45,40,0.45)", quill: "#F0EADB", tips: "rgba(20,45,40,0.4)", beak: ["#F0EADB", "#91B5A0"], rune: "ᛗ", runeInk: "#142D28", glow: null, marks: ["moon", "leaf"], markColor: "#2b5246" },
  },
  {
    id: "valhalla", name: "Valhalla", rune: "ᛏ", tagline: "O salão dos guerreiros: aço, carmesim e muralha de escudos; corvos de elmo.",
    families: { night: "#11151c", ink: "#f1f3f6", dim: "#a7b0be", gold: "#d4a24c", teal: "#c8d0dc", sky: "#e0475c", violet: "#8a96a8", rose: "#e0475c", red: "#ff8a5c", ember: "#d4a24c" },
    aurora: ["#8a96a8", "#c8d0dc", "#e0475c", "#8a96a8"],
    accent: "#d4a24c", onAccent: "#1a1206", error: "#ff8a5c", errorText: "#ffc2a6", limit: "#f2d27a", ok: "#8fd7a0",
    ink: "#f1f3f6", dim: "#a7b0be", night: "#11151c", tempo: 0.95,
    tones: { idle: "#F1F3F6", working: "#C8D0DC", thinking: "#E0475C", searching: "#A7B0BE", approval: "#D4A24C", question: "#C8D0DC", finished: "#8FD7A0", sleeping: "#5A6475", dizzy: "#E0475C" },
    huginn: { lit: "#63748c", dark: "#1a222e", wing: "#36435a", belly: ["#e0475c", "#36435a"], eye: "#ffd0d6", halo: "rgba(224,71,92,0.9)", rim: "rgba(220,228,240,0.62)", quill: "#e0475c", tips: "rgba(220,228,240,0.48)", beak: ["#e6c27a", "#8a6526"], rune: "ᚨ", runeInk: "#e6c27a", glow: "rgba(224,71,92,0.4)", marks: ["helm"], markColor: "#c8d0dc" },
    muninn: { lit: "#4a505a", dark: "#14171c", wing: "#2c3038", belly: ["#c8d0dc", "#2c3038"], eye: "#ffd27a", halo: "rgba(212,162,76,0.85)", rim: "rgba(200,208,220,0.5)", quill: "#c8d0dc", tips: "rgba(200,208,220,0.42)", beak: ["#e6c27a", "#8a6526"], rune: "ᛗ", runeInk: "#e6c27a", glow: null, marks: ["moon", "helm"], markColor: "#d4a24c" },
  },
  {
    id: "ragnarok", name: "Ragnarök", rune: "ᚺ", tagline: "O fim dos tempos: céu escuro e aurora de tempestade violeta; corvos de raio.",
    families: { night: "#0d0816", ink: "#f4eeff", dim: "#b0a4cc", gold: "#c9b8ff", teal: "#7a5cff", sky: "#4fb3ff", violet: "#d14dff", rose: "#ff5cc8", red: "#ff6b6b", ember: "#c47aff" },
    aurora: ["#4fb3ff", "#7a5cff", "#d14dff", "#7a5cff"],
    accent: "#c9b8ff", onAccent: "#120a24", error: "#ff6b6b", errorText: "#ffb3b3", limit: "#ffc65c", ok: "#6ee7b7",
    ink: "#f4eeff", dim: "#b0a4cc", night: "#0d0816", tempo: 0.9,
    tones: { idle: "#F4EEFF", working: "#4FB3FF", thinking: "#D14DFF", searching: "#7A5CFF", approval: "#FFC65C", question: "#C9B8FF", finished: "#6EE7B7", sleeping: "#5A4E7A", dizzy: "#FF5CC8" },
    huginn: { lit: "#3a2c5c", dark: "#09060f", wing: "#221a3a", belly: ["#7a5cff", "#221a3a"], eye: "#e6dcff", halo: "rgba(122,92,255,0.95)", rim: "rgba(201,184,255,0.62)", quill: "#4fb3ff", tips: "rgba(201,184,255,0.5)", beak: ["#c9b8ff", "#6a4fd0"], rune: "ᚨ", runeInk: "#c9b8ff", glow: "rgba(122,92,255,0.5)", marks: ["crest", "storm"], markColor: "#4fb3ff" },
    muninn: { lit: "#5c4a80", dark: "#140e20", wing: "#352a4c", belly: ["#ff9ce0", "#352a4c"], eye: "#ff8fe0", halo: "rgba(209,77,255,0.85)", rim: "rgba(240,200,255,0.5)", quill: "#d14dff", tips: "rgba(240,200,255,0.42)", beak: ["#c9b8ff", "#6a4fd0"], rune: "ᛗ", runeInk: "#c9b8ff", glow: null, marks: ["moon", "storm"], markColor: "#d14dff" },
  },
];

export const DEFAULT_THEME: ThemeId = "bifrost";
export const THEME_KEY = "bifrost.theme";
export const THEME_EVENT = "bifrost-theme";

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// ── Cor ──
type HSL = [number, number, number];
export function hexRgb(h: string): [number, number, number] {
  const v = h.replace("#", "");
  const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");
function rgbHsl([r, g, b]: [number, number, number]): HSL {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslRgb([h, s, l]: HSL): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Recolore um literal da família `fam` para o alvo do tema, preservando a hierarquia (claro/escuro). */
export function recolor(hex: string, fam: Family, target: string): string {
  const [h, s, l] = rgbHsl(hexRgb(hex));
  const [bh, bs, bl] = rgbHsl(hexRgb(BASE[fam]));
  const [th, ts, tl] = rgbHsl(hexRgb(target));
  const dh = ((h - bh + 540) % 360) - 180;
  const nh = (th + dh * 0.35 + 360) % 360;
  const ns = clamp(bs > 0.04 ? s * (ts / bs) : ts);
  const nl = fam === "night" ? clamp(l * (tl / Math.max(bl, 0.02)), 0, 0.42) : clamp(l + (tl - bl), 0.04, 0.97);
  return toHex(...hslRgb([nh, ns, nl]));
}

/** Todas as variáveis CSS do tema (vazio no Bifröst onde não há alvo: valem as cores originais).
 *  `complete` escreve também as originais — para prévias dentro de outro tema. */
export function themeVars(t: Theme, complete = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [fam, list] of Object.entries(CSS_FAMILIES) as [Family, readonly string[]][]) {
    const target = t.families[fam];
    if (!target && !complete) continue;
    for (const lit of list) {
      const c = target ? recolor(lit, fam, target) : `#${lit}`;
      out[`--tk-${lit}`] = c;
      out[`--tk-${lit}-rgb`] = hexRgb(c).join(", ");
    }
  }
  const [a, b, c, d] = t.aurora;
  const fade = (x: string, al: number) => `rgba(${hexRgb(x).join(", ")}, ${al})`;
  out["--th-aurora"] = `linear-gradient(90deg, ${fade(a, 0)} 0%, ${a} 16%, ${b} 36%, ${c} 62%, ${d} 84%, ${fade(d, 0)} 100%)`;
  out["--th-accent"] = t.accent; out["--th-on-accent"] = t.onAccent; out["--th-accent-rgb"] = hexRgb(t.accent).join(", ");
  out["--th-error"] = t.error; out["--th-error-text"] = t.errorText; out["--th-error-rgb"] = hexRgb(t.error).join(", ");
  out["--th-limit"] = t.limit; out["--th-ok"] = t.ok; out["--th-ink"] = t.ink; out["--th-dim"] = t.dim; out["--th-night"] = t.night;
  out["--th-a1"] = a; out["--th-a2"] = b; out["--th-a3"] = c; out["--th-a4"] = d;
  out["--th-a1-rgb"] = hexRgb(a).join(", "); out["--th-a3-rgb"] = hexRgb(c).join(", ");
  out["--bf-aurora-band"] = out["--th-aurora"];
  out["--bf-bridge"] = `repeating-linear-gradient(90deg, transparent 0 21px, ${fade(t.accent, 0.7)} 21px 22px, transparent 22px 44px), ${out["--th-aurora"]}`;
  out["--prism"] = `linear-gradient(100deg, ${a} 0%, ${b} 45%, ${c} 100%)`;
  out["--red"] = t.error; out["--red-text"] = t.errorText; out["--hub-red"] = t.error; out["--bf-blood"] = t.error;
  out["--th-tempo"] = String(t.tempo);
  return out;
}

/** Contraste WCAG entre duas cores (#rrggbb). */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = hexRgb(h).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ── Estado vivo ──
let current: Theme = THEMES[0];
const subs = new Set<(t: Theme) => void>();
let applied: string[] = [];

export function currentTheme(): Theme { return current; }
export function onThemeChange(fn: (t: Theme) => void): () => void { subs.add(fn); return () => subs.delete(fn); }

function readStored(): ThemeId {
  try { return themeById(globalThis.localStorage?.getItem(THEME_KEY)).id; } catch { return DEFAULT_THEME; }
}

function paint(t: Theme) {
  if (typeof document === "undefined") return;
  const vars = themeVars(t);
  for (const el of [document.documentElement, document.body].filter(Boolean) as HTMLElement[]) {
    for (const k of applied) if (!(k in vars)) el.style.removeProperty(k);
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  }
  applied = Object.keys(vars);
  document.documentElement.dataset.theme = t.id;
}

/** Aplica o tema nesta janela; com `fade`, cruza as cores suavemente (View Transitions). */
export function applyTheme(id: string, opts: { fade?: boolean } = {}): Theme {
  const t = themeById(id);
  const run = () => { current = t; paint(t); for (const fn of subs) fn(t); };
  const doc = typeof document !== "undefined" ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }) : null;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (opts.fade && doc?.startViewTransition && !reduce && t.id !== current.id) doc.startViewTransition(run);
  else run();
  return t;
}

type Emit = (event: string, payload: unknown) => Promise<void>;
let emitter: Emit | null = null;

/** Escolhe o tema: aplica aqui com transição, guarda e avisa as outras janelas. */
export function chooseTheme(id: ThemeId): void {
  applyTheme(id, { fade: true });
  try { globalThis.localStorage?.setItem(THEME_KEY, id); } catch { /* sem armazenamento */ }
  void emitter?.(THEME_EVENT, id).catch(() => undefined);
}

/** Liga o tema na janela: aplica o guardado e escuta trocas feitas em outras janelas. */
export function bootTheme(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const forced = new URLSearchParams(window.location?.search ?? "").get("theme");
  applyTheme(forced ?? readStored());
  if (!document.body) document.addEventListener("DOMContentLoaded", () => paint(current), { once: true });
  window.addEventListener("storage", (e) => { if (e.key === THEME_KEY) applyTheme(e.newValue ?? DEFAULT_THEME, { fade: true }); });
  if ("__TAURI_INTERNALS__" in window) {
    void import("@tauri-apps/api/event").then(({ emit, listen }) => {
      emitter = emit;
      void listen<string>(THEME_EVENT, (e) => { if (e.payload !== current.id) applyTheme(e.payload, { fade: true }); });
    }).catch(() => undefined);
  }
}

bootTheme();
