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
import "./menu-page.css";
import { Mascot } from "../bifrost/mascots";
import { reducedMotion } from "../bifrost/motion";
import { CATEGORY_RUNE, Convert, QUICK_PROMPTS, baseName, on, type ItemReport, type Plan, type RingSlice } from "./api";
import { hitRadius, hitTest, type Hit } from "./ring";
import { Donut } from "./donut";
import { readRingStyle } from "./ring-style";

interface PlanPayload { plan: Plan | null; error: string | null; icon?: string | null }

const POP_MS = 300;

const root = document.getElementById("fm-root")!;
root.classList.add("fm-ring");
const donut = new Donut(root, reducedMotion);
const { hubIcon, badge, hubTitle, progress, ravenBox } = donut;
const raven = new Mascot("huginn", ravenBox);
donut.setStyle(readRingStyle());

let plan: Plan | null = null;
let icon: string | null = null;
let job: number | null = null;
let slices: RingSlice[] = [];
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
  donut.hint(text, danger);
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

function drawSlices() {
  donut.draw(slices);
}

function openSub(index: number) {
  if (donut.openSub(index)) void Convert.menuRadius(hitRadius(true));
}

function closeSub() {
  donut.closeSub();
  void Convert.menuRadius(hitRadius(false));
}

function mark(h: Hit) {
  donut.mark(h);
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
      if (donut.subOf !== h.index) subTimer = window.setTimeout(() => openSub(h.index), 160);
    } else hint(`Solte → ${s.label}`);
    if (!s.children.length && donut.subOf >= 0) subTimer = window.setTimeout(closeSub, 320);
  } else if (h.kind === "sub") {
    const p = slices[donut.subOf];
    const c = p?.children[h.index];
    if (c) hint(`Solte → ${p.label} · ${c.label}`);
  } else {
    hint("Esc para fechar");
  }
}

function hitAt(x: number, y: number): Hit {
  const c = center();
  return hitTest(x - c.x, y - c.y, slices.length, donut.subOf >= 0 ? { parent: donut.subOf, count: slices[donut.subOf].children.length } : undefined);
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
  const c = slices[donut.subOf]?.children[h.index];
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
  const wait = donut.retractDelays(POP_MS);
  root.classList.add("closing");
  root.classList.remove("open", "shown", "sub-shown");
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
  donut.clear();
  donut.setStyle(readRingStyle());
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
