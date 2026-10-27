// O Conversor na ilha: o arquivo solto em "Solte seus arquivos aqui" ganha
// "Converter…" (uma vista própria, com os formatos e as ferramentas) ao lado de
// "Enviar para a IA"; e o gesto do Huginn manda arquivos para o chat da ilha
// ("filee-ask") com os atalhos de pergunta.

import { h, clear } from "../views/dom";
import { btn, card } from "../views/kit";
import { Bridge } from "../core/bridge";
import { State } from "../core/state";
import type { IslandViewName } from "../core/layout";
import type { ViewActions, ViewHost } from "../views/views";
import { registerAttachAction } from "../views/attach";
import { ICONS } from "../views/icons";
import { Convert, QUICK_PROMPTS, actionLabel, baseName, on, type ItemReport, type Plan } from "./api";

/** O original do arquivo solto (o chat usa a cópia da caixa de entrada). */
export const FileeIsland = {
  original: null as string[] | null,
  /** Pergunta escolhida no balão do gesto: o chat a envia sozinho. */
  pendingPrompt: null as string | null,
};

export interface AskHost { alert(v: IslandViewName): void }

/** "Enviar para a IA" do gesto: a ilha abre no chat com o arquivo. */
export async function fileeAsk(island: AskHost, p: { paths: string[]; prompt: string | null }): Promise<void> {
  const path = p.paths[0];
  if (!path) return;
  const name = baseName(path);
  FileeIsland.original = p.paths;
  FileeIsland.pendingPrompt = p.prompt;
  State.droppedFile = { name, path };
  State.promptContext = { kind: "file", name, path };
  State.chatHistory = [];
  void Bridge.chatReset();
  try {
    const f = await Bridge.ingestFile(path);
    State.droppedFile = { name: f.name, path: f.path };
    State.promptContext = { kind: "file", name: f.name, path: f.path };
  } catch (err) {
    State.noteMessage = String(err).replace(/^Error:\s*/, "");
    island.alert("note");
    return;
  }
  island.alert("prompt");
  State.notify();
}

/** Os atalhos de pergunta, ao lado do arquivo no chat. */
export function quickPrompts(send: (prompt: string) => void): HTMLElement {
  const row = h("div", { class: "fl-quick" });
  for (const q of QUICK_PROMPTS) {
    const b = h("button", { class: "fl-quick-chip", text: q.label, title: q.prompt });
    b.addEventListener("click", (e) => { e.stopPropagation(); send(q.prompt); });
    row.append(b);
  }
  return row;
}

/** Vista "convert" da ilha: o que fazer com o arquivo solto. */
export function buildConvertView(actions: ViewActions): ViewHost {
  const title = h("div", { class: "title fl-i-title" });
  const chips = h("div", { class: "fl-i-chips" });
  const status = h("div", { class: "fl-i-status" });
  const row = h("div", { class: "actions fl-i-actions" },
    btn("Enviar para a IA", "primary", () => actions.setView("prompt")),
    btn("Abrir no Conversor", "secondary", () => {
      const ps = FileeIsland.original ?? [];
      if (ps.length) void Convert.menuAction("open-converter", ps);
    }),
    btn("Cancelar", "secondary", () => actions.cancelDrop()),
  );
  const el = h("div", { class: "view" }, card(null, h("div", { class: "stack fl-i-stack" }, title, chips, status, row)));
  let drawnFor = "";
  let plan: Plan | null = null;
  let job: number | null = null;

  async function load(paths: string[]) {
    plan = await Convert.plan(paths).catch(() => null);
    draw();
  }

  function draw() {
    clear(chips);
    const ts = plan?.targets ?? [];
    const conv = ts.filter((t) => t.group === "convert").slice(0, 7);
    const tools = ts.filter((t) => t.group === "tools" && ["compress", "resize", "text", "extract", "split-pdf"].includes(t.id));
    for (const t of [...conv, ...tools]) {
      const b = h("button", { class: `fl-i-chip ${t.group}${t.ready ? "" : " off"}`, text: t.group === "convert" ? t.label : actionLabel(t.id), title: t.ready ? actionLabel(t.id) : `Precisa do ${t.needsLabel} (veja o Conversor)` }) as HTMLButtonElement;
      b.disabled = !t.ready;
      b.addEventListener("click", () => void run(t.id));
      chips.append(b);
    }
    if (!ts.length) chips.append(h("span", { class: "fl-i-none", text: "Nada para converter neste arquivo." }));
  }

  async function run(action: string) {
    const ps = FileeIsland.original ?? [];
    if (!ps.length) return;
    status.textContent = `${actionLabel(action)}…`;
    status.className = "fl-i-status busy";
    State.stateOverride = "working";
    State.notify();
    job = await Convert.start(ps, action).catch(() => null);
  }

  void on<ItemReport>("convert-item", (r) => {
    if (job == null || r.job !== job) return;
    if (r.state === "running") status.textContent = r.progress > 0 ? `${Math.round(r.progress * 100)} %…` : status.textContent;
    if (r.state === "done") {
      State.stateOverride = null;
      clear(status);
      status.className = "fl-i-status done";
      const out = r.outputs[0] ?? "";
      const open = h("button", { class: "fl-i-link", text: "Abrir pasta" });
      open.addEventListener("click", () => void Convert.reveal(out));
      status.append(h("span", { text: `Pronto: ${r.outputs.length > 1 ? `${r.outputs.length} arquivos` : baseName(out)}` }), open);
      State.notify();
    } else if (r.state === "failed") {
      State.stateOverride = null;
      status.className = "fl-i-status error";
      status.textContent = r.error ?? "Não deu certo.";
      State.notify();
    }
  });

  return {
    el,
    sync() {
      const name = State.droppedFile?.name ?? "";
      clear(title);
      title.append(h("b", { text: name || "arquivo" }), document.createTextNode(" — converter para…"));
      const key = (FileeIsland.original ?? []).join("|");
      if (key && key !== drawnFor) {
        drawnFor = key;
        status.textContent = "";
        status.className = "fl-i-status";
        void load(FileeIsland.original!);
      }
    },
  };
}

// ── O "+" do compositor: anexar e converter pelo seletor nativo do Conversor ──
/** Escolhe arquivos no seletor nativo; sem ele (dev/navegador), volta à vista de soltar. */
async function pick(): Promise<string[] | null> {
  try { const ps = await Convert.pickFiles(); return ps ?? []; } catch { return null; }
}
registerAttachAction({
  id: "file", label: "Anexar arquivo…", icon: ICONS.doc, order: 10,
  run: async (c) => {
    c.done();
    const ps = await pick();
    if (ps === null) { State.view = "upload"; State.notify(); return; }
    const path = ps[0];
    if (!path) return;
    FileeIsland.original = ps;
    try { const f = await Bridge.ingestFile(path); c.attachFile(f.name, f.path); }
    catch (err) { State.noteMessage = String(err).replace(/^Error:\s*/, ""); State.view = "note"; State.notify(); }
  },
});
registerAttachAction({
  id: "convert", label: "Converter arquivo…", icon: ICONS.doc, order: 15,
  run: async (c) => {
    c.done();
    const ps = await pick();
    if (!ps || !ps.length) return;
    FileeIsland.original = ps;
    State.droppedFile = { name: baseName(ps[0]), path: ps[0] };
    State.view = "convert"; State.notify();
  },
});
