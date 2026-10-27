// Rig 2D dos novos Huginn (preto) e Muninn (prata), fiel à referência
// /workspace/bifrost-ref/corvos-novos-ref.png: contorno escuro grosso, adesivo
// cinza por fora, topete (espetado no Huginn, fofo no Muninn), olhos grandes,
// bico cinza, medalhão de bronze no cordão, asas escuras e pés cinza.
// Camadas: pés · asas (peças articuladas no ombro) · corpo · cabeça · topete ·
// cordão/medalhão · olhos (branco, pupila, pálpebra) · sobrancelhas · bico
// (inferior com língua, superior). Coordenadas: caixa de 100 unidades centrada
// em (0,0), pés em y≈+47. Só transforms e Path2D — nada de 3D nem detalhe extra.

export type Who = "huginn" | "muninn";

export interface RigPose {
  /** Respiração: 0…1 sobe o corpo um fio, pés plantados. */
  breath: number;
  /** Inclinação da cabeça (rad). */
  tilt: number;
  /** Pupilas: −1…1 (esq./dir., cima/baixo). */
  px: number; py: number;
  /** Pálpebra: 0 aberto, 1 fechado. */
  lid: number;
  /** Sobrancelhas erguidas (0…1), esquerda e direita. */
  browL: number; browR: number;
  /** Bico aberto 0…1. */
  beak: number;
  /** Asas: ângulo para fora no ombro (rad, 0 = dobrada). */
  wingL: number; wingR: number;
  /** Corpo inteiro: deslocamento vertical (pulinho) em unidades. */
  lift: number;
}

export const REST_POSE: RigPose = { breath: 0, tilt: 0, px: 0, py: 0, lid: 0, browL: 0, browR: 0, beak: 0, wingL: 0, wingR: 0, lift: 0 };

export interface RigPalette {
  body: string; head: string; crest: string; wing: string; wingDark: string;
  beak: string; beakDark: string; feet: string; ink: string; sticker: string;
  medal: string; medalHi: string; cord: string; tongue: string; mouth: string; eye: string; pupil: string;
}

/** As cores da referência. */
export const REF_PALETTE: Record<Who, RigPalette> = {
  huginn: {
    body: "#232328", head: "#26262C", crest: "#2E3E6E", wing: "#353A50", wingDark: "#262A3A",
    beak: "#6E717C", beakDark: "#50535D", feet: "#4A4B55", ink: "#121217", sticker: "#C9CBD2",
    medal: "#B47A45", medalHi: "#E0AE78", cord: "#121217", tongue: "#E07A86", mouth: "#3A1E24", eye: "#FFFFFF", pupil: "#121217",
  },
  muninn: {
    body: "#BDBEC4", head: "#C4C5CB", crest: "#D7D8DD", wing: "#3B3C44", wingDark: "#2C2D33",
    beak: "#5F626B", beakDark: "#474A52", feet: "#4A4B55", ink: "#17171C", sticker: "#C9CBD2",
    medal: "#B47A45", medalHi: "#E0AE78", cord: "#17171C", tongue: "#E07A86", mouth: "#3A1E24", eye: "#FFFFFF", pupil: "#17171C",
  },
};

// ── Formas (Path2D em unidades da caixa) ─────────────────────────────────────
const P = (d: string) => (typeof Path2D === "function" ? new Path2D(d) : (null as unknown as Path2D));
const BODY = "M0 -4 C20 -4 29 12 28 27 C27 40 16 46 0 46 C-16 46 -27 40 -28 27 C-29 12 -20 -4 0 -4Z";
const HEAD = "M0 -40 C15 -40 25 -30 25 -17 C25 -10 27 -8 24 -4 C21 0 14 3 0 3 C-14 3 -21 0 -24 -4 C-27 -8 -25 -10 -25 -17 C-25 -30 -15 -40 0 -40Z";
const CREST: Record<Who, string> = {
  huginn: "M-13 -35 C-17 -42 -21 -45 -26 -46 C-19 -49 -13 -46 -10 -42 C-11 -50 -9 -56 -4 -60 C-3 -53 -1 -48 1 -44 C3 -51 8 -55 14 -56 C11 -50 10 -45 9 -41 C14 -45 19 -46 23 -44 C18 -40 15 -36 13 -33Z",
  muninn: "M-14 -34 C-19 -38 -22 -43 -21 -48 C-17 -44 -13 -43 -10 -43 C-12 -49 -10 -55 -5 -58 C-4 -52 -1 -48 2 -46 C3 -52 8 -56 13 -55 C10 -51 10 -47 11 -44 C16 -48 22 -48 25 -45 C20 -42 17 -38 14 -33Z",
};
// Asa esquerda, com o pivô no ombro em (0,0); a direita é o espelho.
const WING = "M4 -3 C-6 -2 -15 8 -18 21 L-26 31 L-17 30 L-18 38 L-10 32 L-8 39 L-3 31 C2 24 7 12 4 -3Z";
const BEAK_UP: Record<Who, string> = {
  huginn: "M-8 -11 C-3 -15 7 -15 11 -10 C15 -5 14 3 9 8 C8 3 4 -1 -1 -2 C-5 -3 -8 -6 -8 -11Z",
  muninn: "M-10 -10 C-5 -14 6 -14 10 -10 C13 -7 12 -3 9 -2 C4 -4 -3 -4 -11 -4 C-12 -6 -12 -8 -10 -10Z",
};
const BEAK_LO = "M-9 -4 C-3 -3 4 -3 9 -2 C9 4 4 8 -1 8 C-5 8 -9 2 -9 -4Z";

const PATHS = new Map<string, Path2D>();
const path = (d: string) => { let p = PATHS.get(d); if (!p) { p = P(d); PATHS.set(d, p); } return p; };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));
/** Sobe de 0 a 1 entre a e b, segura, e volta entre c e d. */
const hold = (t: number, a: number, b: number, c: number, d: number) => (t < c ? seg(t, a, b) : 1 - seg(t, c, d));
const blinkAt = (t: number, a: number, b: number) => { if (t < a || t > b) return 0; const u = (t - a) / (b - a); return Math.sin(Math.PI * u) ** 0.6; };

/** Os laços-assinatura de 6 s (pedido do Paulo), contínuos: t ∈ [0, 6). */
export const LOOP_S = 6;
export function signature(who: Who, t: number): RigPose {
  t = ((t % LOOP_S) + LOOP_S) % LOOP_S;
  // Respiração quase imperceptível, ciclo inteiro no laço (sem emenda).
  const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 3);
  if (who === "huginn") {
    const glance = hold(t, 2, 3, 5, 6);
    const look = hold(t, 3, 4, 5, 6);
    return { ...REST_POSE, breath, lid: blinkAt(t, 1.5, 1.8), px: 0.75 * glance, py: -0.1 * glance,
      tilt: 0.07 * look, browR: look, browL: -0.25 * look };
  }
  const tilt = hold(t, 1.5, 2.5, 5, 6);
  const up = t < 2.5 ? 0 : t < 3 ? seg(t, 2.5, 3) : t < 4 ? 1 : 1 - seg(t, 4, 5);
  const wave = t >= 3 && t < 4 ? Math.sin(((t - 3) / 1) * 2 * Math.PI * 2) * 0.22 * Math.sin(Math.PI * (t - 3)) : 0;
  return { ...REST_POSE, breath, lid: blinkAt(t, 1, 1.3), tilt: -0.09 * tilt, px: -0.15 * tilt, py: -0.2 * tilt,
    wingR: up * 2.0 + wave, beak: 0.55 + 0.1 * tilt, browL: 0.35 * tilt, browR: 0.35 * tilt };
}

/** Desenha o corvo com centro em (0,0) e escala `s` px por unidade. `lod` simplifica abaixo de ~40 px. */
export function drawRig(x: CanvasRenderingContext2D, who: Who, pose: RigPose, pal: RigPalette, s: number, opts: { alpha?: number; face?: number } = {}) {
  const px = s * 100;
  const lod = px < 44;
  const ink = Math.max(lod ? 2.6 : 2.2, (lod ? 1.3 : 1.05) / s * 0.9);
  const inkW = Math.min(ink, lod ? 3.6 : 2.6);
  x.save();
  if (opts.alpha !== undefined) x.globalAlpha *= opts.alpha;
  x.scale(s, s);
  x.lineJoin = "round"; x.lineCap = "round";
  const rise = -pose.breath * 0.9 - pose.lift;
  const fillInk = (p: Path2D, fill: string, w = inkW) => { x.fillStyle = fill; x.fill(p); x.strokeStyle = pal.ink; x.lineWidth = w; x.stroke(p); };

  // Pés (plantados: não sobem com a respiração).
  const foot = (fx: number) => {
    const toes = [[-4.5, 3.5], [0, 4.6], [4.5, 3.5]];
    const draw = (w: number, c: string) => {
      x.strokeStyle = c; x.lineWidth = w;
      x.beginPath(); x.moveTo(fx, 40 + rise * 0.3 - pose.lift); x.lineTo(fx, 46);
      for (const [dx, dy] of toes) { x.moveTo(fx, 46); x.lineTo(fx + dx, 46 + dy); }
      x.stroke();
    };
    return draw;
  };
  const feet = [foot(-11), foot(11)];
  // Adesivo: uma passada larga e clara por trás de tudo.
  const head = path(HEAD), body = path(BODY), crest = path(CREST[who]), wing = path(WING);
  const headT = () => { x.translate(0, rise * 1.1 - 2); x.translate(0, -4); x.rotate(pose.tilt); x.scale(1.08, 1.08); x.translate(0, 4); };
  const wingT = (side: -1 | 1, a: number) => { x.translate(side * 20, 5 + rise); x.scale(side === -1 ? 1 : -1, 1); x.rotate(a); };
  if (!lod) {
    x.save();
    x.strokeStyle = pal.sticker; x.lineWidth = inkW + 5.5;
    for (const f of feet) f(inkW + 5.5, pal.sticker);
    for (const [side, a] of [[-1, pose.wingL], [1, pose.wingR]] as const) { x.save(); wingT(side, a); x.stroke(wing); x.restore(); }
    x.save(); x.translate(0, rise); x.stroke(body); x.restore();
    x.save(); headT(); x.stroke(head); x.stroke(crest); x.restore();
    x.restore();
  }
  for (const f of feet) { f(inkW + 3, pal.ink); f(3, pal.feet); }

  // Asas (atrás do corpo quando dobradas, à frente quando erguidas).
  const drawWing = (side: -1 | 1, a: number) => { x.save(); wingT(side, a); fillInk(wing, pal.wing); if (!lod) { x.strokeStyle = pal.wingDark; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-3, 6); x.quadraticCurveTo(-8, 16, -10, 26); x.stroke(); } x.restore(); };
  const front = (_a: number) => true;
  if (!front(pose.wingL)) drawWing(-1, pose.wingL);
  if (!front(pose.wingR)) drawWing(1, pose.wingR);

  x.save(); x.translate(0, rise); fillInk(body, pal.body); x.restore();

  // Cordão e medalhão (no peito, sob a cabeça).
  x.save(); x.translate(0, rise);
  x.strokeStyle = pal.cord; x.lineWidth = lod ? 1.6 : 1.1;
  x.beginPath(); x.moveTo(-13, 2); x.quadraticCurveTo(0, 12, 13, 2); x.stroke();
  x.beginPath(); x.arc(0, 10.5, lod ? 4.4 : 3.6, 0, Math.PI * 2); x.fillStyle = pal.medal; x.fill(); x.lineWidth = lod ? 1.6 : 1.2; x.strokeStyle = pal.ink; x.stroke();
  if (!lod) { x.beginPath(); x.arc(-1.1, 9.4, 1.1, 0, Math.PI * 2); x.fillStyle = pal.medalHi; x.fill(); }
  x.restore();

  if (front(pose.wingL)) drawWing(-1, pose.wingL);
  if (front(pose.wingR)) drawWing(1, pose.wingR);

  // Cabeça, topete e rosto.
  x.save(); headT();
  fillInk(crest, pal.crest);
  fillInk(head, pal.head);
  const face = opts.face ?? 0;
  x.translate(face * 3, 0);
  const eyes: [number, number, number, number][] = who === "huginn" ? [[-9.5, -19, 8, 8.6], [9, -18, 7.2, 7.8]] : [[-9, -19, 7.6, 8.4], [9.5, -19, 8, 8.6]];
  eyes.forEach(([ex, ey, rx, ry]) => {
    const e = new Path2D(); e.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
    x.fillStyle = pal.eye; x.fill(e); x.strokeStyle = pal.ink; x.lineWidth = inkW * 0.85; x.stroke(e);
    x.save(); x.clip(e);
    const pr = rx * 0.52;
    const cx = ex + pose.px * (rx - pr - 0.6), cy = ey + 1 + pose.py * (ry - pr - 0.6);
    x.fillStyle = pal.pupil; x.beginPath(); x.arc(cx, cy, pr, 0, Math.PI * 2); x.fill();
    if (!lod) { x.fillStyle = "#FFFFFF"; x.beginPath(); x.arc(cx - pr * 0.35, cy - pr * 0.4, pr * 0.3, 0, Math.PI * 2); x.fill(); }
    if (pose.lid > 0.01) {
      x.fillStyle = pal.head;
      x.fillRect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, (ry * 2 + 2) * Math.min(1, pose.lid));
      x.strokeStyle = pal.ink; x.lineWidth = inkW * 0.8;
      const ly = ey - ry - 1 + (ry * 2 + 2) * Math.min(1, pose.lid);
      x.beginPath(); x.moveTo(ex - rx, ly); x.lineTo(ex + rx, ly); x.stroke();
    }
    x.restore();
  });
  // Sobrancelhas: o humor do Huginn (um lado sobe: "entendi").
  const brow = (ex: number, ey: number, rx: number, raise: number, side: -1 | 1) => {
    const base = who === "huginn" ? 2.2 : -0.6; // o Huginn começa de cenho meio franzido
    const y0 = ey - 10.5 - raise * 3.2;
    x.strokeStyle = pal.ink; x.lineWidth = lod ? 2.4 : 2;
    x.beginPath();
    x.moveTo(ex - rx * 0.8, y0 + (side === -1 ? 0 : base * (1 - raise)));
    x.quadraticCurveTo(ex, y0 - 2.2 - raise * 1.2, ex + rx * 0.8, y0 + (side === -1 ? base * (1 - raise) : 0));
    x.stroke();
  };
  brow(eyes[0][0], eyes[0][1], eyes[0][2], pose.browL, -1);
  brow(eyes[1][0], eyes[1][1], eyes[1][2], pose.browR, 1);

  // Bico: o inferior gira para baixo ao abrir (língua no Muninn), o superior por cima.
  x.save(); x.translate(1, 0);
  const open = Math.max(0, Math.min(1, pose.beak));
  if (open > 0.02) {
    x.save(); x.translate(-6, -4); x.rotate(open * 0.42); x.translate(6, 4);
    fillInk(path(BEAK_LO), pal.beakDark, inkW * 0.85);
    x.save(); x.clip(path(BEAK_LO)); x.fillStyle = pal.mouth; x.fillRect(-8, -5, 17, 4 + open * 2);
    x.fillStyle = pal.tongue; x.beginPath(); x.ellipse(1.5, -1.2 + open * 1.4, 4.2, 2.2, 0, 0, Math.PI * 2); x.fill(); x.restore();
    x.restore();
  }
  fillInk(path(BEAK_UP[who]), pal.beak, inkW * 0.9);
  x.restore();
  x.restore();
  x.restore();
}

/** Paleta do rig para o personagem escolhido.
 *  - "classic" (padrão) e sem look: as cores da referência;
 *  - "theme" (Seguir o tema): preto/prata fixos, o topete e o brilho do medalhão no acento do tema;
 *  - os outros: recolor do mesmo rig (contornos mantidos). */
export function rigPalette(who: Who, characterId: string, look: { dark: string; lit: string; wing: string; markColor: string; beak: readonly string[] } | null, accent?: string): RigPalette {
  const ref = REF_PALETTE[who];
  if (characterId === "theme") return { ...ref, crest: who === "huginn" ? mixHex(ref.crest, accent ?? ref.crest, 0.35) : ref.crest, medalHi: accent ?? ref.medalHi };
  if (characterId === "classic" || !look) return ref;
  const body = who === "huginn" ? look.dark : look.lit;
  return { ...ref, body, head: body, wing: look.wing, wingDark: mixHex(look.wing, "#000000", 0.3), crest: look.markColor, beak: look.beak[1] ?? ref.beak, beakDark: mixHex(look.beak[1] ?? ref.beak, "#000000", 0.25) };
}
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => { const m = h.replace("#", ""); const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m.slice(0, 6); return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); };
  try { const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); } catch { return a; }
}
