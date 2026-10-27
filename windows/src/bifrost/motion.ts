// Motor de movimento do Bifrost: curvas próprias, molas e linhas do tempo.
// Mesmo princípio do motor do Huginn na ilha (alvos + duração + curva, tudo
// num requestAnimationFrame só), aplicado a elementos DOM. Respeita
// `prefers-reduced-motion`: aí tudo pula direto para o fim.

export type Curve = (t: number) => number;

/** Curvas nórdicas: "fiorde" desacelera longo, "corvo" tem um pequeno ressalto. */
export const Curves = {
  linear: (t: number) => t,
  fjord: (t: number) => 1 - Math.pow(1 - t, 4),
  raven: (t: number) => {
    const c = 1.55;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  tide: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  ember: (t: number) => Math.sin((t * Math.PI) / 2),
} satisfies Record<string, Curve>;

/** Durações (ms) da coreografia: um ritmo só para o app inteiro. */
export const Beat = { tap: 120, quick: 220, step: 360, glide: 620, saga: 1100 } as const;

export function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Mola amortecida, resolvida analiticamente: devolve x(t) de 0 a 1. */
export function spring(stiffness = 170, damping = 18): Curve {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  return (t: number) => {
    const s = t * 1.2;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * s) * (Math.cos(wd * s) + ((zeta * w0) / wd) * Math.sin(wd * s));
    }
    return 1 - (1 + w0 * s) * Math.exp(-w0 * s);
  };
}

export interface Track {
  from: number;
  to: number;
  ms: number;
  curve?: Curve;
  delay?: number;
  apply: (v: number) => void;
}

/** Toca várias trilhas juntas; resolve quando todas terminam. */
export function play(tracks: Track[], now: () => number = () => performance.now()): Promise<void> {
  if (reducedMotion() || typeof requestAnimationFrame !== "function") {
    for (const t of tracks) t.apply(t.to);
    return Promise.resolve();
  }
  const start = now();
  return new Promise((resolve) => {
    const frame = () => {
      const el = now() - start;
      let done = true;
      for (const t of tracks) {
        const local = Math.min(1, Math.max(0, (el - (t.delay ?? 0)) / t.ms));
        if (local < 1) done = false;
        t.apply(t.from + (t.to - t.from) * (t.curve ?? Curves.fjord)(local));
      }
      if (done) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/** Valor amostrado de uma curva — usado nos testes e nas transições CSS. */
export function sample(curve: Curve, steps = 10): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => Math.round(curve(i / steps) * 1000) / 1000);
}

/** Entrada em cascata ("runas acendendo"): cada filho chega um pouco depois. */
export function cascade(children: HTMLElement[], gap = 45): Promise<void> {
  return play(
    children.map((el, i) => ({
      from: 0, to: 1, ms: Beat.step, delay: i * gap, curve: Curves.raven,
      apply: (v: number) => {
        el.style.opacity = String(Math.min(1, v));
        el.style.transform = `translateY(${(1 - v) * 10}px)`;
      },
    })),
  );
}
