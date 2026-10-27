// Bifrost — a conversa na ilha ("Saga"). Escrita do zero para o Bifrost.
//
// Layout: um cabeçalho com o nome de quem responde (a IA escolhida, com a cor
// e a runa dela) que abre o seletor; a saga, em que cada fala é uma linha
// entalhada — as suas à direita com borda de ouro, as do Huginn à esquerda com
// a runa ᚺ; e a proa: o campo de texto e o botão-runa de enviar.
// Um modelo local escreve aos poucos: o Rust manda `chat-delta` com o texto
// visível até agora, e a fala cresce no lugar.

import { FileeIsland, quickPrompts } from "../filee/island";
import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { renderMarkdown } from "./markdown";
import { Bridge, onEvent, type ChatContext } from "../core/bridge";
import { activeModel, modelLabel, providerDef } from "../core/providers";
import { modelPicker, MODEL_LABELS } from "./model-picker";
import { attachActions, registerAttachAction, type AttachContext } from "./attach";
import { Sound } from "../core/sound";
import { State, type ChatMessage } from "../core/state";
import type { ViewHost } from "./views";
import { N_, t, tl } from "../i18n/i18n";
import { flip } from "../theme/interact";

const TEXT = {
  first: "Pergunte qualquer coisa…",
  next: "Continue a conversa…",
  send: N_("Send"),
  switchModel: N_("Switch provider or model"),
  noModel: N_("Choose a model"),
  loading: N_("Loading models…"),
  noKey: "Sem acesso — escolha uma IA do PC em Configurações → Chat.",
  openSettings: N_("Open Settings"),
};

let seq = 1;
/** A gravação em curso: a próxima pergunta espera por ela, então a troca vale já. */
let saving: Promise<unknown> = Promise.resolve();
let pending = 0;
const persist = () => {
  pending++;
  saving = Bridge.saveSettings(State.settings).catch(() => undefined).finally(() => { pending--; });
};
/**
 * O eco "settings-changed" de uma gravação anterior não pode desfazer uma troca
 * mais nova: enquanto houver gravação do seletor em curso, a escolha local vence.
 */
export function keepChatChoice<T extends { chatProvider: unknown; chatModels: unknown; model: unknown }>(incoming: T, local: T): T {
  return pending > 0 ? { ...incoming, chatProvider: local.chatProvider, chatModels: local.chatModels, model: local.model } : incoming;
}
const labels = MODEL_LABELS;

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

// ── O "+": ações de anexar padrão (outros recursos usam registerAttachAction) ──

registerAttachAction({
  id: "file", label: "Arquivo…", icon: ICONS.doc, order: 10,
  run: (c) => { State.view = "upload"; State.notify(); c.done(); },
});
registerAttachAction({
  id: "clipboard", label: "Colar da área de transferência", icon: ICONS.copy, order: 20,
  available: () => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText),
  run: async (c) => { try { c.insert(await navigator.clipboard.readText()); } catch { /* sem permissão */ } c.done(); },
});

/** Altura do campo que cresce: de 1 a 5 linhas. */
export function growHeight(scrollH: number, line = 18, maxLines = 5): number {
  return Math.max(line, Math.min(line * maxLines, scrollH));
}

// ── A vista ─────────────────────────────────────────────────────────────────

export function buildPrompt(onHeightChange: () => void): ViewHost {
  const files = h("div", { class: "chip-row" });
  // Atalhos de pergunta do Conversor ("O que é isso?", "Resumir"…), com o arquivo.
  const quick = quickPrompts((prompt) => { field.value = prompt; void ask(); });
  const saga = h("div", { class: "chat-log bf-saga" });
  const field = h("textarea", { class: "chat-input cmp-field", rows: "1", placeholder: TEXT.first, spellcheck: "false", "aria-label": "Mensagem" }) as HTMLTextAreaElement;

  const dot = h("i", { class: "model-dot" });
  const name = h("span", { class: "model-name" });
  const who = h("button", { class: "model-btn cmp-model", title: tl(TEXT.switchModel), "aria-haspopup": "dialog" }, dot, name, svg(ICONS.chevronUpDown, 9, { stroke: 2 }));
  const plus = h("button", { class: "cmp-icon cmp-plus", title: "Anexar", "aria-haspopup": "menu" }, svg(ICONS.plus, 13));
  const mic = h("button", { class: "cmp-icon cmp-mic", title: "Ditar: segure Ctrl da direita e fale — o Bifrost escreve aqui" }, svg(ICONS.mic, 13));
  const sendBtn = h("button", { class: "send-btn cmp-send", title: tl(TEXT.send), "aria-label": "Enviar" },
    h("span", { class: "cmp-send-go" }, svg(ICONS.arrowUp, 14)), h("span", { class: "cmp-send-stop" }, svg(ICONS.stop, 11)));
  const menu = h("div", { class: "cmp-menu", role: "menu" });
  const hint = h("div", { class: "cmp-hint", role: "status" });
  const prow = h("div", { class: "chat-bar cmp" }, plus, field, h("div", { class: "cmp-tools" }, who, mic, sendBtn), menu);
  const head = h("div", { class: "model-row bf-saga-head" }, h("span", { class: "bf-saga-title", text: "Saga" }));

  const body = h("div", { class: "chat-body bf-saga-body" });
  const pick = modelPicker({
    persist,
    picked: () => { Sound.play("blip"); field.focus(); },
    changed: () => { body.classList.toggle("picking", pick.isOpen); drawWho(); State.notify(); onHeightChange(); },
  });
  body.append(head, files, saga, pick.el, hint, prow);
  const el = h("div", { class: "view" }, h("div", { class: "card chat-card bf-saga-card" }, body));

  let busy = false;
  let drawn = -1;
  let growing: HTMLElement | null = null;
  let asked = 0;

  function drawWho() {
    const p = providerDef(State.settings.chatProvider);
    dot.style.background = p.accent;
    const m = activeModel(State.settings);
    name.textContent = m ? modelLabel(m, labels.get(p.id)) : t(TEXT.noModel);
    who.title = `${t(p.name)} · ${m || t(TEXT.noModel)} — ${tl(TEXT.switchModel)}`;
    who.classList.toggle("open", pick.isOpen);
    who.disabled = busy;
    prow.classList.toggle("busy", busy);
    sendBtn.title = busy ? "Parar" : t(TEXT.send);
    sendBtn.setAttribute("aria-label", busy ? "Parar" : "Enviar");
  }

  const grow = () => { field.style.height = "auto"; field.style.height = `${growHeight(field.scrollHeight)}px`; };

  who.addEventListener("click", () => {
    if (busy) return;
    flip(body, () => { if (pick.isOpen) pick.close(); else pick.open(); });
  });

  // O "+": monta o menu com o que estiver registrado.
  const ctx: AttachContext = {
    insert: (text) => { const a = field.selectionStart ?? field.value.length; field.setRangeText(text, a, field.selectionEnd ?? a, "end"); grow(); },
    attachFile: (n, path) => { State.droppedFile = { name: n, path }; State.notify(); },
    done: () => { menu.classList.remove("on"); field.focus(); },
  };
  plus.addEventListener("click", () => {
    if (menu.classList.toggle("on")) {
      clear(menu);
      attachActions().forEach((a, i) => {
        const b = h("button", { class: "cmp-menu-item", role: "menuitem", style: `--i:${i}` },
          a.icon && a.icon.length > 3 ? svg(a.icon, 13, { stroke: 1.7 }) : h("span", { text: a.icon ?? "•" }), h("span", { text: a.label }));
        b.addEventListener("click", () => void a.run(ctx));
        menu.append(b);
      });
    }
  });
  mic.addEventListener("click", () => {
    field.focus();
    hint.textContent = "Segure Ctrl da direita e fale: o ditado escreve neste campo.";
    hint.classList.add("on");
    window.setTimeout(() => hint.classList.remove("on"), 3200);
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

  function finish() {
    busy = false;
    growing = null;
    drawn = -1;
    drawWho();
    State.notify();
    onHeightChange();
    field.focus();
  }

  /** Parar: a ilha deixa de esperar já; a resposta que chegar depois é descartada. */
  function stop() {
    if (!busy) return;
    asked++;
    State.stateOverride = null;
    State.chatHistory.push({ id: seq++, role: "assistant", content: "_Interrompido._" });
    finish();
  }

  async function ask() {
    const q = field.value.trim();
    if (!q || busy) return;
    if (pick.isOpen) pick.close();
    menu.classList.remove("on");
    field.value = "";
    grow();
    busy = true;
    const mine = ++asked;
    drawWho();
    Sound.play("send");
    State.chatHistory.push({ id: seq++, role: "user", content: q });
    State.stateOverride = "thinking";
    State.notify();
    onHeightChange();
    const f = State.droppedFile;
    const c: ChatContext | null = State.chatHistory.length === 1 && f ? { kind: "file", name: f.name, path: f.path } : null;
    try {
      await saving;
      const r = await Bridge.chatSend(q, c);
      if (mine !== asked) return;
      State.chatHistory.push({ id: seq++, role: "assistant", content: r.text });
      State.stateOverride = null;
      Sound.play("finish");
    } catch (err) {
      if (mine !== asked) return;
      State.stateOverride = null;
      State.noteMessage = String(err).replace(/^Error:\s*/, "");
      State.view = "note";
      Sound.play("error");
    } finally {
      if (mine === asked) finish();
    }
  }

  sendBtn.addEventListener("click", () => (busy ? stop() : void ask()));
  field.addEventListener("input", grow);
  field.addEventListener("keydown", (e) => {
    const k = e as KeyboardEvent;
    if (pick.isOpen && pick.key(k)) { e.preventDefault(); e.stopPropagation(); return; }
    if (k.key === "Enter" && !k.shiftKey && !k.isComposing) { e.preventDefault(); void ask(); }
    else if (k.key === "Escape" && menu.classList.contains("on")) { e.preventDefault(); menu.classList.remove("on"); }
    e.stopPropagation();
  });

  return {
    el,
    sync() {
      const label = State.droppedFile?.name ?? "";
      if (files.dataset.label !== label) {
        files.dataset.label = label;
        clear(files);
        if (label) files.append(fileTag(label), quick);
      }
      quick.hidden = State.chatHistory.length > 0 || busy;
      // O balão do gesto já escolheu a pergunta: ela vai sozinha.
      if (FileeIsland.pendingPrompt && State.view === "prompt" && !busy && label) {
        field.value = FileeIsland.pendingPrompt;
        FileeIsland.pendingPrompt = null;
        queueMicrotask(() => void ask());
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
      field.placeholder = State.chatHistory.length === 0 ? TEXT.first : TEXT.next;
    },
    focus() { field.focus(); field.select(); },
  };
}
