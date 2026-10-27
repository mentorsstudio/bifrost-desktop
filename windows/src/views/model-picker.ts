// Fase 19 — o seletor de modelos do chat, refeito como popover.
// Uma busca no alto e seções: IA do PC (Claude Code, Codex, Gemini, Ollama,
// LM Studio), Agentes MCP (Hermes VPS e outros) e Remoto. Cada linha: ícone,
// nome, ponto de status, modelo/versão e o check no escolhido. Setas, Enter
// e Esc; rola só na vertical. Escolher troca provedor E modelo (chooseModel).

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { Bridge, type ModelInfo } from "../core/bridge";
import {
  activeModel, chooseModel, filterRows, providerDef, providerGroup, stepIndex, visibleProviders,
  type PickerGroup, type PickerRow, type ProviderDef,
} from "../core/providers";
import { State } from "../core/state";
import { t } from "../i18n/i18n";

export const GROUP_TITLE: Record<PickerGroup, string> = { pc: "IA do PC", mcp: "Agentes MCP", remote: "Remoto" };
type Status = "ok" | "loading" | "off";

export interface ModelPicker {
  el: HTMLElement;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  /** Teclas vindas do campo de busca ou do compositor. */
  key(e: KeyboardEvent): boolean;
}

/** Labels já buscados, por provedor (o chip do compositor mostra o rótulo). */
export const MODEL_LABELS = new Map<string, ModelInfo[]>();

export function modelPicker(opts: { persist: () => void; changed: () => void; picked: () => void }): ModelPicker {
  const search = h("input", { type: "search", class: "mp-search-input", placeholder: "Buscar modelo ou agente…", spellcheck: "false", "aria-label": "Buscar modelo" }) as HTMLInputElement;
  const list = h("div", { class: "mp-list", role: "listbox", "aria-label": "Modelos" });
  const el = h("div", { class: "mp-pop", role: "dialog", "aria-label": "Escolher IA" },
    h("label", { class: "mp-search" }, svg(ICONS.search, 13, { stroke: 1.8 }), search), list);
  const status = new Map<string, Status>();
  const notes = new Map<string, string>();
  let shown = false;
  let active = -1;
  let rows: PickerRow[] = [];
  let ticket = 0;

  const rowsNow = (): PickerRow[] => {
    const out: PickerRow[] = [];
    for (const p of visibleProviders(State.settings)) {
      const models = MODEL_LABELS.get(p.id);
      const base = { provider: p.id, group: providerGroup(p.id), sub: t(p.name) };
      if (models?.length) for (const m of models) out.push({ ...base, model: m.id, label: m.label });
      else {
        const cur = State.settings.chatProvider === p.id ? activeModel(State.settings) : p.defaultModel;
        out.push({ ...base, model: cur, label: cur || t(p.name) });
      }
    }
    const order: PickerGroup[] = ["pc", "mcp", "remote"];
    return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  };

  const icon = (p: ProviderDef, label: string) => h("span", { class: "mp-icon", style: `--accent:${p.accent}`, text: (label.trim()[0] ?? "?").toUpperCase() });

  const draw = () => {
    const now = { p: State.settings.chatProvider, m: activeModel(State.settings) };
    rows = filterRows(rowsNow(), search.value);
    clear(list);
    if (!rows.length) list.append(h("div", { class: "mp-empty", text: "Nada encontrado." }));
    let last: PickerGroup | null = null;
    rows.forEach((r, i) => {
      if (r.group !== last) { last = r.group; list.append(h("div", { class: "mp-group", role: "presentation", text: GROUP_TITLE[r.group] })); }
      const p = providerDef(r.provider);
      const st = status.get(r.provider) ?? "loading";
      const on = r.provider === now.p && r.model === now.m;
      const b = h("button", {
        class: `mp-row${on ? " on" : ""}${i === active ? " kb" : ""}`, role: "option", "aria-selected": String(on),
        title: notes.get(r.provider) ?? `${r.sub} · ${r.model}`, style: `--i:${Math.min(i, 12)}`,
      },
        icon(p, r.label),
        h("span", { class: "mp-text" }, h("span", { class: "mp-name", text: r.label }), h("span", { class: "mp-sub", text: r.model && r.model !== r.label ? `${r.sub} · ${r.model}` : r.sub })),
        h("i", { class: `mp-dot ${st}`, title: st === "ok" ? "Disponível" : st === "loading" ? "Verificando…" : "Indisponível" }),
        h("span", { class: "mp-check" }, on ? svg(ICONS.check, 12, { stroke: 2.4 }) : null),
      );
      b.addEventListener("click", () => pick(r));
      b.addEventListener("mousemove", () => { if (active !== i) { active = i; mark(); } });
      list.append(b);
    });
    mark();
  };

  const rowEls = () => ([...list.children] as HTMLElement[]).filter((c) => c.classList.contains("mp-row"));
  const mark = () => {
    rowEls().forEach((b, i) => b.classList.toggle("kb", i === active));
    rowEls()[active]?.scrollIntoView?.({ block: "nearest" });
  };

  function pick(r: PickerRow) {
    if (!r.model) return;
    State.settings = chooseModel(State.settings, r.provider, r.model);
    opts.persist();
    opts.picked();
    close();
  }

  const fetchAll = async () => {
    const mine = ++ticket;
    await Promise.all(visibleProviders(State.settings).map(async (p) => {
      if (p.key && !(await Bridge.secretPresent(p.key))) { status.set(p.id, "off"); notes.set(p.id, "Sem acesso — Configurações → Chat."); return; }
      try {
        const got = (await Bridge.chatModels(p.id)) ?? [];
        if (mine !== ticket) return;
        if (got.length) { MODEL_LABELS.set(p.id, got); status.set(p.id, "ok"); notes.delete(p.id); }
        else { status.set(p.id, "off"); notes.set(p.id, "Nenhum modelo encontrado — veja Configurações → Chat."); }
      } catch (err) {
        status.set(p.id, "off"); notes.set(p.id, String(err).replace(/^Error:\s*/, ""));
      }
      if (mine === ticket && shown) draw();
    }));
  };

  search.addEventListener("input", () => { active = rows.length ? 0 : -1; draw(); });
  search.addEventListener("keydown", (e) => { if (key(e)) e.preventDefault(); e.stopPropagation(); });

  function key(e: KeyboardEvent): boolean {
    if (!shown) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { active = stepIndex(active, e.key === "ArrowDown" ? 1 : -1, rows.length); mark(); return true; }
    if (e.key === "Enter") { const r = rows[active]; if (r) pick(r); return true; }
    if (e.key === "Escape") { close(); return true; }
    return false;
  }

  function open() {
    if (shown) return;
    shown = true;
    State.chatPicking = true;
    search.value = "";
    draw();
    active = rows.findIndex((r) => r.provider === State.settings.chatProvider && r.model === activeModel(State.settings));
    el.classList.remove("leaving");
    el.classList.add("on");
    mark();
    opts.changed();
    void fetchAll();
    (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f: () => void) => setTimeout(f, 0))(() => search.focus?.());
  }
  function close() {
    if (!shown) return;
    shown = false;
    ticket++;
    State.chatPicking = false;
    el.classList.remove("on");
    el.classList.add("leaving");
    setTimeout(() => el.classList.remove("leaving"), 220);
    opts.changed();
  }
  return { el, open, close, key, get isOpen() { return shown; } };
}
