// Bifrost — a conversa na ilha ("Saga"). Escrita do zero para o Bifrost.
//
// Layout: um cabeçalho com o nome de quem responde (a IA escolhida, com a cor
// e a runa dela) que abre o seletor; a saga, em que cada fala é uma linha
// entalhada — as suas à direita com borda de ouro, as do Huginn à esquerda com
// a runa ᚺ; e a proa: o campo de texto e o botão-runa de enviar.
// Um modelo local escreve aos poucos: o Rust manda `chat-delta` com o texto
// visível até agora, e a fala cresce no lugar.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { renderMarkdown } from "./markdown";
import { Bridge, onEvent, type ChatContext, type ModelInfo } from "../core/bridge";
import { activeModel, pickModel, providerDef, visibleProviders, withModel, type ProviderDef } from "../core/providers";
import { Sound } from "../core/sound";
import { State, type ChatMessage } from "../core/state";
import type { ViewHost } from "./views";
import { N_, t, tl } from "../i18n/i18n";

const TEXT = {
  first: N_("Ask me anything…"),
  next: N_("Continue…"),
  send: N_("Send"),
  switchModel: N_("Switch provider or model"),
  noModel: N_("Choose a model"),
  loading: N_("Loading models…"),
  noKey: "Sem acesso — escolha uma IA do PC em Configurações → Chat.",
  openSettings: N_("Open Settings"),
};

let seq = 1;
const persist = () => void Bridge.saveSettings(State.settings);

/** Uma fala da saga. */
function line(m: ChatMessage): HTMLElement {
  if (m.role === "user") {
    return h("div", { class: "chat-row user bf-saga-you" }, h("div", { class: "bubble", text: m.content }));
  }
  const reply = h("div", { class: "reply" });
  renderMarkdown(reply, m.content);
  return h("div", { class: "chat-row bf-saga-huginn" }, h("span", { class: "bf-saga-rune", text: "ᚺ" }), reply);
}

/** Huginn pensando: três pontos de aurora. */
function thinking(): HTMLElement {
  return h("div", { class: "chat-row bf-saga-huginn" }, h("span", { class: "bf-saga-rune", text: "ᚺ" }), h("div", { class: "typing" }, h("i"), h("i"), h("i")));
}

/** O arquivo solto na ilha, sobre o qual é a pergunta. */
function fileTag(label: string): HTMLElement {
  const tag = h("div", { class: "chip bf-saga-file" }, h("i", { class: "chip-dot" }), h("span", { text: label }));
  requestAnimationFrame(() => tag.classList.add("settled"));
  return tag;
}

// ── Seletor: as IAs, depois os modelos da escolhida ─────────────────────────

interface Selector { el: HTMLElement; open(): void; close(): void; readonly isOpen: boolean }

function selector(changed: () => void): Selector {
  const tabs = h("div", { class: "picker-chips" });
  const models = h("div", { class: "picker-list" });
  const el = h("div", { class: "picker bf-saga-picker" }, tabs, h("div", { class: "picker-rule" }), models);
  const known = new Map<string, ModelInfo[]>();
  let shown = false;
  let ticket = 0;

  const say = (text: string, settings = false) => {
    clear(models);
    const row = h("div", { class: "picker-status", text });
    if (settings) row.append(h("button", { class: "picker-link", text: tl(TEXT.openSettings), onclick: () => void Bridge.openSettingsWindow() }));
    models.append(row);
  };

  const drawTabs = () => {
    clear(tabs);
    for (const p of visibleProviders(State.settings)) {
      const b = h("button", { class: p.id === State.settings.chatProvider ? "picker-chip on" : "picker-chip", style: `--accent:${p.accent}` },
        h("i", { class: "picker-dot" }), h("span", { text: t(p.name) }));
      b.addEventListener("click", () => {
        if (p.id === State.settings.chatProvider) return;
        State.settings = { ...State.settings, chatProvider: p.id };
        persist();
        Sound.play("pop");
        drawTabs();
        void fetchModels();
        changed();
      });
      tabs.append(b);
    }
  };

  const drawModels = (p: ProviderDef, list: ModelInfo[]) => {
    clear(models);
    const now = activeModel(State.settings);
    for (const m of list) {
      const on = m.id === now;
      const b = h("button", { class: on ? "picker-model on" : "picker-model", style: `--accent:${p.accent}`, title: m.id },
        h("span", { class: "picker-model-name", text: m.label }), on ? svg(ICONS.check, 11, { stroke: 2.2 }) : null);
      b.addEventListener("click", () => {
        State.settings = withModel(State.settings, p.id, m.id);
        persist();
        Sound.play("blip");
        close();
      });
      models.append(b);
    }
    models.querySelector(".picker-model.on")?.scrollIntoView({ block: "nearest" });
  };

  const fetchModels = async () => {
    const p = providerDef(State.settings.chatProvider);
    const mine = ++ticket;
    const cached = p.urlField ? undefined : known.get(p.id);
    if (cached) return drawModels(p, cached);
    if (p.key && !(await Bridge.secretPresent(p.key))) {
      if (mine === ticket) say(t(TEXT.noKey), true);
      return;
    }
    if (mine !== ticket) return;
    say(t(TEXT.loading));
    try {
      const list = await Bridge.chatModels(p.id);
      if (mine !== ticket) return;
      if (!p.urlField) known.set(p.id, list);
      const keep = pickModel(p, list.map((m) => m.id), activeModel(State.settings));
      if (keep && keep !== activeModel(State.settings)) {
        State.settings = withModel(State.settings, p.id, keep);
        persist();
        changed();
      }
      drawModels(p, list);
    } catch (err) {
      if (mine === ticket) say(String(err).replace(/^Error:\s*/, ""), Boolean(p.key));
    }
  };

  function open() { shown = true; el.classList.add("on"); drawTabs(); changed(); void fetchModels(); }
  function close() { shown = false; ticket++; el.classList.remove("on"); changed(); }
  return { el, open, close, get isOpen() { return shown; } };
}

// ── A vista ─────────────────────────────────────────────────────────────────

export function buildPrompt(onHeightChange: () => void): ViewHost {
  const files = h("div", { class: "chip-row" });
  const saga = h("div", { class: "chat-log bf-saga" });
  const field = h("input", { type: "text", class: "chat-input", placeholder: t(TEXT.first), spellcheck: "false" }) as HTMLInputElement;
  const sendBtn = h("button", { class: "send-btn bf-saga-send", title: tl(TEXT.send) }, h("span", { class: "bf-saga-send-rune", text: "ᛏ" }));
  const prow = h("div", { class: "chat-bar bf-saga-prow" }, field, sendBtn);

  const dot = h("i", { class: "model-dot" });
  const name = h("span", { class: "model-name" });
  const who = h("button", { class: "model-btn bf-saga-who", title: tl(TEXT.switchModel) }, dot, name, svg(ICONS.chevronUpDown, 9, { stroke: 2 }));
  const head = h("div", { class: "model-row bf-saga-head" }, h("span", { class: "bf-saga-title", text: "Saga" }), who);

  const body = h("div", { class: "chat-body bf-saga-body" });
  const pick = selector(() => { body.classList.toggle("picking", pick.isOpen); drawWho(); });
  body.append(head, files, saga, pick.el, prow);
  const el = h("div", { class: "view" }, h("div", { class: "card chat-card bf-saga-card" }, body));

  let busy = false;
  let drawn = -1;
  let growing: HTMLElement | null = null;

  function drawWho() {
    const p = providerDef(State.settings.chatProvider);
    dot.style.background = p.accent;
    name.textContent = activeModel(State.settings) || t(TEXT.noModel);
    who.classList.toggle("open", pick.isOpen);
    who.disabled = busy;
  }

  who.addEventListener("click", () => {
    if (busy) return;
    if (pick.isOpen) pick.close(); else pick.open();
  });

  void onEvent<string>("chat-delta", (text) => {
    if (!busy || !text) return;
    if (!growing) {
      growing = h("div", { class: "reply" });
      saga.querySelector(".typing")?.parentElement?.remove();
      saga.append(h("div", { class: "chat-row bf-saga-huginn" }, h("span", { class: "bf-saga-rune", text: "ᚺ" }), growing));
    }
    renderMarkdown(growing, text);
    saga.scrollTop = saga.scrollHeight;
  });

  async function ask() {
    const q = field.value.trim();
    if (!q || busy) return;
    if (pick.isOpen) pick.close();
    field.value = "";
    busy = true;
    drawWho();
    Sound.play("send");
    State.chatHistory.push({ id: seq++, role: "user", content: q });
    State.stateOverride = "thinking";
    State.notify();
    onHeightChange();
    const f = State.droppedFile;
    const ctx: ChatContext | null = State.chatHistory.length === 1 && f ? { kind: "file", name: f.name, path: f.path } : null;
    try {
      const r = await Bridge.chatSend(q, ctx);
      State.chatHistory.push({ id: seq++, role: "assistant", content: r.text });
      State.stateOverride = null;
      Sound.play("finish");
    } catch (err) {
      State.stateOverride = null;
      State.noteMessage = String(err).replace(/^Error:\s*/, "");
      State.view = "note";
      Sound.play("error");
    } finally {
      busy = false;
      growing = null;
      drawn = -1;
      drawWho();
      State.notify();
      onHeightChange();
      field.focus();
    }
  }

  sendBtn.addEventListener("click", () => void ask());
  field.addEventListener("keydown", (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === "Enter") { e.preventDefault(); void ask(); }
    else if (k === "Escape" && pick.isOpen) { e.preventDefault(); pick.close(); }
    e.stopPropagation();
  });

  return {
    el,
    sync() {
      const label = State.droppedFile?.name ?? "";
      if (files.dataset.label !== label) {
        files.dataset.label = label;
        clear(files);
        if (label) files.append(fileTag(label));
      }
      const wait = State.stateOverride === "thinking";
      const n = State.chatHistory.length + (wait ? 0.5 : 0);
      if (n !== drawn && !growing) {
        drawn = n;
        clear(saga);
        for (const m of State.chatHistory) saga.append(line(m));
        if (wait) saga.append(thinking());
        saga.scrollTop = saga.scrollHeight;
      }
      if (State.view !== "prompt" && pick.isOpen) pick.close();
      drawWho();
      field.placeholder = t(State.chatHistory.length === 0 ? TEXT.first : TEXT.next);
      field.disabled = busy;
    },
    focus() { field.focus(); field.select(); },
  };
}
