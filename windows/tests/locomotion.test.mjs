import { test } from "node:test";
import assert from "node:assert/strict";
import { pose, flapCycle, RHYTHM, WING_MAX, REST } from "../src/bifrost/locomotion.ts";
const gaits = ["flap", "walk", "takeoff", "fly", "glide", "land"];
test("asas sempre para fora e abaixo do limite em todos os quadros (0–2 s, 240 quadros)", () => {
  for (const who of ["huginn", "muninn"]) for (const g of gaits) for (let i = 0; i <= 240; i++) {
    const p = pose(g, i / 120, RHYTHM[who], 0.2);
    assert.ok(p.wing >= 0, `${g} ${who} ${i}`);
    assert.ok(p.wing + Math.max(0, p.feather) <= WING_MAX + 0.21, `${g} ${who} ${i}: ${p.wing}`);
    assert.ok(p.wingLen >= 1 && p.wingLen <= 1.121, `${g} len`);
    assert.ok(p.sy > 0.85 && p.sy < 1.1 && p.sx > 0.9 && p.sx < 1.12, `${g} squash ${p.sx} ${p.sy}`);
  }
});
test("ciclo de asa: descida mais curta que a subida e contínuo", () => {
  assert.equal(flapCycle(0, 0, 1).angle, 1);
  assert.ok(Math.abs(flapCycle(0.42, 0, 1).angle) < 1e-9);
  assert.ok(Math.abs(flapCycle(0.999, 0, 1).angle - 1) < 0.01);
});
test("pouso termina parado; Muninn tem ritmo próprio", () => {
  const end = pose("land", RHYTHM.huginn.land, RHYTHM.huginn);
  for (const k of ["dy", "tilt", "wing"]) assert.ok(Math.abs(end[k] - REST[k]) < 0.05, k);
  assert.notEqual(RHYTHM.huginn.hop, RHYTHM.muninn.hop);
});
