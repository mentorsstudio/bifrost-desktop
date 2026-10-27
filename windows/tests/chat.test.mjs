// The chat view (src/views/chat.ts) on a fake DOM, through the real bridge:
// the model switcher asks for a provider's models only once it is picked and
// has a key, picking saves the settings, and a streamed answer grows in place.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./fakedom.mjs";
import { calls, emit, internals, sent } from "./tauri.mjs";

installFakeDom();
const { buildPrompt } = await import("../src/views/chat.ts");
const { DEFAULT_SETTINGS, State } = await import("../src/core/state.ts");

/** What the mocked Rust side answers, by command. */
let answers;
const plainInvoke = internals.invoke;
internals.invoke = async (cmd, args) => {
  const result = await plainInvoke(cmd, args);
  if (cmd in answers) return typeof answers[cmd] === "function" ? answers[cmd](args) : answers[cmd];
  return result;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let view;
beforeEach(() => {
  calls.length = 0;
  answers = {};
  // Paulo build: MCP is the default; these tests are about the key-based providers.
  State.settings = { ...DEFAULT_SETTINGS, chatProvider: "anthropic", chatModels: {} };
  State.chatHistory = [];
  State.stateOverride = null;
  State.view = "prompt";
  State.droppedFile = null;
  view = buildPrompt(() => {});
  view.sync();
});

const $ = (cls) => view.el.querySelector(cls);
const rows = () => view.el.find(".mp-row");
const names = () => rows().map((r) => r.find(".mp-name")[0].textContent);
const groups = () => view.el.find(".mp-group").map((g) => g.textContent);

test("the model button shows the active provider's model", () => {
  assert.equal($(".model-name").textContent, "claude-opus-5");
  State.settings = { ...State.settings, chatProvider: "google" };
  view.sync();
  assert.equal($(".model-name").textContent, "gemini-2.0-flash");
  State.settings = { ...State.settings, chatProvider: "ollama" };
  view.sync();
  assert.equal($(".model-name").textContent, "Choose a model");
});

test("fase 19: o popover agrupa IA do PC, Agentes MCP e Remoto, e um provedor sem chave não é consultado", async () => {
  answers.secret_present = false;
  answers.chat_models = (args) => (args.provider === "cli" ? [{ id: "claude", label: "Claude Code" }, { id: "codex", label: "Codex" }] : []);
  $(".model-btn").fire("click");
  await flush(); await flush();
  assert.ok($(".chat-body").classList.contains("picking"));
  assert.ok(State.chatPicking, "a ilha cresce para o seletor caber");
  assert.deepEqual(groups(), ["IA do PC", "Agentes MCP", "Remoto"]);
  assert.ok(names().includes("Claude Code") && names().includes("Codex"));
  assert.ok(!sent("chat_models").some((a) => a.provider === "anthropic"), "sem chave, sem consulta");
  assert.deepEqual(sent("secret_present"), [{ key: "anthropic-api-key" }]);
});

test("fase 19: escolher um modelo de outra seção troca provedor E modelo (o bug antigo) e salva", async () => {
  answers.secret_present = true;
  answers.chat_models = (args) => (args.provider === "cli" ? [{ id: "claude", label: "Claude Code" }, { id: "codex", label: "Codex" }]
    : args.provider === "anthropic" ? [{ id: "claude-opus-5", label: "Claude Opus 5" }] : []);
  $(".model-btn").fire("click");
  await flush(); await flush();
  rows().find((r) => r.find(".mp-name")[0].textContent === "Codex").fire("click");
  assert.equal(State.settings.chatProvider, "cli");
  assert.equal(State.settings.chatModels.cli, "codex");
  const saved = sent("save_settings").at(-1).settings;
  assert.equal(saved.chatProvider, "cli");
  assert.equal(saved.chatModels.cli, "codex");
  assert.ok(!$(".chat-body").classList.contains("picking"));
  assert.ok(!State.chatPicking);
  assert.equal($(".model-name").textContent, "Codex");
});

test("fase 19: busca filtra e setas + Enter escolhem", async () => {
  answers.secret_present = true;
  answers.chat_models = (args) => (args.provider === "cli" ? [{ id: "claude", label: "Claude Code" }, { id: "gemini", label: "Gemini CLI" }] : []);
  $(".model-btn").fire("click");
  await flush(); await flush();
  const search = $(".mp-search-input");
  search.value = "gemi";
  search.fire("input");
  assert.deepEqual(names(), ["Gemini CLI"]);
  search.fire("keydown", { key: "Enter" });
  assert.equal(State.settings.chatProvider, "cli");
  assert.equal(State.settings.chatModels.cli, "gemini");
});

test("a local answer streams into one reply, then the finished text replaces it", async () => {
  let finish;
  answers.chat_send = () => new Promise((resolve) => (finish = resolve));
  const input = $(".chat-input");
  input.value = "hello";
  $(".send-btn").fire("click");
  await flush();
  view.sync(); // what State.notify() does in the island
  assert.ok($(".model-btn").disabled, "no switching mid-answer");
  assert.ok($(".typing"), "dots until the first visible text");

  emit("chat-delta", ""); // still thinking
  assert.ok($(".typing"));
  emit("chat-delta", "Hel");
  emit("chat-delta", "Hello **there**");
  view.sync(); // another view update mid-stream must not wipe the live answer
  assert.equal($(".typing"), null);
  const replies = view.el.find(".reply");
  assert.equal(replies.length, 1);
  assert.equal(replies[0].find("STRONG")[0].textContent, "there");

  finish({ text: "Hello **there**!" });
  await flush();
  view.sync();
  assert.equal(view.el.find(".reply").length, 1);
  assert.equal(view.el.find(".reply")[0].textContent, "Hello there!");
  assert.deepEqual(State.chatHistory.map((m) => m.role), ["user", "assistant"]);
  assert.ok(!$(".model-btn").disabled);
});
