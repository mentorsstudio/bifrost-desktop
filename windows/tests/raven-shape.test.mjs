import { test } from "node:test";
import assert from "node:assert/strict";
import { RAVEN, mirrorPath } from "../src/bifrost/raven-shape.ts";
const norm = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);
const xs = (d) => norm(d).filter((_, i) => i % 2 === 0);
const ys = (d) => norm(d).filter((_, i) => i % 2 === 1);
test("asas espelhadas em x = 60", () => {
  const r = norm(mirrorPath(RAVEN.wingL)), w = norm(RAVEN.wingR);
  assert.equal(r.length, w.length);
  r.forEach((v, i) => assert.ok(Math.abs(v - w[i]) < 0.01, `${i}: ${v} vs ${w[i]}`));
});
test("tudo em curvas (sem L/H/V: nada quadrado) e fechado", () => {
  for (const k of ["body", "belly", "tail", "beak", "crest", "moon", "wingL", "wingR"]) {
    assert.ok(!/[LlHhVv]/.test(RAVEN[k]), k);
    assert.ok(/Z$/.test(RAVEN[k]), k);
  }
});
test("corpo, peito, cauda, bico, crista e lua simétricos", () => {
  for (const k of ["body", "belly", "tail", "beak", "crest", "moon"]) {
    const pts = (d) => { const n = norm(d); const s = []; for (let i = 0; i < n.length; i += 2) s.push(`${n[i].toFixed(2)},${n[i + 1]}`); return [...new Set(s)].sort(); };
    assert.deepEqual(pts(mirrorPath(RAVEN[k])), pts(RAVEN[k]), k);
  }
});
test("asas abaixo do bico e fora do rosto: nada cruza olhos nem bico", () => {
  const beakBottom = Math.max(...ys(RAVEN.beak));
  const eyeL = 60 - RAVEN.eyes.dx - 5, eyeR = 60 + RAVEN.eyes.dx + 5;
  assert.ok(Math.min(...ys(RAVEN.wingL)) >= beakBottom);
  assert.ok(Math.max(...xs(RAVEN.wingL)) < eyeL);
  assert.ok(Math.min(...xs(RAVEN.wingR)) > eyeR);
});
test("olhos e bico dentro do corpo; crista acima dos olhos", () => {
  assert.ok(Math.min(...ys(RAVEN.beak)) > RAVEN.eyes.y);
  assert.ok(Math.max(...ys(RAVEN.crest)) < RAVEN.eyes.y - 12);
  assert.ok(Math.min(...xs(RAVEN.body)) < 60 - RAVEN.eyes.dx - 10);
});
