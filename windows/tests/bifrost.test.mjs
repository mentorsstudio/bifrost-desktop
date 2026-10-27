// Bifrost: motor de movimento, corvos e o bloqueio do menu nativo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Curves, Beat, spring, sample } from "../src/bifrost/motion.ts";
import { mascotSvg, MASCOT_STATES } from "../src/bifrost/mascots.ts";

test("as curvas começam em 0 e terminam em 1", () => {
  for (const [name, c] of Object.entries(Curves)) {
    assert.equal(Math.round(c(0) * 1000) / 1000, 0, name);
    assert.equal(Math.round(c(1) * 1000) / 1000, 1, name);
  }
  // O "corvo" passa do alvo (ressalto) e volta.
  assert.ok(Math.max(...sample(Curves.raven, 40)) > 1);
  const s = spring();
  assert.ok(Math.abs(s(1) - 1) < 0.05);
  assert.ok(Beat.tap < Beat.quick && Beat.quick < Beat.step && Beat.step < Beat.glide);
});

test("Huginn e Muninn são desenhos próprios, com todos os estados no CSS", () => {
  const css = readFileSync(new URL("../src/bifrost/nordic.css", import.meta.url), "utf8");
  for (const name of ["huginn", "muninn"]) {
    const svg = mascotSvg(name);
    assert.match(svg, /<svg class="bf-raven"/);
    assert.ok(!/mochi|coucou/i.test(svg));
  }
  for (const s of MASCOT_STATES.filter((s) => s !== "blink")) assert.ok(css.includes(`.bf-state-${s}`), s);
  assert.ok(css.includes("prefers-reduced-motion"));
});

test("nenhuma janela abre o menu nativo do WebView", () => {
  const entries = ["src/main.ts", "src/pill/main.ts", "src/settings/main.ts", "src/desktop/main.ts"];
  for (const f of entries) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.match(src, /bifrost\/contextmenu/, f);
  }
  const menu = readFileSync(new URL("../src/bifrost/contextmenu.ts", import.meta.url), "utf8");
  assert.match(menu, /e\.preventDefault\(\)/);
  const rust = readFileSync(new URL("../src-tauri/src/webview_drop.rs", import.meta.url), "utf8");
  assert.match(rust, /SetAreDefaultContextMenusEnabled\(false/);
});

test("nenhum campo de chave de API sobrou nas configurações", () => {
  const files = ["src/settings/main.ts", "src/settings/mcp.ts"];
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(!/API key|chave de API|anthropic-api-key|stripe-api-key|github-token/.test(src), f);
  }
});
