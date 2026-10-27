import { test } from "node:test";
import assert from "node:assert/strict";
import { statusOf, isSession, isLive, whereOf, elapsed, sortSessions, monogram, agentLabel } from "../src/views/agents-model.ts";

test("whereOf mostra as duas últimas pastas", () => {
  assert.equal(whereOf("C:\\Users\\paulo\\projetos\\bifrost\\"), "projetos/bifrost");
  assert.equal(whereOf("/home/p/x"), "p/x");
  assert.equal(whereOf(""), null);
});
test("elapsed formata s, min e h", () => {
  assert.equal(elapsed(5), "5s");
  assert.match(elapsed(125), /2\s?min/);
  assert.match(elapsed(3725), /1h/);
});
test("integração parada não aparece; sessão real aparece", () => {
  const idle = { id: "integration_claude", name: "Claude Code", state: "idle", steps: [], source: "integration", isIntegration: true };
  assert.equal(isLive(idle), false);
  assert.equal(isLive({ ...idle, sessionId: "s1" }), true);
  assert.equal(isSession({ id: "stripe", name: "Stripe", source: "integration", isIntegration: true }), false);
  assert.equal(isLive({ id: "agent_codex", name: "Codex", state: "working", steps: [] }), true);
});
test("status e ordem: aguardando primeiro", () => {
  const a = { id: "agent_a", name: "A", state: "working" };
  const b = { id: "agent_b", name: "B", state: "approval" };
  const c = { id: "agent_c", name: "C", state: "finished" };
  assert.equal(statusOf(b), "waiting");
  assert.equal(statusOf(c), "finished");
  assert.deepEqual(sortSessions([c, a, b]).map((x) => x.id), ["agent_b", "agent_a", "agent_c"]);
});
test("rótulo e monograma", () => {
  assert.equal(agentLabel({ id: "agent_codex", name: "Codex" }), "Codex");
  assert.equal(agentLabel({ id: "integration_claude", name: "Sessão" }), "Claude Code");
  assert.equal(monogram("Gemini CLI"), "GC");
});

import { mergeDetected } from "../src/views/agents-model.ts";
import { SessionMemory } from "../src/views/session-card.ts";
test("achados sem hooks não repetem sessões com hooks", () => {
  const live = [{ id: "agent_codex", name: "Codex", sessionCwd: "C:\\p\\loja" }];
  const found = [
    { id: "cli:codex:1", agent: "codex", kind: "cli", folder: null },
    { id: "cli:gemini:2", agent: "gemini", kind: "cli", folder: null },
    { id: "editor:cursor:loja", agent: "cursor", kind: "editor", folder: "loja" },
    { id: "editor:vscode:x", agent: "vscode", kind: "editor", folder: "x" },
    { id: "ollama:q", agent: "ollama", kind: "ollama", folder: "q" },
  ];
  assert.deepEqual(mergeDetected(live, found).map((d) => d.id), ["cli:gemini:2", "ollama:q", "editor:vscode:x"]);
});
test("a memória da sessão guarda o último resumo e sobrevive a um reinício", () => {
  const store = new Map();
  const ls = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const m = new SessionMemory(ls);
  m.note({ id: "agent_codex", finalLine: "Checkout corrigido", sessionCwd: "C:\\p\\loja", steps: [], stepIndex: 0, state: "finished" }, 1000);
  m.note({ id: "agent_codex", finalLine: null, sessionCwd: null, steps: [], stepIndex: 0, state: "idle" }, 5000);
  const again = new SessionMemory(ls).get("agent_codex");
  assert.equal(again.summary, "Checkout corrigido");
  assert.equal(again.cwd, "C:\\p\\loja");
  assert.equal(again.started, 1000);
});
