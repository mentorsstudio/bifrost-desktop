// A geometria do anel do gesto (fatias de rosca, como o menu do Filee — MIT,
// © 2026 Myeonggu Kim / KnifeLemon — reescrita do zero). Ângulos em graus,
// no sentido horário a partir das 12h; a fatia i fica centrada em i·span, então
// a primeira está no topo. Tudo em px CSS relativo ao centro. Sem DOM, testada.

export const DONUT = {
  size: 460,        // janela quadrada
  outer: 162,       // raio externo das fatias
  inner: 66,        // raio do miolo (furo)
  gap: 3,           // vão constante entre fatias (px)
  corner: 10,       // arredondamento dos cantos
  pop: 7,           // quanto a fatia sob o mouse sai para fora
  subInner: 172,    // segundo anel (grupo): raio interno
  subOuter: 220,    // e externo
  subOverhang: 0.25,
  minSubWidth: 46,  // largura mínima de uma fatia do segundo anel (no meio)
  maxSlices: 12,
} as const;

const RAD = Math.PI / 180;

export function span(count: number): number {
  return count <= 0 ? 360 : 360 / count;
}

export function midAngle(index: number, count: number): number {
  return index * span(count);
}

/** Ponto (x, y) para um ângulo horário a partir das 12h. */
export function pointAt(angle: number, r: number): { x: number; y: number } {
  return { x: r * Math.sin(angle * RAD), y: -r * Math.cos(angle * RAD) };
}

/** Ângulo (0..360) de (dx, dy). */
export function angleOf(dx: number, dy: number): number {
  const a = Math.atan2(dx, -dy) / RAD;
  return a < 0 ? a + 360 : a;
}

export function indexAt(angle: number, count: number): number {
  if (count <= 0) return -1;
  const s = span(count);
  return Math.floor((angle + s / 2) / s) % count;
}

/** Largura angular de cada fatia do segundo anel de um grupo. */
export function subSpan(parentSpan: number, count: number): number {
  if (count <= 0) return 0;
  const mid = (DONUT.subInner + DONUT.subOuter) / 2;
  let s = (parentSpan * (1 + 2 * DONUT.subOverhang)) / count;
  s = Math.max(s, (DONUT.minSubWidth / mid) / RAD);
  return Math.min(s, 360 / count);
}

export function subMid(parentMid: number, sub: number, count: number, sSpan: number): number {
  return parentMid + (sub - (count - 1) / 2) * sSpan;
}

export type Hit =
  | { kind: "center" }
  | { kind: "slice"; index: number }
  | { kind: "sub"; index: number }
  | { kind: "outside" };

/** O que está sob (dx, dy): o furo (cancelar), uma fatia, uma fatia do segundo anel, ou fora. */
export function hitTest(dx: number, dy: number, count: number, sub?: { parent: number; count: number }): Hit {
  const d = Math.hypot(dx, dy);
  if (d < DONUT.inner) return { kind: "center" };
  if (d <= DONUT.outer + DONUT.pop && count > 0) return { kind: "slice", index: indexAt(angleOf(dx, dy), count) };
  if (sub && sub.count > 0 && d >= DONUT.subInner - 4 && d <= DONUT.subOuter + DONUT.pop) {
    const pm = midAngle(sub.parent, count);
    const ss = subSpan(span(count), sub.count);
    let delta = angleOf(dx, dy) - pm;
    delta = ((delta + 540) % 360) - 180;
    const i = Math.floor(delta / ss + sub.count / 2);
    if (i >= 0 && i < sub.count) return { kind: "sub", index: i };
  }
  return { kind: "outside" };
}

/** Raio que conta como "dentro" para o clique-fora (no Rust). */
export function hitRadius(subOpen: boolean): number {
  return (subOpen ? DONUT.subOuter : DONUT.outer) + DONUT.pop;
}

function f(n: number) {
  return Math.round(n * 100) / 100;
}

/** Contorno SVG de uma fatia com vão constante. Os cantos arredondados saem de
 *  um contorno encolhido de `corner` e traçado com essa espessura e junção
 *  redonda: a forma fica dentro da fatia "seca" e o vão não muda. */
export function wedge(inner: number, outer: number, mid: number, sp: number, gap: number = DONUT.gap, corner: number = DONUT.corner): { d: string; stroke: number } {
  const r = Math.max(0, Math.min(corner, (outer - inner) / 2 - 1));
  const ri = inner + r, ro = outer - r;
  const half = (rad: number) => Math.max(0.05, sp / 2 - ((gap / 2 + r) / rad) / RAD);
  const ho = half(ro), hi = half(ri);
  const a = pointAt(mid - ho, ro), b = pointAt(mid + ho, ro);
  const c = pointAt(mid + hi, ri), e = pointAt(mid - hi, ri);
  const largeO = ho * 2 > 180 ? 1 : 0, largeI = hi * 2 > 180 ? 1 : 0;
  const d = `M${f(a.x)} ${f(a.y)}A${f(ro)} ${f(ro)} 0 ${largeO} 1 ${f(b.x)} ${f(b.y)}L${f(c.x)} ${f(c.y)}A${f(ri)} ${f(ri)} 0 ${largeI} 0 ${f(e.x)} ${f(e.y)}Z`;
  return { d, stroke: r * 2 };
}

/** Onde vai o rótulo de uma fatia e quanto cabe na largura. */
export function labelBox(index: number, count: number): { x: number; y: number; width: number } {
  const r = DONUT.inner + (DONUT.outer - DONUT.inner) * 0.6;
  const m = midAngle(index, count);
  const p = pointAt(m, r);
  const chord = count <= 1 ? 140 : 2 * r * Math.sin((span(count) / 2) * RAD) - DONUT.gap - 8;
  return { ...p, width: Math.max(44, Math.min(110, chord)) };
}
