// O anel do gesto (fileemenu.html): Ctrl + segurar o botão direito sobre um
// arquivo abre uma rosca de fatias em volta do cursor, como o menu do Filee
// (MIT, © 2026 Myeonggu Kim / KnifeLemon), reescrita do zero na identidade do
// Bifrost. As fatias vêm do Rust (convert/ring.rs): primeiro as conversões
// diretas do tipo do arquivo, depois as nossas. No miolo, o ícone do arquivo,
// a contagem e a dica ("Solte aqui para cancelar", "Solte → PNG"). Soltar no
// miolo ou fora cancela; soltar numa fatia roda. "Enviar para a IA" é um grupo:
// abre um segundo anel por fora. O Huginn fica pequeno, pousado na borda.

import "../theme/runic.css";
import "../theme/motion.css";
import "../bifrost/nordic.css";
import "../theme/themes.css";
import "../theme/themes";
import "../bifrost/contextmenu";
import "./menu.css";
import { Mascot } from "../bifrost/mascots";
import { reducedMotion } from "../bifrost/motion";
import { CATEGORY_RUNE, Convert, QUICK_PROMPTS, baseName, on, type ItemReport, type Plan, type RingSlice } from "./api";
import { DONUT, hitRadius, hitTest, labelBox, midAngle, pointAt, span, subMid, subSpan, wedge, type Hit } from "./ring";

interface PlanPayload { plan: Plan | null; error: string | null; icon?: string | null }

const STAGGER = 35;
const POP_MS = 300;
const SVG = "http://www.w3.org/2000/svg";

const root = document.getElementById("fm-root")!;
const stage = el("div", "fm-stage");
const svg = document.createElementNS(SVG, "svg");
svg.setAttribute("class", "fm-svg");
svg.setAttribute("viewBox", `${-DONUT.size / 2} ${-DONUT.size / 2} ${DONUT.size} ${DONUT.size}`);
const slicesG = document.createElementNS(SVG, "g");
const subG = document.createElementNS(SVG, "g");
subG.setAttribute("class", "fm-sub-g");
svg.append(subG, slicesG);
const labels = el("div", "fm-labels");
const subLabels = el("div", "fm-labels fm-sub-labels");
const hub = el("div", "fm-hub");
const hubIcon = el("div", "fm-hub-icon");
const badge = el("span", "fm-badge");
const hubTitle = el("div", "fm-hub-title");
const hubHint = el("div", "fm-hub-hint");
const progress = el("div", "fm-progress");
hub.append(progress, hubIcon, badge, hubTitle, hubHint);
const perch = el("div", "fm-perch");
const ravenBox = el("div", "fm-raven");
const raven = new Mascot("huginn", ravenBox);
perch.append(ravenBox);
stage.append(svg, labels, subLabels, hub, perch);
root.append(stage);

let plan: Plan | null = null;
let icon: string | null = null;
let job: number | null = null;
let slices: RingSlice[] = [];
let subOf = -1;
let hover: Hit = { kind: "center" };
let closing = false;
let busy = false;
let doneOutput: string | null = null;
let closeTimer = 0;
let subTimer = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function center() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function paths(): string[] {
  return plan?.files.map((f) => f.path) ?? [];
}

function hint(text: string, danger = false) {
  hubHint.textContent = text;
  hubHint.classList.toggle("danger", danger);
}

function idleHint() {
  hint("Solte aqui para cancelar", true);
}

function drawHub() {
  const files = plan?.files ?? [];
  const f = files[0];
  hubIcon.replaceChildren();
  if (icon) {
    const img = el("img", "fm-file-img");
    img.src = icon;
    img.alt = "";
    hubIcon.append(img);
  } else {
    hubIcon.append(el("span", `fm-file-rune c-${f?.category ?? "other"}`, CATEGORY_RUNE[f?.category ?? "other"]));
  }
  badge.textContent = files.length > 1 ? String(files.length) : "";
  badge.classList.toggle("on", files.length > 1);
  hubTitle.textContent = plan?.ring?.title ?? (files.length > 1 ? `${files.length} arquivos` : f?.name ?? "");
}

function sliceNode(s: RingSlice, i: number, count: number, sub: boolean, parentMid = 0, sSpan = 0) {
  const mid = sub ? subMid(parentMid, i, count, sSpan) : midAngle(i, count);
  const sp = sub ? sSpan : span(count);
  const w = sub ? wedge(DONUT.subInner, DONUT.subOuter, mid, sp, DONUT.gap, 8) : wedge(DONUT.inner, DONUT.outer, mid, sp);
  const g = document.createElementNS(SVG, "g");
  g.setAttribute("class", `fm-slice${s.enabled ? "" : " off"}${s.children.length ? " group" : ""}`);
  const pop = pointAt(mid, DONUT.pop);
  g.style.setProperty("--px", `${pop.x}px`);
  g.style.setProperty("--py", `${pop.y}px`);
  g.style.setProperty("--d", reducedMotion() ? "0ms" : `${i * STAGGER}ms`);
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", w.d);
  path.setAttribute("stroke-width", String(w.stroke));
  g.append(path);
  // Rótulo (HTML, para quebrar linha e cortar com reticências).
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

/** Palavras longas ganham um hífen opcional no meio ("Redimen-sionar"). */
export function softHyphens(label: string): string {
  return label.split(" ").map((w) => (w.length > 10 ? `${w.slice(0, Math.ceil(w.length / 2) + 1)}\u00AD${w.slice(Math.ceil(w.length / 2) + 1)}` : w)).join(" ");
}

/** Diminui a letra até o nome caber (no máximo 2 linhas, sem partir palavra). */
function fit(lab: HTMLElement) {
  const name = lab.querySelector<HTMLElement>(".fm-label-name");
  if (!name) return;
  let size = parseFloat(getComputedStyle(name).fontSize) || 12;
  while ((name.scrollWidth > name.clientWidth + 0.5 || name.scrollHeight > name.clientHeight + 0.5) && size > 8.5) {
    size -= 0.5;
    name.style.fontSize = `${size}px`;
  }
}

function drawSlices() {
  slicesG.replaceChildren();
  labels.replaceChildren();
  slices.forEach((s, i) => {
    const { g, lab } = sliceNode(s, i, slices.length, false);
    slicesG.append(g);
    labels.append(lab);
  });
  for (const l of labels.children) fit(l as HTMLElement);
}

function openSub(index: number) {
  const s = slices[index];
  if (!s?.children.length || subOf === index || !s.enabled) return;
  subOf = index;
  const n = s.children.length;
  const ss = subSpan(span(slices.length), n);
  const pm = midAngle(index, slices.length);
  subG.replaceChildren();
  subLabels.replaceChildren();
  s.children.forEach((c, i) => {
    const { g, lab } = sliceNode(c, i, n, true, pm, ss);
    subG.append(g);
    subLabels.append(lab);
  });
  for (const l of subLabels.children) fit(l as HTMLElement);
  slicesG.children[index]?.classList.add("parent");
  root.classList.add("sub-open");
  requestAnimationFrame(() => root.classList.add("sub-shown"));
  void Convert.menuRadius(hitRadius(true));
}

function closeSub() {
  subOf = -1;
  subG.replaceChildren();
  subLabels.replaceChildren();
  root.classList.remove("sub-open", "sub-shown");
  for (const c of slicesG.children) c.classList.remove("parent");
  void Convert.menuRadius(hitRadius(false));
}

function mark(h: Hit) {
  for (const c of [...slicesG.children, ...subG.children, ...labels.children, ...subLabels.children]) c.classList.remove("on");
  if (h.kind === "slice") {
    slicesG.children[h.index]?.classList.add("on");
    labels.children[h.index]?.classList.add("on");
  } else if (h.kind === "sub") {
    subG.children[h.index]?.classList.add("on");
    subLabels.children[h.index]?.classList.add("on");
  }
  hub.classList.toggle("hot", h.kind === "center");
}

function setHover(h: Hit) {
  if (closing || busy || !slices.length) return;
  if (JSON.stringify(h) === JSON.stringify(hover)) return;
  hover = h;
  mark(h);
  window.clearTimeout(subTimer);
  if (h.kind === "center") {
    idleHint();
  } else if (h.kind === "slice") {
    const s = slices[h.index];
    if (!s.enabled) hint(s.reason ?? "Não serve para estes arquivos");
    else if (s.children.length) {
      hint("Mova para fora para escolher");
      if (subOf !== h.index) subTimer = window.setTimeout(() => openSub(h.index), 160);
    } else hint(`Solte → ${s.label}`);
    if (!s.children.length && subOf >= 0) subTimer = window.setTimeout(closeSub, 320);
  } else if (h.kind === "sub") {
    const p = slices[subOf];
    const c = p?.children[h.index];
    if (c) hint(`Solte → ${p.label} · ${c.label}`);
  } else {
    hint("Esc para fechar");
  }
}

function hitAt(x: number, y: number): Hit {
  const c = center();
  return hitTest(x - c.x, y - c.y, slices.length, subOf >= 0 ? { parent: subOf, count: slices[subOf].children.length } : undefined);
}

function activate(h: Hit) {
  if (closing) return;
  if (busy) return;
  if (doneOutput && h.kind === "center") {
    void Convert.reveal(doneOutput);
    retract();
    return;
  }
  if (h.kind === "center" || h.kind === "outside") {
    retract();
    return;
  }
  if (h.kind === "slice") {
    const s = slices[h.index];
    if (!s?.enabled) return;
    if (s.children.length) { openSub(h.index); return; }
    run(s);
    return;
  }
  const c = slices[subOf]?.children[h.index];
  if (c?.enabled) run(c);
}

function run(s: RingSlice) {
  if (s.action === "ask") {
    const i = Number(s.id.split(":")[1] ?? -1);
    void Convert.menuAction("ask", paths(), QUICK_PROMPTS[i]?.prompt);
    retract();
  } else if (s.action === "open-converter") {
    void Convert.menuAction("open-converter", paths());
    retract();
  } else {
    void runAction(s.action, s.label);
  }
}

async function runAction(action: string, label: string) {
  busy = true;
  closeSub();
  root.classList.add("busy");
  setProgress(0.04);
  raven.set("thinking");
  hint(`${label}…`);
  try {
    job = await Convert.menuAction(action, paths());
  } catch (e) {
    message(String(e).replace(/^Error:\s*/, ""));
  }
}

function setProgress(p: number) {
  progress.style.setProperty("--p", String(Math.max(0, Math.min(1, p))));
}

function message(text: string) {
  busy = false;
  raven.set("error");
  hint(text, true);
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(retract, 2800);
}

/** Recolhe as fatias na ordem inversa e só então esconde a janela. */
export function retract() {
  if (closing) return;
  closing = true;
  window.clearTimeout(closeTimer);
  window.clearTimeout(subTimer);
  const n = slices.length;
  for (const nodes of [slicesG.children, labels.children]) {
    [...nodes].forEach((g, i) => (g as HTMLElement).style.setProperty("--d", reducedMotion() ? "0ms" : `${(n - 1 - i) * 22}ms`));
  }
  root.classList.add("closing");
  root.classList.remove("open", "shown", "sub-shown");
  const wait = reducedMotion() ? 0 : n * 22 + POP_MS;
  window.setTimeout(() => {
    job = null;
    void Convert.menuClose();
  }, wait);
}

function reset() {
  plan = null;
  icon = null;
  job = null;
  slices = [];
  closing = false;
  busy = false;
  doneOutput = null;
  hover = { kind: "center" };
  window.clearTimeout(closeTimer);
  root.classList.remove("closing", "busy", "open", "done");
  closeSub();
  slicesG.replaceChildren();
  labels.replaceChildren();
  hubIcon.replaceChildren(el("span", "fm-file-rune c-other", "ᛟ"));
  hubTitle.textContent = "";
  badge.classList.remove("on");
}

void on<unknown>("filee-menu-open", () => {
  reset();
  raven.set(reducedMotion() ? "thinking" : "flyIn");
  hint("Lendo…");
  requestAnimationFrame(() => root.classList.add("shown"));
});

void on<PlanPayload>("filee-menu-plan", (p) => {
  if (!p.plan) { message(p.error ?? "Não achei um arquivo aqui."); return; }
  plan = p.plan;
  icon = p.icon ?? null;
  slices = p.plan.ring?.slices ?? [];
  drawHub();
  drawSlices();
  raven.set("listening");
  idleHint();
  mark({ kind: "center" });
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("open")));
  void Convert.menuRadius(hitRadius(false));
});

void on<{ x: number; y: number }>("filee-menu-release", ({ x, y }) => activate(hitAt(x, y)));
void on<null>("filee-menu-escape", () => retract());

void on<ItemReport>("convert-item", (r) => {
  if (job == null || r.job !== job) return;
  setProgress(r.state === "done" ? 1 : r.progress);
  if (r.state === "done") {
    busy = false;
    raven.set("success");
    doneOutput = r.outputs[0] ?? null;
    root.classList.add("done");
    hubTitle.textContent = "Pronto!";
    const name = r.outputs.length > 1 ? `${r.outputs.length} arquivos` : baseName(r.outputs[0] ?? "");
    hint(`${name} · clique para abrir a pasta`);
    closeTimer = window.setTimeout(retract, 4200);
  } else if (r.state === "failed") {
    message(r.error ?? "Não deu certo.");
  }
});

document.addEventListener("pointermove", (e) => setHover(hitAt(e.clientX, e.clientY)));
document.addEventListener("click", (e) => activate(hitAt(e.clientX, e.clientY)));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") retract(); });
// Clique direito dentro do anel: nada de menu nativo.
document.addEventListener("contextmenu", (e) => e.preventDefault());
