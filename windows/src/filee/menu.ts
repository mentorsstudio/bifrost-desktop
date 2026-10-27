// O anel do gesto (fileemenu.html): Ctrl + segurar o botão direito sobre um
// arquivo. O ícone do arquivo fica no miolo; as ações surgem uma atrás da outra
// em volta, e o Huginn pousa no topo do anel com um balãozinho que diz o nome
// do botão sob o mouse. "Converter para…" e "Enviar para a IA" abrem um segundo
// arco por fora. Soltar o botão sobre um item roda; Esc ou clique fora fecha
// (o anel recolhe na ordem inversa). O acerto é pela fatia (ring.ts).

import "../theme/runic.css";
import "../theme/motion.css";
import "../bifrost/nordic.css";
import "../theme/themes.css";
import "../theme/themes";
import "../bifrost/contextmenu";
import "./menu.css";
import { Mascot } from "../bifrost/mascots";
import { reducedMotion } from "../bifrost/motion";
import {
  CATEGORY_RUNE, Convert, QUICK_PROMPTS, baseName, on,
  type ItemReport, type Plan,
} from "./api";
import { RING, hitRadius, hitTest, polar, ringAngles, subAngles, type Hit } from "./ring";

interface PlanPayload { plan: Plan | null; error: string | null; icon?: string | null }

export type Slice = { id: string; label: string; rune: string; sub?: "convert" | "ask"; hint?: string; disabled?: boolean; run?: () => void };

const STAGGER = 35;
/** Rótulos curtos para os botões pequenos do segundo arco (o nome inteiro vai no miolo). */
const SHORT: Record<string, string> = { "O que é isso?": "O quê?", Resumir: "Resumo", Explicar: "Explica", "Extrair dados": "Dados", Traduzir: "Traduz" };
const POP = 260;

const root = document.getElementById("fm-root")!;
const ring = el("div", "fm-ring");
const track = el("div", "fm-track");
const core = el("div", "fm-core");
const coreIcon = el("div", "fm-core-icon");
const badge = el("span", "fm-badge");
const coreLabel = el("div", "fm-core-label");
const progress = el("div", "fm-progress");
core.append(progress, coreIcon, badge, coreLabel);
const perch = el("div", "fm-perch");
const ravenBox = el("div", "fm-raven");
const raven = new Mascot("huginn", ravenBox);
const bubble = el("div", "fm-bubble");
perch.append(ravenBox, bubble);
const slicesBox = el("div", "fm-slices");
const subBox = el("div", "fm-subs");
ring.append(track, subBox, slicesBox, core, perch);
root.append(ring);

let plan: Plan | null = null;
let icon: string | null = null;
let job: number | null = null;
let slices: Slice[] = [];
let angles: number[] = [];
let subs: Slice[] = [];
let subA: number[] = [];
let subOf = -1;
let hover: Hit = null;
let closeTimer = 0;
let subTimer = 0;
let closing = false;
let busy = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** O centro do anel na janela (o Rust já empurrou a janela para dentro da tela). */
function center() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/** O nome do botão sob o mouse: no balãozinho do Huginn ou, com o segundo arco
 *  aberto (que passa por cima do corvo), no miolo, sob o ícone. */
function say(text: string) {
  const inCore = subOf >= 0;
  bubble.textContent = inCore ? "" : text;
  bubble.classList.toggle("on", !inCore && !!text);
  core.classList.toggle("speaking", inCore);
  coreLabel.textContent = inCore ? text : fileLabel();
}

function fileLabel(): string {
  const files = plan?.files ?? [];
  return files.length > 1 ? `${files.length} arquivos` : files[0]?.name ?? "";
}

function target(id: string) {
  return plan?.targets.find((t) => t.id === id);
}

function tool(id: string, rune: string, label: string): Slice | null {
  const t = target(id);
  if (!t) return null;
  return { id, label, rune, disabled: !t.ready, hint: t.ready ? undefined : `Precisa do ${t.needsLabel}`, run: () => void runAction(id) };
}

export function mainSlices(p: Plan | null): Slice[] {
  const files = p?.files ?? [];
  const allPdf = files.length > 1 && files.every((f) => f.category === "pdf");
  const out: (Slice | null)[] = [];
  if (p?.targets.some((t) => t.group === "convert")) out.push({ id: "sub-convert", label: "Converter para…", rune: "ᚱ", sub: "convert" });
  out.push(tool("compress", "ᚲ", "Comprimir"));
  out.push(tool("resize", "ᛊ", "Redimensionar"));
  if (allPdf) out.push(tool("merge-pdf", "ᛗ", "Juntar PDFs"));
  out.push({ id: "sub-ask", label: "Enviar para a IA", rune: "ᚺ", sub: "ask" });
  out.push({ id: "open-converter", label: "Abrir no Conversor", rune: "ᛟ", run: () => void Convert.menuAction("open-converter", paths()) });
  return out.filter((x): x is Slice => !!x);
}

function subSlices(kind: "convert" | "ask"): Slice[] {
  if (kind === "convert") {
    return (plan?.targets ?? []).filter((t) => t.group === "convert").slice(0, 9).map((t) => ({
      id: t.id, label: t.label, rune: t.label.length > 4 ? t.label.slice(0, 4) : t.label,
      disabled: !t.ready, hint: t.ready ? `Converter para ${t.label}` : `Precisa do ${t.needsLabel}`, run: () => void runAction(t.id),
    }));
  }
  const ask: Slice[] = QUICK_PROMPTS.map((q) => ({ id: `ask:${q.label}`, label: q.label, rune: SHORT[q.label] ?? q.label.slice(0, 5), run: () => void Convert.menuAction("ask", paths(), q.prompt) }));
  ask.push({ id: "ask-open", label: "Só abrir o chat", rune: "Chat", run: () => void Convert.menuAction("ask", paths()) });
  return ask;
}

function paths(): string[] {
  return plan?.files.map((f) => f.path) ?? [];
}

function button(s: Slice, angle: number, r: number, i: number, cls: string): HTMLElement {
  const b = el("button", `${cls}${s.disabled ? " off" : ""}${s.sub ? " has-sub" : ""}`);
  b.setAttribute("role", "menuitem");
  b.setAttribute("aria-label", s.hint && s.disabled ? `${s.label} — ${s.hint}` : s.label);
  b.dataset.act = s.id;
  const p = polar(angle, r);
  b.style.setProperty("--x", `${p.x}px`);
  b.style.setProperty("--y", `${p.y}px`);
  b.style.setProperty("--i", String(i));
  b.append(el("span", "fm-glyph", s.rune));
  if (cls === "fm-slice") b.append(el("span", "fm-cap", s.label));
  return b;
}

function drawCore() {
  const files = plan?.files ?? [];
  const f = files[0];
  coreIcon.replaceChildren();
  if (icon) {
    const img = el("img", "fm-file-img");
    img.src = icon;
    img.alt = "";
    coreIcon.append(img);
  } else {
    coreIcon.append(el("span", `fm-file-rune c-${f?.category ?? "other"}`, CATEGORY_RUNE[f?.category ?? "other"]));
  }
  badge.textContent = files.length > 1 ? String(files.length) : "";
  badge.classList.toggle("on", files.length > 1);
  coreLabel.textContent = fileLabel();
}

function stagger(nodes: HTMLElement[], reverse = false) {
  nodes.forEach((n, i) => {
    const k = reverse ? nodes.length - 1 - i : i;
    n.style.setProperty("--d", reducedMotion() ? "0ms" : `${k * STAGGER}ms`);
  });
}

function openRing() {
  closing = false;
  busy = false;
  root.classList.remove("closing", "busy");
  slices = mainSlices(plan);
  angles = ringAngles(slices.length);
  slicesBox.replaceChildren(...slices.map((s, i) => button(s, angles[i], RING.itemR, i, "fm-slice")));
  closeSub();
  drawCore();
  raven.set("listening");
  say(plan && plan.files.length > 1 ? "O que faço com eles?" : "O que faço com ele?");
  const nodes = [...slicesBox.children] as HTMLElement[];
  stagger(nodes);
  requestAnimationFrame(() => ring.classList.add("open"));
  void Convert.menuRadius(hitRadius(false));
}

function openSub(index: number) {
  const s = slices[index];
  if (!s?.sub || subOf === index) return;
  subOf = index;
  subs = subSlices(s.sub);
  subA = subAngles(angles[index], subs.length);
  subBox.replaceChildren(...subs.map((x, i) => button(x, subA[i], RING.subR, i, "fm-sub")));
  stagger([...subBox.children] as HTMLElement[]);
  for (const c of slicesBox.children) c.classList.remove("parent");
  slicesBox.children[index]?.classList.add("parent");
  requestAnimationFrame(() => subBox.classList.add("open"));
  say(s.label);
  void Convert.menuRadius(hitRadius(true));
}

function closeSub() {
  subOf = -1;
  subs = [];
  subA = [];
  subBox.classList.remove("open");
  subBox.replaceChildren();
  for (const c of slicesBox.children) c.classList.remove("parent");
  core.classList.remove("speaking");
  coreLabel.textContent = fileLabel();
  void Convert.menuRadius(hitRadius(false));
}

function setHover(h: Hit) {
  const same = JSON.stringify(h) === JSON.stringify(hover);
  hover = h;
  if (same) return;
  for (const c of root.querySelectorAll(".on")) if (c !== bubble && c !== badge) c.classList.remove("on");
  window.clearTimeout(subTimer);
  if (h?.kind === "item") {
    const s = slices[h.index];
    slicesBox.children[h.index]?.classList.add("on");
    say(s.disabled ? s.hint ?? s.label : s.label);
    if (s.sub && subOf !== h.index) subTimer = window.setTimeout(() => openSub(h.index), 220);
    else if (!s.sub && subOf >= 0) subTimer = window.setTimeout(closeSub, 380);
  } else if (h?.kind === "sub") {
    const s = subs[h.index];
    subBox.children[h.index]?.classList.add("on");
    say(s.hint ?? s.label);
  } else if (!busy) {
    say(plan && plan.files.length > 1 ? "O que faço com eles?" : "O que faço com ele?");
  }
}

function hitAt(x: number, y: number): Hit {
  const c = center();
  return hitTest(x - c.x, y - c.y, angles, subA);
}

function activate(h: Hit) {
  if (!h || closing || busy) return;
  if (h.kind === "core") return;
  if (h.kind === "item") {
    const s = slices[h.index];
    if (!s || s.disabled) return;
    if (s.sub) { openSub(h.index); return; }
    s.run?.();
    if (s.id === "open-converter") retract();
    return;
  }
  const s = subs[h.index];
  if (!s || s.disabled) return;
  s.run?.();
  if (s.id.startsWith("ask")) retract();
}

async function runAction(action: string) {
  busy = true;
  root.classList.add("busy");
  setProgress(0.04);
  raven.set("thinking");
  say("Trabalhando nisso…");
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
  raven.set("error");
  say(text);
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(retract, 2600);
}

/** Recolhe o anel na ordem inversa e só então esconde a janela. */
export function retract() {
  if (closing) return;
  closing = true;
  window.clearTimeout(closeTimer);
  window.clearTimeout(subTimer);
  const all = [...subBox.children, ...slicesBox.children] as HTMLElement[];
  stagger(all, true);
  root.classList.add("closing");
  ring.classList.remove("open", "shown");
  subBox.classList.remove("open");
  const wait = reducedMotion() ? 0 : all.length * STAGGER + POP;
  window.setTimeout(() => {
    job = null;
    void Convert.menuClose();
  }, wait);
}

void on<unknown>("filee-menu-open", () => {
  plan = null;
  icon = null;
  job = null;
  closing = false;
  busy = false;
  window.clearTimeout(closeTimer);
  root.classList.remove("closing", "busy");
  ring.classList.remove("open", "shown");
  slicesBox.replaceChildren();
  closeSub();
  slices = [];
  angles = [];
  coreIcon.replaceChildren(el("span", "fm-file-rune c-other", "ᛟ"));
  coreLabel.textContent = "";
  badge.classList.remove("on");
  raven.set(reducedMotion() ? "thinking" : "flyIn");
  say("Deixa eu ver…");
  requestAnimationFrame(() => ring.classList.add("shown"));
});

void on<PlanPayload>("filee-menu-plan", (p) => {
  if (!p.plan) { message(p.error ?? "Não achei um arquivo aqui."); return; }
  plan = p.plan;
  icon = p.icon ?? null;
  openRing();
});

void on<{ x: number; y: number }>("filee-menu-release", ({ x, y }) => activate(hitAt(x, y)));
void on<null>("filee-menu-escape", () => retract());

void on<ItemReport>("convert-item", (r) => {
  if (job == null || r.job !== job) return;
  setProgress(r.state === "done" ? 1 : r.progress);
  if (r.state === "done") {
    raven.set("success");
    const name = r.outputs.length > 1 ? `${r.outputs.length} arquivos` : baseName(r.outputs[0] ?? "");
    say(`Pronto! ${name}`);
    busy = false;
    root.classList.remove("busy");
    slices = [{ id: "reveal", label: "Abrir pasta", rune: "ᛟ", run: () => { void Convert.reveal(r.outputs[0]); retract(); } }];
    angles = [0];
    slicesBox.replaceChildren(button(slices[0], 0, RING.itemR, 0, "fm-slice"));
    closeTimer = window.setTimeout(retract, 4200);
  } else if (r.state === "failed") {
    busy = false;
    root.classList.remove("busy");
    message(r.error ?? "Não deu certo.");
  }
});

document.addEventListener("pointermove", (e) => setHover(hitAt(e.clientX, e.clientY)));
document.addEventListener("pointerleave", () => setHover(null));
document.addEventListener("click", (e) => {
  const h = hitAt(e.clientX, e.clientY);
  if (h === null && !closing) { retract(); return; }
  activate(h);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") retract(); });
// Clique direito dentro do anel: nada de menu nativo.
document.addEventListener("contextmenu", (e) => e.preventDefault());
