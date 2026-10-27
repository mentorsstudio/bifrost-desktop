// Fase 19 — Personagens: o visual do Huginn e do Muninn, separado do tema do app.
// "theme" (Seguir o tema) é o padrão e usa os corvos do próprio tema. Os outros
// estilos trocam só as cores e a marca dos corvos — formas redondas e simétricas,
// olhos claros sobre corpo escuro (ou o inverso) para ler em qualquer fundo.
// Vale para a ilha, o corvo da área de trabalho, a pílula e o corvo do chat.

import { currentTheme, onThemeChange, type RavenLook, type Theme } from "./themes";

export type CharacterId = "theme" | "classic" | "snow" | "ember" | "moss" | "dusk" | "gold" | "storm";

export interface Character { id: CharacterId; name: string; tagline: string; huginn: RavenLook | null; muninn: RavenLook | null }

type Seed = { lit: string; dark: string; wing: string; belly: [string, string]; eye: string; accent: string; beak: [string, string]; glow: string | null };
function look(s: Seed, huginn: boolean, extra: RavenLook["marks"] = []): RavenLook {
  return {
    lit: s.lit, dark: s.dark, wing: s.wing, belly: s.belly, eye: s.eye,
    halo: `${s.accent}e6`, rim: "rgba(255,255,255,0.55)", quill: s.accent, tips: "rgba(255,255,255,0.45)",
    beak: s.beak, rune: huginn ? "ᚨ" : "ᛗ", runeInk: s.beak[0], glow: huginn ? s.glow : null,
    marks: [huginn ? "crest" : "moon", ...extra], markColor: s.accent,
  };
}
const GOLD: [string, string] = ["#F6D27A", "#B8862F"];
const pair = (h: Seed, m: Seed, hm: RavenLook["marks"] = [], mm: RavenLook["marks"] = []) => ({ huginn: look(h, true, hm), muninn: look(m, false, mm) });

export const CHARACTERS: readonly Character[] = [
  { id: "theme", name: "Seguir o tema", tagline: "Os corvos mudam junto com o tema do app.", huginn: null, muninn: null },
  { id: "classic", name: "Clássico", tagline: "Huginn preto e Muninn prata, traço de desenho animado.", ...pair(
    { lit: "#3a4256", dark: "#0c0f17", wing: "#1c2130", belly: ["#9aa6c8", "#1c2130"], eye: "#f2f5ff", accent: "#9aa6c8", beak: GOLD, glow: null },
    { lit: "#5b5f6e", dark: "#17181e", wing: "#2c2e38", belly: ["#d5d8e2", "#2c2e38"], eye: "#ffe2a0", accent: "#d5d8e2", beak: GOLD, glow: null }) },
  { id: "snow", name: "Neve", tagline: "Penas brancas de inverno, olhos de gelo.", ...pair(
    { lit: "#f4f7ff", dark: "#b9c4dc", wing: "#cfd8ea", belly: ["#ffffff", "#c4cee4"], eye: "#1d2b4a", accent: "#7fb2ff", beak: ["#ffd98a", "#c98d2f"], glow: "rgba(159,200,255,0.35)" },
    { lit: "#eef0f6", dark: "#a9adbd", wing: "#c3c7d4", belly: ["#ffffff", "#babfcc"], eye: "#2a2438", accent: "#b9a8ff", beak: ["#ffd98a", "#c98d2f"], glow: null }, [], ["frost"]) },
  { id: "ember", name: "Brasa", tagline: "Laranja de fogueira e carvão quente.", ...pair(
    { lit: "#d9683a", dark: "#4a1a0c", wing: "#8a3418", belly: ["#ffc27a", "#7a2c12"], eye: "#fff1d6", accent: "#ffb347", beak: ["#ffe08a", "#c2551c"], glow: "rgba(255,140,60,0.45)" },
    { lit: "#a8523a", dark: "#2e120c", wing: "#5e2618", belly: ["#ffd8b0", "#5e2618"], eye: "#ffe2a0", accent: "#ffd8b0", beak: ["#ffe08a", "#c2551c"], glow: null }, ["ember"]) },
  { id: "moss", name: "Musgo", tagline: "Verde de floresta, macio como folha.", ...pair(
    { lit: "#4f9a6a", dark: "#12301e", wing: "#2a5c3c", belly: ["#c8f2b0", "#2a5c3c"], eye: "#f4ffe8", accent: "#a6e88a", beak: ["#f3d98a", "#9c7a2a"], glow: "rgba(140,230,150,0.35)" },
    { lit: "#7a8a52", dark: "#252c16", wing: "#4a5530", belly: ["#e6edc0", "#4a5530"], eye: "#fff2c4", accent: "#e6edc0", beak: ["#f3d98a", "#9c7a2a"], glow: null }, [], ["leaf"]) },
  { id: "dusk", name: "Crepúsculo", tagline: "Lilás e rosa do fim de tarde.", ...pair(
    { lit: "#8f6ad8", dark: "#2a1850", wing: "#553896", belly: ["#ffc6e6", "#553896"], eye: "#fff0fa", accent: "#ff9fd2", beak: ["#ffd9a8", "#c9884a"], glow: "rgba(200,140,255,0.4)" },
    { lit: "#c77aa8", dark: "#3a1830", wing: "#7a3a62", belly: ["#ffe0f0", "#7a3a62"], eye: "#fff2c4", accent: "#ffe0f0", beak: ["#ffd9a8", "#c9884a"], glow: null }) },
  { id: "gold", name: "Ouro de Asgard", tagline: "Dourado com detalhes de marfim.", ...pair(
    { lit: "#e0b04e", dark: "#5a3a0c", wing: "#9a6c1e", belly: ["#fff2c4", "#9a6c1e"], eye: "#fff6dc", accent: "#fff2c4", beak: ["#fff2c4", "#c9a04a"], glow: "rgba(246,210,122,0.5)" },
    { lit: "#c9a26a", dark: "#4a3418", wing: "#7e5e30", belly: ["#fbecd0", "#7e5e30"], eye: "#fff6dc", accent: "#fbecd0", beak: ["#fff2c4", "#c9a04a"], glow: null }, ["crown"]) },
  { id: "storm", name: "Tempestade", tagline: "Cinza-chumbo com relâmpago ciano.", ...pair(
    { lit: "#5c7590", dark: "#16222e", wing: "#34475a", belly: ["#8ff0ff", "#34475a"], eye: "#e8fdff", accent: "#5ee8ff", beak: ["#d8e4ee", "#7c8ea0"], glow: "rgba(94,232,255,0.4)" },
    { lit: "#6c7480", dark: "#1c2026", wing: "#3c434e", belly: ["#d6e2ec", "#3c434e"], eye: "#fff2c4", accent: "#d6e2ec", beak: ["#d8e4ee", "#7c8ea0"], glow: null }, ["storm"]) },
];

export const DEFAULT_CHARACTER: CharacterId = "classic";
export const CHARACTER_KEY = "bifrost.character";
export const CHARACTER_EVENT = "bifrost-character";

export function characterById(id: string | null | undefined): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER)!;
}

/** O tema com os corvos do personagem por cima (id próprio para caches e gradientes). */
export function ravenTheme(t: Theme = currentTheme(), c: Character = current): Theme {
  if (!c.huginn || !c.muninn) return t;
  return { ...t, id: `${t.id}-${c.id}` as Theme["id"], huginn: c.huginn, muninn: c.muninn };
}

let current: Character = characterById(DEFAULT_CHARACTER);
const subs = new Set<(c: Character) => void>();
export function currentCharacter(): Character { return current; }
export function onCharacterChange(fn: (c: Character) => void): () => void { subs.add(fn); return () => subs.delete(fn); }
/** Avisa quando os corvos mudam por qualquer motivo: tema ou personagem. */
export function onRavenLookChange(fn: () => void): () => void {
  const a = onThemeChange(() => fn()), b = onCharacterChange(() => fn());
  return () => { a(); b(); };
}

export function applyCharacter(id: string): Character {
  const c = characterById(id);
  if (c.id === current.id) return c;
  current = c;
  for (const fn of subs) fn(c);
  return c;
}

type Emit = (event: string, payload: unknown) => Promise<void>;
let emitter: Emit | null = null;

/** Escolhe o personagem: aplica aqui, guarda e avisa as outras janelas. */
export function chooseCharacter(id: CharacterId): void {
  applyCharacter(id);
  try { globalThis.localStorage?.setItem(CHARACTER_KEY, id); } catch { /* sem armazenamento */ }
  void emitter?.(CHARACTER_EVENT, id).catch(() => undefined);
}

export function bootCharacter(): void {
  if (typeof window === "undefined") return;
  let stored: string | null = null;
  try { stored = globalThis.localStorage?.getItem(CHARACTER_KEY) ?? null; } catch { /* nada */ }
  const forced = new URLSearchParams(window.location?.search ?? "").get("character");
  current = characterById(forced ?? stored);
  window.addEventListener?.("storage", (e) => { if (e.key === CHARACTER_KEY) applyCharacter(e.newValue ?? DEFAULT_CHARACTER); });
  if ("__TAURI_INTERNALS__" in window) {
    void import("@tauri-apps/api/event").then(({ emit, listen }) => {
      emitter = emit;
      void listen<string>(CHARACTER_EVENT, (e) => applyCharacter(e.payload));
    }).catch(() => undefined);
  }
}

bootCharacter();
