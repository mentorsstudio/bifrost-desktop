import { test } from "node:test";
import assert from "node:assert/strict";
import { leftMode } from "../src/views/overview.ts";

const base = { hasTask: true, planOpen: false, hasDiff: false, sessionActive: false, sessionCardOk: false, id: "stripe" };
test("visão geral: prioridade do cartão da esquerda", () => {
  assert.equal(leftMode({ ...base, planOpen: true, hasDiff: true }), "plan");
  assert.equal(leftMode({ ...base, hasTask: false }), null);
  assert.equal(leftMode({ ...base, hasDiff: true, sessionActive: true }), "diff");
  assert.equal(leftMode({ ...base, sessionActive: true, sessionCardOk: true }), "ticker");
  assert.equal(leftMode({ ...base, sessionCardOk: true, id: "integration_spotify" }), "sessionCard");
  assert.equal(leftMode({ ...base, id: "integration_spotify" }), "spotify");
  assert.equal(leftMode({ ...base, id: "integration_whatsapp" }), "whatsapp");
  assert.equal(leftMode(base), "card");
});

import { prettyName } from "../src/settings/mcp.ts";
test("MCP: nomes importados legíveis", () => {
  assert.equal(prettyName("google-flow"), "Google Flow");
  assert.equal(prettyName("n8n-vault"), "n8n Vault");
  assert.equal(prettyName("quartzo-brain"), "Quartzo Brain");
  assert.equal(prettyName("DaVinci-Resolve"), "DaVinci Resolve");
});
