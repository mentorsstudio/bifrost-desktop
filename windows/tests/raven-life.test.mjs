import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickIdle, nextGap, shouldDoze, beakAfter, LIFE_TUNING, effectiveLevel, RavenLife } from "../src/bifrost/raven-life.ts";
import { RavenEngine } from "../src/bifrost/raven.ts";
const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("repertório: voo e passeio só no corvo da área de trabalho", () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(pickIdle(i / 1000, false));
  assert.ok(!seen.has("fly") && !seen.has("walk"));
  const d = new Set();
  for (let i = 0; i < 1000; i++) d.add(pickIdle(i / 1000, true));
  for (const a of ["look", "tilt", "preen", "hop", "walk", "fly"]) assert.ok(d.has(a), a);
});
test("níveis: Calmo espaça mais que Normal, Animado menos; desligado nunca", () => {
  assert.ok(nextGap("calmo", 0.5) > nextGap("normal", 0.5));
  assert.ok(nextGap("animado", 0.5) < nextGap("normal", 0.5));
  assert.equal(nextGap("off", 0.5), Infinity);
  assert.ok(!shouldDoze("off", 1e6));
  assert.ok(shouldDoze("normal", LIFE_TUNING.normal.dozeMin * 60));
  assert.ok(!shouldDoze("normal", LIFE_TUNING.normal.dozeMin * 60 - 1));
});
test("bico: abre no pedaço do streaming e fecha em ~120 ms", () => {
  assert.equal(beakAfter(0, 0.016, true), 1);
  assert.ok(beakAfter(1, 0.06, false) > 0.4);
  assert.equal(beakAfter(1, 0.2, false), 0);
});
test("estados: pensar, falar, sucesso, erro e cochilo no motor", () => {
  const e = new RavenEngine();
  const life = new RavenLife(e, {});
  e.life = life;
  life.level = "normal";
  life.signal({ kind: "thinking" });
  assert.equal(e.state, "thinking");
  life.level = "normal";
  life.signal({ kind: "chunk" });
  life.level = "normal";
  e.update(0.016);
  assert.ok(e.beak > 0.9, "bico aberto ao falar");
  life.signal({ kind: "done" });
  life.level = "normal";
  assert.equal(e.state, "idle");
  for (let i = 0; i < 30; i++) e.update(0.016);
  assert.ok(e.beak < 0.05);
  life.error();
  assert.ok(e.busy);
  life.success();
  assert.ok(e.wingBeat > 0.5);
});
test("movimento reduzido desliga a vida", () => {
  const old = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try { assert.equal(effectiveLevel("animado"), "off"); } finally { globalThis.matchMedia = old; }
});
test("fiação: chat, ditado, ilha, área de trabalho, pílula e Ajustes", () => {
  const chat = r("src/views/chat.ts");
  for (const k of ["thinking", "chunk", "success", "error", "done"]) assert.match(chat, new RegExp(`ravenSignal\\(\\{ kind: "${k}"`));
  assert.match(r("src/pill/main.ts"), /kind: "listening"/);
  assert.match(r("src/pill/main.ts"), /kind: "level"/);
  assert.match(r("src/island/island.ts"), /new RavenLife\(this\.engine/);
  assert.match(r("src/desktop/main.ts"), /desktop: true, ownSleep: true/);
  assert.match(r("src/settings/main.ts"), /lifeSection\(\)/);
  assert.match(r("src/settings/page-themes.ts"), /Calmo[\s\S]*Normal[\s\S]*Animado/);
  assert.match(r("src/bifrost/raven.ts"), /x\.clip\(beak\)/);
});
