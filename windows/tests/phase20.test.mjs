// Fase 20: o Conversor no "+" do chat e o corvo do anel com o personagem escolhido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("o '+' recebe Anexar e Converter do Conversor pelo registro", () => {
  const s = src("filee/island.ts");
  assert.match(s, /id: "file", label: "Anexar arquivo…"/);
  assert.match(s, /id: "convert", label: "Converter arquivo…"/);
  assert.match(s, /State\.view = "convert"/);
  assert.doesNotMatch(src("views/chat.ts"), /id: "file"/);
  assert.match(src("views/chat.ts"), /from "\.\.\/filee\/island"/);
});

test("o Huginn do anel usa o personagem (Mascot sem tema fixo lê ravenTheme)", () => {
  assert.match(src("filee/menu.ts"), /new Mascot\("huginn", ravenBox\)/);
  assert.match(src("bifrost/mascots.ts"), /T: Theme = ravenTheme\(\)/);
  assert.match(src("bifrost/mascots.ts"), /import \{ onRavenLookChange, ravenTheme \} from "\.\.\/theme\/characters"/);
});

test("Ajustes mostra Conversor em Geral e Personagens em Temas", () => {
  const m = src("settings/main.ts");
  assert.match(m, /general: \(\) => \[generalSection\(\), fileeSection\(\)\]/);
  assert.match(m, /themes: \(\) => \[themesSection\(\), charactersSection\(\)\]/);
});
