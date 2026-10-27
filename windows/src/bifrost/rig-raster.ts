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
  "huginn-under": new URL("./art/huginn-under.webp", import.meta.url).href,
  "muninn-under": new URL("./art/muninn-under.webp", import.meta.url).href,
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
  "muninn-lidmask": new URL("./art/muninn-lidmask.webp", import.meta.url).href,
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
// ── Estilos (Ajustes › Personagens): recolor dos desenhos originais ────────────────
// Remapeia só as penas (corpo/asa) e o topete, pela luminância de cada pixel; tinta,
// branco dos olhos, pupilas, bico, língua e medalhão de bronze ficam intactos.
type Tint = { feather: string; wing?: string; crest?: string };
export const STYLE_TINTS: Record<string, Partial<Record<Who, Tint>>> = {
  snow:  { huginn: { feather: "#cdd6ea", crest: "#7fb2ff" }, muninn: { feather: "#f3f5fb", wing: "#aab6cc" } },
  ember: { huginn: { feather: "#3b2a25", crest: "#ff8a3a" }, muninn: { feather: "#e8955c", wing: "#4a2a22" } },
  moss:  { huginn: { feather: "#24452f", crest: "#a6e88a" }, muninn: { feather: "#a9c48a", wing: "#2f4a30" } },
  dusk:  { huginn: { feather: "#4a3470", crest: "#ff9fd2" }, muninn: { feather: "#e4b8d8", wing: "#6a4a86" } },
  gold:  { huginn: { feather: "#8a6420", crest: "#fff2c4" }, muninn: { feather: "#f1e3c3", wing: "#a07a34" } },
  storm: { huginn: { feather: "#3a4550", crest: "#5ee8ff" }, muninn: { feather: "#aeb6c0", wing: "#3a424c" } },
};
/** "Seguir o tema": cada tema do app vira um dos estilos. */
export const THEME_STYLE: Record<string, string> = {
  bifrost: "classic", asgard: "gold", muspelheim: "ember", niflheim: "snow", yggdrasil: "moss", valhalla: "storm", ragnarok: "dusk",
};
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Faixas de luminância das penas na arte original (referência de cada corvo).
const REFL: Record<Who, { dark: [number, number, number]; light?: [number, number, number] }> = {
  huginn: { dark: [33, 96, 50] },                       // corpo+asa; ref ≈ 50
  muninn: { dark: [33, 96, 62], light: [150, 233, 198] }, // asa ≈ 62; corpo ≈ 198
};
function tintPixel(who: Who, t: Tint, r: number, g: number, b: number): [number, number, number] | null {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const R = REFL[who];
  let target: number[] | null = null, ref = 1;
  if (who === "huginn" && t.crest && b - r > 24 && b > g && l > 30 && l < 120) { target = hex(t.crest); ref = 62; }
  else if (mx > 0 && (mx - mn) / mx > 0.32) return null; // medalhão, língua, rosa: intactos
  else if (l >= R.dark[0] && l <= R.dark[1]) { target = hex(who === "muninn" ? (t.wing ?? t.feather) : t.feather); ref = R.dark[2]; }
  else if (R.light && l >= R.light[0] && l <= R.light[1]) { target = hex(t.feather); ref = R.light[2]; }
  if (!target) return null;
  const k = l / ref;
  return [Math.min(255, target[0] * k), Math.min(255, target[1] * k), Math.min(255, target[2] * k)];
}
const TINTED = ["under", "base", "head", "wing", "beakLo"];
const tintCache = new Map<string, HTMLCanvasElement>();
function tinted(who: Who, style: string, layer: string): CanvasImageSource | undefined {
  const src = imgs.get(`${who}-${layer}`);
  const t = STYLE_TINTS[style]?.[who];
  if (!src || !t || !TINTED.includes(layer)) return src;
  const key = `${who}-${style}-${layer}`;
  let c = tintCache.get(key);
  if (!c) {
    c = canv(src.naturalWidth, src.naturalHeight);
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      const o = tintPixel(who, t, p[i], p[i + 1], p[i + 2]);
      if (o) { p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; }
    }
    g.putImageData(d, 0, 0);
    tintCache.set(key, c);
  }
  return c;
}
const tintRgb = (who: Who, style: string, c: readonly number[]) => {
  const t = STYLE_TINTS[style]?.[who];
  const o = t ? tintPixel(who, t, c[0], c[1], c[2]) : null;
  return o ? o.map(Math.round) : c;
};

export function drawRaster(x: C2, who: Who, pose: RigPose, s: number, alpha = 1, style = "classic") {
  const m = META[who];
  const im = (l: string) => (tinted(who, style, l) ?? imgs.get(`${who}-${l}`))!;
  const W = m.w + pad * 2, H = m.h + pad * 2;
  const f = sc(`${who}-frame`, W, H), g = f.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  g.translate(pad, pad);
  const k = m.h / 112; // px da arte por unidade do rig
  const rise = (-pose.breath * 0.7 - pose.lift) * k;
  // Base: corpo e pés plantados; a respiração estica o peito um tiquinho a partir dos pés.
  g.save(); g.translate(0, m.h); g.scale(1, 1 + pose.breath * 0.006); g.translate(0, -m.h);
  if (pose.lift) g.translate(0, -pose.lift * k);
  g.drawImage(im("under"), 0, 0); // forro de dentro (tapa frestas entre peças)
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
  // Muninn não desliza a pupila: a pupila dela encosta no contorno do olho e qualquer
  // deslocamento abria uma fresta branca (esclera) ao lado do olho esquerdo.
  const gaze = 0; // pupilas ficam na cabeça (sem fresta branca ao olhar)
  ge.drawImage(im("pupils"), pose.px * small * 0.3 * gaze, pose.py * small * 0.25 * gaze);
  const lid = Math.max(0, Math.min(1, pose.lid));
  if (who === "muninn") {
    // Muninn: olhos e pupilas são os pixels originais da própria cabeça (sem camada de
    // pupila: nada a desalinhar). A pálpebra vem por cima, recortada pela máscara do olho.
    if (lid > 0.01 && m.eyeFit) {
      // Piscada de desenho: a pálpebra (cor da pena em volta) cobre o olho INTEIRO, inclusive
      // o contorno de fora (máscara recortada do desenho, +3 px). A borda de baixo é um arco
      // "⌣" igual ao de baixo do olho, que desce com a pálpebra; fechado, sobra só esse traço.
      const lw = 7.5;
      const l = sc(`${who}-lid`, m.w, m.h), gl = l.getContext("2d")!;
      gl.globalCompositeOperation = "source-over"; gl.clearRect(0, 0, m.w, m.h);
      m.eyeFit.forEach(([, , , , , lr, lg, lb], i) => {
        // geometria do próprio branco do olho (o traço do contorno fica logo fora dele)
        const [fx, fy, rx, ry] = m.eyes[i];
        const ae = rx + lw * 0.5, be = ry + lw * 0.5, a = ae + lw * 0.5, b = be + lw * 0.5, ang = 0;
        const D = (1 - lid) * (2 * be + lw + 14);
        gl.save(); gl.translate(fx, fy); gl.rotate(ang);
        const own = new Path2D(); own.ellipse(0, 0, a + 16, b + 16, 0, 0, Math.PI * 2); gl.clip(own); // só o próprio olho
        const W2 = a + 40, T = -b - 40;
        const cover = new Path2D();
        cover.moveTo(-W2, T); cover.lineTo(W2, T); cover.lineTo(W2, -D); cover.lineTo(ae, -D);
        cover.ellipse(0, -D, ae, be, 0, 0, Math.PI, false);
        cover.lineTo(-W2, -D); cover.closePath();
        gl.fillStyle = rgb(tintRgb(who, style, [lr ?? m.lid[0], lg ?? m.lid[1], lb ?? m.lid[2]]));
        gl.fill(cover);
        gl.strokeStyle = rgb(m.ink); gl.lineWidth = lw; gl.lineCap = "round";
        gl.beginPath(); gl.ellipse(0, -D, ae, be, 0, 0.2, Math.PI - 0.2, false); gl.stroke();
        gl.restore();
      });
      gl.globalCompositeOperation = "destination-in"; gl.drawImage(im("lidmask"), 0, 0);
      gl.globalCompositeOperation = "source-over";
      g.drawImage(l, 0, 0);
    }
  } else {
  if (lid > 0.01) {
    for (const [cx, cy, rx, ry] of m.eyes) {
      // A borda de baixo da pálpebra é o arco de cima do próprio olho, descido: acompanha a curva.
      const d = (ry * 2 + 6) * lid;
      const p = new Path2D();
      p.rect(cx - rx - 8, cy - ry - 8, rx * 2 + 16, ry * 2 + 16);
      p.ellipse(cx, cy + d - 2, rx * 1.08, ry * 1.04, 0, 0, Math.PI * 2);
      ge.fillStyle = rgb(tintRgb(who, style, m.lid)); ge.fill(p, "evenodd");
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
    // a asa vai presa ao corpo (mesma respiração da base): o cordão e o ombro não se separam
    g.save(); g.translate(0, m.h); g.scale(1, 1 + pose.breath * 0.006); g.translate(0, -m.h);
    if (pose.lift) g.translate(0, -pose.lift * k);
    g.translate(sx, sy); g.rotate(wa); g.translate(-sx, -sy); g.drawImage(im("wing"), 0, 0); g.restore();
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
