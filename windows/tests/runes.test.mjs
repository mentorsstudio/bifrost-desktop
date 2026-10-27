import { test } from "node:test";
import assert from "node:assert/strict";
import { toRunes, RUNE_MAP, SLEEP_RUNE } from "../src/bifrost/runes.ts";

test("todas as letras de a a z têm runa (sem z cru)", () => {
  for (const c of "abcdefghijklmnopqrstuvwxyz") assert.match(RUNE_MAP[c], /^[\u16A0-\u16FF]$/u, c);
  assert.equal(SLEEP_RUNE, "ᛉ");
});
test("Ajustes e os nomes dos corvos", () => {
  assert.equal(toRunes("Ajustes"), "ᚨᛃᚢᛊᛏᛖᛊ");
  assert.doesNotMatch(toRunes("Zzz ajustes"), /[a-z]/i);
  assert.equal(toRunes("huginn", " "), "ᚺ ᚢ ᚷ ᛁ ᚾ ᚾ");
});
