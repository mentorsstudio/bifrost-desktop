// Vida dos corvos (fase 22): um repertório discreto de gestos e estados por cima
// do RavenEngine. Só mexe nas propriedades que o motor já anima por transform
// (yaw, tilt, oy, sy/sx, roll, wingBeat, beak); nada de layout. Respeita
// movimento reduzido e o nível escolhido em Ajustes → Temas ("Vida dos corvos").
import { reducedMotion } from "./motion";
import type { RavenEngine } from "./raven";

export type LifeLevel = "off" | "calmo" | "normal" | "animado";
export type LifeActivity = "thinking" | "listening" | "speaking" | null;
export type IdleAct = "look" | "tilt" | "preen" | "hop" | "walk" | "fly";
export type LifeSignal =
  | { kind: "thinking" | "listening" | "speaking" | "done" }
  | { kind: "chunk" }
  | { kind: "level"; value: number }
  | { kind: "success" | "error" | "activity" };

export const LIFE_KEY = "bifrost.ravenLife";
export const LIFE_EVENT = "raven-life";
export const LIFE_LEVELS: readonly LifeLevel[] = ["off", "calmo", "normal", "animado"];

/** Intervalo médio entre gestos (s) e minutos até cochilar, por nível. */
export const LIFE_TUNING: Record<Exclude<LifeLevel, "off">, { gap: number; dozeMin: number; amp: number }> = {
  calmo: { gap: 14, dozeMin: 4, amp: 0.7 },
  normal: { gap: 8, dozeMin: 3, amp: 1 },
  animado: { gap: 4.5, dozeMin: 6, amp: 1.25 },
};

export function readLevel(): LifeLevel {
  try {
    const v = localStorage.getItem(LIFE_KEY) as LifeLevel | null;
    return v && LIFE_LEVELS.includes(v) ? v : "normal";
  } catch { return "normal"; }
}
export function saveLevel(l: LifeLevel) {
  try { localStorage.setItem(LIFE_KEY, l); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new CustomEvent(LIFE_EVENT, { detail: { kind: "activity" } }));
}
/** O nível que vale agora: movimento reduzido desliga tudo. */
export function effectiveLevel(l: LifeLevel = readLevel()): LifeLevel {
  return reducedMotion() ? "off" : l;
}

/** O próximo gesto ocioso. Voo só no corvo da área de trabalho, e raro. */
export function pickIdle(r: number, desktop: boolean): IdleAct {
  const table: [IdleAct, number][] = [["look", 30], ["tilt", 22], ["preen", 16], ["hop", 14], ["walk", desktop ? 14 : 0], ["fly", desktop ? 4 : 0]];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [a, w] of table) { if ((x -= w) < 0) return a; }
  return "look";
}
/** Espera até o próximo gesto: ±50 % do intervalo do nível. */
export function nextGap(level: LifeLevel, r: number): number {
  if (level === "off") return Infinity;
  return LIFE_TUNING[level].gap * (0.5 + r);
}
/** Já é hora de cochilar? */
export function shouldDoze(level: LifeLevel, idleSeconds: number): boolean {
  return level !== "off" && idleSeconds >= LIFE_TUNING[level].dozeMin * 60;
}
/** Bico ao falar: abre a cada pedaço do streaming e fecha sozinho em ~120 ms. */
export function beakAfter(beak: number, dt: number, chunk: boolean): number {
  return chunk ? 1 : Math.max(0, beak - dt / 0.12);
}

const fj = (t: number) => 1 - Math.pow(1 - t, 3);
const sw = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

export interface LifeHost {
  /** Corvo da área de trabalho: pode andar/voar dentro da própria janela. */
  desktop?: boolean;
  /** O dono já tem o próprio sono (ex.: desktop): a vida não cochila por ele. */
  ownSleep?: boolean;
  /** Gestos ociosos (a pílula mini já tem o próprio repertório). */
  idle?: boolean;
  /** Acorda o laço de quadros do dono (ele dorme quando nada se mexe). */
  wake?: () => void;
}

export class RavenLife {
  level: LifeLevel = effectiveLevel();
  activity: LifeActivity = null;
  dozing = false;
  private nextAt: number;
  private lastActive = performance.now();
  private chunk = false;
  private mic = 0;
  private dozeZ = 0;
  private wasState: string | null = null;
  private seenState = "idle";

  private e: RavenEngine;
  private host: LifeHost;
  constructor(e: RavenEngine, host: LifeHost = {}) {
    this.e = e;
    this.host = host;
    this.nextAt = performance.now() / 1000 + nextGap(this.level, Math.random());
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener(LIFE_EVENT, (ev) => this.signal((ev as CustomEvent<LifeSignal>).detail));
      window.addEventListener("storage", (ev) => { if (ev.key === LIFE_KEY) this.level = effectiveLevel(); });
    }
  }

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Agenda um quadro para quando o próximo gesto vencer (o laço do dono pode estar parado). */
  private arm() {
    if (this.timer || !this.host.wake || !Number.isFinite(this.nextAt)) return;
    const ms = Math.max(50, (this.nextAt - performance.now() / 1000) * 1000);
    this.timer = setTimeout(() => { this.timer = null; this.host.wake?.(); }, Math.min(ms, 60_000));
  }

  get amp() { return this.level === "off" ? 0 : LIFE_TUNING[this.level].amp; }

  signal(s: LifeSignal) {
    this.level = effectiveLevel();
    if (s.kind !== "level") this.poke();
    this.host.wake?.();
    switch (s.kind) {
      case "thinking": case "listening": case "speaking": this.setActivity(s.kind); break;
      case "done": this.setActivity(null); break;
      case "chunk": this.chunk = true; if (this.activity !== "speaking") this.setActivity("speaking"); break;
      case "level": this.mic = Math.max(0, Math.min(1, s.value)); break;
      case "success": this.success(); break;
      case "error": this.error(); break;
    }
  }

  /** Qualquer atividade: zera o relógio de ócio e acorda. */
  poke() {
    this.lastActive = performance.now();
    if (this.dozing) this.wake();
  }

  setActivity(a: LifeActivity) {
    if (a === this.activity) return;
    const e = this.e;
    if (a === "thinking" && e.state === "idle") { this.wasState = "idle"; e.setState("thinking"); }
    if (a !== "thinking" && this.wasState && e.state === "thinking") { e.setState("idle"); this.wasState = null; }
    this.activity = a;
    if (this.level === "off") return;
    if (a === "listening") e.anim("pitch", [[-0.16, 220, fj]]);
    if (a === "thinking") e.anim("tilt", [[0.14 * this.amp, 320, fj]]);
    if (a === null) { e.anim("tilt", [[0, 260, sw]]); e.beak = 0; }
  }

  success() {
    if (this.level === "off") return;
    this.e.wingBeat = Math.min(1, 0.75 * this.amp + 0.2);
    this.e.anim("oy", [[-0.12 * this.amp, 140, fj], [0, 220, sw]]);
  }
  error() {
    if (this.level === "off") return;
    const a = 0.32 * this.amp;
    this.e.anim("yaw", [[-a, 60, fj], [a, 90, sw], [-a * 0.6, 80, sw], [a * 0.3, 70, sw], [0, 120, fj]]);
    this.e.anim("sx", [[1.08, 70, fj], [0.96, 90, sw], [1.03, 90, sw], [1, 140, fj]]);
  }
  hover() {
    if (this.level === "off") return;
    this.poke();
    this.e.anim("tilt", [[-0.1 * this.amp, 160, fj], [0, 260, sw]]);
  }
  click() {
    if (this.level === "off") return;
    this.poke();
    this.e.anim("oy", [[-0.09 * this.amp, 110, fj], [0, 200, sw]]);
    this.e.anim("sy", [[0.92, 80, fj], [1.05, 120, sw], [1, 160, fj]]);
  }

  private wake() {
    this.dozing = false;
    if (this.e.state === "sleeping") this.e.setState("idle");
    this.e.anim("pitch", [[0, 320, fj]]);
  }

  /** Chamado a cada quadro pelo dono do corvo, depois de engine.update(). */
  tick(dt: number) {
    const e = this.e;
    const n = performance.now() / 1000;
    if (this.level === "off") { e.beak = 0; return; }
    // Sessões de agente: o fim feliz bate as asas; o erro arrepia as penas.
    if (e.state !== this.seenState) {
      if (e.state === "finished") this.success();
      if (e.state === "error") this.error();
      if (e.state !== "sleeping" && e.state !== "idle") this.poke();
      this.seenState = e.state;
    }
    // Falar: o bico segue os pedaços do streaming.
    e.beak = this.activity === "speaking" ? beakAfter(e.beak, dt, this.chunk) : Math.max(0, e.beak - dt / 0.12);
    this.chunk = false;
    // Ouvir: um pulso leve no ritmo do microfone.
    if (this.activity === "listening") { const p = 1 + this.mic * 0.05 * this.amp; e.sy = Math.max(e.sy, p); }
    // Cochilo (corvos sem sono próprio: ilha, pílula, chat).
    if (!this.host.ownSleep && this.host.idle !== false && this.activity === null && e.state === "idle"
      && shouldDoze(this.level, (performance.now() - this.lastActive) / 1000)) {
      this.dozing = true;
      e.setState("sleeping");
    }
    if (this.dozing) {
      if ((this.dozeZ += dt) > 6) { this.dozeZ = 0; }
      return;
    }
    if (this.host.idle === false) return;
    if (this.activity || e.state !== "idle" || e.moving) { this.nextAt = Math.max(this.nextAt, n + 2); return; }
    if (n < this.nextAt) { this.arm(); return; }
    this.nextAt = n + nextGap(this.level, Math.random());
    this.play(pickIdle(Math.random(), Boolean(this.host.desktop)));
    this.arm();
  }

  play(act: IdleAct) {
    const e = this.e;
    const a = this.amp;
    switch (act) {
      case "look": { const d = Math.random() < 0.5 ? -1 : 1; e.anim("yaw", [[0.5 * d * a, 260, fj], [0.5 * d * a, 700, sw], [0, 380, sw]]); break; }
      case "tilt": { const d = Math.random() < 0.5 ? -1 : 1; e.anim("tilt", [[0.16 * d * a, 240, fj], [0.16 * d * a, 620, sw], [0, 320, sw]]); break; }
      case "preen":
        e.anim("tilt", [[-0.2 * a, 240, fj], [-0.24 * a, 360, sw], [0, 300, sw]]);
        e.anim("pitch", [[0.22, 240, fj], [0.18, 360, sw], [0, 300, sw]]);
        e.wingBeat = 0.25 * a;
        break;
      case "hop":
        e.anim("sy", [[0.9, 90, fj], [1.06, 130, sw], [1, 160, fj]]);
        e.anim("oy", [[-0.08 * a, 150, fj], [0, 200, sw]]);
        break;
      case "walk": e.setGait("walk", { face: Math.random() < 0.5 ? -1 : 1, seconds: 0.9 }); break;
      // Voo curto dentro da própria janela: decola, plana um instante e pousa
      // no mesmo lugar (a pose de voo cabe no quadro: ver QA "raven-clip").
      case "fly":
        e.takeOff(Math.random() < 0.5 ? -1 : 1, 0.12);
        setTimeout(() => e.land(), 1100);
        break;
    }
  }
}

/** Avisa os corvos (esta janela e as outras, via evento do Tauri). */
export function ravenSignal(s: LifeSignal) {
  if (typeof window === "undefined") return;
  // No Tauri o evento volta para esta janela também (listenRavenSignals).
  if (!("__TAURI_INTERNALS__" in window)) { window.dispatchEvent(new CustomEvent(LIFE_EVENT, { detail: s })); return; }
  void import("@tauri-apps/api/event").then(({ emit }) => emit(LIFE_EVENT, s)).catch(() => {
    window.dispatchEvent(new CustomEvent(LIFE_EVENT, { detail: s }));
  });
}
/** Recebe os avisos das outras janelas. */
let listening = false;
export function listenRavenSignals() {
  if (listening || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  listening = true;
  void import("@tauri-apps/api/event").then(({ listen }) =>
    listen<LifeSignal>(LIFE_EVENT, (ev) => window.dispatchEvent(new CustomEvent(LIFE_EVENT, { detail: ev.payload }))),
  ).catch(() => {});
}
