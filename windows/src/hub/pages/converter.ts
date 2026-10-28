import { gesturePicker } from "../../filee/gesture-picker";
import { gestureShort } from "../../core/gesture-trigger";
// Conversor: o Filee dentro do Bifrost. Uma área de soltar com o Huginn, os
// formatos possíveis para o que foi solto (só os que fazem sentido), opções,
// a fila com progresso e "Abrir pasta", as ferramentas opcionais (FFmpeg,
// PDFium sob demanda; Pandoc, LibreOffice, ImageMagick, 7-Zip detectados) e o
// gesto Ctrl + botão direito. Tudo offline, no próprio PC.

import "../../filee/filee.css";
import { h, clear } from "../../views/dom";
import type { HubContext } from "../shell";
import { button, card, label, row, segmented, toggle } from "../ui";
import { Mascot, type MascotState } from "../../bifrost/mascots";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  CATEGORY_RUNE, Convert, actionLabel, fmtSize, on,
  type FileePrefs, type ItemReport, type Options, type Plan, type TargetInfo, type ToolProgress, type ToolStatus,
} from "../../filee/api";
import { reducedMotion } from "../../bifrost/motion";
import { fitAll } from "../../core/fit-text";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface QueueItem extends ItemReport { action: string }

// A fila sobrevive a sair e voltar à página (as tarefas continuam no Rust).
const queue = new Map<string, QueueItem>(); // `${job}:${index}`
const jobAction = new Map<number, string>();

export async function converterPage(page: HTMLElement, ctx: HubContext) {
  page.classList.add("fl-page");
  let paths: string[] = [];
  let plan: Plan | null = null;
  let chosen: string | null = null;
  const opts: Options = { quality: 82, maxSide: 1920 };
  const unsubs: (() => void)[] = [];

  const pick = button("Escolher arquivos…", () => void choose(), "primary");
  page.append(ctx.hero("converter", "Conversor", "Solte arquivos, escolha o formato. Tudo no seu PC, sem enviar nada.", [pick]));

  // ── Área de soltar ──
  const ravenHost = h("div", { class: "fl-drop-raven" });
  const raven = new Mascot("huginn", ravenHost);
  raven.set("idle");
  const say = h("div", { class: "fl-drop-say", text: "Solte seus arquivos aqui" });
  const hint = h("div", { class: "fl-drop-hint", text: "Imagens, PDF, documentos, áudio, vídeo e compactados — 1 ou 100 de uma vez." });
  const ring = h("div", { class: "fl-drop-ring", "aria-hidden": "true" }, ..."ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ".split("").map((r, i) => h("span", { text: r, style: `--i:${i}` })));
  const drop = h("div", { class: "fl-drop", role: "button", tabindex: "0", "aria-label": "Área para soltar arquivos" }, ring, ravenHost, h("div", { class: "fl-drop-copy" }, say, hint));
  drop.addEventListener("click", () => void choose());
  drop.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void choose(); });
  page.append(drop);

  const files = h("div", { class: "fl-files" });
  const picker = h("div", { class: "fl-picker" });
  const options = h("div", { class: "fl-options" });
  const runRow = h("div", { class: "fl-run" });
  const work = card(label("Arquivos"), files, label("O que fazer"), picker, options, runRow);
  work.classList.add("fl-work");
  page.append(work);

  const queueBox = h("div", { class: "fl-queue" });
  const queueCard = card(h("div", { class: "fl-card-head" }, label("Fila"), button("Limpar concluídos", () => { for (const [k, q] of queue) if (q.state !== "running" && q.state !== "queued") queue.delete(k); drawQueue(); }, "", true)), queueBox);
  page.append(queueCard);

  const toolsBox = h("div", { class: "fl-tools" });
  page.append(card(label("Ferramentas"), h("div", { class: "hub-note", text: "O básico já vem no Bifrost. Áudio, vídeo e PDF → imagem usam ferramentas que você baixa com um clique; documentos usam o Pandoc ou o LibreOffice se estiverem instalados." }), toolsBox));

  const gestureBox = h("div", { class: "fl-gesture" });
  page.append(card(label("Gesto do Huginn"), gestureBox));

  // ── Estado do corvo ──
  let moodTimer = 0;
  const mood = (s: MascotState, back = 0) => {
    raven.set(s);
    window.clearTimeout(moodTimer);
    if (back) moodTimer = window.setTimeout(() => raven.set("idle"), back);
  };

  async function choose() {
    const picked = (await Convert.pickFiles().catch(() => null)) ?? [];
    if (picked.length) await add(picked);
  }

  async function add(more: string[]) {
    const seen = new Set(paths);
    paths = [...paths, ...more.filter((p) => !seen.has(p))];
    mood("success", 1400);
    await refresh();
  }

  async function refresh() {
    plan = paths.length ? await Convert.plan(paths).catch(() => null) : null;
    if (chosen && !plan?.targets.some((t) => t.id === chosen)) chosen = null;
    drawFiles();
    drawPicker();
    drawOptions();
    drawRun();
    work.classList.toggle("empty", !paths.length);
  }

  function drawFiles() {
    clear(files);
    if (!paths.length) {
      files.append(h("div", { class: "hub-note", text: "Nenhum arquivo ainda. Solte acima ou use “Escolher arquivos…”." }));
      return;
    }
    for (const f of plan?.files ?? paths.map((p) => ({ path: p, name: p.split(/[\\/]/).pop()!, ext: "", category: "other" as const, categoryLabel: "Arquivo", size: 0 }))) {
      const x = h("button", { class: "fl-x", title: "Tirar da lista", "aria-label": `Tirar ${f.name} da lista`, text: "×" });
      x.addEventListener("click", () => { paths = paths.filter((p) => p !== f.path); void refresh(); });
      files.append(h("div", { class: "fl-file", title: f.path },
        h("span", { class: `fl-rune c-${f.category}`, text: CATEGORY_RUNE[f.category] }),
        h("span", { class: "fl-file-name", text: f.name }),
        h("span", { class: "fl-file-meta", text: [f.categoryLabel, f.size ? fmtSize(f.size) : ""].filter(Boolean).join(" · ") }),
        x));
    }
  }

  function targetButton(t: TargetInfo): HTMLElement {
    const b = h("button", { class: ["fl-target", t.group, chosen === t.id ? "on" : "", t.ready ? "" : "locked"].filter(Boolean).join(" "), "aria-pressed": String(chosen === t.id) });
    b.append(h("span", { class: "fl-target-label bf-fit", text: t.group === "convert" ? t.label : actionLabel(t.id) }));
    if (!t.ready && t.needsLabel) b.append(h("span", { class: "fl-target-need", text: t.needsLabel }));
    b.title = t.ready ? actionLabel(t.id) : `Precisa do ${t.needsLabel}`;
    b.addEventListener("click", () => { chosen = t.id; drawPicker(); drawOptions(); drawRun(); });
    return b;
  }

  function drawPicker() {
    clear(picker);
    const ts = plan?.targets ?? [];
    if (!ts.length) {
      picker.append(h("div", { class: "hub-note", text: paths.length ? "Nada a fazer com esta seleção." : "Os formatos aparecem quando houver arquivos." }));
      return;
    }
    const conv = ts.filter((t) => t.group === "convert");
    const tools = ts.filter((t) => t.group === "tools");
    if (conv.length) picker.append(h("div", { class: "fl-group-title", text: "Converter para" }), h("div", { class: "fl-grid" }, ...conv.map(targetButton)));
    if (tools.length) picker.append(h("div", { class: "fl-group-title", text: "Ferramentas" }), h("div", { class: "fl-grid" }, ...tools.map(targetButton)));
    requestAnimationFrame(() => fitAll(picker));
  }

  function drawOptions() {
    clear(options);
    if (!chosen) return;
    const lossy = /^to:(jpg|webp|mp4|webm|mov|mkv)$/.test(chosen) || chosen === "compress";
    if (lossy) {
      const val = h("b", { text: `${opts.quality}` });
      const range = h("input", { type: "range", min: "30", max: "100", value: String(opts.quality), class: "fl-range", "aria-label": "Qualidade" }) as HTMLInputElement;
      range.addEventListener("input", () => { opts.quality = Number(range.value); val.textContent = range.value; });
      options.append(row("Qualidade", "Mais alta = arquivo maior.", h("div", { class: "fl-range-wrap" }, range, val)));
    }
    if (chosen === "resize") {
      const cur = String(opts.maxSide ?? 0);
      options.append(row("Tamanho", "O lado maior da imagem.", segmented<string>([["3840", "4K"], ["1920", "1920"], ["1280", "1280"], ["800", "800"], ["0", "50 %"]], cur, (v) => { opts.maxSide = Number(v) || undefined; opts.percent = Number(v) ? undefined : 50; })));
    }
    if (/^pdf$/.test(plan?.files[0]?.ext ?? "") && /^to:(png|jpg)$/.test(chosen)) {
      options.append(row("Resolução", "Pontos por polegada de cada página.", segmented<string>([["96", "96"], ["150", "150"], ["300", "300"]], String(opts.dpi ?? 150), (v) => { opts.dpi = Number(v); })));
    }
  }

  function drawRun() {
    clear(runRow);
    const t = plan?.targets.find((x) => x.id === chosen);
    const go = button(t ? actionLabel(t.id) : "Escolha um formato", () => void run(), "primary");
    go.disabled = !t || !t.ready;
    const where = h("span", { class: "fl-where", text: prefs?.outDir ? `Salva em ${prefs.outDir}` : "Salva ao lado do original, sem sobrescrever." });
    runRow.append(where, go);
    if (t && !t.ready) {
      const tool = plan?.tools.find((x) => x.id === t.needs);
      runRow.prepend(h("span", { class: "fl-need", text: tool?.downloadable ? `Baixe o ${tool.label} em Ferramentas, abaixo.` : `Instale o ${t.needsLabel} para isso.` }));
    }
  }

  async function run() {
    if (!chosen || !paths.length) return;
    const action = chosen;
    mood("thinking");
    try {
      const job = await Convert.start(paths, action, { ...opts });
      if (job == null) return;
      jobAction.set(job, action);
      queueCard.classList.add("live");
    } catch (e) {
      mood("error", 2000);
    }
  }

  function drawQueue() {
    clear(queueBox);
    if (!queue.size) {
      queueBox.append(h("div", { class: "hub-note", text: "As conversões aparecem aqui, com o progresso de cada arquivo." }));
      return;
    }
    for (const q of [...queue.values()].reverse()) {
      const bar = h("div", { class: "fl-bar" }, h("i", { style: `transform:scaleX(${q.state === "done" ? 1 : q.progress})` }));
      const st = { queued: "Na fila", running: q.progress > 0 ? `${Math.round(q.progress * 100)} %` : "Convertendo…", done: "Pronto", failed: "Falhou", cancelled: "Cancelado" }[q.state];
      const right = h("div", { class: "fl-q-actions" });
      if (q.state === "done" && q.outputs[0]) right.append(button("Abrir pasta", () => void Convert.reveal(q.outputs[0]), "", true));
      if (q.state === "running" || q.state === "queued") right.append(button("Cancelar", () => void Convert.cancel(q.job), "", true));
      const detail = q.state === "failed" ? q.error ?? "" : q.state === "done" ? (q.outputs.length > 1 ? `${q.outputs.length} arquivos` : (q.outputs[0] ?? "").split(/[\\/]/).pop() ?? "") : actionLabel(q.action);
      queueBox.append(h("div", { class: `fl-q ${q.state}` },
        h("div", { class: "fl-q-main" },
          h("div", { class: "fl-q-top" }, h("span", { class: "fl-q-name", text: q.name, title: q.name }), h("span", { class: "fl-q-state", text: st })),
          bar,
          h("div", { class: `fl-q-detail ${q.state === "failed" ? "error" : ""}`, text: detail, title: detail })),
        right));
    }
  }

  // ── Ferramentas ──
  const downloading = new Map<string, number>();
  async function drawTools(list?: ToolStatus[] | null) {
    const tools = list ?? (await Convert.tools().catch(() => null)) ?? [];
    clear(toolsBox);
    for (const t of tools) {
      let trailing: HTMLElement;
      const pct = downloading.get(t.id);
      if (t.path) trailing = h("span", { class: "fl-ok", text: "Pronto" });
      else if (pct !== undefined) trailing = h("div", { class: "fl-bar small" }, h("i", { style: `transform:scaleX(${pct})` }));
      else if (t.downloadable) trailing = button(`Baixar (${t.downloadMb} MB)`, () => void install(t.id), "", true);
      else trailing = h("span", { class: "fl-missing", text: "Não instalado" });
      toolsBox.append(row(t.label, t.path ? `${t.hint}` : t.hint, trailing));
    }
  }
  async function install(id: string) {
    downloading.set(id, 0);
    void drawTools();
    try {
      await Convert.installTool(id as never);
      mood("success", 1600);
    } catch (e) {
      mood("error", 2000);
    }
    downloading.delete(id);
    await drawTools();
    await refresh();
  }

  // ── Gesto ──
  let prefs: FileePrefs | null = await Convert.prefs().catch(() => null);
  prefs ??= { gesture: true, trigger: "ctrl-hold", holdMs: 280, contextMenu: false, outDir: "" };
  function drawGesture() {
    clear(gestureBox);
    const p = prefs!;
    const save = async (change: (p: FileePrefs) => void) => {
      change(p);
      prefs = (await Convert.setPrefs(p).catch(() => null)) ?? p;
      drawGesture();
      drawRun();
    };
    gestureBox.append(
      row(`${gestureShort(p.trigger)} sobre um arquivo`, "No Explorador ou na área de trabalho, um anel de fatias abre em volta do cursor com as conversões do tipo do arquivo. Solte sobre uma fatia; solte no meio para cancelar.", toggle(p.gesture, (v) => void save((x) => { x.gesture = v; }))),
      row("Como abrir", "Clique e faça o gesto. Segurar evita conflito: um toque rápido continua abrindo o menu normal.", gesturePicker(p.trigger, p.holdMs, (v) => void save((x) => { x.trigger = v; }))),
      row("“Bifrost ›” no menu do Explorador", "Entrada clássica (em “Mostrar mais opções” no Windows 11). Só para o seu usuário, sem administrador.", toggle(p.contextMenu, (v) => void save((x) => { x.contextMenu = v; }))),
    );
    const warn = h("div", { class: "fl-hint" });
    gestureBox.append(warn);
    void Convert.gestureStatus(p.trigger).then((st) => {
      if (!st?.filee) return;
      warn.textContent = st.conflict ?? `O Filee também está instalado (${st.fileeTriggers.join(", ") || "sem gatilhos"}). Sem conflito com este gatilho.`;
      warn.classList.toggle("warn", !!st.conflict);
    }).catch(() => undefined);
    const out = h("input", { class: "hub-input fl-out", placeholder: "Ao lado do original", value: p.outDir, "aria-label": "Pasta de saída" }) as HTMLInputElement;
    out.addEventListener("change", () => void save((x) => { x.outDir = out.value.trim(); }));
    gestureBox.append(row("Pasta de saída", "Vazia = ao lado de cada arquivo original.", out));
  }

  // ── Eventos ──
  unsubs.push(await on<ItemReport & { action?: string }>("convert-item", (r) => {
    const key = `${r.job}:${r.index}`;
    const prev = queue.get(key);
    queue.set(key, { ...r, action: prev?.action ?? jobAction.get(r.job) ?? "" });
    if (r.state === "done") mood("success", 1600);
    else if (r.state === "failed") mood("error", 2200);
    drawQueue();
  }));
  unsubs.push(await on<ToolProgress>("convert-tool", (p) => {
    if (p.done) return;
    downloading.set(p.id, p.total ? p.got / p.total : 0.05);
    const bar = toolsBox.querySelector<HTMLElement>(".fl-bar.small i");
    if (bar) bar.style.transform = `scaleX(${downloading.get(p.id)})`; else void drawTools();
  }));
  unsubs.push(await on<string[]>("converter-files", (ps) => void add(ps)));

  if (IS_TAURI) {
    try {
      const un = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") { drop.classList.add("over"); if (raven.state !== "listening") raven.set("listening"); }
        else if (p.type === "leave") { drop.classList.remove("over"); raven.set("idle"); }
        else if (p.type === "drop") { drop.classList.remove("over"); if (p.paths.length) void add(p.paths); }
      });
      unsubs.push(un);
    } catch { /* fora do Tauri */ }
  }
  ctx.onLeave = () => { for (const u of unsubs) u(); };

  if (reducedMotion()) drop.classList.add("still");
  drawQueue();
  drawGesture();
  await drawTools();
  const pending = (await Convert.takePending().catch(() => null)) ?? [];
  if (pending.length) await add(pending); else await refresh();
}
