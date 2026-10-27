// A silhueta dos corvos (Huginn e Muninn), fase 11: redesenho do zero.
// Uma peça só — cabeça e corpo num "grão" macio, sem pescoço nem emenda — tudo em
// curvas de Bézier, simétrico em x = 60 (viewBox 120), sem contorno preto.
// Camadas (de trás para a frente): cauda · pés · corpo · peito · runa · asas ·
// rosto (crista ou lua, olhos, bico). O rosto fica na zona y 36–61 e x 45–75; as
// asas começam abaixo do bico (y ≥ 61) e fora do rosto (x ≤ 41 / x ≥ 79): nada se cruza.

export const RAVEN = {
  body: "M60 20 C76 20 86 32 86 47 C86 54 84.6 58.4 85.4 63 C89.6 71.6 91.6 81.6 88.4 89.6 C84 99 72.6 103 60 103 C47.4 103 36 99 31.6 89.6 C28.4 81.6 30.4 71.6 34.6 63 C35.4 58.4 34 54 34 47 C34 32 44 20 60 20 Z",
  belly: "M60 66 C70.6 66 77.4 73.6 77.4 82.4 C77.4 91.4 70 97.6 60 97.6 C50 97.6 42.6 91.4 42.6 82.4 C42.6 73.6 49.4 66 60 66 Z",
  wingL: "M36.4 61.8 C27.6 65.6 23.2 77.6 25 88.6 C25.8 93.8 30 95.2 33.2 92 C38.4 86.2 41.2 76 40.4 66.2 C40 63.2 38.4 61.4 36.4 61.8 Z",
  wingR: "M83.6 61.8 C92.4 65.6 96.8 77.6 95 88.6 C94.2 93.8 90 95.2 86.8 92 C81.6 86.2 78.8 76 79.6 66.2 C80 63.2 81.6 61.4 83.6 61.8 Z",
  tail: "M50.4 97.6 C47.2 103.6 46.8 109.4 50.6 110.8 C53.8 112 57 108.4 60 106.2 C63 108.4 66.2 112 69.4 110.8 C73.2 109.4 72.8 103.6 69.6 97.6 Z",
  crest: "M55 22.4 C53.2 16.4 54.2 11.2 57.6 9.6 C58 13 59 15.6 60 17.2 C61 15.6 62 13 62.4 9.6 C65.8 11.2 66.8 16.4 65 22.4 Z",
  moon: "M52.4 28.6 C55 25.8 65 25.8 67.6 28.6 C64.6 27.6 55.4 27.6 52.4 28.6 Z",
  beak: "M55 52.6 C57 51.4 63 51.4 65 52.6 C64.6 56.2 62.6 59.4 60 60.6 C57.4 59.4 55.4 56.2 55 52.6 Z",
  /** A "cabeça" que os adornos usam: o círculo do alto do grão. */
  head: { cx: 60, cy: 44, r: 24 },
  eyes: { dx: 9.5, y: 46 },
  feet: { dx: 6.5, y: 103.4 },
  /** Ombros: o pivô das asas. */
  shoulder: { dx: 23, y: 63 },
} as const;

/** Espelha os números x de um caminho absoluto em torno de x = 60 (para o teste de simetria). */
export function mirrorPath(d: string): string {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => (i++ % 2 === 0 ? String(+(120 - Number(n)).toFixed(3)) : n));
}
