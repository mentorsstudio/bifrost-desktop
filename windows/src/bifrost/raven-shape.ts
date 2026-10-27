// A silhueta dos corvos (Huginn e Muninn), fase 16: redesenho na família Freya —
// um ovo alto e calmo, asas em lâmina, bico curto; mesmas âncoras para os adornos.
// Uma peça só — cabeça e corpo num "grão" macio, sem pescoço nem emenda — tudo em
// curvas de Bézier, simétrico em x = 60 (viewBox 120), sem contorno preto.
// Camadas (de trás para a frente): cauda · pés · corpo · peito · runa · asas ·
// rosto (crista ou lua, olhos, bico). O rosto fica na zona y 36–61 e x 45–75; as
// asas começam abaixo do bico (y ≥ 61) e fora do rosto (x ≤ 41 / x ≥ 79): nada se cruza.

export const RAVEN = {
  body: "M60 18 C77 18 87 31 87 46 C87 55 85 60 86 66 C88 78 86 92 79 99 C74 103.5 67 105 60 105 C53 105 46 103.5 41 99 C34 92 32 78 34 66 C35 60 33 55 33 46 C33 31 43 18 60 18 Z",
  belly: "M60 64 C69 64 75 72 75 81 C75 91 68 98 60 98 C52 98 45 91 45 81 C45 72 51 64 60 64 Z",
  wingL: "M37 62 C29 68 26 80 28 92 C29 96 32 97 34 94 C39 86 41 75 41 66 C41 63 39 61.5 37 62 Z",
  wingR: "M83 62 C91 68 94 80 92 92 C91 96 88 97 86 94 C81 86 79 75 79 66 C79 63 81 61.5 83 62 Z",
  tail: "M55 100 C54 105 55 109 57 110 C58.4 110.4 59.3 109 60 107.5 C60.7 109 61.6 110.4 63 110 C65 109 66 105 65 100 Z",
  crest: "M56 21 C54.5 15.5 55.5 11.5 58.2 10.5 C58.4 14 59.2 16.4 60 17.6 C60.8 16.4 61.6 14 61.8 10.5 C64.5 11.5 65.5 15.5 64 21 Z",
  moon: "M53 28 C56 25.6 64 25.6 67 28 C64 27.2 56 27.2 53 28 Z",
  beak: "M55.5 52.6 C58 51.4 62 51.4 64.5 52.6 C64.2 56.4 62.3 59.8 60 61.4 C57.7 59.8 55.8 56.4 55.5 52.6 Z",
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
