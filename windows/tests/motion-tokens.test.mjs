import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const css = walk(root).filter((f) => f.endsWith(".css"));
const motion = readFileSync(join(root, "theme/motion.css"), "utf8");

test("motion.css define os tokens de mola e duração", () => {
  for (const t of ["--m-fast", "--m-base", "--m-slow", "--m-xslow", "--m-smooth", "--m-snappy", "--m-bouncy", "--m-ease"]) assert.ok(motion.includes(t + ":"), t);
});

test("todo componente interativo tem regra de movimento com tokens", () => {
  for (const sel of ["button", ".btn", ".icon-btn", ".hub-item", '[role="switch"]', ".toggle", "input", "textarea", "select", ":focus-visible", '[role="menu"]', '[role="dialog"]', ".hub-page", ".m-stagger", ".bf-skeleton::after"]) {
    const i = motion.indexOf(sel);
    assert.ok(i >= 0, `faltou ${sel}`);
    const block = motion.slice(i, motion.indexOf("}", i));
    assert.match(block, /var\(--m-/, `${sel} sem token`);
  }
});

test("nenhuma transição/animação usa curva crua fora dos tokens", () => {
  for (const f of css) {
    if (f.endsWith("motion.css")) continue;
    for (const m of readFileSync(f, "utf8").matchAll(/(?<![-\w])(transition|animation)(-timing-function)?\s*:([^;{}]*);/g)) {
      assert.doesNotMatch(m[3], /cubic-bezier|(?<![-\w])ease(-in|-out|-in-out)?(?![-\w])/, `${f}: ${m[0]}`);
    }
  }
});

test("transições só animam propriedades baratas (sem width/height/top/left)", () => {
  for (const f of css) for (const m of readFileSync(f, "utf8").matchAll(/(motion: morph[^\n]*\n[^\n]*\n)?\s*(?<![-\w])transition\s*:([^;{}]*);/g))
    if (!m[1]) assert.doesNotMatch(m[2], /(?<![-\w])(width|height|top|left|right|bottom|margin|padding)\s/, `${f}: ${m[0]}`);
});

test("toda janela importa motion.css", () => {
  for (const m of ["main.ts", "desktop/main.ts", "pill/main.ts", "settings/main.ts", "traymenu/main.ts"])
    assert.match(readFileSync(join(root, m), "utf8"), /motion\.css/, m);
});

test("respeita prefers-reduced-motion", () => assert.match(motion, /prefers-reduced-motion: reduce/));
