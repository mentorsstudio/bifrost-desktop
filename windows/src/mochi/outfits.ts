// Adornos do Huginn, desenhados em código — originais do Bifrost: halo de
// aurora, faixa de runas, cachecol de gelo, coroa de estrelas, elmo e lanterna.
//
// Coordenadas: o espaço do corpo do BotEngine — origem no centro do corpo,
// y para baixo, R = W × 0.3, rx = 1.14 R, ry = 0.88 R. Os adornos são planos
// (2D) e acompanham o giro da cabeça só pelo deslocamento horizontal.

import { Ease } from "../core/anim";
import type { Outfit, OutfitSelection } from "./wardrobe";
import { SCRIPT_FONTS } from "../core/fonts";

const EYE_W = 0.25;
const EYE_H = 0.27;
const EYE_SP = 0.37;
const EYE_P = -0.12;
const EXP = 2.7;

type Ctx = CanvasRenderingContext2D;

/** Geometria da cabeça + o atraso de mola das partes soltas (−1…1). */
export interface Head {
  R: number;
  rx: number;
  ry: number;
  yaw: number;
  pitch: number;
  physDx: number;
  physDy: number;
}

export function makeHead(R: number, yaw = 0, pitch = 0, physDx = 0, physDy = 0): Head {
  return { R, rx: R * 1.14, ry: R * 0.88, yaw, pitch, physDx, physDy };
}

/** O contorno em gota do Huginn, igual ao do motor (cabeça mais estreita). */
export function bodyOutline(rx: number, ry: number): Path2D {
  const p = new Path2D();
  const n = 96;
  const e = 2 / EXP;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = rx * Math.sign(ca) * Math.pow(Math.abs(ca), e) * (1 - 0.17 * Math.max(0, -sa));
    const y = ry * Math.sign(sa) * Math.pow(Math.abs(sa), e) * (sa > 0 ? 1.04 : 1);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

export interface EyeFrame {
  sd: number; x: number; y: number; fx: number; fy: number; visible: boolean; w: number; h: number;
}

/** Onde o motor desenha os olhos. */
export function eyeFrames(H: Head): EyeFrame[] {
  return [-1, 1].map((sd) => {
    const eyeYaw = sd * EYE_SP + H.yaw;
    const eyePitch = EYE_P + H.pitch;
    const cp = Math.cos(eyePitch);
    return {
      sd,
      visible: Math.cos(eyeYaw) * cp > 0.04,
      x: Math.sin(eyeYaw) * cp * H.rx,
      y: -Math.sin(eyePitch) * H.ry,
      fx: Math.max(0.18, Math.cos(eyeYaw)),
      fy: Math.max(0.18, cp),
      w: H.R * EYE_W,
      h: H.R * EYE_H,
    };
  });
}

export interface OutfitState {
  /** 0 = ausente, 1 = no lugar. Animado pelo motor. */
  presence: number;
  /** A transformação em caixa de entrega: os adornos somem. */
  morph: number;
}

function layerAlpha(st: OutfitState): number {
  const morphFade = 1 - Math.min(1, Math.max(0, (st.morph - 0.3) / 0.2));
  return morphFade * Math.min(1, st.presence * 2.5);
}

const shiftX = (H: Head) => Math.sin(H.yaw) * H.rx * 0.6;

function starPath(ctx: Ctx, x: number, y: number, ro: number, ri: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

const PRISM = ["#4FE3C1", "#5AA9FF", "#9D7BFF", "#FF6FAE", "#FFC65C"];

function auroraHalo(ctx: Ctx, H: Head, front: boolean) {
  const t = performance.now() / 1000;
  const cx = shiftX(H);
  const cy = -H.ry * 1.18;
  const w = H.rx * 0.95;
  const h = H.ry * 0.22;
  const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
  PRISM.forEach((c, i) => g.addColorStop((i + (Math.sin(t) * 0.1 + 0.1)) / 5.2, c));
  ctx.save();
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(1.2, H.R * 0.09);
  ctx.shadowColor = "rgba(157,123,255,0.8)";
  ctx.shadowBlur = H.R * 0.3;
  ctx.beginPath();
  // a metade de trás do anel atrás do corpo, a da frente na frente
  ctx.ellipse(cx, cy, w, h, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function runeBand(ctx: Ctx, H: Head) {
  const y = -H.ry * 0.62;
  const w = H.rx * 0.82;
  const h = H.R * 0.17;
  ctx.save();
  ctx.clip(bodyOutline(H.rx, H.ry));
  ctx.fillStyle = "#1B2550";
  ctx.fillRect(-H.rx, y - h / 2, H.rx * 2, h);
  ctx.strokeStyle = "#FFC65C";
  ctx.lineWidth = Math.max(0.8, H.R * 0.035);
  ctx.shadowColor = "rgba(255,198,92,0.9)";
  ctx.shadowBlur = H.R * 0.15;
  const sx = shiftX(H);
  // três runas simples (ᚱ ᚢ ᚾ) feitas com traços
  const runes: [number, number][][][] = [
    [[[-0.5, -1], [-0.5, 1]], [[-0.5, -1], [0.4, -0.4]], [[0.4, -0.4], [-0.5, 0.1]], [[-0.5, 0.1], [0.5, 1]]],
    [[[-0.5, 1], [-0.5, -1]], [[-0.5, -1], [0.5, -0.4]], [[0.5, -0.4], [0.5, 1]]],
    [[[0, -1], [0, 1]], [[-0.5, -0.3], [0.5, 0.3]]],
  ];
  runes.forEach((strokes, i) => {
    const rx0 = sx + (i - 1) * w * 0.55;
    ctx.beginPath();
    for (const [[x0, y0], [x1, y1]] of strokes) {
      ctx.moveTo(rx0 + x0 * h * 0.35, y + y0 * h * 0.36);
      ctx.lineTo(rx0 + x1 * h * 0.35, y + y1 * h * 0.36);
    }
    ctx.stroke();
  });
  ctx.restore();
}

function frostScarf(ctx: Ctx, H: Head) {
  const y = H.ry * 0.5;
  const sway = H.physDx * H.R * 0.3;
  const g = ctx.createLinearGradient(-H.rx, 0, H.rx, 0);
  g.addColorStop(0, "#BFE9FF");
  g.addColorStop(1, "#7FB8FF");
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-H.rx * 0.95, y - H.R * 0.12);
  ctx.quadraticCurveTo(0, y + H.R * 0.12, H.rx * 0.95, y - H.R * 0.12);
  ctx.lineTo(H.rx * 0.92, y + H.R * 0.12);
  ctx.quadraticCurveTo(0, y + H.R * 0.38, -H.rx * 0.92, y + H.R * 0.12);
  ctx.closePath();
  ctx.fill();
  // ponta pendurada
  ctx.beginPath();
  ctx.moveTo(H.rx * 0.35, y + H.R * 0.18);
  ctx.lineTo(H.rx * 0.6 + sway, y + H.R * 0.7);
  ctx.lineTo(H.rx * 0.38 + sway, y + H.R * 0.74);
  ctx.lineTo(H.rx * 0.18, y + H.R * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  for (const fx of [-0.5, 0, 0.5]) starPath(ctx, fx * H.rx, y + H.R * 0.1, H.R * 0.06, H.R * 0.025), ctx.fill();
  ctx.restore();
}

function starCrown(ctx: Ctx, H: Head) {
  const cx = shiftX(H);
  const base = -H.ry * 0.95;
  ctx.save();
  ctx.shadowColor = "rgba(255,198,92,0.9)";
  ctx.shadowBlur = H.R * 0.25;
  ctx.fillStyle = "#FFD27A";
  [-0.42, 0, 0.42].forEach((dx, i) => {
    const r = H.R * (i === 1 ? 0.2 : 0.14);
    starPath(ctx, cx + dx * H.rx, base - r * (i === 1 ? 1.3 : 0.9), r, r * 0.45);
    ctx.fill();
  });
  ctx.restore();
}

function helm(ctx: Ctx, H: Head) {
  const cx = shiftX(H) * 0.6;
  const top = -H.ry * 1.12;
  const rim = -H.ry * 0.52;
  ctx.save();
  const g = ctx.createLinearGradient(0, top, 0, rim);
  g.addColorStop(0, "#C9D3EA");
  g.addColorStop(1, "#6F7C9C");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - H.rx * 0.78, rim);
  ctx.bezierCurveTo(cx - H.rx * 0.78, top, cx + H.rx * 0.78, top, cx + H.rx * 0.78, rim);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4A5778";
  ctx.fillRect(cx - H.rx * 0.82, rim - H.R * 0.08, H.rx * 1.64, H.R * 0.12);
  ctx.fillRect(cx - H.R * 0.05, rim - H.R * 0.05, H.R * 0.1, H.R * 0.32);
  ctx.restore();
}

function lantern(ctx: Ctx, H: Head) {
  const t = performance.now() / 1000;
  const sway = Math.sin(t * 2) * 0.12 + H.physDx * 0.4;
  ctx.save();
  ctx.translate(H.rx * 1.25, -H.ry * 0.1);
  ctx.rotate(sway);
  ctx.strokeStyle = "#8C97B8";
  ctx.lineWidth = Math.max(0.8, H.R * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, -H.R * 0.35);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.shadowColor = "rgba(255,198,92,1)";
  ctx.shadowBlur = H.R * (0.4 + 0.1 * Math.sin(t * 5));
  ctx.fillStyle = "#FFC65C";
  ctx.beginPath();
  ctx.roundRect(-H.R * 0.13, 0, H.R * 0.26, H.R * 0.34, H.R * 0.06);
  ctx.fill();
  ctx.restore();
}

function withAlpha(ctx: Ctx, a: number, f: () => void) {
  ctx.save();
  ctx.globalAlpha *= a;
  f();
  ctx.restore();
}

/** As partes atrás do corpo. */
export function drawOutfitBehind(ctx: Ctx, outfit: Outfit, H: Head, st: OutfitState) {
  if (outfit === "none") return;
  const a = layerAlpha(st);
  if (a <= 0.005) return;
  withAlpha(ctx, a, () => {
    if (outfit === "auroraHalo") auroraHalo(ctx, H, false);
    if (outfit === "lantern") lantern(ctx, H);
  });
}

/** As partes na frente do corpo, desenhadas depois dos olhos. */
export function drawOutfitFront(ctx: Ctx, outfit: Outfit, H: Head, st: OutfitState) {
  if (outfit === "none" || outfit === "lantern") return;
  const a = layerAlpha(st);
  if (a <= 0.005) return;
  const drop = 1 - Ease.back(st.presence);
  ctx.save();
  ctx.translate(0, -drop * H.ry * 0.6);
  withAlpha(ctx, a, () => {
    switch (outfit) {
      case "auroraHalo": auroraHalo(ctx, H, true); break;
      case "runeBand": runeBand(ctx, H); break;
      case "frostScarf": frostScarf(ctx, H); break;
      case "starCrown": starCrown(ctx, H); break;
      case "helm": helm(ctx, H); break;
      default: break;
    }
  });
  ctx.restore();
}

// ── Ícones da vista de adornos ────────────────────────────────────────────────

function iconHuginn(ctx: Ctx, size: number, outfit: Outfit) {
  const R = 10;
  const H = makeHead(R);
  const st: OutfitState = { presence: 1, morph: 0 };
  ctx.save();
  ctx.translate(size / 2, size / 2 + R * 0.62);
  drawOutfitBehind(ctx, outfit, H, st);
  const body = bodyOutline(H.rx, H.ry);
  const g = ctx.createLinearGradient(H.rx * 0.7, -H.ry * 0.85, -H.rx * 0.8, H.ry * 0.9);
  g.addColorStop(0, "#3E4A7A");
  g.addColorStop(1, "#0F1327");
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.fillStyle = "rgb(220,244,255)";
  for (const e of eyeFrames(H)) {
    if (!e.visible) continue;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.w * 0.4, e.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#FFC65C";
  ctx.beginPath();
  ctx.moveTo(-R * 0.15, R * 0.15);
  ctx.lineTo(0, R * 0.08);
  ctx.lineTo(R * 0.15, R * 0.15);
  ctx.lineTo(0, R * 0.4);
  ctx.closePath();
  ctx.fill();
  drawOutfitFront(ctx, outfit, H, st);
  ctx.restore();
}

/** A imagem de um botão de adorno. "auto" mostra o da estação com a etiqueta AUTO; "none", um círculo riscado. */
export function drawWardrobeIcon(ctx: Ctx, size: number, selection: OutfitSelection, seasonal: Outfit, autoLabel: string) {
  ctx.clearRect(0, 0, size, size);
  if (selection === "none") {
    const r = 6.5;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = "#57618A";
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.moveTo(-r * 0.56, r * 0.56);
    ctx.lineTo(r * 0.56, -r * 0.56);
    ctx.stroke();
    ctx.restore();
    return;
  }
  iconHuginn(ctx, size, selection === "auto" ? seasonal : selection);
  if (selection !== "auto") return;
  const R = 10;
  const by = size / 2 + R * 0.62 + R * 0.88 * 0.72;
  const bw = 14;
  const bh = 6.5;
  ctx.save();
  ctx.translate(size / 2, by);
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = "rgba(7,16,34,0.8)";
  ctx.fill();
  ctx.fillStyle = "#EEF2FF";
  let fontPx = 4.2;
  ctx.font = `600 ${fontPx}px "Space Grotesk", "Segoe UI", ${SCRIPT_FONTS}, sans-serif`;
  while (ctx.measureText(autoLabel).width > bw - 2 && fontPx > 2.6) {
    fontPx -= 0.2;
    ctx.font = `600 ${fontPx}px "Space Grotesk", "Segoe UI", ${SCRIPT_FONTS}, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(autoLabel, 0, 0.2);
  ctx.restore();
}
