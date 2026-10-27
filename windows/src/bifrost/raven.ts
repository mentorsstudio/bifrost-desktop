import { RAVEN } from "./raven-shape";
// RavenEngine — o motor do Huginn (e do Muninn), escrito do zero para o Bifrost.
//
// Contrato: o mesmo que a ilha, a área de trabalho, a pílula, o hub e o resumo
// já usam (setState, triggerEmote, update/draw no canvas, morph para a caixa de
// mensagem, tapa → tontura, aceno, guarda-roupa, dança). Por dentro tudo é
// novo: cada propriedade é uma "corda" — uma mola amortecida com alvo — e as
// coreografias são sequências de alvos com curvas do motion.ts. O desenho é o
// corvo nórdico: asas que batem, peito com nó entalhado, bico de ouro, olhos de
// aurora, e emblemas em forma de runa.

import { Curves, reducedMotion, type Curve } from "./motion";
import { REST, RHYTHM, WING_MAX, blend, gaitLength, pose as gaitPose, type Gait, type Pose } from "./locomotion";
import { SLEEP_RUNE } from "./runes";
import { Sound } from "../core/sound";
import type { BotEmoteName, BotStateName } from "../core/layout";
import { drawOutfitBehind, drawOutfitFront, setRavenPainter, type RavenHead } from "./outfits";
import type { Outfit } from "../huginn/wardrobe";
import { currentTheme, onThemeChange, type RavenLook } from "../theme/themes";

export type EyeShape =
  | "pill" | "wide" | "dot" | "line" | "flat" | "happy" | "closed"
  | "spiral" | "heart" | "star" | "tired" | "wink" | "cup";
export type BadgeKind = "dots" | "bang" | "question" | "dot" | "arrow" | "orbit" | "scan" | "check" | "cross" | "hourglass";
export interface Badge { kind: BadgeKind; color: RGB }
export type RGB = readonly [number, number, number];
/** [alvo, duração ms, curva] */
export type Step = readonly [number, number, Curve];

type Prop =
  | "yaw" | "pitch" | "roll" | "tilt" | "open" | "sx" | "sy" | "oy" | "ox" | "tint"
  | "morph" | "hands" | "blush" | "es" | "badgeS" | "outfitPresence";

interface Mood {
  color: RGB; tint: number; eye: EyeShape; badge: Badge | null;
  hop: boolean; scan: boolean; breathe: boolean; snore: boolean; sweat: boolean;
  gaze: readonly [number, number] | null; lean: number;
}

interface Spark { kind: "heart" | "star" | "spark" | "sweat" | "z"; x: number; y: number; vx: number; vy: number; age: number; life: number; spin: number; size: number }

const hex = (h: string): RGB => {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
export const hexToRGB = hex;
const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clock = () => performance.now() / 1000;

// Fase 18: a paleta vem do tema ativo (src/theme/themes.ts) e troca ao vivo.
interface Pal { hl: { lit: RGB; dark: RGB }; mn: { lit: RGB; dark: RGB }; H: RavenLook; M: RavenLook }
let palFor = "";
let PAL: Pal;
function pal(): Pal {
  const t = currentTheme();
  if (palFor !== t.id) {
    PAL = { hl: { lit: hex(t.huginn.lit), dark: hex(t.huginn.dark) }, mn: { lit: hex(t.muninn.lit), dark: hex(t.muninn.dark) }, H: t.huginn, M: t.muninn };
    palFor = t.id;
  }
  return PAL;
}
/** Tom de erro e de limite do tema ativo (sinais funcionais, dessaturados). */
export const errorTone = () => currentTheme().error;
export const limitTone = () => currentTheme().limit;
function tones() {
  const t = currentTheme(), o = t.tones;
  return {
    idle: hex(o.idle), working: hex(o.working), thinking: hex(o.thinking), searching: hex(o.searching),
    approval: hex(o.approval), question: hex(o.question), error: hex(t.error), finished: hex(o.finished),
    ratelimit: hex(t.limit), sleeping: hex(o.sleeping), dizzy: hex(o.dizzy),
  };
}
const TONE = tones();
const calm = { hop: false, scan: false, breathe: false, snore: false, sweat: false, gaze: null, lean: 0 };
export const BOT_STATES: Record<BotStateName, Mood> = {
  idle: { ...calm, color: TONE.idle, tint: 0, eye: "pill", badge: null },
  working: { ...calm, color: TONE.working, tint: 0.72, eye: "pill", badge: { kind: "dots", color: TONE.working } },
  thinking: { ...calm, color: TONE.thinking, tint: 0.72, eye: "pill", badge: { kind: "orbit", color: TONE.thinking }, gaze: [0.55, 0.55] },
  searching: { ...calm, color: TONE.searching, tint: 0.72, eye: "pill", badge: { kind: "scan", color: TONE.searching }, scan: true },
  approval: { ...calm, color: TONE.approval, tint: 0.78, eye: "wide", badge: { kind: "bang", color: TONE.approval }, hop: true },
  question: { ...calm, color: TONE.question, tint: 0.75, eye: "pill", badge: { kind: "question", color: TONE.question }, lean: 0.17 },
  error: { ...calm, color: TONE.error, tint: 0.78, eye: "flat", badge: { kind: "cross", color: TONE.error } },
  finished: { ...calm, color: TONE.finished, tint: 0.35, eye: "happy", badge: { kind: "check", color: TONE.finished } },
  ratelimit: { ...calm, color: TONE.ratelimit, tint: 0.72, eye: "tired", badge: { kind: "hourglass", color: TONE.ratelimit }, sweat: true },
  sleeping: { ...calm, color: TONE.sleeping, tint: 0.32, eye: "closed", badge: null, breathe: true, snore: true },
  dizzy: { ...calm, color: TONE.dizzy, tint: 0.7, eye: "spiral", badge: null },
};
onThemeChange(() => {
  const n = tones();
  for (const [k, m] of Object.entries(BOT_STATES) as [BotStateName, Mood][]) {
    const c = n[k as keyof typeof n];
    if (!c) continue;
    m.color = c;
    if (m.badge) m.badge = { ...m.badge, color: c };
  }
  Object.assign(TONE, n);
});
export const STATE_SOUND: Partial<Record<BotStateName, string>> = {
  working: "work", thinking: "think", searching: "search", approval: "approval", question: "question",
  error: "error", finished: "finish", ratelimit: "rate", sleeping: "sleep", dizzy: "dizzy",
};
const EMOTE_EYES: Record<BotEmoteName, EyeShape> = {
  love: "heart", surprised: "dot", proud: "star", wink: "wink", yawn: "tired", happy: "happy", annoyed: "line",
};

const out = Curves.fjord;
const pop = Curves.raven;
const sway = Curves.tide;
const flat = Curves.linear;

/** A dança: entra em 0,3 s, sai em 0,5 s. */
export function stepDanceLevel(level: number, dancing: boolean, dt: number): number {
  const goal = dancing ? 1 : 0;
  if (level < goal) return Math.min(goal, level + dt / 0.3);
  if (level > goal) return Math.max(goal, level - dt / 0.5);
  return level;
}
/** O balanço a 112 BPM: lado a lado, pulo, inclinação e amasso ao pousar. */
export function danceTransform(seconds: number, level: number, R: number) {
  const beat = (seconds * 112) / 60;
  const hop = Math.abs(Math.sin(Math.PI * beat));
  const land = Math.pow(1 - hop, 6);
  return {
    dx: 0.08 * R * Math.sin(Math.PI * beat) * level,
    dy: -0.2 * R * hop * level,
    rotate: 0.1 * Math.sin(Math.PI * beat) * level,
    sx: 1 + 0.045 * land * level,
    sy: 1 - 0.06 * land * level,
  };
}

/** Uma coreografia em andamento numa propriedade. */
interface Phrase { steps: readonly Step[]; at: number; from: number; t0: number; done?: () => void }

export class RavenEngine {
  isMini = false;
  /** Qual dos dois corvos o motor desenha (o app usa o Huginn; o Muninn aparece nas pranchas). */
  identity: "huginn" | "muninn" = "huginn";
  bodyColor: RGB | null = null;
  private hint: RGB | null = null;

  yaw = 0; pitch = 0; roll = 0; tilt = 0; open = 1;
  sx = 1; sy = 1; oy = 0; ox = 0;
  tint = 0; morph = 0; hands = 0; blush = 0; es = 1; badgeS = 0;
  outfit: Outfit = "none";
  outfitPresence = 0;
  private wantOutfit: Outfit = "none";

  tgYaw = 0; tgPitch = 0; tgTilt = 0; tgSy = 1; tgSx = 1; tgEs = 1;
  particleOverhang = 0;
  isDancing = false;
  dancingLevel = 0;
  slotH = 0; slotHTarget = 0; slotHVel = 0; isChewing = false;

  /** Penas soltas (topete, adornos): atrasam com mola. */
  physDx = 0; physDy = 0;
  private vx = 0; private vy = 0;
  private last = { yaw: 0, oy: 0, roll: 0 };

  col: RGB = TONE.idle;
  colT: RGB = TONE.idle;
  state: BotStateName = "idle";
  cfg: Mood = BOT_STATES.idle;
  eyeOverride: EyeShape | null = null;
  eyeOverrideUntil = 0;
  permanentEye: EyeShape | null = null;
  permanentEmote: BotEmoteName | null = null;
  miniNextBehavior = 0;
  badge: Badge | null = null;
  private badgeId = "none";
  private badgeTicket = 0;

  private phrases = new Map<Prop, Phrase>();
  private sparks: Spark[] = [];
  lookX = 0;
  lookY = 0;
  lastTime = clock();
  private born = clock() - Math.random() * 5;
  private blinkAt = clock() + 1.5 + Math.random() * 2;
  wingBeat = 0;
  waveUntil = 0;
  waveStart = 0;
  private waveTicket = 0;
  private ambientAt = 0;
  private slaps: number[] = [];
  private wander = { x: 0, y: 0, next: 0 };

  onDizzy: (() => void) | null = null;

  // ── Locomoção (fase 13) ─────────────────────────────────────────────────────
  gait: Gait = "none";
  private gaitAt = clock();
  private gaitUntil = Infinity;
  private fromPose: Pose = REST;
  private blendAt = 0;
  /** Inclinação ao longo do caminho no voo (rad), e para onde ele olha (−1 esq., 1 dir.). */
  travelTilt = 0;
  face = 0;
  faceTarget = 0;
  /** Para testes e pranchas: congela o relógio da marcha em `t` segundos. */
  gaitClock: number | null = null;

  /** Troca de marcha, misturando a pose anterior por 0,16 s. Com movimento reduzido, nada muda no desenho. */
  setGait(g: Gait, opts: { tilt?: number; face?: number; seconds?: number } = {}) {
    if (opts.tilt !== undefined) this.travelTilt = opts.tilt;
    if (opts.face !== undefined) this.faceTarget = opts.face;
    if (reducedMotion()) { this.gait = "none"; return; }
    this.fromPose = this.currentPose();
    this.blendAt = clock();
    this.gait = g;
    this.gaitAt = clock();
    this.gaitUntil = opts.seconds !== undefined ? clock() + opts.seconds : Infinity;
  }
  /** Agitação/alerta: bate as asas por `seconds`. */
  flapBurst(seconds = 1.2) { if (this.gait === "none" || this.gait === "flap") this.setGait("flap", { seconds }); }
  walk(dir: -1 | 1) { this.setGait("walk", { face: dir }); }
  takeOff(dir: number, tilt: number) { this.setGait("takeoff", { face: Math.sign(dir) || 0, tilt }); }
  land() { this.setGait("land"); }
  stop() { if (this.gait !== "none") this.setGait("none", { face: 0 }); }
  get moving(): boolean { return this.gait !== "none" || Math.abs(this.face - this.faceTarget) > 0.01; }

  private get rhythm() { return RHYTHM[this.identity]; }
  /** A pose de agora (marcha + mistura com a anterior). */
  currentPose(): Pose {
    const now = this.gaitClock ?? clock();
    const p = gaitPose(this.gait, now - (this.gaitClock == null ? this.gaitAt : 0), this.rhythm, this.travelTilt);
    const b = this.gaitClock == null ? (clock() - this.blendAt) / 0.16 : 1;
    return b < 1 ? blend(this.fromPose, p, Curves.fjord(Math.max(0, b))) : p;
  }
  private stepGait(dt: number) {
    const n = clock();
    const len = gaitLength(this.gait, this.rhythm);
    if (len !== null && this.gaitClock == null && n - this.gaitAt >= len) {
      if (this.gait === "takeoff") { this.fromPose = this.currentPose(); this.blendAt = n; this.gait = "fly"; this.gaitAt = n; }
      else { this.gait = "none"; this.fromPose = REST; }
    }
    if (n > this.gaitUntil) { this.gaitUntil = Infinity; this.setGait("none"); }
    // Virar: mola crítica; no meio da volta ele "afina" (sx), como quem gira.
    const w = 14;
    this.face += (this.faceTarget - this.face) * (1 - Math.exp(-w * dt));
  }

  // ── Coreografia ────────────────────────────────────────────────────────────

  /** Toca uma sequência de alvos numa propriedade (substitui a anterior). */
  anim(prop: Prop, steps: readonly Step[], done?: () => void) {
    this.phrases.set(prop, { steps, at: 0, from: this[prop], t0: performance.now(), done });
  }
  private held(prop: Prop) { return this.phrases.has(prop); }

  setState(next: BotStateName, force = false) {
    if (this.state === next && !force) return;
    const before = this.state;
    this.state = next;
    this.cfg = BOT_STATES[next];
    this.colT = this.cfg.color;
    if (!this.held("tint")) this.tint = this.cfg.tint;
    if (!this.held("tilt")) this.tgTilt = this.cfg.lean;
    this.setBadge(this.currentBadge());
    switch (next) {
      case "finished":
        this.spin(950, 1);
        this.wingBeat = 1;
        if (!this.isMini) this.flapBurst(1.1);
        setTimeout(() => this.emit("spark", 5), 500);
        break;
      case "error":
        this.anim("ox", [[0.08, 50, out], [-0.08, 70, sway], [0.05, 70, sway], [0, 90, out]]);
        break;
      case "approval":
        this.wingBeat = 0.7;
        if (!this.isMini) this.flapBurst(0.9);
        this.anim("oy", [[-0.2, 150, out], [0, 300, pop]]);
        break;
      case "dizzy":
        this.spin(1300, 2);
        break;
      case "question":
        this.blink();
        break;
      case "ratelimit":
        this.emit("sweat", 1);
        break;
      default:
        if (before !== "idle" || next !== "idle") this.blink();
    }
  }

  setUpdateHint(color: RGB | null) {
    const was = this.hint;
    if (color === was || (color && was && color.every((c, i) => c === was[i]))) return;
    this.hint = color;
    this.setBadge(this.currentBadge());
  }
  get showsUpdateHint(): boolean {
    return this.hint != null && (this.state === "idle" || this.state === "sleeping");
  }
  private currentBadge(): Badge | null {
    return this.showsUpdateHint && this.hint ? { kind: "arrow", color: this.hint } : this.cfg.badge;
  }
  setBadge(b: Badge | null) {
    const id = b ? `${b.kind}:${b.color.join()}` : "none";
    if (id === this.badgeId) return;
    this.badgeId = id;
    const ticket = ++this.badgeTicket;
    this.anim("badgeS", [[0, 90, sway]]);
    setTimeout(() => {
      if (ticket !== this.badgeTicket) return;
      this.badge = b;
      if (b) this.anim("badgeS", [[1, 280, pop]]);
    }, 100);
  }

  blink() {
    if (this.held("open")) return;
    this.anim("open", [[0.06, 70, sway], [1, 130, out]]);
  }

  squash() {
    this.vy += 0.6;
    this.anim("sy", [[0.78, 70, out], [1.1, 130, out], [1, 170, sway]]);
    this.anim("sx", [[1.16, 70, out], [0.95, 130, out], [1, 170, sway]]);
  }

  gulp() {
    this.slotHTarget = 0.42;
    setTimeout(() => {
      this.slotHTarget = 0;
      this.isChewing = true;
      setTimeout(() => (this.isChewing = false), 800);
    }, 460);
    this.anim("sy", [[0.78, 80, out], [1.18, 130, out], [1, 220, pop]]);
    this.anim("sx", [[1.28, 80, out], [0.92, 130, out], [1, 220, pop]]);
    this.blink();
  }

  slap() {
    this.stopWave();
    if (this.state === "dizzy") return;
    const t = clock();
    this.slaps = this.slaps.filter((s) => t - s < 1.7);
    this.slaps.push(t);
    Sound.play("slap");
    this.squash();
    this.wingBeat = 1;
    this.vy -= 1.2;
    this.vx += Math.random() < 0.5 ? 0.7 : -0.7;
    if (this.slaps.length >= 3) {
      this.slaps = [];
      this.onDizzy?.();
    } else {
      this.eyeOverride = "line";
      this.eyeOverrideUntil = t + 0.8;
      setTimeout(() => Sound.play("annoyed"), 60);
    }
  }

  private spin(ms: number, turns: number) {
    this.roll = 0;
    this.anim("roll", [[Math.PI * 2 * turns, ms, sway]], () => (this.roll = 0));
  }
  doRoll(ms: number, turns: number) { this.spin(ms, turns); }

  /** Aceno: o Huginn abre uma asa e acena. */
  greet() {
    const t = clock();
    const ticket = ++this.waveTicket;
    this.waveStart = t + 0.45;
    this.waveUntil = t + 1.55;
    this.vx += 0.2;
    this.eyeOverride = "happy";
    this.eyeOverrideUntil = t + 2;
    this.anim("oy", [[-0.06, 220, out], [0, 220, pop]]);
    const later = (ms: number, f: () => void) => setTimeout(() => ticket === this.waveTicket && f(), ms);
    later(250, () => {
      this.anim("hands", [[1, 280, out]]);
      this.anim("sy", [[0.95, 100, out], [1, 260, pop]]);
      this.anim("sx", [[1.04, 100, out], [1, 260, pop]]);
      Sound.play("greet");
    });
    later(550, () => this.blink());
    later(1500, () => this.blink());
    later(1550, () => {
      this.waveUntil = 0;
      this.anim("hands", [[0, 200, sway]]);
    });
    later(1750, () => {
      this.eyeOverride = "happy";
      this.eyeOverrideUntil = clock() + 0.3;
    });
  }
  interruptGreet() { this.stopWave(); }
  private stopWave() {
    if (this.hands <= 0.01 && clock() >= this.waveUntil) return;
    this.waveTicket++;
    this.waveUntil = this.waveStart = 0;
    this.anim("hands", [[0, 150, sway]]);
  }

  setPermanentEmote(emote: BotEmoteName | null) {
    this.permanentEmote = emote;
    this.miniNextBehavior = clock() + 0.8 + Math.random() * 1.7;
    if (emote === "wink") return;
    this.permanentEye = emote ? EMOTE_EYES[emote] : null;
    if (this.permanentEye) {
      this.eyeOverride = this.permanentEye;
      this.eyeOverrideUntil = Infinity;
    } else if (this.eyeOverrideUntil === Infinity) {
      this.eyeOverride = null;
      this.eyeOverrideUntil = 0;
    }
  }

  triggerEmote(emote: BotEmoteName, duration = 1.8) {
    const t = clock();
    const hold = (duration - 0.5) * 1000;
    this.eyeOverride = EMOTE_EYES[emote];
    this.eyeOverrideUntil = t + duration;
    switch (emote) {
      case "love":
        this.anim("blush", [[1, 300, out], [1, (duration - 0.6) * 1000, flat], [0, 300, sway]]);
        this.emit("heart", 4);
        this.anim("oy", [[-0.1, 160, out], [0, 300, pop]]);
        break;
      case "surprised":
        this.wingBeat = 1;
        this.anim("oy", [[-0.3, 140, out], [0, 380, pop]]);
        this.anim("es", [[1.25, 120, out], [1, 500, sway]]);
        break;
      case "proud":
        this.emit("star", 5);
        this.anim("tilt", [[-0.14, 220, out], [-0.14, hold, flat], [0, 280, sway]]);
        this.anim("blush", [[0.7, 250, out], [0.7, hold, flat], [0, 300, sway]]);
        break;
      case "wink":
        this.anim("tilt", [[0.12, 160, out], [0.12, (duration - 0.4) * 1000, flat], [0, 240, sway]]);
        break;
      case "yawn":
        this.anim("sy", [[1.12, 500, sway], [1, 500, sway]]);
        this.anim("sx", [[0.94, 500, sway], [1, 500, sway]]);
        setTimeout(() => { this.eyeOverride = "closed"; this.emit("z", 2); }, 700);
        break;
      case "happy":
        this.anim("blush", [[0.6, 200, out], [0, 600, sway]]);
        break;
      case "annoyed":
        this.eyeOverride = "line";
        this.eyeOverrideUntil = t + 0.8;
        setTimeout(() => Sound.play("annoyed"), 60);
        break;
    }
  }

  emit(kind: Spark["kind"], n: number) {
    for (let i = 0; i < n; i++) {
      const z = kind === "z";
      this.sparks.push({
        // Nascem ao lado da cabeça (|x| ≥ 0.6R) e se afastam: nunca cruzam o rosto.
        ...(() => { // Com um selo à direita, as faíscas vão só para a esquerda (nunca tocam o selo).
          const side = z ? 1 : this.badge ? -1 : (i % 2 === 0 ? 1 : -1);
          if (z) return { x: 0.5 + Math.random() * 0.15, y: -0.62, vx: 0.12 + Math.random() * 0.08, vy: -(0.22 + Math.random() * 0.08) };
          return {
          x: side * (0.62 + Math.random() * 0.3), y: -0.85 - Math.random() * 0.25,
          vx: side * (0.12 + Math.random() * 0.25), vy: -(0.4 + Math.random() * 0.3) }; })(),
        kind,
        age: -i * 0.14, life: 1.3 + Math.random() * 0.5, spin: Math.random() * Math.PI * 2, size: 0.15 + Math.random() * 0.08,
      });
    }
  }

  animateMorph(target: number, ms?: number) {
    this.anim("morph", [[target, ms ?? (target > 0.5 ? 550 : 650), sway]]);
  }
  resetMorph() {
    this.phrases.delete("morph");
    this.morph = 0;
  }

  setOutfit(next: Outfit, animated = true) {
    if (next === this.wantOutfit) return;
    this.wantOutfit = next;
    this.phrases.delete("outfitPresence");
    const enter = () => {
      this.outfit = next;
      this.anim("outfitPresence", [[1, 350, sway]], () => this.squash());
    };
    if (!animated) {
      this.outfit = next;
      this.outfitPresence = next !== "none" ? 1 : 0;
    } else if (next === "none") this.anim("outfitPresence", [[0, 180, sway]], () => (this.outfit = "none"));
    else if (this.outfit === "none") { this.outfitPresence = 0; enter(); }
    else this.anim("outfitPresence", [[0, 180, sway]], enter);
  }

  setDancing(d: boolean) { this.isDancing = d; }

  private get rigid(): boolean { return !this.isMini && this.outfit !== "none" && this.outfitPresence > 0.05; }

  get busy(): boolean {
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.002;
    return (
      this.phrases.size > 0 || this.sparks.length > 0 || this.isMini || this.isDancing || this.dancingLevel > 0.001 ||
      this.cfg.hop || this.cfg.scan || this.cfg.breathe || this.cfg.snore || this.cfg.sweat || this.wingBeat > 0.01 ||
      !near(this.tgYaw, this.yaw) || !near(this.tgPitch, this.pitch) || !near(this.tgTilt, this.tilt) ||
      !near(this.tgSy, this.sy) || !near(this.tgSx, this.sx) || !near(this.tgEs, this.es) ||
      this.slotH > 0.001 || Math.abs(this.slotHVel) > 0.001 ||
      this.col.some((c, i) => Math.abs(c - this.colT[i]) > 0.003) ||
      (this.outfit !== "none" && (Math.abs(this.vx) > 0.01 || Math.abs(this.vy) > 0.01))
    );
  }

  // ── Passo ──────────────────────────────────────────────────────────────────

  update(dt: number) {
    const n = clock();
    const ms = performance.now();
    for (const [prop, ph] of [...this.phrases]) {
      const [goal, len, curve] = ph.steps[ph.at];
      const p = Math.min(1, Math.max(0, (ms - ph.t0) / len));
      this[prop] = ph.from + (goal - ph.from) * curve(p);
      if (p >= 1) {
        ph.from = goal;
        ph.at++;
        ph.t0 = ms;
        if (ph.at >= ph.steps.length) {
          this.phrases.delete(prop);
          ph.done?.();
        }
      }
    }

    const t = n - this.born;
    let gy = this.lookX * 0.62;
    let gp = this.lookY * 0.5;
    if (this.cfg.gaze) { gy = gy * 0.35 + this.cfg.gaze[0] * 0.55; gp = gp * 0.3 + this.cfg.gaze[1] * 0.5; }
    if (this.cfg.scan) { gy = Math.sin(t * 2.6) * 0.6; gp = -0.06; }
    if (this.state === "sleeping") { gy = 0; gp = -0.14; }
    if (this.state === "dizzy") gy = Math.sin(t * 9) * 0.25;
    if (this.isMini && !this.cfg.gaze && !this.cfg.scan && this.state !== "sleeping" && this.state !== "dizzy") {
      if (n > this.wander.next) this.wander = { x: -0.88 + Math.random() * 1.76, y: -0.55 + Math.random(), next: n + 0.5 + Math.random() * 1.5 };
      gy = this.wander.x * 0.62;
      gp = this.wander.y * 0.5;
    }
    this.tgYaw = gy;
    this.tgPitch = gp;
    this.tgTilt = this.cfg.lean;
    if (n > this.waveStart && n < this.waveUntil) this.tgTilt = -0.06 + Math.sin(2 * Math.PI * 1.2 * (n - this.waveStart)) * 0.07;

    const k = 1 - Math.pow(0.0008, dt);
    const kEye = 1 - Math.pow(0.0025, dt);
    const hop = this.cfg.hop ? -Math.abs(Math.sin(t * 5.2)) * 0.07 : 0;
    if (!this.held("oy")) this.oy += (hop - this.oy) * k;
    if (this.cfg.breathe) {
      const a = this.isMini ? 0.07 : 0.035;
      this.tgSy = 1 + Math.sin(t * 1.8) * a;
      this.tgSx = 1 - Math.sin(t * 1.8) * a * 0.57;
    } else if (this.isMini) {
      this.tgSy = 1 + Math.sin(t * 2.2 / currentTheme().tempo) * 0.04;
      this.tgSx = 1 - Math.sin(t * 2.2 / currentTheme().tempo) * 0.02;
    } else {
      this.tgSy = this.tgSx = 1;
    }
    if (this.isMini && n > this.miniNextBehavior) this.miniLoop();
    if (!this.held("yaw")) this.yaw += (this.tgYaw - this.yaw) * kEye;
    if (!this.held("pitch")) this.pitch += (this.tgPitch - this.pitch) * kEye;
    if (!this.held("tilt")) this.tilt += (this.tgTilt - this.tilt) * k;
    if (!this.held("sy")) this.sy += (this.tgSy - this.sy) * k;
    if (!this.held("sx")) this.sx += (this.tgSx - this.sx) * k;
    if (!this.held("es")) this.es += (this.tgEs - this.es) * k;
    this.col = mix(this.col, this.colT, 1 - Math.pow(0.002, dt));
    this.wingBeat = Math.max(0, this.wingBeat - dt * 1.4);

    if (n > this.blinkAt) {
      if (this.state !== "sleeping" && this.state !== "dizzy") {
        this.blink();
        if (Math.random() < 0.22) setTimeout(() => this.blink(), 230);
      }
      this.blinkAt = n + 2.2 + Math.random() * 3.2;
    }
    if (this.eyeOverride && n > this.eyeOverrideUntil) {
      this.eyeOverride = this.permanentEye;
      if (this.permanentEye) this.eyeOverrideUntil = Infinity;
    }
    if (n - this.ambientAt > 1.3) {
      this.ambientAt = n;
      if (this.cfg.snore) this.emit("z", 1);
      if (!this.isMini && this.cfg.sweat && Math.random() < 0.5) this.emit("sweat", 1);
    }
    for (const s of this.sparks) s.age += dt;
    this.sparks = this.sparks.filter((s) => s.age < s.life);

    // Bico/caixa: mola ω = 2π/0,25 s, ζ = 0,6.
    const w = (2 * Math.PI) / 0.25;
    this.slotHVel += (w * w * (this.slotHTarget - this.slotH) - 2 * 0.6 * w * this.slotHVel) * dt;
    this.slotH = Math.max(0, this.slotH + this.slotHVel * dt);
    this.dancingLevel = stepDanceLevel(this.dancingLevel, this.isDancing, dt);

    if (dt > 0) {
      const dRoll = this.roll - this.last.roll;
      const rollV = Math.abs(dRoll) > Math.PI ? 0 : dRoll / dt;
      const tx = Math.max(-1, Math.min(1, -((this.yaw - this.last.yaw) / dt) * 0.35 - this.tilt * 2 + (this.rigid ? rollV * 0.18 : 0)));
      const ty = Math.max(-1, Math.min(1, ((this.oy - this.last.oy) / dt) * 0.5));
      this.vx += (60 * (tx - this.physDx) - 9 * this.vx) * dt;
      this.vy += (60 * (ty - this.physDy) - 9 * this.vy) * dt;
      this.physDx += this.vx * dt;
      this.physDy += this.vy * dt;
    }
    this.last = { yaw: this.yaw, oy: this.oy, roll: this.roll };
    this.stepGait(dt);
    this.lastTime = n;
  }

  private miniLoop() {
    const n = clock();
    switch (this.permanentEmote) {
      case "happy":
        if (this.held("oy")) { this.miniNextBehavior = n + 0.4; return; }
        this.anim("oy", [[-0.3, 120, out], [0.03, 200, sway], [0, 160, pop]]);
        this.anim("sy", [[0.82, 80, out], [1.18, 130, out], [0.88, 160, sway], [1, 200, pop]]);
        this.anim("sx", [[1.15, 80, out], [0.88, 130, out], [1.06, 160, sway], [1, 200, pop]]);
        this.miniNextBehavior = n + 2.2 + Math.random() * 1.2;
        break;
      case "annoyed":
        if (this.held("yaw")) { this.miniNextBehavior = n + 0.5; return; }
        this.anim("yaw", [[-0.65, 50, out], [0.65, 90, sway], [-0.5, 80, sway], [0.4, 75, sway], [-0.2, 70, sway], [0, 140, out]]);
        this.miniNextBehavior = n + 3 + Math.random() * 2.5;
        break;
      case "wink":
        this.eyeOverride = "wink";
        this.eyeOverrideUntil = n + 0.55;
        this.anim("tilt", [[0.13, 100, out], [0.13, 320, flat], [0, 200, sway]]);
        this.miniNextBehavior = n + 2.2 + Math.random() * 2;
        break;
      case "love":
        this.emit("heart", 2);
        this.anim("tilt", [[-0.1, 180, out], [0.1, 340, sway], [0, 220, sway]]);
        this.miniNextBehavior = n + 2.6 + Math.random() * 1.5;
        break;
      default:
        this.miniNextBehavior = n + 3 + Math.random() * 2;
    }
  }

  applyDance(x: CanvasRenderingContext2D, W: number, H: number) {
    if (this.dancingLevel <= 0.001) return;
    const R = W * 0.3;
    const px = W / 2 + this.ox * R;
    const py = H / 2 + this.particleOverhang / 2 + this.oy * R + R * 0.06 + R * 0.88;
    const d = danceTransform(clock(), this.dancingLevel, R);
    x.translate(px + d.dx, py + d.dy);
    x.rotate(d.rotate);
    x.scale(d.sx, d.sy);
    x.translate(-px, -py);
  }

  // ── Desenho ────────────────────────────────────────────────────────────────

  draw(x: CanvasRenderingContext2D, W: number, H: number) {
    const R = W * 0.3;
    const rx = R * 1.14;
    const ry = R * 0.88;
    const cx = W / 2 + this.ox * R;
    const cy = H / 2 + this.particleOverhang / 2 + this.oy * R + R * 0.06;
    const m = this.morph;
    x.save();
    if (this.rigid && Math.abs(this.roll) > 0.001) { x.translate(cx, cy); x.rotate(this.roll); x.translate(-cx, -cy); }
    x.save();
    x.translate(cx, cy);
    if (this.tilt) x.rotate(this.tilt);
    x.scale(this.sx, this.sy);

    // O corvo (mesmo desenho dos SVGs de Huginn/Muninn) some enquanto a caixa
    // de mensagem aparece: os dois nunca se cruzam por mais que um instante.
    const ravenA = Math.max(0, 1 - m * 1.8);
    if (ravenA > 0.004) this.figure(x, R, ravenA);
    if (m > 0.01) {
      x.save();
      x.globalAlpha *= Math.min(1, m * 1.6);
      const box = this.silhouette(rx, ry, R);
      this.plumage(x, box, R, rx, ry);
      if (m > 0.35) this.eyes(x, box, R, rx, ry);
      this.slot(x, R, m);
      x.restore();
    }
    x.restore();
    x.restore();
    if (this.badge && this.badgeS > 0.01 && m < 0.25) this.rune(x, this.badge, R, cx, cy);
    this.drawSparks(x, R, cx, cy);
  }

  /** O corvo inteiro, nas coordenadas do SVG (viewBox 120) — o mesmo grão macio de
   *  mascots.ts (fase 11): cauda · pés · topete · corpo · peito · runa · asas · rosto.
   *  O rosto (olhos, bico) se mexe dentro do corpo; as asas giram no ombro, para fora,
   *  sempre abaixo do bico. Os adornos usam o círculo do alto (RAVEN.head). */
  private figure(x: CanvasRenderingContext2D, R: number, a: number) {
    const k = (R * 2.1) / 100;
    const t = clock();
    const muninn = this.identity === "muninn";
    const flap = Math.sin(t * 26) * this.wingBeat * 0.42;
    const P = this.isMini ? REST : this.currentPose();
    const turn = 1 - 0.1 * (1 - Math.min(1, Math.abs(this.face) * 1.4)) * Math.min(1, Math.abs(this.faceTarget) + Math.abs(this.face));
    const wave = this.hands * (0.7 + Math.sin(t * 14) * 0.3);
    const gx = Math.sin(this.yaw) * 3 * (1 - Math.abs(this.face) * 0.5) + this.face * 3.2;
    const gy = Math.sin(this.pitch) * 2.4 + P.bob;
    const PP = pal(); const L = muninn ? PP.M : PP.H; const base = muninn ? PP.mn : PP.hl;
    const lit = this.bodyColor ? mix(this.bodyColor, base.lit, 0.45) : base.lit;
    const dark = this.bodyColor ? mix(this.bodyColor, base.dark, 0.7) : base.dark;
    const tint = this.tint * 0.55;
    const feather = (c0: number, c1: number) => {
      const g = x.createLinearGradient(0, c0, 0, c1);
      g.addColorStop(0, css(tint > 0.01 ? mix(lit, this.col, tint * 0.6) : lit));
      g.addColorStop(1, css(tint > 0.01 ? mix(dark, this.col, tint * 0.35) : dark));
      return g;
    };
    x.save();
    x.globalAlpha *= a;
    x.scale(k, k);
    x.translate(-60, -64);
    // Pose da marcha: o corpo inteiro (adornos inclusive) pula, amassa e inclina em torno dos pés.
    if (P !== REST || turn !== 1) {
      x.translate(60, 104); x.rotate(P.tilt); x.scale(P.sx * turn, P.sy); x.translate(-60, -104 + P.dy);
    }
    x.lineJoin = "round";
    // Sem contorno preto: só um aro de luz finíssimo, para o corvo não "colar" no fundo.
    // Fase 17: aro de luz Marfim (Huginn) / Pinheiro (Muninn) para ler em qualquer fundo.
    x.lineWidth = muninn ? 1.1 : 1.5;
    x.strokeStyle = L.rim;
    const H = RAVEN.head;
    const footLift = (s: number) => (s < 0 ? P.footL : P.footR) + P.tuck * 3.2;
    const head: RavenHead = { x: 60 + gx * 0.4, y: H.cy + gy * 0.4 + this.physDy * 2, r: H.r, chestY: 82, bodyR: 28, footX: 60 + RAVEN.feet.dx, footY: RAVEN.feet.y - footLift(1), spread: Math.min(1, P.wing / 1.5) };
    const dressed = !this.isMini && this.outfit !== "none";
    const st = { presence: this.outfitPresence, morph: 0 };
    if (dressed) drawOutfitBehind(x, this.outfit, head, st);
    if (!this.isMini) {
      // Cauda: só as pontas aparecem abaixo do corpo, por trás dos pés.
      const tail = new Path2D(RAVEN.tail);
      x.fillStyle = css(dark); x.fill(tail); x.stroke(tail);
      x.fillStyle = L.beak[1];
      for (const s of [-1, 1]) { x.beginPath(); x.ellipse(60 + s * RAVEN.feet.dx * (1 - 0.25 * P.tuck), RAVEN.feet.y - footLift(s), 4.2 * (1 - 0.35 * P.tuck), 2.2, 0, 0, Math.PI * 2); x.fill(); }
    }
    // Topete do Huginn (atrás do corpo, nasce do alto da cabeça); balança com mola.
    if (!this.isMini && !muninn && !L.marks.includes("crown") && !L.marks.includes("helm") && !(dressed && (this.outfit === "helm" || this.outfit === "starCrown"))) {
      const sw = this.physDx * 0.3 + Math.sin(t * 1.7 / currentTheme().tempo) * 0.05 + (this.state === "sleeping" ? -0.14 : 0) + P.crest + this.face * 0.12;
      x.save(); x.translate(60, 22); x.rotate(sw); x.translate(-60, -22);
      x.fillStyle = css(lit); x.fill(new Path2D(RAVEN.crest));
      x.restore();
    }
    // Leque de penas atrás de cada asa aberta: aparece só com a asa fora do corpo.
    const wingAngle = (side: -1 | 1, extra = 0) => Math.min(WING_MAX + 0.2, Math.max(0, P.wing + extra + Math.abs(flap) + (side > 0 ? wave : 0) + 0.04 * Math.sin(t * 1.75)));
    const wingAt = (side: -1 | 1, a: number, len: number, fill: string | CanvasGradient, quill: boolean) => {
      const sx = 60 + side * RAVEN.shoulder.dx, sy = RAVEN.shoulder.y;
      x.save();
      x.translate(sx, sy);
      x.rotate(side < 0 ? a : -a);
      x.scale(1, len);
      x.translate(-sx, -sy);
      const p = new Path2D(side < 0 ? RAVEN.wingL : RAVEN.wingR);
      x.fillStyle = fill; x.fill(p); x.stroke(p);
      if (quill) {
        x.strokeStyle = L.quill; x.globalAlpha *= 0.55;
        x.lineWidth = 1.3; x.lineCap = "round";
        x.beginPath(); x.moveTo(60 + side * 26.6, 70); x.bezierCurveTo(60 + side * 29.4, 76, 60 + side * 29.6, 83, 60 + side * 28, 88.6); x.stroke();
        // Fase 17: pontas de pena na base da asa (três traços curtos).
        x.globalAlpha /= 0.55; x.strokeStyle = L.tips;
        x.lineWidth = 1;
        for (const [ox, oy] of [[-3.2, 89], [-1, 91.6], [1.6, 93.2]] as const) {
          const bx = 60 + side * (30 + ox);
          x.beginPath(); x.moveTo(bx, oy - 3.2); x.lineTo(bx + side * 0.6, oy); x.stroke();
        }
      }
      x.restore();
    };
    if (!this.isMini && P.wing > 0.12) {
      for (const side of [-1, 1] as const) wingAt(side, wingAngle(side, P.feather), P.wingLen * 0.94, css(mix(dark, lit, 0.25)), false);
    }
    const body = new Path2D(RAVEN.body);
    if (L.glow && !this.isMini) { x.save(); x.shadowColor = L.glow; x.shadowBlur = R * 0.18; x.fillStyle = feather(20, 103); x.fill(body); x.restore(); }
    x.fillStyle = feather(20, 103); x.fill(body); x.stroke(body);
    // Peito: aurora (Huginn) ou prata (Muninn), e o brilho macio do alto da cabeça.
    const belly = new Path2D(RAVEN.belly);
    const bg = x.createRadialGradient(60, 72, 1, 60, 82, 18);
    bg.addColorStop(0, css(hex(L.belly[0]), muninn ? 0.34 : 0.28));
    bg.addColorStop(1, css(hex(L.belly[1]), 0.08));
    x.fillStyle = bg; x.fill(belly);
    const gloss = x.createRadialGradient(52, 33, 0.5, 54, 36, 15);
    gloss.addColorStop(0, "rgba(255, 255, 255,0.2)"); gloss.addColorStop(1, "rgba(255, 255, 255,0)");
    x.fillStyle = gloss; x.fill(body);
    if (!this.isMini && !(dressed && this.outfit === "runeBand")) {
      x.save();
      x.fillStyle = L.runeInk; x.globalAlpha *= 0.9;
      x.font = '700 11px "Bifrost Runic","Segoe UI Historic","Segoe UI Symbol",serif';
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(L.rune, 60, 84);
      x.restore();
    }
    if (!this.isMini) for (const side of [-1, 1] as const) wingAt(side, wingAngle(side), P.wingLen, feather(60, 95), true);
    // Rosto: lua de Muninn, bochechas, olhos e bico — sempre dentro do corpo.
    x.save();
    x.translate(gx, gy);
    if (muninn && !this.isMini && !(dressed && (this.outfit === "helm" || this.outfit === "starCrown"))) {
      x.fillStyle = L.markColor; x.globalAlpha *= 0.88; x.fill(new Path2D(RAVEN.moon)); x.globalAlpha /= 0.88;
    }
    const flush = Math.max(this.blush, this.tint * 0.4);
    if (flush > 0.02) {
      x.fillStyle = css(hex(L.quill), 0.4 * flush);
      for (const ex of [45.5, 74.5]) { x.beginPath(); x.ellipse(ex, 54.5, 3.6, 2, 0, 0, Math.PI * 2); x.fill(); }
    }
    let shape: EyeShape = this.eyeOverride ?? this.cfg.eye;
    if (this.isDancing && this.dancingLevel > 0.15 && (this.state === "idle" || this.state === "finished")) shape = "happy";
    x.save();
    x.clip(body);
    x.fillStyle = x.strokeStyle = L.eye;
    x.shadowColor = this.tint > 0.2 ? css(this.col, 0.9) : L.halo;
    x.shadowBlur = Math.max(2, R * 0.12);
    const big = this.isMini ? 1.6 : 1;
    for (const side of [-1, 1]) {
      x.save();
      x.translate(60 + side * RAVEN.eyes.dx, RAVEN.eyes.y);
      eyeShape(x, shape, 8.2 * this.es * big, 9.6 * this.es * big, side, this.open);
      x.restore();
    }
    x.shadowBlur = 0;
    // Brilho nos olhos abertos (só nas formas "pill"/"wide"), e a pálpebra mansa do Muninn.
    if (!this.isMini && (shape === "pill" || shape === "wide") && this.open > 0.5) {
      x.fillStyle = "rgba(255, 255, 255,0.85)";
      for (const side of [-1, 1]) { x.beginPath(); x.arc(60 + side * RAVEN.eyes.dx + 1.6, RAVEN.eyes.y - 2.2, 1.3, 0, Math.PI * 2); x.fill(); }
      if (muninn) {
        x.fillStyle = css(dark);
        for (const side of [-1, 1]) {
          const ex = 60 + side * RAVEN.eyes.dx, ey = RAVEN.eyes.y;
          x.beginPath(); x.moveTo(ex - 5, ey - 2.4); x.bezierCurveTo(ex - 2.2, ey - 6.4, ex + 2.2, ey - 6.4, ex + 5, ey - 2.4);
          x.bezierCurveTo(ex + 3, ey - 7.6, ex - 3, ey - 7.6, ex - 5, ey - 2.4); x.fill();
        }
      }
    }
    x.restore();
    if (!this.isMini) {
      const beak = new Path2D(RAVEN.beak);
      const g = x.createLinearGradient(56, 51, 64, 61); g.addColorStop(0, L.beak[0]); g.addColorStop(1, L.beak[1]);
      x.fillStyle = g; x.fill(beak);
      drawMarks(x, L, muninn, dressed ? this.outfit : "none", t);
    }
    x.restore();
    if (dressed) drawOutfitFront(x, this.outfit, head, st);
    x.restore();
  }

  /** Corpo de corvo (cabeça mais estreita) que vira a caixa de mensagem no morph. */
  private silhouette(rx: number, ry: number, R: number): Path2D {
    const p = new Path2D();
    const m = this.morph;
    const n = 72;
    const e = 2 / 2.7;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const bx = rx * Math.sign(c) * Math.pow(Math.abs(c), e) * (1 - 0.2 * Math.max(0, -s));
      const by = ry * Math.sign(s) * Math.pow(Math.abs(s), e) * (s > 0 ? 1.05 : 1);
      let px = bx, py = by;
      if (m > 0.004) {
        const box = boxPoint(c, s, R, R * 0.94, R * 0.42);
        px = bx + (box.x - bx) * m;
        py = by + (box.y - by) * m;
      }
      if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
    }
    p.closePath();
    return p;
  }

  private plumage(x: CanvasRenderingContext2D, body: Path2D, R: number, rx: number, ry: number) {
    const g = x.createLinearGradient(rx * 0.6, -ry, -rx * 0.7, ry);
    if (this.bodyColor) {
      g.addColorStop(0, css(mix(this.bodyColor, pal().hl.lit, 0.45)));
      g.addColorStop(1, css(mix(this.bodyColor, pal().hl.dark, 0.7)));
    } else {
      g.addColorStop(0, css(pal().hl.lit));
      g.addColorStop(1, css(pal().hl.dark));
    }
    x.fillStyle = g;
    x.fill(body);
    const tint = this.tint * (1 - this.morph);
    if (tint > 0.01) {
      const tg = x.createLinearGradient(0, ry, 0, -ry);
      tg.addColorStop(0, css(this.col, 0.7 * tint));
      tg.addColorStop(1, css(this.col, 0));
      x.fillStyle = tg;
      x.fill(body);
    }
    // Brilho de aurora no alto e sombra na borda.
    const hl = x.createRadialGradient(rx * 0.3, -ry * 0.5, 0, rx * 0.3, -ry * 0.5, R * 0.5);
    hl.addColorStop(0, css(hex(pal().H.quill), 0.18));
    hl.addColorStop(1, css(hex(pal().H.quill), 0));
    x.fillStyle = hl;
    x.fill(body);
    const sh = x.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.3);
    sh.addColorStop(0, "rgba(0, 0, 0,0)");
    sh.addColorStop(1, "rgba(0, 0, 0,0.25)");
    x.fillStyle = sh;
    x.fill(body);
  }

  /** A caixa de mensagem: uma fenda que abre (engolir arquivos) e mastiga. */
  private slot(x: CanvasRenderingContext2D, R: number, m: number) {
    const h = Math.max(R * 0.04, this.slotH * R) * m;
    const w = R * 0.9 * m;
    const chew = this.isChewing ? Math.sin(clock() * 30) * R * 0.02 : 0;
    x.save();
    x.fillStyle = "rgba(5, 8, 18,0.85)";
    x.strokeStyle = pal().H.rim;
    x.lineWidth = Math.max(0.6, R * 0.02);
    rounded(x, -w / 2, R * 0.38 - h / 2 + chew, w, h, h / 2);
    x.fill();
    x.stroke();
    x.restore();
  }

  private eyes(x: CanvasRenderingContext2D, body: Path2D, R: number, rx: number, ry: number) {
    let shape: EyeShape = this.eyeOverride ?? this.cfg.eye;
    if (this.isDancing && this.dancingLevel > 0.15 && !this.isMini && (this.state === "idle" || this.state === "finished")) shape = "happy";
    if (this.morph > 0.5) {
      if (this.isChewing) shape = "happy";
      else if (this.slotHTarget > 0.05 || this.slotH > 0.1) shape = "cup";
    }
    x.save();
    x.clip(body);
    x.fillStyle = x.strokeStyle = pal().H.eye;
    if (!this.isMini) {
      x.shadowColor = this.tint > 0.2 ? css(this.col, 0.9) : pal().H.halo;
      x.shadowBlur = Math.max(2, R * 0.24);
    }
    for (const side of [-1, 1]) {
      const yaw = side * 0.37 + this.yaw;
      let pitch = -0.12 + this.pitch + (this.rigid ? 0 : this.roll);
      pitch = ((((pitch + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const cp = Math.cos(pitch);
      if (Math.cos(yaw) * cp <= 0.04) continue;
      const ex = Math.sin(yaw) * cp * rx;
      const ey = -Math.sin(pitch) * ry + ry * 0.14 * this.morph;
      const fx = Math.max(0.18, Math.cos(yaw)) + (1 - Math.max(0.18, Math.cos(yaw))) * this.morph * 0.7;
      const fy = Math.max(0.18, cp) + (1 - Math.max(0.18, cp)) * this.morph * 0.7;
      const big = this.isMini ? 1.9 : 1;
      x.save();
      x.translate(ex, ey);
      x.scale(fx, fy);
      eyeShape(x, shape, R * 0.25 * this.es * big, R * 0.27 * this.es * big, side, this.open);
      x.restore();
    }
    x.restore();
  }

  /** Emblemas como runas gravadas num escudo redondo. */
  private rune(x: CanvasRenderingContext2D, b: Badge, R: number, cx: number, cy: number) {
    const s = this.badgeS;
    const bx = cx + R * 1.2;
    const by = cy - R * 1.08;
    const r = R * 0.27 * s;
    x.save();
    x.translate(bx, by);
    // Fase 17: quadrado arredondado (ícone Freya), nunca círculo.
    x.beginPath();
    x.roundRect(-r, -r, r * 2, r * 2, r * 0.42);
    x.fillStyle = css(hex(currentTheme().night), 0.94);
    x.fill();
    x.lineWidth = Math.max(1, R * 0.05);
    x.strokeStyle = css(b.color, 0.95);
    x.stroke();
    x.fillStyle = x.strokeStyle = css(b.color);
    x.lineCap = "round";
    x.lineWidth = Math.max(1, r * 0.22);
    const t = clock();
    switch (b.kind) {
      case "dots":
        for (let i = 0; i < 3; i++) {
          const up = Math.max(0, Math.sin(t * 6 - i * 0.9)) * r * 0.25;
          x.beginPath(); x.arc((i - 1) * r * 0.42, -up, r * 0.14, 0, Math.PI * 2); x.fill();
        }
        break;
      case "bang": // ᛁ com ponto
        x.beginPath(); x.moveTo(0, -r * 0.5); x.lineTo(0, r * 0.15); x.stroke();
        x.beginPath(); x.arc(0, r * 0.45, r * 0.12, 0, Math.PI * 2); x.fill();
        break;
      case "question": // ᚹ (wunjo) estilizada
        x.beginPath(); x.moveTo(-r * 0.15, r * 0.5); x.lineTo(-r * 0.15, -r * 0.5); x.lineTo(r * 0.3, -r * 0.15); x.lineTo(-r * 0.15, r * 0.1); x.stroke();
        break;
      case "dot":
        x.beginPath(); x.arc(0, 0, r * 0.32, 0, Math.PI * 2); x.fill();
        break;
      case "orbit": { // pensando: um ponto dá a volta devagar
        const a = t * 2.4;
        x.globalAlpha *= 0.35; x.beginPath(); x.arc(0, 0, r * 0.45, 0, Math.PI * 2); x.stroke(); x.globalAlpha /= 0.35;
        x.beginPath(); x.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.16, 0, Math.PI * 2); x.fill();
        break;
      }
      case "scan": { // procurando: lupa que varre de um lado a outro
        const dx = Math.sin(t * 2.2) * r * 0.18;
        x.beginPath(); x.arc(dx - r * 0.08, -r * 0.08, r * 0.3, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.moveTo(dx + r * 0.14, r * 0.14); x.lineTo(dx + r * 0.42, r * 0.42); x.stroke();
        break;
      }
      case "check": // terminou: visto
        x.beginPath(); x.moveTo(-r * 0.4, 0); x.lineTo(-r * 0.1, r * 0.3); x.lineTo(r * 0.42, -r * 0.32); x.stroke();
        break;
      case "cross": { // erro: ᚾ (naudiz) — traço com a barra torta; pulsa de leve
        const k = 1 + 0.06 * Math.sin(t * 5);
        x.scale(k, k);
        x.beginPath(); x.moveTo(-r * 0.05, -r * 0.5); x.lineTo(-r * 0.05, r * 0.5); x.moveTo(-r * 0.35, -r * 0.18); x.lineTo(r * 0.3, r * 0.18); x.stroke();
        break;
      }
      case "hourglass": { // limite: ampulheta que vira devagar
        x.rotate(Math.floor(t / 2.4) % 2 ? Math.PI : 0);
        x.beginPath(); x.moveTo(-r * 0.32, -r * 0.42); x.lineTo(r * 0.32, -r * 0.42); x.lineTo(-r * 0.32, r * 0.42); x.lineTo(r * 0.32, r * 0.42); x.closePath(); x.stroke();
        break;
      }
      case "arrow": // ᛏ (tiwaz): a seta da atualização
        x.beginPath(); x.moveTo(0, r * 0.5); x.lineTo(0, -r * 0.5); x.moveTo(-r * 0.35, -r * 0.1); x.lineTo(0, -r * 0.5); x.lineTo(r * 0.35, -r * 0.1); x.stroke();
        break;
    }
    x.restore();
  }

  private drawSparks(x: CanvasRenderingContext2D, R: number, cx: number, cy: number) {
    for (const s of this.sparks) {
      if (s.age < 0) continue;
      const k = s.age / s.life;
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      x.save();
      x.globalAlpha = Math.max(0, a);
      x.translate(cx + (s.x + s.vx * s.age) * R, cy + (s.y + s.vy * s.age) * R);
      x.rotate(s.spin + s.age);
      const sz = s.size * R;
      switch (s.kind) {
        case "heart": x.fillStyle = currentTheme().tones.dizzy; heart(x, sz); x.fill(); break;
        case "star": x.fillStyle = currentTheme().accent; star(x, sz, sz * 0.45); x.fill(); break;
        case "spark": x.strokeStyle = currentTheme().aurora[1]; x.lineWidth = sz * 0.25; x.beginPath(); x.moveTo(-sz, 0); x.lineTo(sz, 0); x.moveTo(0, -sz); x.lineTo(0, sz); x.stroke(); break;
        case "sweat": x.fillStyle = currentTheme().tones.working; x.beginPath(); x.ellipse(0, 0, sz * 0.45, sz * 0.7, 0, 0, Math.PI * 2); x.fill(); break;
        case "z": x.rotate(-(s.spin + s.age)); x.fillStyle = currentTheme().tones.sleeping; x.font = `600 ${sz * 2.2}px "Bifrost Runic", "Segoe UI Symbol", sans-serif`; x.fillText(SLEEP_RUNE, 0, 0); break;
      }
      x.restore();
    }
  }
}

/** O nome antigo continua válido: as telas pedem um BotEngine. */
export { RavenEngine as BotEngine };

// ── Formas ─────────────────────────────────────────────────────────────────

function rounded(x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, r: number) {
  const k = Math.max(0, Math.min(r, W / 2, H / 2));
  x.beginPath();
  x.moveTo(X + k, Y);
  x.arcTo(X + W, Y, X + W, Y + H, k);
  x.arcTo(X + W, Y + H, X, Y + H, k);
  x.arcTo(X, Y + H, X, Y, k);
  x.arcTo(X, Y, X + W, Y, k);
  x.closePath();
}
function heart(x: CanvasRenderingContext2D, s: number) {
  x.beginPath();
  x.moveTo(0, s * 0.4);
  x.bezierCurveTo(-s, -s * 0.1, -s * 0.5, -s * 0.9, 0, -s * 0.35);
  x.bezierCurveTo(s * 0.5, -s * 0.9, s, -s * 0.1, 0, s * 0.4);
  x.closePath();
}
function star(x: CanvasRenderingContext2D, ro: number, ri: number) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
}
function eyeShape(x: CanvasRenderingContext2D, shape: EyeShape, w: number, h: number, side: number, open: number) {
  const t = clock();
  const stroke = (lw: number, f: () => void) => { x.lineWidth = lw; x.lineCap = "round"; x.beginPath(); f(); x.stroke(); };
  switch (shape) {
    case "wide": eyeShape(x, "pill", w * 1.16, h * 1.12, side, open); break;
    case "pill": { const hh = Math.max(h * open, w * 0.3); rounded(x, -w / 2, -hh / 2, w, hh, Math.min(w, hh) / 2); x.fill(); break; }
    case "dot": x.beginPath(); x.arc(0, 0, w * 0.45, 0, Math.PI * 2); x.fill(); break;
    case "line": x.rotate(-side * 0.2); rounded(x, -w * 0.78, -w * 0.21, w * 1.56, w * 0.42, w * 0.21); x.fill(); break;
    case "flat": rounded(x, -w * 0.72, -w * 0.2, w * 1.44, w * 0.4, w * 0.2); x.fill(); break;
    case "happy": stroke(w * 0.5, () => x.arc(0, h * 0.18, w * 0.82, Math.PI * 1.12, Math.PI * 1.88)); break;
    case "closed": stroke(w * 0.36, () => x.arc(0, -h * 0.08, w * 0.78, Math.PI * 0.15, Math.PI * 0.85)); break;
    case "spiral": stroke(w * 0.22, () => {
      for (let a = 0; a < 4.4 * Math.PI; a += 0.2) {
        const r = w * 0.06 + a * w * 0.058;
        const aa = a + t * 9 * side;
        if (a === 0) x.moveTo(Math.cos(aa) * r, Math.sin(aa) * r); else x.lineTo(Math.cos(aa) * r, Math.sin(aa) * r);
      }
    }); break;
    case "heart": { const f = x.fillStyle; x.fillStyle = currentTheme().tones.dizzy; heart(x, w * 1.2); x.fill(); x.fillStyle = f; break; }
    case "star": { const f = x.fillStyle; x.fillStyle = currentTheme().accent; x.rotate(t * 1.5 * side); star(x, w * 1.05, w * 0.46); x.fill(); x.fillStyle = f; break; }
    case "tired": rounded(x, -w / 2, -h * 0.02, w, h * 0.38, w / 2); x.fill(); break;
    case "wink":
      if (side < 0) stroke(w * 0.36, () => x.arc(0, -h * 0.08, w * 0.78, Math.PI * 0.15, Math.PI * 0.85));
      else eyeShape(x, "pill", w, h, side, open);
      break;
    case "cup": stroke(w * 0.42, () => x.arc(0, -h * 0.15, w * 0.7, Math.PI * 0.1, Math.PI * 0.9)); break;
  }
}
/** Ponto da borda de um retângulo arredondado (W×H meias-medidas, canto r) na direção (c, s). */
function boxPoint(c: number, s: number, W: number, H: number, r: number): { x: number; y: number } {
  // Interseção do raio com o retângulo; cantos arredondados por projeção no círculo do canto.
  const tx = Math.abs(c) > 1e-6 ? W / Math.abs(c) : Infinity;
  const ty = Math.abs(s) > 1e-6 ? H / Math.abs(s) : Infinity;
  const t = Math.min(tx, ty);
  let px = c * t;
  let py = s * t;
  const kx = Math.sign(px) * (W - r);
  const ky = Math.sign(py) * (H - r);
  if (Math.abs(px) > W - r && Math.abs(py) > H - r) {
    const dx = px - kx;
    const dy = py - ky;
    const d = Math.hypot(dx, dy) || 1;
    px = kx + (dx / d) * r;
    py = ky + (dy / d) * r;
  }
  return { x: px, y: py };
}

// Os ícones do guarda-roupa desenham o mesmo corvo do motor, já vestido.
setRavenPainter((c, size, outfit) => {
  const e = new RavenEngine();
  e.outfit = outfit;
  e.outfitPresence = 1;
  e.update(0);
  c.save();
  c.translate(0, size * 0.06);
  e.draw(c, size, size);
  c.restore();
});

/**
 * Fase 18: a marca do tema, por cima da cabeça (coroa, brasa, geada, folha, elmo, raio).
 * Tudo simétrico em torno de x = 60, entre a testa e os olhos — nunca toca olhos/bico.
 */
function drawMarks(x: CanvasRenderingContext2D, L: RavenLook, muninn: boolean, outfit: string, t: number) {
  if (outfit === "helm" || outfit === "starCrown") return;
  x.save();
  x.lineJoin = "round"; x.lineCap = "round";
  for (const m of L.marks) {
    switch (m) {
      case "crown": {
        const y = muninn ? 31.5 : 28;
        x.fillStyle = L.markColor; x.strokeStyle = "rgba(0,0,0,0.25)"; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(51, y + 5); x.lineTo(51, y); x.lineTo(54.5, y + 2.6); x.lineTo(60, y - 2.4); x.lineTo(65.5, y + 2.6); x.lineTo(69, y); x.lineTo(69, y + 5);
        x.quadraticCurveTo(60, y + 6.4, 51, y + 5); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = "rgba(255,255,255,0.7)"; x.beginPath(); x.arc(60, y + 2.6, 0.9, 0, Math.PI * 2); x.fill();
        break;
      }
      case "ember": {
        // duas brasas nas maçãs do rosto, que tremulam de leve
        const k = 0.75 + 0.25 * Math.sin(t * 6.3);
        const g = x.createRadialGradient(60, 47, 0, 60, 47, 5);
        g.addColorStop(0, L.markColor); g.addColorStop(1, "rgba(255,120,40,0)");
        x.globalAlpha *= k; x.fillStyle = g;
        x.beginPath(); x.moveTo(60, 41); x.bezierCurveTo(63.2, 44, 63.4, 48.6, 60, 50.4); x.bezierCurveTo(56.6, 48.6, 56.8, 44, 60, 41); x.fill();
        x.globalAlpha /= k;
        break;
      }
      case "frost": {
        x.strokeStyle = L.markColor; x.lineWidth = 1.1; x.globalAlpha *= 0.9;
        const cx = 60, cy = 44, r = 3.6;
        for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; x.beginPath(); x.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.stroke(); }
        x.globalAlpha /= 0.9;
        break;
      }
      case "leaf": {
        x.fillStyle = L.markColor; x.globalAlpha *= 0.92;
        x.beginPath(); x.moveTo(60, 40.5); x.bezierCurveTo(63.6, 42.6, 63.6, 47, 60, 49.5); x.bezierCurveTo(56.4, 47, 56.4, 42.6, 60, 40.5); x.fill();
        x.strokeStyle = "rgba(0,0,0,0.25)"; x.lineWidth = 0.6; x.beginPath(); x.moveTo(60, 41.6); x.lineTo(60, 48.6); x.stroke();
        x.globalAlpha /= 0.92;
        break;
      }
      case "helm": {
        // faixa do elmo na testa + protetor de nariz entre os olhos (acima do bico)
        x.fillStyle = L.markColor; x.strokeStyle = "rgba(0,0,0,0.3)"; x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(44, 38); x.quadraticCurveTo(60, 31, 76, 38); x.lineTo(75, 41.4); x.quadraticCurveTo(60, 35, 45, 41.4); x.closePath(); x.fill(); x.stroke();
        x.beginPath(); x.roundRect(58.6, 37, 2.8, 13, 1.4); x.fill(); x.stroke();
        break;
      }
      case "storm": {
        const k = 0.7 + 0.3 * Math.max(0, Math.sin(t * 2.1));
        x.fillStyle = L.markColor; x.globalAlpha *= k;
        x.beginPath(); x.moveTo(61.4, 39.5); x.lineTo(57.2, 45.6); x.lineTo(60, 45.6); x.lineTo(58.6, 50.2); x.lineTo(62.8, 44); x.lineTo(60, 44); x.closePath(); x.fill();
        x.globalAlpha /= k;
        break;
      }
      default: break;
    }
  }
  x.restore();
}
