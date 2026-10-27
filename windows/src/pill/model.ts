// Modelo da pílula, sem DOM: o que mostrar (aparência), o tamanho, a fala das
// nove barras e as zonas onde o mouse é da pílula. Tudo puro, para os testes.

import type { PillState } from "../core/flow";

export const BANDS = 9;
export const REST = { length: 44, thickness: 8 } as const;
export const OPEN_THICKNESS = 34;

/** As sete aparências da placa. */
export type Look = "resting" | "toolbar" | "note" | "live" | "handsFree" | "message" | "voice";

export const IDLE_STATE: PillState = {
  phase: "idle", edge: "bottom", key: "right_ctrl", noteStartedAt: null, announcement: null, enabled: false, voice: null,
};

const PHASE_LOOK: Partial<Record<PillState["phase"], Look>> = {
  locked: "handsFree",
  listening: "live",
  thinking: "live",
  copied: "message",
  failed: "message",
  pastedAgain: "message",
};

export function lookOf(s: PillState, hovered: boolean): Look {
  const byPhase = PHASE_LOOK[s.phase];
  if (byPhase) return byPhase;
  if (s.voice) return "voice";
  if (s.noteStartedAt) return "note";
  return hovered ? "toolbar" : "resting";
}

export const isVertical = (s: PillState) => s.edge !== "bottom";

/** A chave (em inglês, para o t()) da mensagem curta de cada fase. */
export function messageKey(phase: PillState["phase"]): string | null {
  return phase === "copied" ? "Copied · press Ctrl+V to paste"
    : phase === "failed" ? "Microphone unavailable"
    : phase === "pastedAgain" ? "Last dictation pasted"
    : null;
}

/** Comprimento da placa aberta; `textWidth` mede a mensagem (canvas no app, número no teste). */
export function openLength(look: Look, s: PillState, now: number, textWidth: number): number {
  const v = isVertical(s);
  switch (look) {
    case "toolbar": return 150;
    case "handsFree": return 158;
    case "note": {
      const longCall = s.noteStartedAt !== null && now - s.noteStartedAt >= 3_600_000;
      return v ? 128 : longCall ? 152 : 136;
    }
    case "message": return v ? 76 : textWidth + 59;
    default: return 118;
  }
}

/** Largura × altura finais da placa. */
export function capsuleSize(look: Look, s: PillState, now: number, textWidth: number): { w: number; h: number } {
  const open = look !== "resting";
  const len = open ? openLength(look, s, now, textWidth) : REST.length;
  const thick = open ? OPEN_THICKNESS : REST.thickness;
  return isVertical(s) ? { w: thick, h: len } : { w: len, h: thick };
}

/** Uma chave que muda quando o conteúdo da placa precisa ser refeito. */
export function contentKey(look: Look, s: PillState, platform: string): string {
  return [look, s.edge, s.phase, s.key, s.noteStartedAt, platform, s.voice?.phase ?? ""].join("|");
}

const wave = (now: number, i: number) => 0.25 + 0.25 * Math.sin(now / 160 - i * 0.7);

/** Onde a barra `i` quer chegar: a voz, uma onda lenta pensando, viva quando o Bifrost fala. */
export function bandGoal(s: PillState, now: number, i: number, mic: readonly number[], speaking: boolean): number {
  if (s.phase === "thinking") return wave(now, i);
  if (s.phase === "listening" || s.phase === "locked") return mic[i] ?? 0;
  switch (s.voice?.phase) {
    case "thinking": return wave(now, i);
    case "speaking": return speaking ? 0.2 + 0.35 * Math.abs(Math.sin(now / 110 + i * 1.3) * Math.sin(now / 270 - i * 0.6)) : 0.05;
    case "listening": return 0.08 + 0.08 * Math.sin(now / 400 - i * 0.5);
    default: return 0;
  }
}

/** Aproxima os níveis dos alvos (filtro de 1ª ordem, ~70 ms). Muta e devolve `levels`. */
export function easeBands(levels: number[], goals: readonly number[], dt: number): number[] {
  const k = Math.min(1, dt * 14);
  for (let i = 0; i < levels.length; i++) levels[i] += ((goals[i] ?? 0) - levels[i]) * k;
  return levels;
}

/** Tamanho em px de uma barra no nível `level`. */
export const bandPx = (level: number) => 3.4 + 16 * Math.max(0, level);

export type Rect = [number, number, number, number];

/** As zonas do mouse: folga em volta da placa em repouso, a placa aberta e o balão. */
export function hotRects(s: PillState, open: boolean, W: number, H: number, bubble: DOMRectReadOnly | null): Rect[] {
  const long = open ? 200 : 96;
  const short = open ? 46 : 26;
  const rects: Rect[] = [];
  if (s.edge === "bottom") rects.push([(W - long) / 2, H - short, long, short]);
  else rects.push([s.edge === "left" ? 0 : W - short, (H - long) / 2, short, long]);
  if (bubble) rects.push([bubble.left - 6, bubble.top - 6, bubble.width + 12, bubble.height + 12]);
  return rects;
}

/** Precisa de quadros? Só visível e aberta; uma chamada sozinha basta 1 quadro/s. */
export function frameMode(visible: boolean, look: Look, hovered: boolean): "none" | "second" | "raf" {
  if (!visible || look === "resting") return "none";
  return look === "note" && !hovered ? "second" : "raf";
}

export const isShown = (s: PillState) => s.enabled || s.noteStartedAt !== null || s.announcement !== null || s.voice !== null;

/** Ícone do anúncio → ícone do hub. */
export const ANNOUNCE_ICON: Record<string, string> = { mic: "mic", lock: "lock", clipboard: "copy", download: "download", check: "check", error: "x" };

/** Distância de um ponto a um retângulo (0 dentro). */
export function distance(r: { left: number; top: number; right: number; bottom: number }, x: number, y: number): number {
  return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
}
