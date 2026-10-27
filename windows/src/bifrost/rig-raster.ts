// Os corvos ORIGINAIS da referência, animados como fantoche de recortes (pedido do Paulo:
// "usar os 2 primeiros modelos e animar eles"). Camadas em art/*.webp, cortadas por
// tools/cut-ravens.py: base (corpo+pés, fixa), cabeça+topete (pivô no pescoço), pupilas,
// máscara dos olhos, sobrancelha do Huginn, bico inferior e asa do Muninn.
// Tudo é composto em tamanho cheio num canvas de quadro e reduzido em meias etapas
// (sem serrilhado nem emendas entre peças em 24–32 px).
import { ART_META } from "./art/meta";
import type { RigPose, Who } from "./rig";

type Meta = { w: number; h: number; pivot: readonly number[]; eyes: readonly (readonly number[])[]; brow: readonly number[] | null;
  beakRoot: readonly number[] | null; shoulder: readonly number[] | null; lid: readonly number[]; ink: readonly number[]; layers: readonly string[] };
const META = ART_META as unknown as Record<Who, Meta>;

const URLS: Record<string, string> = {
  "huginn-base": new URL("./art/huginn-base.webp", import.meta.url).href,
  "huginn-head": new URL("./art/huginn-head.webp", import.meta.url).href,
  "huginn-pupils": new URL("./art/huginn-pupils.webp", import.meta.url).href,
  "huginn-eyes": new URL("./art/huginn-eyes.webp", import.meta.url).href,
  "huginn-brow": new URL("./art/huginn-brow.webp", import.meta.url).href,
  "muninn-base": new URL("./art/muninn-base.webp", import.meta.url).href,
  "muninn-head": new URL("./art/muninn-head.webp", import.meta.url).href,
  "muninn-pupils": new URL("./art/muninn-pupils.webp", import.meta.url).href,
  "muninn-eyes": new URL("./art/muninn-eyes.webp", import.meta.url).href,
  "muninn-beakLo": new URL("./art/muninn-beakLo.webp", import.meta.url).href,
  "muninn-wing": new URL("./art/muninn-wing.webp", import.meta.url).href,
};

const imgs = new Map<string, HTMLImageElement>();
let loading = false;
const listeners = new Set<() => void>();
/** Avisa quando as camadas terminam de carregar (para redesenhar quem estava parado). */
export function onRasterReady(f: () => void) { listeners.add(f); return () => listeners.delete(f); }

function load() {
  if (loading || typeof Image !== "function") return;
  loading = true;
  let left = Object.keys(URLS).length;
  for (const [k, u] of Object.entries(URLS)) {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { imgs.set(k, im); if (--left === 0) listeners.forEach((f) => f()); };
    im.onerror = () => { --left; };
    im.src = u;
  }
}

export function rasterReady(who: Who): boolean {
  load();
  return META[who].layers.every((l) => imgs.has(`${who}-${l}`));
}

type C2 = CanvasRenderingContext2D;
const canv = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const scratch = new Map<string, HTMLCanvasElement>();
const pad = 60; // folga para a asa erguida e a cabeça inclinada
function sc(key: string, w: number, h: number) {
  let c = scratch.get(key);
  if (!c || c.width !== w || c.height !== h) { c = canv(w, h); scratch.set(key, c); }
  return c;
}
const rgb = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** Desenha o corvo original com o centro do rig em (0,0); `s` = px por unidade do rig (112 = altura). */
export function drawRaster(x: C2, who: Who, pose: RigPose, s: number, alpha = 1) {
  const m = META[who];
  const im = (l: string) => imgs.get(`${who}-${l}`)!;
  const W = m.w + pad * 2, H = m.h + pad * 2;
  const f = sc(`${who}-frame`, W, H), g = f.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  g.translate(pad, pad);
  const k = m.h / 112; // px da arte por unidade do rig
  const rise = (-pose.breath * 0.7 - pose.lift) * k;
  // Base: corpo e pés plantados; a respiração estica o peito um tiquinho a partir dos pés.
  g.save(); g.translate(0, m.h); g.scale(1, 1 + pose.breath * 0.008); g.translate(0, -m.h);
  if (pose.lift) g.translate(0, -pose.lift * k);
  g.drawImage(im("base"), 0, 0);
  g.restore();
  // Asa que acena (Muninn): gira no ombro, por cima do corpo.
  const wingA = m.shoulder ? -Math.max(-0.3, Math.min(2.2, pose.wingR)) * 0.32 : 0;
  const drawWing = () => {
    if (!m.shoulder) return;
    const [sx, sy] = m.shoulder;
    g.save(); g.translate(0, rise * 0.6); g.translate(sx, sy); g.rotate(wingA); g.translate(-sx, -sy); g.drawImage(im("wing"), 0, 0); g.restore();
  };
  // Cabeça + topete: inclina no pescoço; ao falar, o Huginn balança a cabeça de leve.
  const [hx, hy] = m.pivot;
  const tilt = Math.max(-0.14, Math.min(0.14, pose.tilt));
  const bob = who === "huginn" ? Math.max(0, pose.beak) * 2.2 * k * 0.4 : 0;
  g.save();
  g.translate(0, rise + bob); g.translate(hx, hy); g.rotate(tilt); g.translate(-hx, -hy);
  g.drawImage(im("head"), 0, 0);
  // Bico inferior do Muninn (já nasce aberto: 0,5 = como no desenho).
  if (m.beakRoot) {
    const [bx, by] = m.beakRoot;
    const a = Math.max(-0.12, Math.min(0.16, (pose.beak - 0.5) * 0.32));
    g.save(); g.translate(bx, by); g.rotate(-a); g.translate(-bx, -by); g.drawImage(im("beakLo"), 0, 0); g.restore();
  }
  // Olhos: pupilas que deslizam + pálpebra, recortados pela máscara do branco do olho.
  const e = sc(`${who}-eyes`, m.w, m.h), ge = e.getContext("2d")!;
  ge.globalCompositeOperation = "source-over"; ge.clearRect(0, 0, m.w, m.h);
  const big = Math.min(...m.eyes.map((q) => q[2]));
  ge.drawImage(im("pupils"), pose.px * big * 0.3, pose.py * big * 0.25);
  if (pose.lid > 0.01) {
    for (const [cx, cy, rx, ry] of m.eyes) {
      const top = cy - ry - 4, hh = (ry * 2 + 8) * Math.min(1, pose.lid);
      ge.fillStyle = rgb(m.lid); ge.fillRect(cx - rx - 6, top, rx * 2 + 12, hh);
      ge.strokeStyle = rgb(m.ink); ge.lineWidth = Math.max(6, ry * 0.16); ge.lineCap = "round";
      ge.beginPath(); ge.moveTo(cx - rx - 2, top + hh); ge.quadraticCurveTo(cx, top + hh + ry * 0.18 * (1 - pose.lid), cx + rx + 2, top + hh); ge.stroke();
    }
  }
  ge.globalCompositeOperation = "destination-in"; ge.drawImage(im("eyes"), 0, 0);
  ge.globalCompositeOperation = "source-over";
  g.drawImage(e, 0, 0);
  // Sobrancelha do Huginn (a direita, o "entendi"): sobe e gira um tico.
  if (m.brow) {
    const [bx, by] = m.brow;
    const r = pose.browR;
    g.save(); g.translate(0, -Math.max(-0.4, Math.min(1.2, r)) * 3.2 * k); g.translate(bx, by); g.rotate(-r * 0.1); g.translate(-bx, -by);
    g.drawImage(im("brow"), 0, 0); g.restore();
  }
  g.restore();
  drawWing();

  // Reduz em meias etapas até perto do tamanho final (qualidade em ícones pequenos).
  const t = x.getTransform ? x.getTransform() : null;
  const dev = t ? Math.hypot(t.a, t.b) || 1 : 1;
  const target = (s / k) * dev; // px de tela (reais) por px da arte
  let src: HTMLCanvasElement = f, sw = W, sh = H, lvl = 0;
  while (target * (W / sw) < 0.5 && sw > 64) {
    const nw = Math.ceil(sw / 2), nh = Math.ceil(sh / 2);
    const d = sc(`${who}-mip${lvl++}`, nw, nh), gd = d.getContext("2d")!;
    gd.clearRect(0, 0, nw, nh); gd.imageSmoothingEnabled = true; gd.imageSmoothingQuality = "high";
    gd.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh);
    src = d; sw = nw; sh = nh;
  }
  x.save();
  if (alpha !== 1) x.globalAlpha *= alpha;
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  // A origem do rig: centro horizontal, pés em +50 unidades.
  const ox = (m.w / 2 + pad) / k, oy = (m.h + pad) / k - 50;
  x.drawImage(src, 0, 0, sw, sh, -ox * s, -oy * s, (W / k) * s, (H / k) * s);
  x.restore();
}
