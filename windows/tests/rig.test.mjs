import { test } from "node:test";
import assert from "node:assert/strict";
import { signature, LOOP_S, rigPalette, REF_PALETTE } from "../src/bifrost/rig.ts";
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const keys = ["breath", "tilt", "px", "py", "lid", "browL", "browR", "beak", "wingL", "wingR", "lift"];

test("laços de 6 s sem emenda (t=0 ≡ t=6)", () => {
  for (const w of ["huginn", "muninn"]) {
    const a = signature(w, 0), b = signature(w, LOOP_S - 1e-9);
    for (const k of keys) assert.ok(near(a[k], b[k], 1e-3), `${w}.${k}`);
  }
});
test("Huginn: pisca em 1,5–2 s, olha de lado em 2–3, ergue UMA sobrancelha em 3–4 e segura até 5", () => {
  assert.equal(signature("huginn", 1).lid, 0);
  assert.ok(signature("huginn", 1.65).lid > 0.8);
  assert.equal(signature("huginn", 2.2).lid, 0);
  assert.ok(signature("huginn", 3).px > 0.7);
  const h = signature("huginn", 4.5);
  assert.ok(h.browR > 0.99 && h.browL <= 0 && h.tilt > 0.06);
  assert.equal(signature("huginn", 3.5).wingL, 0, "asas dobradas");
  assert.equal(signature("huginn", 3.5).wingR, 0);
});
test("Muninn: pisca em 1–1,5, inclina em 1,5–2,5, ergue UMA asa e acena 2x em 3–4, baixa em 4–5", () => {
  assert.ok(signature("muninn", 1.15).lid > 0.8);
  assert.ok(signature("muninn", 2.5).tilt < -0.08);
  assert.equal(signature("muninn", 2.4).wingR, 0);
  assert.ok(signature("muninn", 3).wingR > 1.9);
  let flips = 0, prev = signature("muninn", 3).wingR;
  let dir = 0;
  for (let t = 3.01; t < 4; t += 0.01) { const v = signature("muninn", t).wingR; const d = Math.sign(v - prev); if (d && dir && d !== dir) flips++; if (d) dir = d; prev = v; }
  assert.ok(flips >= 3 && flips <= 4, `acenos ${flips}`);
  assert.equal(signature("muninn", 3.5).wingL, 0, "uma asa só");
  assert.ok(near(signature("muninn", 5).wingR, 0));
});
test("paletas: Clássico = referência; Seguir o tema mantém preto/prata; estilos recolorem", () => {
  assert.equal(rigPalette("huginn", "classic", null), REF_PALETTE.huginn);
  const t = rigPalette("muninn", "theme", null, "#ff0000");
  assert.equal(t.body, REF_PALETTE.muninn.body);
  const r = rigPalette("huginn", "ember", { dark: "#331100", lit: "#aa5500", wing: "#552200", markColor: "#ff8800", beak: ["#fff", "#cc9900"] });
  assert.equal(r.body, "#331100");
  assert.equal(r.ink, REF_PALETTE.huginn.ink, "contorno mantido");
});
