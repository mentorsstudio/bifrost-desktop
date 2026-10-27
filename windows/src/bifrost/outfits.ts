// Adornos nórdicos do Huginn — arte nova, desenhada do zero sobre a cabeça do
// corvo (círculo {x, y, r} no espaço do desenho). Os ids guardados em
// `mochiOutfit` não mudam; só o desenho:
//   auroraHalo → auréola de aurora      runeBand  → amuleto rúnico no peito
//   frostScarf → manto de pele e broche helm      → elmo com asas e protetor nasal
//   starCrown  → coroa de ouro com runas lantern   → lanterna de ferro pendurada

import type { Outfit, OutfitSelection } from "../huginn/wardrobe";

type Ctx = CanvasRenderingContext2D;

/** Onde está a cabeça (e o peito) do corvo, no espaço em que ele é desenhado. */
export interface RavenHead { x: number; y: number; r: number; chestY: number; bodyR: number }
export interface OutfitState { presence: number; morph: number }

const GOLD = ["#F6D27A", "#B8862F"] as const;
const IRON = ["#9AA3B8", "#3D4560"] as const;
const INK = "#070b16";

function lin(c: Ctx, x0: number, y0: number, x1: number, y1: number, a: string, b: string) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}
function alpha(st: OutfitState) { return Math.max(0, Math.min(1, st.presence)) * Math.max(0, 1 - st.morph * 2); }
function outline(c: Ctx, w: number) { c.lineWidth = w * 0.6; c.strokeStyle = "rgba(7,11,22,.35)"; c.lineJoin = "round"; c.stroke(); }

function halo(c: Ctx, h: RavenHead, front: boolean) {
  const t = performance.now() / 1000;
  c.save();
  c.translate(h.x, h.y - h.r * 1.25);
  c.scale(1, 0.32);
  c.lineWidth = h.r * 0.22;
  const g = c.createLinearGradient(-h.r, 0, h.r, 0);
  const p = (Math.sin(t * 1.3) + 1) / 2;
  g.addColorStop(0, "#5ef2c9"); g.addColorStop(0.5 + p * 0.2 - 0.1, "#6aa8ff"); g.addColorStop(1, "#b47cff");
  c.strokeStyle = g;
  c.shadowColor = "rgba(94,242,201,.8)"; c.shadowBlur = h.r * 0.5;
  c.beginPath();
  if (front) c.arc(0, 0, h.r * 0.95, 0, Math.PI); else c.arc(0, 0, h.r * 0.95, Math.PI, Math.PI * 2);
  c.stroke();
  c.restore();
}

function amulet(c: Ctx, h: RavenHead) {
  const y = h.chestY;
  c.save();
  c.strokeStyle = GOLD[1]; c.lineWidth = h.r * 0.07;
  c.beginPath(); c.moveTo(h.x - h.r * 0.62, h.y + h.r * 0.78); c.quadraticCurveTo(h.x, y + h.r * 0.1, h.x + h.r * 0.62, h.y + h.r * 0.78); c.stroke();
  c.beginPath(); c.arc(h.x, y, h.r * 0.34, 0, Math.PI * 2);
  c.fillStyle = lin(c, h.x - h.r * 0.3, y - h.r * 0.3, h.x + h.r * 0.3, y + h.r * 0.3, GOLD[0], GOLD[1]);
  c.fill(); outline(c, h.r * 0.06);
  c.fillStyle = INK; c.font = `700 ${h.r * 0.42}px "Bifrost Runic","Segoe UI Historic","Segoe UI Symbol",serif`;
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("ᚨ", h.x, y + h.r * 0.02);
  c.restore();
}

// Manto: fica inteiro atrás do corpo redondo e só aparece dos lados e embaixo,
// como um tecido que cai dos ombros (y ≈ 54) até a cauda; nada na frente do peito.
function cloakBehind(c: Ctx, h: RavenHead) {
  const x = h.x, top = h.y + h.r * 0.8, low = h.chestY + h.bodyR * 0.82;
  const w = h.bodyR * 1.2;
  c.save();
  c.beginPath();
  c.moveTo(x - h.r * 0.55, top);
  c.bezierCurveTo(x - w * 1.05, top + 4, x - w * 1.12, low - 14, x - w * 0.92, low);
  c.bezierCurveTo(x - w * 0.5, low + 4, x + w * 0.5, low + 4, x + w * 0.92, low);
  c.bezierCurveTo(x + w * 1.12, low - 14, x + w * 1.05, top + 4, x + h.r * 0.55, top);
  c.closePath();
  c.fillStyle = lin(c, 0, top, 0, low, "#8a3434", "#3e1616");
  c.fill(); outline(c, h.r * 0.05);
  c.restore();
}
// Gola: uma meia-lua fina de pele no pescoço, abaixo da ponta do bico e acima
// das asas; o broche fica no ombro direito, fora do rosto.
function cloakFront(c: Ctx, h: RavenHead) {
  const x = h.x, y = h.y + h.r * 0.86;
  c.save();
  c.beginPath();
  c.moveTo(x - h.r * 0.78, y - 1.5);
  c.quadraticCurveTo(x, y + h.r * 0.34, x + h.r * 0.78, y - 1.5);
  c.quadraticCurveTo(x + h.r * 0.8, y + h.r * 0.3, x + h.r * 0.62, y + h.r * 0.36);
  c.quadraticCurveTo(x, y + h.r * 0.72, x - h.r * 0.62, y + h.r * 0.36);
  c.quadraticCurveTo(x - h.r * 0.8, y + h.r * 0.3, x - h.r * 0.78, y - 1.5);
  c.closePath();
  c.fillStyle = lin(c, 0, y - 2, 0, y + h.r * 0.6, "#e6d6b8", "#9c8664");
  c.fill(); outline(c, h.r * 0.04);
  c.beginPath(); c.arc(x + h.r * 0.5, y + h.r * 0.3, h.r * 0.12, 0, Math.PI * 2);
  c.fillStyle = lin(c, x + h.r * 0.55, y, x + h.r * 0.8, y + h.r * 0.4, GOLD[0], GOLD[1]); c.fill();
  c.restore();
}

function helm(c: Ctx, h: RavenHead) {
  c.save();
  const { x, y, r } = h;
  // Asas do elmo (atrás da cúpula, mas na camada da frente da cabeça).
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(x + s * r * 0.75, y - r * 0.35);
    c.quadraticCurveTo(x + s * r * 1.45, y - r * 0.9, x + s * r * 1.35, y - r * 1.45);
    c.quadraticCurveTo(x + s * r * 1.05, y - r * 0.95, x + s * r * 0.7, y - r * 0.7);
    c.closePath();
    c.fillStyle = lin(c, x, y - r * 1.4, x + s * r, y, "#f4f6ff", "#aab4cf");
    c.fill(); outline(c, r * 0.06);
  }
  // Cúpula: cobre só o alto da cabeça, termina acima dos olhos.
  c.beginPath();
  c.moveTo(x - r * 0.98, y - r * 0.34);
  c.bezierCurveTo(x - r * 0.98, y - r * 1.38, x + r * 0.98, y - r * 1.38, x + r * 0.98, y - r * 0.34);
  c.closePath();
  c.fillStyle = lin(c, x - r, y - r, x + r, y, IRON[0], IRON[1]);
  c.fill(); outline(c, r * 0.07);
  // Faixa de ouro e protetor nasal (para entre os olhos, acima do bico).
  c.fillStyle = GOLD[1];
  c.beginPath(); c.roundRect(x - r * 0.98, y - r * 0.46, r * 1.96, r * 0.14, r * 0.07); c.fill();
  c.beginPath(); c.roundRect(x - r * 0.07, y - r * 0.36, r * 0.14, r * 0.42, r * 0.05);
  c.fillStyle = IRON[1]; c.fill(); outline(c, r * 0.04);
  c.restore();
}

function crown(c: Ctx, h: RavenHead) {
  const { x, y, r } = h;
  const base = y - r * 0.82, top = base - r * 0.6;
  c.save();
  // Fase 11: coroa de pontas redondas (nada pontudo), simétrica: aro + 5 bolinhas.
  c.beginPath();
  c.moveTo(x - r * 0.66, base);
  c.bezierCurveTo(x - r * 0.72, base - r * 0.3, x - r * 0.6, top + r * 0.2, x - r * 0.5, top + r * 0.28);
  c.quadraticCurveTo(x - r * 0.25, base - r * 0.05, x, top);
  c.quadraticCurveTo(x + r * 0.25, base - r * 0.05, x + r * 0.5, top + r * 0.28);
  c.bezierCurveTo(x + r * 0.6, top + r * 0.2, x + r * 0.72, base - r * 0.3, x + r * 0.66, base);
  c.quadraticCurveTo(x, base + r * 0.12, x - r * 0.66, base);
  c.closePath();
  c.fillStyle = lin(c, x, top, x, base, GOLD[0], GOLD[1]);
  c.fill(); outline(c, r * 0.06);
  for (const [dx, dy] of [[-0.5, 0.28], [0, 0], [0.5, 0.28]]) { c.beginPath(); c.arc(x + dx * r, top + dy * r, r * 0.1, 0, Math.PI * 2); c.fillStyle = GOLD[0]; c.fill(); }
  c.fillStyle = "#5ef2c9";
  for (const dx of [-0.42, 0, 0.42]) { c.beginPath(); c.arc(x + dx * r, base - r * 0.12, r * 0.07, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

function lantern(c: Ctx, h: RavenHead) {
  const t = performance.now() / 1000;
  const sway = Math.sin(t * 1.6) * 0.12;
  // Pendurada além da ponta da asa direita (x ≈ 104), para não sumir atrás dela.
  const px = h.x + h.bodyR * 1.75, py = h.chestY - h.bodyR * 0.05;
  c.save();
  c.translate(px, py);
  c.rotate(sway);
  c.strokeStyle = IRON[0]; c.lineWidth = h.r * 0.05;
  c.beginPath(); c.moveTo(0, -h.r * 0.5); c.lineTo(0, 0); c.stroke();
  c.beginPath(); c.roundRect(-h.r * 0.26, 0, h.r * 0.52, h.r * 0.66, h.r * 0.1);
  const g = c.createRadialGradient(0, h.r * 0.33, 0, 0, h.r * 0.33, h.r * 0.5);
  g.addColorStop(0, "#ffe59a"); g.addColorStop(1, "#ff7a4a");
  c.fillStyle = g; c.shadowColor = "rgba(255,180,90,.9)"; c.shadowBlur = h.r * 0.8; c.fill();
  c.shadowBlur = 0; c.strokeStyle = IRON[1]; c.lineWidth = h.r * 0.07; c.stroke();
  c.restore();
}

/** Partes atrás do corpo. */
export function drawOutfitBehind(c: Ctx, outfit: Outfit, h: RavenHead, st: OutfitState) {
  const a = alpha(st);
  if (outfit === "none" || a <= 0.005) return;
  c.save(); c.globalAlpha *= a;
  if (outfit === "auroraHalo") halo(c, h, false);
  if (outfit === "frostScarf") cloakBehind(c, h);
  c.restore();
}

/** Partes na frente, depois do rosto; caem de cima com mola ao vestir. */
export function drawOutfitFront(c: Ctx, outfit: Outfit, h: RavenHead, st: OutfitState) {
  const a = alpha(st);
  if (outfit === "none" || a <= 0.005) return;
  const p = Math.max(0, Math.min(1, st.presence));
  const back = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
  c.save(); c.globalAlpha *= a;
  c.translate(0, -(1 - back) * h.r * 1.2);
  switch (outfit) {
    case "auroraHalo": halo(c, h, true); break;
    case "runeBand": amulet(c, h); break;
    case "frostScarf": cloakFront(c, h); break;
    case "starCrown": crown(c, h); break;
    case "helm": helm(c, h); break;
    case "lantern": lantern(c, h); break;
  }
  c.restore();
}

/** Desenha um corvo inteiro em `size` px (usado nos ícones e por quem não tem motor). */
export type RavenPainter = (c: Ctx, size: number, outfit: Outfit) => void;
let painter: RavenPainter | null = null;
export function setRavenPainter(p: RavenPainter) { painter = p; }

/** O ícone de um botão de adorno: "auto" leva a etiqueta AUTO; "none", um círculo riscado. */
export function drawWardrobeIcon(c: Ctx, size: number, selection: OutfitSelection, seasonal: Outfit, autoLabel: string) {
  c.clearRect(0, 0, size, size);
  if (selection === "none") {
    c.save(); c.translate(size / 2, size / 2);
    c.strokeStyle = "#93a1c6"; c.lineWidth = 1.4; c.lineCap = "round";
    c.beginPath(); c.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    c.moveTo(-size * 0.15, size * 0.15); c.lineTo(size * 0.15, -size * 0.15); c.stroke();
    c.restore();
    return;
  }
  painter?.(c, size, selection === "auto" ? seasonal : selection);
  if (selection !== "auto") return;
  const bw = size * 0.5, bh = size * 0.2;
  c.save(); c.translate(size / 2, size - bh * 0.8);
  c.beginPath(); c.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  c.fillStyle = "rgba(7,11,22,.85)"; c.fill();
  c.strokeStyle = "rgba(226,181,90,.6)"; c.lineWidth = 0.8; c.stroke();
  c.fillStyle = "#f6d27a"; c.font = `700 ${bh * 0.62}px "Segoe UI",sans-serif`;
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(autoLabel, 0, 0.3);
  c.restore();
}
