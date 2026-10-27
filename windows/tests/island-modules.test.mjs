// Módulos novos da ilha (geometry, targets, upload-steps) e dos cartões (alert-model).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../src/island/geometry.ts";
import { targetOf, terminalOf, INTEGRATION_URLS } from "../src/island/targets.ts";
import { uploadCues, fileNameOf } from "../src/island/upload-steps.ts";
import * as A from "../src/views/alert-model.ts";
import { islandSize, QUESTION_PICKER_H, EXPANDED_CORNER, ROUNDED_CORNER } from "../src/core/layout.ts";

test("forma-alvo segue islandSize; pergunta com opções usa a altura do seletor", () => {
  for (const [m, v] of [["hidden", "overview"], ["compact", "overview"], ["expanded", "approval"], ["expanded", "prompt"]]) {
    const s = G.targetShape(m, v, 3, false);
    const ref = islandSize(m, v, 3);
    assert.equal(s.w, ref.w); assert.equal(s.h, ref.h);
    assert.equal(s.r, m === "expanded" ? EXPANDED_CORNER : ROUNDED_CORNER);
  }
  assert.equal(G.targetShape("expanded", "question", 0, true).h, QUESTION_PICKER_H);
  assert.equal(G.targetShape("compact", "question", 0, true).h, islandSize("compact", "question", 0).h);
});

test("retângulo centrado, margem de toque, Huginn circular, aviso ao Rust", () => {
  const r = G.islandRect(720, 200, 40);
  assert.deepEqual(r, { x: 260, y: 0, w: 200, h: 40 });
  assert.deepEqual(G.islandRect(0, 200, 40).x, 260, "sem viewport usa PANEL_W");
  assert.ok(G.insideWithMargin(r, 260 - 14, 54));
  assert.ok(!G.insideWithMargin(r, 260 - 15, 10));
  assert.ok(G.onRaven(r, 46, 16, 20, 260 + 46 + 9, 16));
  assert.ok(!G.onRaven(r, 46, 16, 20, 260 + 46 + 11, 16));
  assert.ok(!G.rectMoved(r, { ...r, x: r.x + 0.4 }));
  assert.ok(G.rectMoved(r, { ...r, h: r.h + 1 }));
  assert.equal(G.modeRank("hidden") < G.modeRank("compact") && G.modeRank("compact") < G.modeRank("expanded"), true);
});

test("barra de contagem: só no fim, proporcional, zero preso ou sem prazo", () => {
  assert.equal(G.countdownWidth(null, 0, 15, true), 0);
  assert.equal(G.countdownWidth(20_000, 0, 15, false), 0);
  assert.equal(G.countdownWidth(20_000, 0, 15, true), 0, "fora da janela de 9 s");
  assert.equal(G.countdownWidth(4_500, 0, 15, true), 80);
  assert.equal(G.countdownWidth(10_000, 0, 30, true), 0, "janela máxima de 10 s");
  assert.equal(G.countdownWidth(-1, 0, 15, true), 0);
});

test("olhar e caixa do canvas do Huginn", () => {
  assert.equal(G.gazeX(100, 100), 0);
  assert.ok(G.gazeX(10_000, 0) > 0.99);
  assert.ok(G.gazeY(10_000, 0) < -0.99);
  const b = G.ravenCanvasBox(30.4, 50, 20);
  assert.deepEqual(b, { w: 30 + 48, h: 70, px: 30, left: 50 - 39, top: 20 - 20 - 35 });
  assert.equal(G.ravenCanvasBox(0.2, 0, 0).px, 1);
});

test("relógio: data curta e hora", () => {
  const s = G.clockText(new Date(2026, 9, 26, 22, 5), "pt-BR");
  assert.match(s, /26/); assert.match(s, /22:05/);
});

test("destinos do ↗ e do terminal", () => {
  assert.deepEqual(targetOf(null), { kind: "none" });
  assert.deepEqual(targetOf({ id: "agent_claude-desktop", sessionId: "x" }), { kind: "claudeDesktop" });
  assert.deepEqual(targetOf({ id: "s1", sessionId: "abc", sessionCwd: "C:/p" }), { kind: "terminal", sessionId: "abc", cwd: "C:/p" });
  assert.deepEqual(targetOf({ id: "integration_claude" }), { kind: "terminal", sessionId: null, cwd: null });
  assert.deepEqual(targetOf({ id: "integration_n8n" }), { kind: "n8n" });
  assert.deepEqual(targetOf({ id: "integration_gitea" }), { kind: "gitea" });
  assert.deepEqual(targetOf({ id: "integration_github" }), { kind: "url", url: INTEGRATION_URLS.integration_github });
  assert.deepEqual(targetOf({ id: "nada" }), { kind: "none" });
  assert.deepEqual(terminalOf({ id: "agent_claude-desktop" }), { kind: "claudeDesktop" });
  assert.deepEqual(terminalOf(null), { kind: "terminal", sessionId: null, cwd: null });
});

test("deixas do envio: tiques a cada 10 %, sino uma vez, escolha depois de 1 s", () => {
  const m = { tens: 0, done: false };
  assert.deepEqual(uploadCues(m, 0.5, 1, 4, true), []);
  assert.deepEqual(uploadCues(m, 1.5, 1, 4, true), ["tick"]);
  assert.deepEqual(uploadCues(m, 1.5, 1, 4, true), [], "mesmo décimo não repete");
  assert.deepEqual(uploadCues(m, 5, 1, 4, true), ["complete"]);
  assert.deepEqual(uploadCues(m, 5.5, 1, 4, true), []);
  assert.deepEqual(uploadCues(m, 6, 1, 4, true), ["choose"]);
  assert.deepEqual(uploadCues(m, 6, 1, 4, false), []);
  assert.equal(fileNameOf("C:\\a\\b.txt"), "b.txt");
  assert.equal(fileNameOf("/x/y.png"), "y.png");
  assert.equal(fileNameOf(""), "file");
});

test("trava de clique: 600 ms por pedido novo", () => {
  const g = new A.ClickGuard();
  g.seen("r1", 1000);
  assert.equal(g.open(1599), false);
  assert.equal(g.open(1600), true);
  g.seen("r1", 5000);
  assert.equal(g.open(1700), true, "o mesmo pedido não reinicia");
  g.seen("r2", 5000);
  assert.equal(g.open(5100), false);
});

test("rótulos dos cartões", () => {
  assert.equal(A.errorWho({ source: "n8n" }), "n8n");
  assert.equal(A.errorWho({ source: "agent" }), "Agent");
  assert.equal(A.errorWho(null), "Claude Code");
  assert.equal(A.errorTitleKey({ source: "n8n" }), "Workflow stopped.");
  assert.equal(A.errorTitleKey(null), "Session stopped on an error.");
  assert.equal(A.finishedWhoKey({ source: "agent" }), "finished");
  assert.equal(A.openLabelKey({ id: "agent_claude-desktop" }), "Open Claude");
  assert.equal(A.finishedTitle({ finalLine: "F" }, "L", "X"), "F");
  assert.equal(A.finishedTitle({ finalLine: "" }, "L", "X"), "L");
  assert.equal(A.finishedTitle(null, null, "X"), "X");
  assert.equal(A.approvalLine({ command: "ls", tool: "Bash" }), "ls");
  assert.equal(A.approvalLine({ tool: "Bash" }), "Bash");
  assert.equal(A.approvalLine(null), "…");
});

test("perguntas: uma por vez, várias escolhas, pedido novo recomeça", () => {
  const qs = [{ question: "A?", options: [], multiSelect: false }, { question: "B?", options: [], multiSelect: true }];
  const f = new A.QuestionFlow();
  f.track("r1");
  assert.deepEqual(f.counter(qs), { index: 1, total: 2 });
  assert.equal(f.answer("A?", "x", 2), null);
  assert.equal(f.current(qs).question, "B?");
  const k = f.key();
  f.toggle("p"); f.toggle("q"); f.toggle("p");
  assert.notEqual(f.key(), k);
  assert.deepEqual([...f.picked], ["q"]);
  assert.deepEqual(f.answer("B?", [...f.picked], 2), { "A?": "x", "B?": ["q"] });
  f.track("r1"); assert.equal(f.index, 2, "o mesmo pedido não recomeça");
  f.track("r2"); assert.equal(f.index, 0); assert.deepEqual(f.answers, {});
  assert.equal(f.counter([qs[0]]), null);
});
