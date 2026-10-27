// A silhueta dos corvos (Huginn e Muninn), uma só fonte para o SVG e o canvas.
// Tudo em curvas de Bézier, simétrico em x = 60 (viewBox 120), sem contorno preto:
// volume por gradiente e um brilho suave. Camadas (de trás para a frente):
// asas · cauda · corpo · runa · cabeça (crista, olhos, bico). As asas ficam abaixo
// do pescoço (y ≥ 59) e a cabeça termina em y = 57: nada cruza o rosto.

export const RAVEN = {
  wingL: "M45 62 C35 59 23 64 18 76 C16.5 80 19 83 23 81.5 C31 78.5 39 78 46 74 C48 70 48 65 45 62 Z",
  wingR: "M75 62 C85 59 97 64 102 76 C103.5 80 101 83 97 81.5 C89 78.5 81 78 74 74 C72 70 72 65 75 62 Z",
  tail: "M51 93 C48.5 100 47 105 49.5 107.5 C52 110 56.5 106 60 104 C63.5 106 68 110 70.5 107.5 C73 105 71.5 100 69 93 Z",
  body: "M60 50 C73 50 83 60 83 75 C83 89 73 98 60 98 C47 98 37 89 37 75 C37 60 47 50 60 50 Z",
  crest: "M55.5 23 C53.5 17 54.5 12.5 58.2 11.5 C58.4 15 59.2 18 60 20 C61 16.5 63.5 13 67 13.8 C65.2 17 64.3 20.5 64.5 23.5 Z",
  beak: "M55.4 44.6 C57.4 43.6 62.6 43.6 64.6 44.6 C64.2 48.4 62.3 51.8 60 53.4 C57.7 51.8 55.8 48.4 55.4 44.6 Z",
  head: { cx: 60, cy: 39, r: 18 },
  eyes: { dx: 7, y: 37 },
} as const;

/** Espelha os números x de um caminho absoluto em torno de x = 60 (para o teste de simetria). */
export function mirrorPath(d: string): string {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => (i++ % 2 === 0 ? String(+(120 - Number(n)).toFixed(3)) : n));
}
