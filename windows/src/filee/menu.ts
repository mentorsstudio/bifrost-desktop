// O corvo do gesto (fileemenu.html): Ctrl + botão direito sobre um arquivo e o
// Huginn pousa no cursor com um balão de ações. Soltar o botão sobre uma ação
// (o Rust manda "filee-menu-release") ou clicar nela, roda. "Converter para…"
// e "Enviar para a IA" abrem um segundo balão. Depois de começar, o balão vira
// o progresso e some sozinho.

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
  CATEGORY_RUNE, Convert, QUICK_PROMPTS, actionLabel, baseName, on,
  type ItemReport, type Plan, type TargetInfo,
} from "./api";

interface OpenPayload { anchorX: number; anchorY: number; flipX: boolean; flipY: boolean }
interface PlanPayload { plan: Plan | null; error: string | null }

type Item = { id: string; label: string; rune: string; sub?: "convert" | "ask"; hint?: string; disabled?: boolean; run?: () => void };

const root = document.getElementById("fm-root")!;
const ravenBox = document.createElement("div");
ravenBox.className = "fm-raven";
const raven = new Mascot("huginn", ravenBox);
const balloon = document.createElement("div");
balloon.className = "fm-balloon";
balloon.setAttribute("role", "menu");
root.append(balloon, ravenBox);

let plan: Plan | null = null;
let job: number | null = null;
let closeTimer = 0;
let subTimer = 0;
let view: "loading" | "main" | "convert" | "ask" | "progress" | "message" = "loading";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function place(p: OpenPayload) {
  const W = window.innerWidth, H = window.innerHeight;
  root.classList.toggle("flip-x", p.flipX);
  root.classList.toggle("flip-y", p.flipY);
  // O corvo pousa no cursor; o balão sai dele, para cima e para a direita
  // (ou para o outro lado perto das bordas da tela).
  const rx = p.flipX ? p.anchorX - 70 : p.anchorX + 6;
  const ry = p.flipY ? p.anchorY + 4 : p.anchorY - 62;
  ravenBox.style.left = `${rx}px`;
  ravenBox.style.top = `${ry}px`;
  balloon.style.left = p.flipX ? "" : `${Math.max(8, p.anchorX + 46)}px`;
  balloon.style.right = p.flipX ? `${Math.max(8, W - (p.anchorX - 46))}px` : "";
  balloon.style.bottom = p.flipY ? "" : `${Math.max(8, H - (p.anchorY - 46))}px`;
  balloon.style.top = p.flipY ? `${p.anchorY + 46}px` : "";
}

function header(): HTMLElement {
  const h = el("div", "fm-head");
  const files = plan?.files ?? [];
  const f = files[0];
  h.append(el("span", `fm-rune c-${f?.category ?? "other"}`, CATEGORY_RUNE[f?.category ?? "other"]));
  const t = el("div", "fm-head-text");
  t.append(el("div", "fm-title", files.length > 1 ? `${files.length} arquivos` : f?.name ?? ""));
  t.append(el("div", "fm-sub", files.length > 1 ? files.map((x) => x.name).join(", ") : `${f?.categoryLabel ?? ""} · o que eu faço com ele?`));
  h.append(t);
  return h;
}

function button(it: Item): HTMLElement {
  const b = el("button", `fm-item${it.sub ? " has-sub" : ""}${it.disabled ? " off" : ""}`);
  b.dataset.act = it.id;
  b.setAttribute("role", "menuitem");
  b.append(el("span", "fm-item-rune", it.rune), el("span", "fm-item-label", it.label));
  if (it.hint) b.append(el("span", "fm-item-hint", it.hint));
  if (it.sub) b.append(el("span", "fm-item-chev", "›"));
  b.addEventListener("click", () => activate(b));
  if (it.sub) {
    b.addEventListener("pointerenter", () => { window.clearTimeout(subTimer); subTimer = window.setTimeout(() => show(it.sub!), 320); });
    b.addEventListener("pointerleave", () => window.clearTimeout(subTimer));
  }
  (b as HTMLElement & { _item?: Item })._item = it;
  return b;
}

function target(id: string): TargetInfo | undefined {
  return plan?.targets.find((t) => t.id === id);
}

function toolItem(id: string, rune: string, label: string): Item | null {
  const t = target(id);
  if (!t) return null;
  return { id, label, rune, disabled: !t.ready, hint: t.ready ? undefined : t.needsLabel ?? undefined, run: () => void runAction(id) };
}

function mainItems(): Item[] {
  const items: (Item | null)[] = [];
  if (plan?.targets.some((t) => t.group === "convert")) items.push({ id: "sub-convert", label: "Converter para…", rune: "ᚱ", sub: "convert" });
  items.push(toolItem("compress", "ᚲ", "Comprimir"));
  items.push(toolItem("resize", "ᛊ", "Redimensionar"));
  if ((plan?.files.length ?? 0) > 1) items.push(toolItem("merge-pdf", "ᛗ", "Juntar PDFs"));
  items.push(toolItem("text", "ᛏ", "Extrair texto"));
  items.push({ id: "sub-ask", label: "Enviar para a IA", rune: "ᚺ", sub: "ask" });
  items.push({ id: "open-converter", label: "Abrir no Conversor", rune: "ᛟ", run: () => void Convert.menuAction("open-converter", paths()) });
  return items.filter((x): x is Item => !!x);
}

function paths(): string[] {
  return plan?.files.map((f) => f.path) ?? [];
}

function show(v: typeof view, message?: string) {
  view = v;
  window.clearTimeout(closeTimer);
  balloon.className = `fm-balloon v-${v}`;
  balloon.replaceChildren();
  if (v === "loading") {
    raven.set("thinking");
    balloon.append(el("div", "fm-say", "Deixa eu ver o que é isso…"));
  } else if (v === "message") {
    raven.set("error");
    balloon.append(el("div", "fm-say", message ?? ""));
    closeTimer = window.setTimeout(close, 2600);
  } else if (v === "main") {
    raven.set("listening");
    const list = el("div", "fm-list");
    list.append(...mainItems().map(button));
    balloon.append(header(), list);
  } else if (v === "convert") {
    const back = button({ id: "back", label: "Voltar", rune: "‹", run: () => show("main") });
    back.classList.add("fm-back");
    const grid = el("div", "fm-grid");
    for (const t of (plan?.targets ?? []).filter((x) => x.group === "convert")) {
      const b = el("button", `fm-chip${t.ready ? "" : " off"}`);
      b.dataset.act = t.id;
      b.title = t.ready ? actionLabel(t.id) : `Precisa do ${t.needsLabel}`;
      b.append(el("span", "fm-chip-label", t.label));
      if (!t.ready) b.append(el("span", "fm-chip-need", t.needsLabel ?? ""));
      (b as HTMLElement & { _item?: Item })._item = { id: t.id, label: t.label, rune: "", disabled: !t.ready, run: () => void runAction(t.id) };
      b.addEventListener("click", () => activate(b));
      grid.append(b);
    }
    balloon.append(el("div", "fm-say small", "Converter para…"), grid, back);
  } else if (v === "ask") {
    raven.set("thinking");
    const list = el("div", "fm-list");
    for (const q of QUICK_PROMPTS) list.append(button({ id: `ask:${q.label}`, label: q.label, rune: "ᚨ", run: () => void Convert.menuAction("ask", paths(), q.prompt) }));
    list.append(button({ id: "ask-open", label: "Só abrir o chat", rune: "ᛉ", run: () => void Convert.menuAction("ask", paths()) }));
    const back = button({ id: "back", label: "Voltar", rune: "‹", run: () => show("main") });
    back.classList.add("fm-back");
    balloon.append(el("div", "fm-say small", "Pergunto o quê à IA?"), list, back);
  } else if (v === "progress") {
    raven.set("thinking");
    balloon.append(el("div", "fm-say", "Trabalhando nisso…"), el("div", "fm-bar"));
    (balloon.querySelector(".fm-bar") as HTMLElement).append(el("i", ""));
  }
  if (!reducedMotion()) {
    balloon.animate([{ opacity: 0.4, transform: "scale(.96)" }, { opacity: 1, transform: "scale(1)" }], { duration: 220, easing: "cubic-bezier(.2,.9,.25,1.15)" });
  }
}

function activate(b: HTMLElement) {
  const it = (b as HTMLElement & { _item?: Item })._item;
  if (!it || it.disabled) return;
  if (it.sub) { show(it.sub); return; }
  it.run?.();
}

async function runAction(action: string) {
  show("progress");
  try {
    job = await Convert.menuAction(action, paths());
  } catch (e) {
    show("message", String(e).replace(/^Error:\s*/, ""));
  }
}

function close() {
  window.clearTimeout(closeTimer);
  job = null;
  void Convert.menuClose();
}

void on<OpenPayload>("filee-menu-open", (p) => {
  plan = null;
  job = null;
  place(p);
  if (!reducedMotion()) raven.set("flyIn");
  show("loading");
});

void on<PlanPayload>("filee-menu-plan", (p) => {
  if (view !== "loading") return;
  if (!p.plan) { show("message", p.error ?? "Não achei um arquivo aqui."); return; }
  plan = p.plan;
  show("main");
});

void on<{ x: number; y: number }>("filee-menu-release", ({ x, y }) => {
  const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-act]");
  if (hit) activate(hit);
});

void on<null>("filee-menu-escape", () => { job = null; });

void on<ItemReport>("convert-item", (r) => {
  if (job == null || r.job !== job) return;
  const bar = balloon.querySelector<HTMLElement>(".fm-bar i");
  if (bar) bar.style.transform = `scaleX(${r.state === "done" ? 1 : r.progress})`;
  if (r.state === "done") {
    raven.set("success");
    balloon.replaceChildren();
    const name = r.outputs.length > 1 ? `${r.outputs.length} arquivos` : baseName(r.outputs[0] ?? "");
    balloon.append(el("div", "fm-say", "Pronto!"), el("div", "fm-done-name", name));
    const open = el("button", "fm-item fm-open");
    open.dataset.act = "reveal";
    open.append(el("span", "fm-item-rune", "ᛟ"), el("span", "fm-item-label", "Abrir pasta"));
    (open as HTMLElement & { _item?: Item })._item = { id: "reveal", label: "", rune: "", run: () => { void Convert.reveal(r.outputs[0]); close(); } };
    open.addEventListener("click", () => activate(open));
    balloon.append(open);
    view = "message";
    closeTimer = window.setTimeout(close, 4200);
  } else if (r.state === "failed") {
    show("message", r.error ?? "Não deu certo.");
  }
});

// Clique direito dentro do balão: nada de menu nativo.
document.addEventListener("contextmenu", (e) => e.preventDefault());
