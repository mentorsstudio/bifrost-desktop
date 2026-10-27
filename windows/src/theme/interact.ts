// Fase 18 — movimento compartilhado (à la Apple): o indicador de aba que desliza
// com mola, a troca de conteúdo com cruzamento e deslize na direção da aba,
// FLIP para abrir/fechar, e a entrada suave do que aparece. Só transform e
// opacity animam; tudo respeita prefers-reduced-motion.

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A mola dos tokens (--m-bouncy / --m-snappy) como easing de Web Animations. */
export function springEasing(token: "--m-bouncy" | "--m-snappy" | "--m-smooth" = "--m-bouncy"): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (v) return v;
  } catch { /* fora do navegador */ }
  return "ease-out";
}
export const SPRING_MS = 460;

export interface Ink { el: HTMLElement; update(animate?: boolean): void; dispose(): void }

/**
 * Indicador que desliza entre as abas de `container`. A aba ativa é achada por
 * `active`; a cor do indicador vem do CSS (.m-ink dentro de .m-has-ink).
 * Usa FLIP: a posição final é escrita de uma vez e a animação é só transform.
 */
export function slidingInk(container: HTMLElement, active = ".on", variant = ""): Ink {
  container.classList.add("m-has-ink");
  if (variant) container.classList.add(`m-ink-${variant}`);
  const ink = document.createElement("span");
  ink.className = "m-ink";
  ink.setAttribute("aria-hidden", "true");
  container.prepend(ink);
  let last: { x: number; y: number; w: number; h: number } | null = null;
  let raf = 0;
  const place = (animate: boolean) => {
    const on = container.querySelector<HTMLElement>(active);
    if (!on || !on.offsetParent) { ink.style.opacity = "0"; last = null; return; }
    const c = container.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (!r.width) return;
    const x = r.left - c.left - container.clientLeft, y = r.top - c.top - container.clientTop;
    const next = { x, y, w: r.width, h: r.height };
    if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5 && Math.abs(last.w - r.width) < 0.5 && Math.abs(last.h - r.height) < 0.5) return;
    ink.style.width = `${r.width}px`;
    ink.style.height = `${r.height}px`;
    ink.style.transform = `translate(${x}px, ${y}px)`;
    const wasHidden = ink.style.opacity !== "1";
    ink.style.opacity = "1";
    if (animate && last && !wasHidden && !reduced() && typeof ink.animate === "function") {
      ink.animate(
        [{ transform: `translate(${last.x}px, ${last.y}px) scale(${last.w / r.width}, ${last.h / r.height})` }, { transform: `translate(${x}px, ${y}px)` }],
        { duration: SPRING_MS, easing: springEasing("--m-bouncy") },
      );
    }
    last = next;
  };
  const schedule = (animate: boolean) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => place(animate)); };
  const mo = new MutationObserver(() => schedule(true));
  mo.observe(container, { subtree: true, attributes: true, attributeFilter: ["class", "aria-checked", "aria-selected"] });
  // Fase 19: a aba ativa muda de largura (o rótulo abre numa transição): o indicador
  // segue o TAMANHO dela também, não só o do contêiner — senão sobra uma forma atrás.
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => schedule(false)) : null;
  ro?.observe(container);
  container.querySelectorAll<HTMLElement>(active.replace(/\.on\b|\[aria-[a-z]+(=[^\]]*)?\]/g, "") || "*").forEach((e) => ro?.observe(e));
  container.addEventListener("transitionend", () => schedule(false));
  schedule(false);
  return { el: ink, update: (a = true) => schedule(a), dispose: () => { mo.disconnect(); ro?.disconnect(); ink.remove(); } };
}

/**
 * Troca de conteúdo: a saída cruza com a entrada e as duas deslizam na direção
 * da navegação (dir = +1 indo para a direita, -1 voltando, 0 só cruzar).
 */
export function slideSwap(out: HTMLElement | null, into: HTMLElement | null, dir: number, distance = 16): void {
  if (reduced()) return;
  const d = Math.sign(dir) * distance;
  if (out && typeof out.animate === "function") {
    out.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translate3d(${-d * 0.6}px, 0, 0) scale(0.985)` }],
      { duration: 180, easing: springEasing("--m-smooth") });
  }
  if (into && typeof into.animate === "function") {
    into.animate([{ opacity: 0, transform: `translate3d(${d}px, 0, 0) scale(0.985)` }, { opacity: 1, transform: "none" }],
      { duration: 380, delay: 60, easing: springEasing("--m-bouncy"), fill: "backwards" });
  }
}

/**
 * FLIP: grava onde cada filho está, deixa o chamador mudar o DOM e, no quadro
 * seguinte, anima cada um do lugar antigo ao novo (só transform); quem entrou
 * aparece com fade e um pequeno deslize.
 */
export function flip(container: HTMLElement, mutate: () => void): void {
  const kids = () => [...container.children] as HTMLElement[];
  const before = new Map(kids().map((k) => [k, k.getBoundingClientRect()] as const));
  mutate();
  if (reduced()) return;
  requestAnimationFrame(() => {
    for (const k of kids()) {
      if (typeof k.animate !== "function") continue;
      const b = before.get(k), a = k.getBoundingClientRect();
      if (!a.height) continue;
      if (!b || !b.height) {
        k.animate([{ opacity: 0, transform: "translate3d(0, -6px, 0) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: springEasing("--m-snappy") });
        continue;
      }
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: SPRING_MS, easing: springEasing("--m-bouncy") });
    }
  });
}

/**
 * O que aparece (display: none → visível) dentro de `root` entra com fade e um
 * deslize curto; os itens de uma lista recém-criada entram em cascata.
 */
export function autoReveal(root: HTMLElement): () => void {
  if (typeof MutationObserver === "undefined") return () => undefined;
  const hidden = new WeakSet<Element>();
  const mo = new MutationObserver((list) => {
    if (reduced()) return;
    for (const m of list) {
      const el = m.target as HTMLElement;
      if (m.type !== "attributes" || typeof el.animate !== "function") continue;
      const nowHidden = el.style.display === "none";
      if (nowHidden) { hidden.add(el); continue; }
      if (m.oldValue?.includes("display: none") || hidden.has(el)) {
        hidden.delete(el);
        el.animate([{ opacity: 0, transform: "translate3d(0, -4px, 0)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: springEasing("--m-snappy") });
      }
    }
  });
  mo.observe(root, { subtree: true, attributes: true, attributeFilter: ["style"], attributeOldValue: true });
  return () => mo.disconnect();
}

