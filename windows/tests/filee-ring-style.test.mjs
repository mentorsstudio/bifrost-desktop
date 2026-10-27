import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RING_STYLES, ringStyleById, DEFAULT_RING_STYLE, FUTHARK } from "../src/filee/ring-style.ts";

test("estilos do anel: quatro, com nomes em pt-BR e padrão Runa", () => {
  assert.deepEqual(RING_STYLES.map((s) => s.id), ["runa", "aurora", "escudo", "minimal"]);
  assert.equal(DEFAULT_RING_STYLE, "runa");
  assert.equal(ringStyleById("aurora"), "aurora");
  assert.equal(ringStyleById("xpto"), "runa");
  assert.equal(ringStyleById(null), "runa");
  assert.ok([...FUTHARK].length >= 24);
});

test("anel: cores só do tema (sem cinza fixo do Filee) e cada estilo tem os seus tokens", () => {
  const css = readFileSync(new URL("../src/filee/menu.css", import.meta.url), "utf8");
  for (const s of ["aurora", "escudo", "minimal"]) assert.match(css, new RegExp(`\\.fm-ring\\[data-ring="${s}"\\] \\{[^}]*--fm-band`));
  assert.doesNotMatch(css, /#10131c/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /var\(--th-accent/);
});

test("ajustes: escolha do estilo com prévia ao vivo", () => {
  const page = readFileSync(new URL("../src/settings/page-filee.ts", import.meta.url), "utf8");
  assert.match(page, /Estilo do anel/);
  assert.match(page, /ringStylePicker\(\)/);
});
