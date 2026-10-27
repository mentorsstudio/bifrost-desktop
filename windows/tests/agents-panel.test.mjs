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
