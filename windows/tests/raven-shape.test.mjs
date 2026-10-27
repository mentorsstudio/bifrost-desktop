import { test } from "node:test";
import assert from "node:assert/strict";
import { RAVEN, mirrorPath } from "../src/bifrost/raven-shape.ts";
const norm = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);
test("asas espelhadas em x = 60", () => {
  const r = norm(mirrorPath(RAVEN.wingL)), w = norm(RAVEN.wingR);
  assert.equal(r.length, w.length);
  r.forEach((v, i) => assert.ok(Math.abs(v - w[i]) < 0.01, `${i}: ${v} vs ${w[i]}`));
});
test("corpo, cauda, bico e crista: só curvas (sem L) e fechados", () => {
  for (const k of ["body", "tail", "beak", "crest", "wingL", "wingR"]) {
    assert.ok(!/[LlHhVv]/.test(RAVEN[k]), k);
    assert.ok(/Z$/.test(RAVEN[k]), k);
  }
});
test("corpo e cauda simétricos: conjunto de pontos igual ao espelho", () => {
  for (const k of ["body", "tail", "beak"]) {
    const pts = (d) => { const n = norm(d); const s = []; for (let i = 0; i < n.length; i += 2) s.push(`${n[i].toFixed(2)},${n[i + 1]}`); return [...new Set(s)].sort(); };
    assert.deepEqual(pts(mirrorPath(RAVEN[k])), pts(RAVEN[k]), k);
  }
});
test("asas abaixo do pescoço: nada cruza o rosto", () => {
  const ys = (d) => norm(d).filter((_, i) => i % 2 === 1);
  assert.ok(Math.min(...ys(RAVEN.wingL)) >= RAVEN.head.cy + RAVEN.head.r);
  assert.ok(Math.min(...ys(RAVEN.wingR)) >= RAVEN.head.cy + RAVEN.head.r);
});
