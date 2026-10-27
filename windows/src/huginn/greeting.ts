// Bifrost — a saudação ao abrir, escrita do zero.
// Coreografia própria ("o voo de Huginn"): a ilha se abre como um fiorde ao
// amanhecer, Huginn desce voando batendo as asas, pousa com mola, dá dois
// pulinhos para o lado, acena com as duas asas, volta ao centro e encolhe até
// o lugar dele na ilha compacta. O corvo é o mesmo motor (RavenEngine) de
// todas as telas; o céu tem aurora e faíscas de runas.
// Tudo no espaço 640×150 da saudação; os testes conferem que ele nunca é
// cortado pela ilha enquanto ela cresce, fica aberta ou encolhe.

import { closeCurve } from "../core/anim";
import { Sound } from "../core/sound";
import { COMPACT_W, NOTCH_H, NOTCH_W } from "../core/layout";
import { RavenEngine } from "../bifrost/raven";

const SOUND = "greeting";

/** Marcos da coreografia, em segundos. */
const T = { appear: 0.2, land: 0.95, settle: 1.25, hopOut: 1.3, wave0: 1.65, wave1: 2.7, hopBack: 2.75, home: 3.2, shrink0: 3.85, end: 4.6, autoLeave: 4.9, collapse: 0.34 };

export const GREETING_END = T.end;
export const GREETING_W = 640;
export const GREETING_H = 150;
/** Largura/altura da caixa que o corvo ocupa (asas abertas incluídas). */
export const ASP = 1.34;

const HOME = { x: 320, y: 90 };
const SIZE = 58;
const SIDE_X = 262;
const SMALL = { x: GREETING_W / 2 - COMPACT_W / 2 + 40, y: NOTCH_H / 2, hb: Math.min(20, Math.max(0, NOTCH_H - 6)) };

type Eye = "dot" | "happy" | "content";

export interface Pose {
  hb: number; x: number; y: number; sx: number; sy: number; tilt: number;
  eye: Eye; open: number; eyeRoll: number;
  lookX: number; lookY: number;
  handL: number; handR: number; wave: number;
  badge: number; tint: number; halo: number; haloBlue: number; minis: number; fx: number;
  header: number; card: number;
  iw: number; ih: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mixN = (a: number, b: number, k: number) => a + (b - a) * k;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** Mola amortecida: passa um pouco do alvo e volta. */
const spring = (k: number) => (k >= 1 ? 1 : 1 - Math.exp(-6 * k) * Math.cos(9 * k));
/** Pulo: arco de altura 1 em [0,1]. */
const arc = (k: number) => 4 * k * (1 - k);

function flight(t: number): Pose {
  const grow = span(t, 0, 0.5);
  const iw = mixN(NOTCH_W, GREETING_W, easeOut(grow));
  const ih = mixN(NOTCH_H, GREETING_H, easeOut(grow));
  const p: Pose = {
    hb: 0, x: HOME.x, y: HOME.y, sx: 1, sy: 1, tilt: 0, eye: "dot", open: 1, eyeRoll: 0,
    lookX: 0, lookY: 0, handL: 0, handR: 0, wave: 0, badge: 0, tint: 0, halo: 0, haloBlue: 0,
    minis: 0, fx: 0, header: 0, card: easeOut(span(t, 0.05, 0.45)), iw, ih,
  };
  if (t < T.appear) return p;
  // Descida em voo: de cima, batendo as asas, crescendo.
  const down = span(t, T.appear, T.land);
  p.hb = mixN(SIZE * 0.35, SIZE, spring(down));
  p.y = mixN(HOME.y - 52, HOME.y, easeOut(down));
  p.x = HOME.x + Math.sin(down * Math.PI) * 10;
  p.tilt = Math.sin(down * Math.PI * 2) * 0.08 * (1 - down);
  p.handL = p.handR = t < T.land ? 1 : 0;
  p.wave = t < T.land ? -1 : 0;
  p.fx = down;
  // Pouso: amassa e estica.
  if (t >= T.land) {
    const s = span(t, T.land, T.settle);
    const sq = Math.sin(s * Math.PI) * (1 - s);
    p.sx = 1 + sq * 0.12;
    p.sy = 1 - sq * 0.1;
  }
  // Dois pulinhos para o lado.
  if (t >= T.hopOut) {
    const k = span(t, T.hopOut, T.wave0);
    const hop = k < 0.5 ? arc(k * 2) : arc(k * 2 - 1);
    p.x = mixN(HOME.x, SIDE_X, easeInOut(k));
    p.y = HOME.y - hop * 9;
    p.lookX = -0.6 * (1 - k);
  }
  // Aceno com as duas asas, olhos felizes.
  if (t >= T.wave0) {
    p.x = SIDE_X;
    p.y = HOME.y;
    p.lookX = 0;
    if (t < T.wave1) {
      p.handL = p.handR = 1;
      p.wave = Math.sin((t - T.wave0) * 14) * 0.5 + 0.5;
      p.eye = "happy";
      p.tilt = Math.sin((t - T.wave0) * 7) * 0.06;
    }
  }
  // Volta ao centro.
  if (t >= T.hopBack) {
    const k = span(t, T.hopBack, T.home);
    p.x = mixN(SIDE_X, HOME.x, easeInOut(k));
    p.y = HOME.y - arc(k) * 10;
    p.eye = "content";
  }
  if (t >= T.home) { p.x = HOME.x; p.y = HOME.y; p.tilt = 0; }
  // Encolhe para o lugar da ilha compacta.
  if (t >= T.shrink0) {
    const k = easeInOut(span(t, T.shrink0, T.end));
    p.x = mixN(HOME.x, SMALL.x, k);
    p.y = mixN(HOME.y, SMALL.y, k);
    p.hb = mixN(SIZE, SMALL.hb, k);
    p.card = 1 - k;
    p.iw = mixN(GREETING_W, COMPACT_W, k);
    p.ih = mixN(GREETING_H, NOTCH_H, k);
    p.minis = k;
    p.eye = "dot";
  }
  return p;
}

function small(): Pose {
  return { ...flight(T.end + 1), x: SMALL.x, y: SMALL.y, hb: SMALL.hb, minis: 1, card: 0, iw: COMPACT_W, ih: NOTCH_H };
}

/** A pose no instante `t`; `tc` é quando o cursor saiu e a ilha começou a fechar. */
export function greetingPose(t: number, tc = Number.POSITIVE_INFINITY): Pose {
  if (t < tc) return t >= T.end ? small() : flight(t);
  const a = tc >= T.end ? small() : flight(tc);
  const b = small();
  // A mesma curva (340 ms) da ilha encolhendo: os dois andam juntos.
  const k = span(t, tc, tc + T.collapse);
  const e = k >= 1 ? 1 : closeCurve(k);
  return {
    ...a, eye: "dot", handL: 0, handR: 0, wave: 0, sx: 1, sy: 1, tilt: 0,
    x: mixN(a.x, b.x, e), y: mixN(a.y, b.y, e), hb: mixN(a.hb, b.hb, e),
    iw: mixN(a.iw, b.iw, e), ih: mixN(a.ih, b.ih, e), card: mixN(a.card, 0, e), minis: mixN(a.minis, 1, e),
  };
}

/** A caixa do corvo (corpo e asas) no espaço 640×150. */
export function mochiBounds(p: Pose): { left: number; right: number; top: number; bottom: number } | null {
  const hh = (p.hb / 2) * Math.max(1, p.sy);
  const hw = (p.hb / 2) * ASP * Math.max(1, p.sx);
  if (hh <= 0.4) return null;
  return { left: p.x - hw, right: p.x + hw, top: p.y - hh, bottom: p.y + hh };
}

// ── Desenho ──────────────────────────────────────────────────────────────────

interface Spark { x: number; y: number; vy: number; life: number; rune: string }
const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";

export class Greeting {
  private startMs = 0;
  private tc = Number.POSITIVE_INFINITY;
  private fired = false;
  private timers: number[] = [];
  private raven = new RavenEngine();
  private last = 0;
  private sparks: Spark[] = [];

  onComplete: (() => void) | null = null;

  start() {
    this.startMs = performance.now();
    this.last = this.startMs;
    this.tc = Number.POSITIVE_INFINITY;
    this.fired = false;
    this.sparks = [];
    this.raven = new RavenEngine();
    this.clear();
    Sound.play(SOUND);
    this.timers.push(window.setTimeout(() => this.fire(), (T.end + 0.05) * 1000));
  }

  /** O cursor entrou durante a saudação: ela fica aberta. */
  hover() { if (this.tc >= T.autoLeave) this.tc = Number.POSITIVE_INFINITY; }

  /** O cursor saiu: fecha a partir de agora. */
  interrupt() {
    const t = this.elapsed;
    if (!Number.isFinite(this.tc) || this.tc > t) this.tc = t;
    this.clear();
    Sound.fadeOut(SOUND, 0.25);
  }

  /** A vista da saudação saiu: o som termina sumindo. */
  leave() { this.clear(); Sound.fadeOut(SOUND, 0.2); }

  get elapsed(): number { return (performance.now() - this.startMs) / 1000; }
  get done(): boolean { return this.fired; }

  private fire() {
    if (this.fired) return;
    this.fired = true;
    this.clear();
    this.onComplete?.();
  }

  private clear() { this.timers.forEach((id) => window.clearTimeout(id)); this.timers = []; }

  draw(x: CanvasRenderingContext2D) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = this.elapsed;
    if (!this.fired && t >= T.end && this.tc >= T.autoLeave) this.fire();
    const p = greetingPose(t, this.tc);
    x.clearRect(0, 0, GREETING_W, GREETING_H);
    if (p.card > 0.01) this.sky(x, p, t, dt);
    if (p.hb > 0.4) this.bird(x, p, dt);
  }

  /** Fundo: noite de fiorde, aurora que respira e runas que sobem. */
  private sky(x: CanvasRenderingContext2D, p: Pose, t: number, dt: number) {
    const w = 620, h = 104, left = 10, top = 36;
    x.save();
    x.globalAlpha = p.card;
    x.beginPath();
    x.roundRect(left, top, w, h, 20);
    const g = x.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, "#0d1630"); g.addColorStop(1, "#070b16");
    x.fillStyle = g; x.fill();
    x.clip();
    const breathe = 0.5 + Math.sin(t * 1.6) * 0.5;
    for (const [cx, col] of [[160, "94,242,201"], [470, "180,124,255"]] as const) {
      const a = x.createRadialGradient(cx, top - 10, 0, cx, top - 10, 220);
      a.addColorStop(0, `rgba(${col},${0.22 + breathe * 0.1})`); a.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = a; x.fillRect(left, top, w, h);
    }
    // Ponte arco-íris na base, que atravessa durante a descida.
    const bw = w * easeOut(clamp(p.fx * 1.4, 0, 1));
    const bg = x.createLinearGradient(left, 0, left + w, 0);
    ["#ff6b6b", "#f2b84b", "#f6e36a", "#5ef2c9", "#6aa8ff", "#b47cff"].forEach((c, i) => bg.addColorStop(i / 5, c));
    x.fillStyle = bg; x.globalAlpha = p.card * 0.7;
    x.fillRect(left + (w - bw) / 2, top + h - 3, bw, 3);
    x.globalAlpha = p.card;
    if (this.sparks.length < 14 && Math.random() < dt * 9) {
      const sx = left + 20 + Math.random() * (w - 40);
      if (Math.abs(sx - p.x) > p.hb) this.sparks.push({ x: sx, y: top + h - 8, vy: 14 + Math.random() * 16, life: 0, rune: RUNES[Math.floor(Math.random() * RUNES.length)] });
    }
    x.font = '12px "Bifrost Runic","Segoe UI Historic",serif';
    x.textAlign = "center";
    for (const s of this.sparks) {
      s.life += dt; s.y -= s.vy * dt;
      x.fillStyle = `rgba(226,181,90,${Math.max(0, 0.6 - s.life * 0.3)})`;
      x.fillText(s.rune, s.x, s.y);
    }
    this.sparks = this.sparks.filter((s) => s.life < 2);
    x.restore();
  }

  private bird(x: CanvasRenderingContext2D, p: Pose, dt: number) {
    const e = this.raven;
    e.update(dt);
    e.hands = p.handL > 0.5 ? p.wave : 0;
    e.wingBeat = p.handL > 0.5 && p.wave < 0 ? 1 : 0;
    e.eyeOverride = p.eye === "happy" ? "happy" : p.eye === "content" ? "happy" : null;
    e.yaw = p.lookX * 0.4;
    e.isMini = p.hb < 26;
    const R = p.hb / 2.1;
    const S = R / 0.3;
    x.save();
    x.translate(p.x, p.y);
    x.rotate(p.tilt);
    x.scale(p.sx, p.sy);
    x.translate(-S / 2, -S / 2 - R * 0.02 - e.particleOverhang / 2);
    e.draw(x, S, S);
    x.restore();
  }
}
