import { test } from "node:test";
import assert from "node:assert/strict";
import { RING, BAND, ringAngles, subAngles, polar, hitTest, hitRadius } from "../src/filee/ring.ts";

test("anel: n botões em n+1 vagas, topo livre para o corvo", () => {
  const a = ringAngles(6);
  assert.equal(a.length, 6);
  assert.ok(a.every((x) => Math.abs(((x + 90) % 360 + 360) % 360) > 20));
});

test("anel: botões não se sobrepõem e cabem na janela", () => {
  for (const n of [3, 4, 5, 6, 7]) {
    const a = ringAngles(n).map((x) => polar(x, RING.itemR));
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++)
      assert.ok(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y) >= RING.item + 4, `n=${n}`);
    const crow = polar(-90, RING.itemR);
    for (const p of a) assert.ok(Math.hypot(p.x - crow.x, p.y - crow.y) >= RING.item / 2 + 20, `corvo n=${n}`);
  }
  assert.ok(RING.subR + RING.sub / 2 < RING.size / 2);
});

test("segundo arco: chips sem sobreposição", () => {
  const s = subAngles(30, 9).map((x) => polar(x, RING.subR));
  for (let i = 1; i < s.length; i++) assert.ok(Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y) >= RING.sub + 4);
});

test("acerto pela fatia e pelo círculo", () => {
  const items = ringAngles(5);
  assert.deepEqual(hitTest(0, 0, items), { kind: "core" });
  items.forEach((x, i) => {
    const p = polar(x + 8, RING.itemR + 20);
    assert.deepEqual(hitTest(p.x, p.y, items), { kind: "item", index: i });
  });
  // canto do quadrado: fora do círculo
  assert.equal(hitTest(RING.size / 2 - 5, RING.size / 2 - 5, items, subAngles(items[0], 4)), null);
  const subs = subAngles(items[1], 4);
  const q = polar(subs[2], RING.subR);
  assert.deepEqual(hitTest(q.x, q.y, items, subs), { kind: "sub", index: 2 });
  assert.equal(hitTest(q.x, q.y, items, []), null);
  assert.ok(hitRadius(true) > hitRadius(false) && hitRadius(false) === BAND.innerMax);
});
