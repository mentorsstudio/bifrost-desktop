// Fase 19: seletor único, compositor, registro do "+", QA visual e CSS de forma única.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { installFakeDom } from "./fakedom.mjs";

installFakeDom();
const P = await import("../src/core/providers.ts");
const { DEFAULT_SETTINGS } = await import("../src/core/state.ts");
const A = await import("../src/views/attach.ts");
const { growHeight } = await import("../src/views/chat.ts");
const css = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("chooseModel troca provedor e modelo juntos", () => {
  const s = P.chooseModel({ ...DEFAULT_SETTINGS, chatProvider: "mcp" }, "cli", "codex");
  assert.equal(s.chatProvider, "cli");
  assert.equal(s.chatModels.cli, "codex");
  const a = P.chooseModel({ ...DEFAULT_SETTINGS, chatProvider: "cli" }, "anthropic", "claude-opus-5");
  assert.equal(a.chatProvider, "anthropic");
  assert.equal(a.model, "claude-opus-5");
});

test("grupos, busca sem acento e setas que dão a volta", () => {
  assert.equal(P.providerGroup("cli"), "pc");
  assert.equal(P.providerGroup("ollama"), "pc");
  assert.equal(P.providerGroup("mcp"), "mcp");
  assert.equal(P.providerGroup("openrouter"), "remote");
  const rows = [
    { provider: "cli", model: "codex", label: "Codex", sub: "IA do PC", group: "pc" },
    { provider: "mcp", model: "hermes-vps", label: "Hermes VPS", sub: "MCP", group: "mcp" },
  ];
  assert.deepEqual(P.filterRows(rows, "HÉRMES").map((r) => r.model), ["hermes-vps"]);
  assert.equal(P.filterRows(rows, "").length, 2);
  assert.equal(P.stepIndex(-1, 1, 3), 0);
  assert.equal(P.stepIndex(-1, -1, 3), 2);
  assert.equal(P.stepIndex(2, 1, 3), 0);
  assert.equal(P.stepIndex(0, 1, 0), -1);
});

test("o registro do + é genérico: outro ramo registra e remove ações", () => {
  const before = A.attachActions().map((a) => a.id);
  assert.ok(before.includes("file"));
  let seen = 0;
  const off = A.onAttachActionsChange(() => seen++);
  const undo = A.registerAttachAction({ id: "converter", label: "Converter arquivo…", order: 5, run: () => {} });
  assert.equal(A.attachActions()[0].id, "converter");
  undo();
  assert.ok(!A.attachActions().some((a) => a.id === "converter"));
  assert.equal(seen, 2);
  off();
  A.registerAttachAction({ id: "hidden", label: "x", available: () => false, run: () => {} });
  assert.ok(!A.attachActions().some((a) => a.id === "hidden"));
});

test("o campo cresce de 1 a 5 linhas", () => {
  assert.equal(growHeight(0), 18);
  assert.equal(growHeight(40), 40);
  assert.equal(growHeight(400), 90);
});

test("uma forma só: a aba ativa num grupo com indicador não pinta fundo próprio", () => {
  const m = css("theme/motion.css");
  assert.match(m, /\.m-ink-hub \.hub-item\.on, \.m-ink-tabs \.tab\.on, \.m-ink-seg button\.on \{\s*background: transparent !important; box-shadow: none !important/);
  assert.match(m, /:focus-visible \{ outline-offset: -2px; \}/);
  assert.match(m, /\.hub-stage > \.hub-page\.m-layer \{ height: 0; overflow: hidden; \}/, "página escondida não estica a rolagem");
  assert.match(m, /@keyframes m-rise-in \{ from \{ opacity: 0; transform: translate3d\(0, 10px, 0\); \} \}/);
  const i = readFileSync(new URL("../src/theme/interact.ts", import.meta.url), "utf8");
  assert.match(i, /forEach\(\(e\) => ro\?\.observe\(e\)\)/, "o indicador acompanha o tamanho da aba");
});

test("a cascata de entrada respeita o movimento reduzido", () => {
  const m = css("theme/motion.css");
  assert.match(m, /prefers-reduced-motion: reduce\) \{ \.m-rise \{ animation: none !important; \} \}/);
  const sh = readFileSync(new URL("../src/hub/shell.ts", import.meta.url), "utf8");
  assert.match(sh, /export function animatePage\(page: HTMLElement\): void \{\n  riseIn\(page\);/);
});

test("Dicionário: a linha de substituição tem 4 colunas (campo → campo botão)", () => {
  assert.match(css("bifrost/hub-pages.css"), /hub-pair \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\) auto;/);
});

// QA visual de verdade: só com BIFROST_VISUAL=1 (precisa do Vite e do Chromium).
test("QA visual: zero problemas em todas as telas", { skip: process.env.BIFROST_VISUAL !== "1" }, () => {
  const r = spawnSync(process.execPath, ["tests/visual/qa.mjs"], { encoding: "utf8", timeout: 1_500_000 });
  const head = (r.stdout || "").split("\n")[0];
  assert.equal(r.status, 0, `${head}\n${(r.stdout || "").slice(0, 4000)}${r.stderr || ""}`);
});
