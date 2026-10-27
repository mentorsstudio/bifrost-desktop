// Geometria da ilha, sem DOM: o tamanho-alvo, o retângulo na janela, os
// toques (ilha com margem, Huginn como círculo), a barra de contagem, o olhar
// do Huginn e o relógio. Tudo puro, testado em tests/island-geometry.test.mjs.

import {
  EXPANDED_CORNER, PANEL_W, QUESTION_PICKER_H, ROUNDED_CORNER, islandSize,
  type IslandMode, type IslandViewName,
} from "../core/layout";

export interface Rect { x: number; y: number; w: number; h: number }

/** Mesma margem do teste de clique do Rust (src-tauri/src/island.rs). */
export const HIT_MARGIN = 14;
/** Folga do canvas do Huginn em cima/embaixo e dos lados (chapéus). */
export const BOT_OVERHANG = 40;
export const BOT_SIDE = 24;
/** Largura máxima da barra de contagem. */
export const COUNTDOWN_MAX = 160;

export const modeRank = (m: IslandMode) => (m === "hidden" ? 0 : m === "compact" ? 1 : 2);

export interface Shape { w: number; h: number; r: number }

export function targetShape(mode: IslandMode, view: IslandViewName, chatCount: number, pickingAnswers: boolean): Shape {
  const { w, h } = islandSize(mode, view, chatCount);
  const expanded = mode === "expanded";
  return {
    w,
    h: expanded && view === "question" && pickingAnswers ? QUESTION_PICKER_H : h,
    r: expanded ? EXPANDED_CORNER : ROUNDED_CORNER,
  };
}

/** A ilha fica centrada no topo da janela. */
export function islandRect(viewportW: number, w: number, h: number): Rect {
  const vw = viewportW > 0 ? viewportW : PANEL_W;
  return { x: (vw - w) / 2, y: 0, w, h };
}

export function insideWithMargin(r: Rect, x: number, y: number, m = HIT_MARGIN): boolean {
  return x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;
}

/** O Huginn é um círculo de diâmetro `size` centrado em (cx, cy) dentro da ilha. */
export function onRaven(r: Rect, cx: number, cy: number, size: number, x: number, y: number): boolean {
  const rad = size / 2;
  return (x - r.x - cx) ** 2 + (y - r.y - cy) ** 2 <= rad * rad;
}

/** O retângulo mudou o bastante para avisar o Rust (meio pixel). */
export function rectMoved(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) > 0.5 || Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5;
}

/** Largura da barra de contagem: só nos últimos 60 % (até 10 s) do fechamento automático. */
export function countdownWidth(dueAtMs: number | null, nowMs: number, autoCloseS: number, show: boolean): number {
  if (!show || dueAtMs == null) return 0;
  const windowS = Math.min(10, autoCloseS * 0.6);
  const left = (dueAtMs - nowMs) / 1000;
  if (left >= windowS) return 0;
  return Math.max(0, Math.min(1, left / windowS)) * COUNTDOWN_MAX;
}

/** Olhar do Huginn: tanh da distância do mouse até ele. */
export const gazeX = (mouseX: number, ravenScreenX: number) => Math.tanh((mouseX - ravenScreenX) / 260);
export const gazeY = (mouseY: number, ravenY: number) => -Math.tanh((mouseY - ravenY) / 200);

/** O canvas do Huginn: tamanho CSS e onde ele fica. */
export function ravenCanvasBox(size: number, cx: number, cy: number): { w: number; h: number; px: number; left: number; top: number } {
  const px = Math.max(1, Math.round(size));
  const h = px + BOT_OVERHANG;
  const w = px + BOT_SIDE * 2;
  return { w, h, px, left: cx - w / 2, top: cy - BOT_OVERHANG / 2 - h / 2 };
}

/** Texto do relógio da ilha compacta. */
export function clockText(now: Date, locale: string | string[] = []): string {
  const date = now.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const time = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${date}  ${time}`;
}
