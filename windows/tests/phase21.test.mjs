import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
test("session card: rótulos curtos com title completo", () => {
  const s = r("src/views/session-card.ts");
  for (const l of ["Pasta", "Conversar", "Ajustes"]) assert.match(s, new RegExp(`"${l}"`));
  assert.match(s, /title:\s*full/);
});
test("session card: botões quebram linha e não usam reticências", () => {
  const c = r("src/bifrost/saga.css");
  assert.match(c, /\.overview \.sc-actions \{[^}]*flex-wrap: wrap/);
  assert.match(c, /\.sc-btn \{[^}]*text-overflow:\s*clip/);
});
test("QA: regra button-cut existe", () => assert.match(r("tests/visual/checks.js"), /button-cut/));
test("pílula: vira só ícone em vez de cortar o nome", () => {
  assert.match(r("src/views/pill-chip.ts"), /icon-only/);
  assert.match(r("src/style.css"), /\.pill\.icon-only \.lbl \{ display: none; \}/);
});
