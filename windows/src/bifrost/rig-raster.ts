// Os corvos ORIGINAIS da referência, animados como fantoche de recortes (pedido do Paulo:
// "usar os 2 primeiros modelos e animar eles"). Camadas em art/*.webp, cortadas por
// tools/cut-ravens.py: base (corpo+pés, fixa), cabeça+topete (pivô no pescoço), pupilas,
// máscara dos olhos, sobrancelha do Huginn, bico inferior e asa do Muninn.
// Tudo é composto em tamanho cheio num canvas de quadro e reduzido em meias etapas
// (sem serrilhado nem emendas entre peças em 24–32 px).
import { ART_META } from "./art/meta";
import type { RigPose, Who } from "./rig";

type Meta = { w: number; h: number; pivot: readonly number[]; eyes: readonly (readonly number[])[]; brow: readonly number[] | null;
  beakRoot: readonly number[] | null; shoulder: readonly number[] | null; lid: readonly number[]; ink: readonly number[];
  sticker: readonly number[]; stickerW: number; eyeFit?: readonly (readonly number[])[]; layers: readonly string[] };
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

/** Limites que mantêm as juntas invisíveis (gola de penas no pescoço, raiz da asa sob o peito). */
export const RASTER_LIMITS = { tilt: 0.065, wing: 0.5, beak: 0.14 };

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
  g.save(); g.translate(0, m.h); g.scale(1, 1 + pose.breath * 0.006); g.translate(0, -m.h);
  if (pose.lift) g.translate(0, -pose.lift * k);
  g.drawImage(im("base"), 0, 0);
  g.restore();
  // Cabeça + topete: inclina no pescoço (a gola serrilhada cobre a junta); ao falar, o Huginn balança.
  const [hx, hy] = m.pivot;
  const tilt = Math.max(-RASTER_LIMITS.tilt, Math.min(RASTER_LIMITS.tilt, pose.tilt * 0.85));
  const bob = who === "huginn" ? Math.max(0, Math.min(1, pose.beak)) * 0.9 * k : 0;
  g.save();
  g.translate(0, rise + bob); g.translate(hx, hy); g.rotate(tilt); g.translate(-hx, -hy);
  g.drawImage(im("head"), 0, 0);
  // Bico inferior do Muninn (o desenho já é de bico aberto: 0,5 = repouso).
  if (m.beakRoot) {
    const [bx, by] = m.beakRoot;
    const a = Math.max(-RASTER_LIMITS.beak * 0.6, Math.min(RASTER_LIMITS.beak, (pose.beak - 0.5) * 0.3));
    g.save(); g.translate(bx, by); g.rotate(-a); g.translate(-bx, -by); g.drawImage(im("beakLo"), 0, 0); g.restore();
  }
  // Olhos: pupilas que deslizam + pálpebras curvas, recortadas pela forma do olho.
  const e = sc(`${who}-eyes`, m.w, m.h), ge = e.getContext("2d")!;
  ge.globalCompositeOperation = "source-over"; ge.clearRect(0, 0, m.w, m.h);
  const small = Math.min(...m.eyes.map((q) => q[2]));
  ge.drawImage(im("pupils"), pose.px * small * 0.3, pose.py * small * 0.25);
  const lid = Math.max(0, Math.min(1, pose.lid));
  if (who === "muninn") {
    // Muninn: pupilas recortadas pelo olho; a pálpebra vai numa camada própria, recortada
    // pelo olho um tico maior (sem franja branca), com UM traço de cílio curvo.
    ge.globalCompositeOperation = "destination-in"; ge.drawImage(im("eyes"), 0, 0);
    ge.globalCompositeOperation = "source-over";
    g.drawImage(e, 0, 0);
    if (lid > 0.01 && m.eyeFit) {
      // Pálpebra: a elipse do olho (ajustada ao contorno de fora) cheia de pena prateada,
      // o contorno do olho redesenhado por cima no mesmo lugar e UM cílio curvo.
      const lw = 6.5; // a mesma espessura das linhas dela (px da arte)
      m.eyeFit.forEach(([fx, fy, a, b, ang], i) => {
        const [cx, cy, rx, ry] = m.eyes[i];
        const inner = new Path2D(); inner.ellipse(fx, fy, a - lw * 0.5, b - lw * 0.5, ang, 0, Math.PI * 2);
        g.save(); g.clip(inner);
        const xL = cx - rx - 12, xR = cx + rx + 12;
        const yE = cy - ry - 8 + (ry * 2 + 20) * lid, sagE = ry * 0.32 * Math.min(1, lid * 1.6);
        g.fillStyle = rgb(m.lid);
        g.beginPath(); g.moveTo(xL, cy - ry - 16); g.lineTo(xR, cy - ry - 16); g.lineTo(xR, yE - sagE);
        g.quadraticCurveTo(cx, yE + sagE, xL, yE - sagE); g.closePath(); g.fill();
        const yC = cy + ry * 0.05, sagC = ry * 0.42;
        const yl = Math.min(yE, yC), sl = Math.min(sagE, sagC);
        g.strokeStyle = rgb(m.ink); g.lineWidth = lw; g.lineCap = "round";
        g.beginPath(); g.moveTo(xL, yl - sl); g.quadraticCurveTo(cx, yl + sl, xR, yl - sl); g.stroke();
        g.restore();
        // o contorno do olho, inteiro e limpo, por cima da borda da pálpebra
        g.save(); g.globalAlpha *= Math.min(1, lid * 2.5);
        g.strokeStyle = rgb(m.ink); g.lineWidth = lw;
        g.beginPath(); g.ellipse(fx, fy, a - lw * 0.5, b - lw * 0.5, ang, 0, Math.PI * 2); g.stroke();
        g.restore();
      });
    }
  } else {
  if (lid > 0.01) {
    for (const [cx, cy, rx, ry] of m.eyes) {
      // A borda de baixo da pálpebra é o arco de cima do próprio olho, descido: acompanha a curva.
      const d = (ry * 2 + 6) * lid;
      const p = new Path2D();
      p.rect(cx - rx - 8, cy - ry - 8, rx * 2 + 16, ry * 2 + 16);
      p.ellipse(cx, cy + d - 2, rx * 1.08, ry * 1.04, 0, 0, Math.PI * 2);
      ge.fillStyle = rgb(m.lid); ge.fill(p, "evenodd");
      ge.save(); ge.clip(p, "evenodd");
      ge.strokeStyle = rgb(m.ink); ge.lineWidth = Math.max(7, ry * 0.14);
      ge.beginPath(); ge.ellipse(cx, cy + d - 2, rx * 1.08, ry * 1.04, 0, Math.PI, Math.PI * 2); ge.stroke();
      ge.restore();
    }
  }
  ge.globalCompositeOperation = "destination-in"; ge.drawImage(im("eyes"), 0, 0);
  ge.globalCompositeOperation = "source-over";
  g.drawImage(e, 0, 0);
  }
  // Sobrancelha do Huginn (a direita, o "entendi"): sobe e gira um tico.
  if (m.brow) {
    const [bx, by] = m.brow;
    const r = Math.max(-0.4, Math.min(1.2, pose.browR));
    g.save(); g.translate(0, -r * 3 * k); g.translate(bx, by); g.rotate(-r * 0.08); g.translate(-bx, -by);
    g.drawImage(im("brow"), 0, 0); g.restore();
  }
  g.restore();
  // Asa que acena (Muninn): gira no ombro, com a raiz escondida sob as penas do peito.
  if (m.shoulder) {
    const [sx, sy] = m.shoulder;
    const wa = -Math.max(-0.1, Math.min(RASTER_LIMITS.wing, pose.wingR * 0.25));
    g.save(); g.translate(0, rise * 0.5); g.translate(sx, sy); g.rotate(wa); g.translate(-sx, -sy); g.drawImage(im("wing"), 0, 0); g.restore();
  }

  // Reduz em meias etapas até perto do tamanho final (nítido em ícones pequenos).
  const t = x.getTransform ? x.getTransform() : null;
  const dev = t ? Math.hypot(t.a, t.b) || 1 : 1;
  const target = (s / k) * dev; // px de tela (reais) por px da arte
  let src: HTMLCanvasElement = f, sw = W, sh = H, lvl = 0;
  while (target * (W / sw) < 0.5 && sw > 64) {
    const nw = Math.ceil(sw / 2), nh = Math.ceil(sh / 2);
    const d2 = sc(`${who}-mip${lvl++}`, nw, nh), gd = d2.getContext("2d")!;
    gd.clearRect(0, 0, nw, nh); gd.imageSmoothingEnabled = true; gd.imageSmoothingQuality = "high";
    gd.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh);
    src = d2; sw = nw; sh = nh;
  }
  // Adesivo AO VIVO: a silhueta composta dilatada (círculo de cópias), em cinza, por baixo.
  const r = m.stickerW * (sw / W);
  const st = sc(`${who}-stk`, sw, sh), gs = st.getContext("2d")!;
  gs.globalCompositeOperation = "source-over"; gs.clearRect(0, 0, sw, sh);
  if (r >= 0.6) {
    const n = r > 3 ? 20 : 12;
    for (const rr of r > 2.5 ? [r, r * 0.6] : [r]) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; gs.drawImage(src, Math.cos(a) * rr, Math.sin(a) * rr); }
    gs.globalCompositeOperation = "source-in"; gs.fillStyle = rgb(m.sticker); gs.fillRect(0, 0, sw, sh);
    gs.globalCompositeOperation = "source-over";
  }
  gs.drawImage(src, 0, 0);
  x.save();
  if (alpha !== 1) x.globalAlpha *= alpha;
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  const ox = (m.w / 2 + pad) / k, oy = (m.h + pad) / k - 50;
  x.drawImage(st, 0, 0, sw, sh, -ox * s, -oy * s, (W / k) * s, (H / k) * s);
  x.restore();
}
