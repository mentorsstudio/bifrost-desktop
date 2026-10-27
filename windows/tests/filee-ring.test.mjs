import { test } from "node:test";
import assert from "node:assert/strict";
import { DONUT, span, midAngle, pointAt, angleOf, indexAt, subSpan, subMid, hitTest, hitRadius, wedge, labelBox } from "../src/filee/ring.ts";

test("rosca: primeira fatia no topo, sentido horário", () => {
  assert.equal(midAngle(0, 5), 0);
  assert.equal(midAngle(1, 4), 90);
  const p = pointAt(90, 100);
  assert.ok(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y) < 1e-9);
  assert.equal(Math.round(angleOf(0, -10)), 0);
  assert.equal(Math.round(angleOf(10, 0)), 90);
  assert.equal(indexAt(359, 4), 0);
  assert.equal(indexAt(44, 4), 0);
  assert.equal(indexAt(46, 4), 1);
});

test("acerto: furo cancela, fatia pelo ângulo, fora do círculo", () => {
  assert.deepEqual(hitTest(0, 0, 5), { kind: "center" });
  assert.deepEqual(hitTest(DONUT.inner - 1, 0, 5), { kind: "center" });
  for (let i = 0; i < 5; i++) {
    const p = pointAt(midAngle(i, 5) + 10, 120);
    assert.deepEqual(hitTest(p.x, p.y, 5), { kind: "slice", index: i });
  }
  // canto da janela quadrada: fora do anel
  assert.deepEqual(hitTest(DONUT.size / 2 - 4, DONUT.size / 2 - 4, 5), { kind: "outside" });
  assert.ok(hitRadius(true) > hitRadius(false));
  assert.ok(hitRadius(true) <= DONUT.size / 2);
});

test("segundo anel: centrado no grupo, fatias largas o bastante", () => {
  const ss = subSpan(span(12), 6);
  const mid = (DONUT.subInner + DONUT.subOuter) / 2;
  assert.ok(2 * Math.PI * mid * (ss / 360) >= DONUT.minSubWidth - 0.01);
  const parent = 10;
  for (let i = 0; i < 6; i++) {
    const a = subMid(midAngle(parent, 12), i, 6, ss);
    const p = pointAt(a, mid);
    assert.deepEqual(hitTest(p.x, p.y, 12, { parent, count: 6 }), { kind: "sub", index: i });
  }
  // sem o segundo anel aberto, a mesma posição é "fora"
  const p = pointAt(midAngle(parent, 12), mid);
  assert.deepEqual(hitTest(p.x, p.y, 12), { kind: "outside" });
});

test("fatias e rótulos cabem", () => {
  for (const n of [1, 3, 5, 8, 12]) {
    const w = wedge(DONUT.inner, DONUT.outer, 0, span(n));
    assert.match(w.d, /^M[-\d.]+ [-\d.]+A/);
    const b = labelBox(0, n);
    assert.ok(b.width >= 44 && Math.hypot(b.x, b.y) < DONUT.outer);
  }
  assert.ok(DONUT.subOuter + DONUT.pop <= DONUT.size / 2);
});
