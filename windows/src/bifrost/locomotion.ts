// Locomoção dos corvos (fase 13): bater de asas, andar aos pulinhos e voar.
// Tudo é uma pose pura em função do tempo — o motor (raven.ts) só aplica a pose
// como transformações no desenho, e as pranchas/testes leem a mesma função quadro
// a quadro. Unidades: as do viewBox 120 do corvo; ângulos em radianos, positivos
// = asa para fora (nunca para dentro do rosto). Cada corvo tem seu próprio ritmo:
// o Muninn é um pouco mais lento e mais largo (memória pesa), o Huginn mais nervoso.

import { Curves } from "./motion";

export type Gait = "none" | "flap" | "walk" | "takeoff" | "fly" | "glide" | "land";

export interface Pose {
  /** Ângulo da asa (rad, para fora). */
  wing: number;
  /** Comprimento da asa a partir do ombro (1 = recolhida; abre até 1.12). */
  wingLen: number;
  /** Atraso da pena de trás em relação à asa (rad, positivo = mais para fora): o leque das penas. */
  feather: number;
  /** Corpo: subida (negativo = para cima), amasso e inclinação. */
  dy: number; sx: number; sy: number; tilt: number;
  /** Quanto cada pé sobe além do corpo; `tuck` recolhe os pés no voo (0–1). */
  footL: number; footR: number; tuck: number;
  /** Atraso do topete (rad) e o balanço da cabeça (rosto, unidades). */
  crest: number; bob: number;
}

export const REST: Pose = { wing: 0, wingLen: 1, feather: 0, dy: 0, sx: 1, sy: 1, tilt: 0, footL: 0, footR: 0, tuck: 0, crest: 0, bob: 0 };

export interface Rhythm {
  /** Um ciclo de asa no chão (agitação, alerta). */
  flap: number;
  /** Um ciclo de asa no voo. */
  flight: number;
  /** Um pulinho do andar. */
  hop: number;
  takeoff: number;
  land: number;
  /** Amplitude extra (Muninn abre mais). */
  reach: number;
}

export const RHYTHM: Record<"huginn" | "muninn", Rhythm> = {
  // Fase 16: ritmo mais calmo (Apple-like) — batidas e pulinhos mais lentos.
  huginn: { flap: 0.4, flight: 0.3, hop: 0.6, takeoff: 0.44, land: 0.52, reach: 0.92 },
  muninn: { flap: 0.46, flight: 0.35, hop: 0.68, takeoff: 0.5, land: 0.58, reach: 0.96 },
};

/** Limite de segurança: além disto a ponta da asa chegaria perto do elmo e da coroa. */
export const WING_MAX = 1.9;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Um ciclo de asa: descida rápida (42 % do ciclo, desacelera no fim como um
 * remo — curva "fiorde") e subida mais lenta e relaxada (curva "maré"). `low` é a
 * asa embaixo, `high` em cima. Devolve também a sustentação (0–1, pico no meio
 * da descida), que levanta o corpo.
 */
export function flapCycle(phase: number, low: number, high: number): { angle: number; lift: number; down: boolean } {
  const p = ((phase % 1) + 1) % 1;
  const D = 0.42;
  if (p < D) {
    const q = p / D;
    return { angle: lerp(high, low, Curves.fjord(q)), lift: Math.sin(Math.PI * q), down: true };
  }
  const q = (p - D) / (1 - D);
  return { angle: lerp(low, high, Curves.tide(q)), lift: 0, down: false };
}

/** A pose de uma marcha em `t` segundos desde que ela começou. */
/** Fase 16: quanto da amplitude original sobra (corpo, quique, inclinação). */
export const CALM = 0.55;

export function pose(gait: Gait, t: number, r: Rhythm = RHYTHM.huginn, travelTilt = 0): Pose {
  const p = rawPose(gait, t, r, travelTilt);
  if (p === REST) return p;
  const k = CALM;
  const ground = gait === "walk" || gait === "flap";
  return {
    ...p,
    dy: ground ? p.dy * k : p.dy, sx: 1 + (p.sx - 1) * k, sy: 1 + (p.sy - 1) * k, bob: p.bob * k,
    tilt: ground ? p.tilt * k : p.tilt, crest: p.crest * k, footL: p.footL * k, footR: p.footR * k,
    wing: ground ? p.wing * 0.8 : p.wing,
  };
}

function rawPose(gait: Gait, t: number, r: Rhythm, travelTilt: number): Pose {
  switch (gait) {
    case "none": return REST;
    case "flap": {
      // Agitação no chão: asas sobem até ~80°, o corpo sobe um pouco a cada descida.
      const f = flapCycle(t / r.flap, 0.08, 1.38 * r.reach);
      const lag = flapCycle(t / r.flap - 0.1, 0.08, 1.38 * r.reach);
      return {
        ...REST, wing: f.angle, wingLen: 1 + 0.08 * smooth(f.angle / 1.4), feather: (lag.angle - f.angle) * 0.6 + 0.1 * smooth(f.angle),
        dy: -2.2 * f.lift, sy: 1 + 0.025 * f.lift, sx: 1 - 0.015 * f.lift,
        crest: -(lag.angle - 0.7) * 0.12, bob: 0.8 * f.lift,
      };
    }
    case "walk": {
      // Pulinho do corvo: agacha (0–18 %), sai do chão esticando (18–62 %),
      // pousa amassando (62–80 %) e se assenta. O pé da frente alterna a cada pulo.
      const n = t / r.hop;
      const k = Math.floor(n);
      const p = n - k;
      const lead = k % 2 === 0 ? 1 : -1;
      let dy = 0, sx = 1, sy = 1, wing = 0.06, bob = 0;
      if (p < 0.18) { const q = smooth(p / 0.18); sy = 1 - 0.07 * q; sx = 1 + 0.05 * q; bob = 1.2 * q; }
      else if (p < 0.62) {
        const q = (p - 0.18) / 0.44;
        dy = -6.5 * Math.sin(Math.PI * q);
        const s = Math.sin(Math.PI * Math.min(1, q * 1.6));
        sy = 1 + 0.05 * s; sx = 1 - 0.035 * s; wing = 0.06 + 0.22 * Math.sin(Math.PI * q); bob = -1.4 * Math.sin(Math.PI * q);
      } else if (p < 0.8) { const q = Math.sin(Math.PI * (p - 0.62) / 0.18); sy = 1 - 0.065 * q; sx = 1 + 0.05 * q; bob = 1.6 * q; }
      else { const q = (p - 0.8) / 0.2; bob = 0.5 * (1 - q); }
      const air = p >= 0.18 && p < 0.62 ? Math.sin(Math.PI * (p - 0.18) / 0.44) : 0;
      return {
        ...REST, wing, feather: 0.04, dy, sx, sy, tilt: 0.05 * lead * air,
        footL: lead < 0 ? 2.2 * air : 0.6 * air, footR: lead > 0 ? 2.2 * air : 0.6 * air,
        crest: -0.12 * air + 0.1 * (bob > 1 ? 1 : 0), bob,
      };
    }
    case "takeoff": {
      // Agacha com as asas armadas, depois pula batendo forte.
      const u = clamp01(t / r.takeoff);
      if (u < 0.42) {
        const q = smooth(u / 0.42);
        return { ...REST, wing: 0.1 + 0.5 * q, wingLen: 1 + 0.04 * q, feather: 0.08 * q, sy: 1 - 0.12 * q, sx: 1 + 0.08 * q, bob: 1.6 * q, crest: 0.1 * q };
      }
      const q = (u - 0.42) / 0.58;
      const f = flapCycle(q * 1.15 + 0.6, 0.45, 1.75 * r.reach);
      return {
        ...REST, wing: f.angle, wingLen: 1.1, feather: 0.16, dy: -12 * Curves.fjord(q), sy: 1 + 0.08 * Math.sin(Math.PI * Math.min(1, q * 2)), sx: 1 - 0.05 * Math.sin(Math.PI * Math.min(1, q * 2)),
        tilt: travelTilt * smooth(q), tuck: smooth(q), crest: -0.25 * Math.sin(Math.PI * q), bob: -1,
      };
    }
    case "fly": {
      const f = flapCycle(t / r.flight, 0.45, 1.8 * r.reach);
      const lag = flapCycle(t / r.flight - 0.12, 0.45, 1.8 * r.reach);
      return {
        ...REST, wing: f.angle, wingLen: 1.1 + 0.02 * f.lift, feather: (lag.angle - f.angle) * 0.55 + 0.14,
        dy: -12 - 2.4 * f.lift + 1.2, sy: 1 + 0.02 * f.lift, tilt: travelTilt, tuck: 1,
        crest: -0.22 - 0.08 * f.lift, bob: 0.6 * f.lift,
      };
    }
    case "glide": {
      // Planando: asas abertas quase na horizontal, só um tremor de penas.
      const w = 1.48 * r.reach + 0.04 * Math.sin(t * 5.2);
      return { ...REST, wing: w, wingLen: 1.12, feather: 0.18, dy: -12 + 1.2 * Math.sin(t * 2.1), tilt: travelTilt, tuck: 1, crest: -0.3, bob: 0 };
    }
    case "land": {
      // Freio: asas para cima e corpo para trás, pés descem; toque com amasso e mola.
      const u = clamp01(t / r.land);
      if (u < 0.5) {
        const q = smooth(u / 0.5);
        return {
          ...REST, wing: lerp(1.5, 1.8 * r.reach, q), wingLen: 1.12, feather: 0.2, dy: lerp(-12, -2.5, Curves.fjord(u / 0.5)),
          tilt: lerp(travelTilt, -0.12, q), tuck: 1 - q, crest: -0.3 + 0.2 * q,
        };
      }
      const q = (u - 0.5) / 0.5;
      const squash = Math.sin(Math.PI * Math.min(1, q * 1.8)) * (1 - q * 0.4);
      const settle = Curves.raven(q);
      return {
        ...REST, wing: Math.max(0, lerp(1.8 * r.reach, 0, settle)), wingLen: lerp(1.12, 1, clamp01(settle)), feather: lerp(0.2, 0, clamp01(settle)), dy: lerp(-2.5, 0, Curves.fjord(Math.min(1, q * 3))),
        sy: 1 - 0.12 * squash, sx: 1 + 0.09 * squash, tilt: lerp(-0.12, 0, clamp01(settle)), crest: 0.18 * squash, bob: 1.8 * squash,
      };
    }
  }
}

/** Duração das marchas que acabam sozinhas (s); as outras repetem. */
export function gaitLength(g: Gait, r: Rhythm): number | null {
  return g === "takeoff" ? r.takeoff : g === "land" ? r.land : null;
}

/** Mistura duas poses (a troca de marcha nunca "pula"). */
export function blend(a: Pose, b: Pose, t: number): Pose {
  const k = clamp01(t);
  const o = { ...a };
  for (const key of Object.keys(a) as (keyof Pose)[]) o[key] = lerp(a[key], b[key], k);
  return o;
}
