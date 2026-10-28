// O gatilho do anel de arquivos: os quatro nomes antigos ("ctrl-hold"…) ou
// "custom:ctrl+shift:middle:hold|click", espelhando Trigger em
// src-tauri/src/gesture/logic.rs.

export type GestureButton = "right" | "middle" | "x1" | "x2";
export interface GestureTrigger { mods: string[]; button: GestureButton; hold: boolean }

const LEGACY: Record<string, GestureTrigger> = {
  "ctrl-hold": { mods: ["ctrl"], button: "right", hold: true },
  ctrl: { mods: ["ctrl"], button: "right", hold: false },
  "ctrl-alt": { mods: ["ctrl", "alt"], button: "right", hold: false },
  "alt-hold": { mods: ["alt"], button: "right", hold: true },
};
export const DEFAULT_GESTURE = "ctrl-hold";
const ORDER = ["ctrl", "alt", "shift", "win"];

export function parseGesture(id: string): GestureTrigger | null {
  if (id in LEGACY) return LEGACY[id];
  const m = /^custom:([a-z+]*):(right|middle|x1|x2):(hold|click)$/.exec(id);
  if (!m) return null;
  const mods = m[1].split("+").filter((x) => x && x !== "none");
  if (mods.some((x) => !ORDER.includes(x))) return null;
  if (m[2] === "right" && !mods.length) return null;
  return { mods: ORDER.filter((x) => mods.includes(x)), button: m[2] as GestureButton, hold: m[3] === "hold" };
}

export function gestureId(g: GestureTrigger): string {
  const mods = ORDER.filter((x) => g.mods.includes(x));
  for (const [id, l] of Object.entries(LEGACY)) if (l.button === g.button && l.hold === g.hold && l.mods.join() === mods.join()) return id;
  return `custom:${mods.join("+") || "none"}:${g.button}:${g.hold ? "hold" : "click"}`;
}

/** Um gatilho aceitável? Botão direito sem modificador tomaria todo clique direito. */
export function gestureProblem(g: GestureTrigger): string | null {
  return g.button === "right" && !g.mods.length ? "Segure Ctrl, Alt, Shift ou Win junto com o botão direito." : null;
}

const MOD_LABEL: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", win: "Win" };
const BUTTON: Record<GestureButton, [string, string]> = {
  right: ["clique direito", "segurar o botão direito"],
  middle: ["clique do meio", "segurar o botão do meio"],
  x1: ["botão Voltar do mouse", "segurar o botão Voltar do mouse"],
  x2: ["botão Avançar do mouse", "segurar o botão Avançar do mouse"],
};

/** "Ctrl + segurar o botão direito", "Ctrl + Shift + clique do meio"… */
export function gestureLabel(id: string): string {
  const g = parseGesture(id) ?? LEGACY[DEFAULT_GESTURE];
  return [...g.mods.map((m) => MOD_LABEL[m]), BUTTON[g.button][g.hold ? 1 : 0]].join(" + ");
}

/** Curto, para títulos: "Ctrl + botão direito". */
export function gestureShort(id: string): string {
  const g = parseGesture(id) ?? LEGACY[DEFAULT_GESTURE];
  const b = { right: "botão direito", middle: "botão do meio", x1: "botão Voltar", x2: "botão Avançar" }[g.button];
  return [...g.mods.map((m) => MOD_LABEL[m]), b].join(" + ");
}

const BTN_OF: Record<number, GestureButton> = { 1: "middle", 2: "right", 3: "x1", 4: "x2" };

/** Gravador: o próximo botão do mouse (não o esquerdo) com os modificadores segurados.
 *  Segurar mais que `holdMs` grava "segurar". Esc cancela. */
export function recordGesture(target: HTMLElement, holdMs: number, done: (id: string | null) => void): () => void {
  let pressed: { g: GestureTrigger; at: number } | null = null;
  const onDown = (e: MouseEvent) => {
    const button = BTN_OF[e.button];
    if (!button) return;
    e.preventDefault(); e.stopPropagation();
    const mods = [e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift", e.metaKey && "win"].filter(Boolean) as string[];
    pressed = { g: { mods, button, hold: false }, at: performance.now() };
  };
  const onUp = (e: MouseEvent) => {
    if (!pressed) return;
    e.preventDefault(); e.stopPropagation();
    const g = { ...pressed.g, hold: performance.now() - pressed.at >= holdMs };
    stop(); done(gestureId(g));
  };
  const block = (e: Event) => e.preventDefault();
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { stop(); done(null); } };
  const stop = () => {
    target.removeEventListener("mousedown", onDown, true);
    target.removeEventListener("mouseup", onUp, true);
    target.removeEventListener("auxclick", block, true);
    target.removeEventListener("contextmenu", block, true);
    target.removeEventListener("keydown", onKey, true);
  };
  target.addEventListener("mousedown", onDown, true);
  target.addEventListener("mouseup", onUp, true);
  target.addEventListener("auxclick", block, true);
  target.addEventListener("contextmenu", block, true);
  target.addEventListener("keydown", onKey, true);
  return stop;
}
