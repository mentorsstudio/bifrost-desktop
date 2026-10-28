// A tecla (ou combinação) que se segura para ditar. Espelha FlowKey do Rust
// (src-tauri/src/flow/logic.rs): os ids antigos ("right_ctrl", "left_ctrl_super"…)
// e "chord:a2+5b" (códigos de tecla virtual do Windows, em hexadecimal).

/** Código de tecla virtual do Windows de um KeyboardEvent.code. */
export function codeToVk(code: string): number | null {
  const fixed: Record<string, number> = {
    ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5, ShiftLeft: 0xa0, ShiftRight: 0xa1,
    MetaLeft: 0x5b, MetaRight: 0x5b, OSLeft: 0x5b, OSRight: 0x5b, Space: 0x20, CapsLock: 0x14, ScrollLock: 0x91,
    Pause: 0x13, Insert: 0x2d, ContextMenu: 0x5d, Backquote: 0xc0,
  };
  if (code in fixed) return fixed[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].charCodeAt(0);
  m = /^Digit([0-9])$/.exec(code);
  if (m) return 0x30 + Number(m[1]);
  m = /^F([0-9]{1,2})$/.exec(code);
  if (m && +m[1] >= 1 && +m[1] <= 24) return 0x6f + Number(m[1]);
  return null;
}

import { t } from "../i18n/i18n";

const NAMED: Record<string, number[]> = {
  right_ctrl: [0xa3], right_alt: [0xa5], right_shift: [0xa1], left_ctrl_super: [0xa2, 0x5b],
};
export const DEFAULT_HOLD_KEY = "left_ctrl_super";

const MODS = new Set([0x10, 0x11, 0x12, 0x5b, 0x5c, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]);
export const isModifierVk = (vk: number) => MODS.has(vk);

/** Os códigos de um id. */
export function holdKeyCodes(id: string): number[] {
  if (id in NAMED) return NAMED[id];
  const m = /^chord:([0-9a-f+]+)$/i.exec(id);
  return m ? m[1].split("+").map((c) => parseInt(c, 16)).filter((n) => n > 0) : NAMED[DEFAULT_HOLD_KEY];
}

/** O id de um conjunto de códigos (o nome antigo quando é um deles). */
export function holdKeyId(codes: number[]): string {
  const v = [...new Set(codes)].sort((a, b) => a - b);
  for (const [name, c] of Object.entries(NAMED)) if ([...c].sort((a, b) => a - b).join() === v.join()) return name;
  return `chord:${v.map((c) => c.toString(16)).join("+")}`;
}

function vkLabel(vk: number, platform: "windows" | "linux", right: (k: string) => string, left: (k: string) => string): string {
  const win = platform === "windows" ? "Win" : "Super";
  switch (vk) {
    case 0x10: return "Shift";
    case 0x11: return "Ctrl";
    case 0x12: return "Alt";
    case 0x5b: case 0x5c: return win;
    case 0xa0: return left("Shift");
    case 0xa1: return right("Shift");
    case 0xa2: return left("Ctrl");
    case 0xa3: return right("Ctrl");
    case 0xa4: return left("Alt");
    case 0xa5: return right("Alt");
    case 0x14: return "Caps Lock";
    case 0x20: return t("Space");
    case 0x91: return "Scroll Lock";
    case 0x13: return "Pause";
    case 0x2d: return "Insert";
    case 0x5d: return "Menu";
    case 0xc0: return "`";
  }
  if (vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6f}`;
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk);
  return `0x${vk.toString(16).toUpperCase()}`;
}

const rank = (vk: number) => ([0x11, 0xa2, 0xa3].includes(vk) ? 0 : [0x12, 0xa4, 0xa5].includes(vk) ? 1 : [0x10, 0xa0, 0xa1].includes(vk) ? 2 : [0x5b, 0x5c].includes(vk) ? 3 : 4);

/** "Ctrl + Win", "Ctrl direito", "Ctrl esquerdo + Alt"… */
export function holdKeyLabel(id: string, platform: "windows" | "linux", right: (k: string) => string, left: (k: string) => string = (k) => k): string {
  if (id === "left_ctrl_super") return platform === "windows" ? "Ctrl + Win" : "Ctrl + Super";
  const codes = holdKeyCodes(id).sort((a, b) => rank(a) - rank(b));
  // Sozinho, o lado esquerdo é o natural: "Ctrl" basta só quando vem com outra tecla.
  return codes.map((c) => vkLabel(c, platform, right, codes.length > 1 ? (k) => k : left)).join(" + ");
}

/** Uma combinação aceitável para segurar? (sem modificador, só teclas que não digitam nada) */
export function holdKeyProblem(codes: number[]): string | null {
  if (!codes.length) return "empty";
  if (codes.length > 4) return "too-many";
  const free = (vk: number) => isModifierVk(vk) || (vk >= 0x70 && vk <= 0x87) || [0x13, 0x91, 0x2d, 0x14, 0x5d].includes(vk);
  if (!codes.some(isModifierVk) && !codes.every(free)) return "types";
  return null;
}

/** Gravador: devolve os códigos mais completos segurados até a primeira tecla solta. */
export function recordHoldKey(target: HTMLElement, done: (codes: number[] | null) => void): () => void {
  const down = new Set<number>();
  let best: number[] = [];
  const onDown = (e: KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.code === "Escape") { stop(); done(null); return; }
    const vk = codeToVk(e.code);
    if (vk == null) return;
    down.add(vk);
    if (down.size >= best.length) best = [...down];
  };
  const onUp = (e: KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!best.length) return;
    stop(); done(best);
  };
  const onBlur = () => { stop(); done(best.length ? best : null); };
  const stop = () => {
    target.removeEventListener("keydown", onDown, true);
    target.removeEventListener("keyup", onUp, true);
    window.removeEventListener("blur", onBlur);
  };
  target.addEventListener("keydown", onDown, true);
  target.addEventListener("keyup", onUp, true);
  window.addEventListener("blur", onBlur);
  return stop;
}
