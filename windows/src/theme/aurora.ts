// Bifrost v16 — a aurora que corre. As pontes (barras de aurora) deslizam devagar
// da esquerda para a direita com um brilho Marfim, via Web Animations — inclusive
// nos pseudo-elementos (::after). Respeita prefers-reduced-motion; uma passada a
// cada 1,5 s pega pontes novas (o hub monta páginas sob demanda).

const HOSTS: [string, "::after" | null][] = [
  ["#island", "::after"], [".hub-side", "::after"], [".bf-hero", "::after"],
  [".bf-ai-card.found", "::after"], [".bf-card.on", "::after"], [".capsule", "::after"],
  [".bf-bridge", null], [".bf-aurora-line", null],
];
const FRAMES: Keyframe[] = [{ backgroundPosition: "0% 0" }, { backgroundPosition: "-220% 0" }];
export const AURORA_MS = 9000;

const seen = new WeakMap<Element, Set<string>>();

export function flowAurora(root: ParentNode = document): number {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
  let n = 0;
  for (const [sel, pseudo] of HOSTS) {
    for (const el of root.querySelectorAll(sel)) {
      const done = seen.get(el) ?? new Set<string>();
      const key = pseudo ?? "";
      if (done.has(key) || typeof (el as HTMLElement).animate !== "function") continue;
      try {
        (el as HTMLElement).animate(FRAMES, { duration: AURORA_MS, iterations: Infinity, easing: "linear", ...(pseudo ? { pseudoElement: pseudo } : {}) });
        done.add(key); seen.set(el, done); n++;
      } catch { /* sem suporte a pseudoElement: fica só a respiração do CSS */ }
    }
  }
  return n;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const go = () => flowAurora();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  window.setInterval(go, 1500);
}
