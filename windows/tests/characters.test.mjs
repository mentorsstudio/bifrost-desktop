// Fase 19: personagens — o visual dos corvos à parte do tema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const C = await import("../src/theme/characters.ts");
const T = await import("../src/theme/themes.ts");
const { mascotSvg, palette } = await import("../src/bifrost/mascots.ts");
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

const lum = (hx) => { const n = parseInt(hx.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 255000; };

test("6+ estilos distintos e o Clássico (rig novo) como padrão", () => {
  assert.equal(C.DEFAULT_CHARACTER, "classic");
  assert.equal(C.CHARACTERS[0].name, "Seguir o tema");
  const styles = C.CHARACTERS.filter((c) => c.huginn);
  assert.ok(styles.length >= 6);
  assert.equal(new Set(styles.map((c) => c.huginn.lit)).size, styles.length);
  for (const c of styles) {
    assert.ok(c.huginn.marks.includes("crest") && c.muninn.marks.includes("moon"), c.id);
    // Olhos legíveis: contraste de luminância com o corpo.
    assert.ok(Math.abs(lum(c.huginn.eye) - lum(c.huginn.dark)) > 0.35, `${c.id} huginn eye`);
    assert.ok(Math.abs(lum(c.muninn.eye) - lum(c.muninn.dark)) > 0.35, `${c.id} muninn eye`);
  }
});

test("seguir o tema devolve o próprio tema; um estilo troca só os corvos", () => {
  const t = T.currentTheme();
  assert.equal(C.ravenTheme(t, C.characterById("theme")), t);
  const r = C.ravenTheme(t, C.characterById("ember"));
  assert.equal(r.huginn, C.characterById("ember").huginn);
  assert.equal(r.accent, t.accent);
  assert.notEqual(r.id, t.id);
  assert.equal(C.characterById("nada").id, "classic");
});

test("escolher guarda, avisa e redesenha os corvos vivos", () => {
  let got = null;
  const off = C.onCharacterChange((c) => { got = c.id; });
  C.chooseCharacter("snow");
  assert.equal(got, "snow");
  assert.equal(globalThis.localStorage.getItem(C.CHARACTER_KEY), "snow");
  assert.equal(palette("huginn").lit, C.characterById("snow").huginn.lit);
  assert.match(mascotSvg("huginn"), /snow/);
  C.chooseCharacter("theme");
  assert.equal(palette("huginn").lit, T.currentTheme().huginn.lit);
  off();
});

test("ilha, desktop, pílula e chat leem o personagem pelo motor do corvo", () => {
  assert.match(src("bifrost/raven.ts"), /const t = ravenTheme\(\);/);
  assert.match(src("bifrost/mascots.ts"), /onRavenLookChange/);
  assert.match(src("settings/main.ts"), /themesSection\(\), charactersSection\(\)/);
  assert.match(src("settings/page-themes.ts"), /role: "radio"/);
});
