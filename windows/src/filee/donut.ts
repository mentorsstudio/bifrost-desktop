// O desenho do anel do gesto, sem estado de gesto: usado pela janela do anel
// (menu.ts) e pelas prévias dos estilos nos Ajustes. A função copia a ideia do
// Filee (MIT, © 2026 Myeonggu Kim / KnifeLemon): fatias por tipo, miolo que
// cancela. O visual é do Bifrost: um anel contínuo (pedra, vidro de aurora,
// escudo de tábuas ou liso), separadores finos de runa em vez de vãos, a fatia
// sob o mouse acesa no acento do tema, o miolo como um escudo redondo com o
// ícone e a contagem, e o Huginn pousado na borda. Tudo recolore pelo tema.

import type { RingSlice } from "./api";
import { DONUT, labelBox, midAngle, pointAt, span, subMid, subSpan, wedge, type Hit } from "./ring";
import { FUTHARK, type RingStyle } from "./ring-style";

const SVG = "http://www.w3.org/2000/svg";
export const STAGGER = 35;
/** Raio do cinto de runas (por fora do anel). */
export const BELT_R = DONUT.outer + 11;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVG, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Sem hífen: palavras nunca se partem ("Redimensionar" inteiro); o fit() diminui a letra até caber. */
export function softHyphens(label: string): string {
  return label.replace(/\u00AD/g, "");
}

/** Diminui a letra até o nome caber (no máximo 2 linhas, sem partir palavra). */
export function fit(lab: HTMLElement) {
  const name = lab.querySelector<HTMLElement>(".fm-label-name");
  if (!name) return;
  let size = parseFloat(getComputedStyle(name).fontSize) || 12;
  // Primeiro a palavra mais longa cabe inteira numa linha (nada de "Redimen-sionar"
  // nem "Redimensiona" cortado): mede cada palavra sem quebra e reduz a letra.
  const room = lab.clientWidth;
  if (room > 0) {
    const probe = el("span", "fm-label-name");
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;display:inline;max-width:none;width:auto;font-size:${size}px`;
    lab.append(probe);
    const widest = Math.max(...(name.textContent ?? "").split(/\s+/).map((w) => { probe.textContent = w; return probe.getBoundingClientRect().width / (lab.getBoundingClientRect().width / Math.max(1, lab.offsetWidth) || 1); }));
    probe.remove();
    if (widest > room - 1) {
      const want = Math.floor((size * (room - 1)) / widest * 2) / 2;
      size = Math.max(8.5, want);
      name.style.fontSize = `${size}px`;
      // No piso de 8,5 px e ainda sem caber: o rótulo alarga um pouco (a fatia
      // tem folga dos lados), em vez de cortar ou partir a palavra.
      const need = Math.ceil((widest * size) / (parseFloat(probe.style.fontSize) || size)) + 2;
      if (need > room) lab.style.width = `${need}px`;
    }
  }
  while ((name.scrollWidth > name.clientWidth + 0.5 || name.scrollHeight > name.clientHeight + 0.5) && size > 8.5) {
    size -= 0.5;
    name.style.fontSize = `${size}px`;
  }
  const cap = lab.querySelector<HTMLElement>(".fm-label-cap");
  if (!cap) return;
  // Mede o texto inteiro (largura de layout, sem o arredondamento do scrollWidth).
  const need = () => { cap.style.maxWidth = "none"; const w = cap.getBoundingClientRect().width / (lab.getBoundingClientRect().width / Math.max(1, lab.offsetWidth) || 1); cap.style.maxWidth = ""; return w; };
  let cs = parseFloat(getComputedStyle(cap).fontSize) || 10;
  while (need() > room - 0.5 && cs > 8) {
    cs -= 0.5;
    cap.style.fontSize = `${cs}px`;
  }
}

export class Donut {
  readonly stage = el("div", "fm-stage");
  readonly svg = svgEl("svg", { class: "fm-svg", viewBox: `${-DONUT.size / 2} ${-DONUT.size / 2} ${DONUT.size} ${DONUT.size}` }) as SVGSVGElement;
  /** Disco sólido por baixo de tudo: nada da área de trabalho atravessa o anel (nem o vão entre o miolo e as fatias). */
  readonly disc = el("div", "fm-disc");
  readonly band = el("div", "fm-band");
  readonly aura = el("div", "fm-aura");
  readonly decor = svgEl("g", { class: "fm-decor" });
  readonly seps = svgEl("g", { class: "fm-seps" });
  readonly slicesG = svgEl("g", { class: "fm-slices" });
  readonly subG = svgEl("g", { class: "fm-sub-g" });
  readonly labels = el("div", "fm-labels");
  readonly subLabels = el("div", "fm-labels fm-sub-labels");
  readonly hub = el("div", "fm-hub");
  readonly hubIcon = el("div", "fm-hub-icon");
  readonly badge = el("span", "fm-badge");
  readonly hubTitle = el("div", "fm-hub-title");
  readonly hubHint = el("div", "fm-hub-hint");
  readonly progress = el("div", "fm-progress");
  readonly perch = el("div", "fm-perch");
  readonly ravenBox = el("div", "fm-raven");
  slices: RingSlice[] = [];
  subOf = -1;
  private reduced: () => boolean;

  constructor(readonly root: HTMLElement, reduced: () => boolean = () => false) {
    this.reduced = reduced;
    const defs = svgEl("defs");
    // Gradiente do aro de metal (escudo) e o brilho da fatia acesa: as cores
    // vêm das variáveis do tema (stop-color em CSS).
    const metal = svgEl("linearGradient", { id: "fm-metal", x1: "0", y1: "0", x2: "1", y2: "1" });
    metal.append(svgEl("stop", { offset: "0", class: "fm-metal-a" }), svgEl("stop", { offset: ".5", class: "fm-metal-b" }), svgEl("stop", { offset: "1", class: "fm-metal-c" }));
    const glow = svgEl("filter", { id: "fm-glow", x: "-30%", y: "-30%", width: "160%", height: "160%" });
    glow.append(svgEl("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "5", result: "b" }));
    const merge = svgEl("feMerge");
    merge.append(svgEl("feMergeNode", { in: "b" }), svgEl("feMergeNode", { in: "SourceGraphic" }));
    glow.append(merge);
    defs.append(metal, glow, svgEl("path", { id: "fm-belt", d: `M0 ${-BELT_R}A${BELT_R} ${BELT_R} 0 1 1 -0.01 ${-BELT_R}Z` }));
    this.svg.append(defs, this.decor, this.seps, this.subG, this.slicesG);
    this.hub.append(this.progress, this.hubIcon, this.badge, this.hubTitle, this.hubHint);
    this.perch.append(this.ravenBox);
    this.stage.append(this.disc, this.aura, this.band, this.svg, this.labels, this.subLabels, this.hub, this.perch);
    root.append(this.stage);
    this.drawDecor();
  }

  setStyle(style: RingStyle) {
    this.root.dataset.ring = style;
  }

  /** Aros, cinto de runas e rebites: não dependem das fatias. */
  private drawDecor() {
    const d = this.decor;
    d.replaceChildren();
    d.append(
      svgEl("circle", { class: "fm-rim-out", r: DONUT.outer + 0.5 }),
      svgEl("circle", { class: "fm-rim-in", r: DONUT.inner - 0.5 }),
      svgEl("circle", { class: "fm-metal-rim", r: DONUT.outer + 2.5 }),
    );
    const belt = svgEl("text", { class: "fm-belt" });
    const tp = svgEl("textPath", { href: "#fm-belt", startOffset: "0" });
    // O cinto dá uma volta inteira (o comprimento do círculo / passo de cada runa).
    const n = Math.floor((2 * Math.PI * BELT_R) / 13);
    tp.textContent = Array.from({ length: n }, (_, i) => FUTHARK[i % FUTHARK.length]).join("");
    tp.setAttribute("textLength", String(2 * Math.PI * BELT_R - 13));
    belt.append(tp);
    d.append(belt);
  }

  /** Separadores finos nas bordas das fatias (com um entalhe em losango) e os rebites do escudo. */
  private drawSeps(count: number) {
    this.seps.replaceChildren();
    if (count < 2) return;
    const sp = span(count);
    for (let i = 0; i < count; i++) {
      const a = (i - 0.5) * sp;
      const p = pointAt(a, DONUT.inner + 5), q = pointAt(a, DONUT.outer - 5);
      const g = svgEl("g", { class: "fm-sep" });
      (g as SVGElement).style.setProperty("--d", this.reduced() ? "0ms" : `${i * STAGGER}ms`);
      g.append(svgEl("line", { x1: p.x.toFixed(2), y1: p.y.toFixed(2), x2: q.x.toFixed(2), y2: q.y.toFixed(2) }));
      const m = pointAt(a, DONUT.outer - 13);
      g.append(svgEl("rect", { class: "fm-notch", x: (m.x - 2.2).toFixed(2), y: (m.y - 2.2).toFixed(2), width: 4.4, height: 4.4, transform: `rotate(${(a + 45).toFixed(1)} ${m.x.toFixed(2)} ${m.y.toFixed(2)})` }));
      const r = pointAt(a, DONUT.outer + 2.5);
      g.append(svgEl("circle", { class: "fm-rivet", cx: r.x.toFixed(2), cy: r.y.toFixed(2), r: 2.6 }));
      this.seps.append(g);
    }
  }

  private sliceNode(s: RingSlice, i: number, count: number, sub: boolean, parentMid = 0, sSpan = 0) {
    const mid = sub ? subMid(parentMid, i, count, sSpan) : midAngle(i, count);
    const sp = sub ? sSpan : span(count);
    // Fatia principal: a "telha" acesa, quase do tamanho do setor, que só
    // aparece sob o mouse (o anel por baixo é contínuo). Segundo anel: fatias soltas.
    const w = sub
      ? wedge(DONUT.subInner, DONUT.subOuter, mid, sp, DONUT.gap, 8)
      : wedge(DONUT.inner + 1, DONUT.outer - 1, mid, sp, 2, 5);
    const g = svgEl("g", { class: `fm-slice${s.enabled ? "" : " off"}${s.children.length ? " group" : ""}${sub ? " solo" : ""}` });
    const pop = pointAt(mid, DONUT.pop);
    g.style.setProperty("--px", `${pop.x}px`);
    g.style.setProperty("--py", `${pop.y}px`);
    g.style.setProperty("--d", this.reduced() ? "0ms" : `${i * STAGGER}ms`);
    g.append(svgEl("path", { d: w.d, "stroke-width": w.stroke }));
    const r = sub ? (DONUT.subInner + DONUT.subOuter) / 2 : 0;
    const box = sub
      ? { ...pointAt(mid, r), width: Math.max(40, 2 * r * Math.sin((sp / 2) * Math.PI / 180) - 6) }
      : labelBox(i, count);
    const lab = el("div", `fm-label${s.enabled ? "" : " off"}${sub ? " small" : ""}`);
    lab.style.left = `${box.x}px`;
    lab.style.top = `${box.y}px`;
    lab.style.width = `${box.width}px`;
    lab.style.setProperty("--d", g.style.getPropertyValue("--d"));
    lab.style.setProperty("--px", `${pop.x}px`);
    lab.style.setProperty("--py", `${pop.y}px`);
    lab.append(el("span", "fm-label-name", softHyphens(s.label)));
    if (s.caption && !sub) lab.append(el("span", "fm-label-cap", s.caption));
    return { g, lab };
  }

  draw(slices: RingSlice[]) {
    this.slices = slices;
    this.slicesG.replaceChildren();
    this.labels.replaceChildren();
    const sp = span(slices.length);
    // As tábuas do escudo seguem as fatias.
    this.root.style.setProperty("--fm-span", `${sp}deg`);
    this.root.style.setProperty("--fm-from", `${-sp / 2}deg`);
    this.drawSeps(slices.length);
    slices.forEach((s, i) => {
      const { g, lab } = this.sliceNode(s, i, slices.length, false);
      this.slicesG.append(g);
      this.labels.append(lab);
    });
    for (const l of this.labels.children) fit(l as HTMLElement);
  }

  clear() {
    this.closeSub();
    this.slices = [];
    this.slicesG.replaceChildren();
    this.labels.replaceChildren();
    this.seps.replaceChildren();
  }

  openSub(index: number): boolean {
    const s = this.slices[index];
    if (!s?.children.length || this.subOf === index || !s.enabled) return false;
    this.subOf = index;
    const n = s.children.length;
    const ss = subSpan(span(this.slices.length), n);
    const pm = midAngle(index, this.slices.length);
    this.subG.replaceChildren();
    this.subLabels.replaceChildren();
    s.children.forEach((c, i) => {
      const { g, lab } = this.sliceNode(c, i, n, true, pm, ss);
      this.subG.append(g);
      this.subLabels.append(lab);
    });
    for (const l of this.subLabels.children) fit(l as HTMLElement);
    this.slicesG.children[index]?.classList.add("parent");
    this.root.classList.add("sub-open");
    requestAnimationFrame(() => this.root.classList.add("sub-shown"));
    return true;
  }

  closeSub() {
    this.subOf = -1;
    this.subG.replaceChildren();
    this.subLabels.replaceChildren();
    this.root.classList.remove("sub-open", "sub-shown");
    for (const c of this.slicesG.children) c.classList.remove("parent");
  }

  mark(h: Hit) {
    for (const c of [...this.slicesG.children, ...this.subG.children, ...this.labels.children, ...this.subLabels.children]) c.classList.remove("on");
    if (h.kind === "slice") {
      this.slicesG.children[h.index]?.classList.add("on");
      this.labels.children[h.index]?.classList.add("on");
    } else if (h.kind === "sub") {
      this.subG.children[h.index]?.classList.add("on");
      this.subLabels.children[h.index]?.classList.add("on");
    }
    this.hub.classList.toggle("hot", h.kind === "center");
  }

  hint(text: string, danger = false) {
    this.hubHint.replaceChildren();
    if (danger) this.hubHint.append(el("span", "fm-hint-rune", "ᚾ"));
    this.hubHint.append(document.createTextNode(text));
    this.hubHint.classList.toggle("danger", danger);
  }

  /** Recolhe na ordem inversa (atrasos). Devolve quanto esperar. */
  retractDelays(popMs: number): number {
    const n = this.slices.length;
    for (const nodes of [this.slicesG.children, this.labels.children, this.seps.children]) {
      [...nodes].forEach((g, i) => (g as HTMLElement).style.setProperty("--d", this.reduced() ? "0ms" : `${(n - 1 - i) * 22}ms`));
    }
    return this.reduced() ? 0 : n * 22 + popMs;
  }
}
