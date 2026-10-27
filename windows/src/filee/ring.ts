// A geometria do anel do gesto (o "rondó"): onde fica cada botão e qual botão
// está sob um ponto. Tudo em px CSS, relativo ao centro do anel. Sem DOM, para
// os testes. O acerto é pelo círculo e pela fatia, nunca pelo retângulo.

/** Tamanho da janela do anel (quadrada) e as faixas. */
export const RING = {
  size: 460,
  core: 46,        // raio do miolo (ícone do arquivo)
  itemR: 102,      // raio onde ficam os centros dos botões
  item: 54,        // diâmetro de cada botão
  subR: 174,       // raio do segundo arco (sub-opções)
  sub: 44,         // diâmetro dos botões do segundo arco
  subStep: 25,     // graus entre os botões do segundo arco
} as const;

/** Limites das faixas de acerto (a fatia vale até a metade do caminho). */
export const BAND = {
  innerMin: RING.core + 4,
  innerMax: (RING.itemR + RING.item / 2 + RING.subR - RING.sub / 2) / 2,
  outerMax: RING.subR + RING.sub / 2 + 10,
} as const;

const DEG = Math.PI / 180;

/** Ângulos (graus, 0 = direita, sentido horário, -90 = topo) dos n botões. O
 *  topo fica livre para o corvo pousar no anel: n botões em n+1 vagas. */
export function ringAngles(n: number): number[] {
  const slots = n + 1;
  const step = 360 / slots;
  return Array.from({ length: n }, (_, i) => -90 + step * (i + 1));
}

/** Os ângulos do segundo arco, centrado no botão-pai. */
export function subAngles(parent: number, n: number): number[] {
  const start = parent - (RING.subStep * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => start + RING.subStep * i);
}

export function polar(angle: number, r: number): { x: number; y: number } {
  return { x: Math.cos(angle * DEG) * r, y: Math.sin(angle * DEG) * r };
}

/** Diferença angular mínima (0..180). */
function gap(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

export type Hit = { kind: "core" } | { kind: "item"; index: number } | { kind: "sub"; index: number } | null;

/** O que está sob (dx, dy) — relativo ao centro. `items` e `subs` são os ângulos
 *  desenhados (subs vazio se o segundo arco estiver fechado). */
export function hitTest(dx: number, dy: number, items: number[], subs: number[] = []): Hit {
  const r = Math.hypot(dx, dy);
  if (r < BAND.innerMin) return { kind: "core" };
  const a = Math.atan2(dy, dx) / DEG;
  const nearest = (list: number[], half: number) => {
    let best = -1, bestGap = Infinity;
    list.forEach((x, i) => { const g = gap(a, x); if (g < bestGap) { bestGap = g; best = i; } });
    return bestGap <= half ? best : -1;
  };
  if (r <= BAND.innerMax) {
    if (!items.length) return null;
    const half = items.length > 1 ? 360 / (items.length + 1) / 2 + 2 : 40;
    const i = nearest(items, half);
    return i < 0 ? null : { kind: "item", index: i };
  }
  if (r <= BAND.outerMax && subs.length) {
    const i = nearest(subs, RING.subStep / 2);
    return i < 0 ? null : { kind: "sub", index: i };
  }
  return null;
}

/** Raio que conta como "dentro" (para o clique-fora no Rust). */
export function hitRadius(subOpen: boolean): number {
  return subOpen ? BAND.outerMax : BAND.innerMax;
}
