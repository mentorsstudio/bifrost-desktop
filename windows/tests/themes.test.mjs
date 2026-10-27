import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES, DEFAULT_THEME, themeById, themeVars, contrast, recolor } from "../src/theme/themes.ts";
import { CSS_FAMILIES } from "../src/theme/css-families.ts";
import { markSvg } from "../src/bifrost/mascots.ts";
import { RAVEN } from "../src/bifrost/raven-shape.ts";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test("sete temas nórdicos, Bifröst é o padrão", () => {
  assert.ok(THEMES.length >= 7);
  assert.equal(DEFAULT_THEME, "bifrost");
  assert.equal(THEMES[0].id, "bifrost");
  assert.equal(themeById(null).id, "bifrost");
  assert.equal(themeById("nada").id, "bifrost");
  for (const k of ["id", "name", "rune"]) assert.equal(new Set(THEMES.map((t) => t[k])).size, THEMES.length, k);
  assert.equal(new Set(THEMES.map((t) => t.aurora.join())).size, THEMES.length, "cada tema com a sua aurora");
});

test("Bifröst mantém o visual colorido original (só o erro recalibrado)", () => {
  assert.deepEqual(Object.keys(THEMES[0].families), ["red"]);
  const v = themeVars(THEMES[0]);
  assert.equal(v["--tk-5ef2c9"], undefined);
});

test("cada tema muda a interface e os corvos", () => {
  const sig = (t) => [t.huginn.lit, t.huginn.eye, t.muninn.lit, t.muninn.eye].join();
  assert.equal(new Set(THEMES.map(sig)).size, THEMES.length);
  for (const t of THEMES) {
    assert.notEqual(t.huginn.lit, t.muninn.lit, t.id);
    assert.ok(t.muninn.marks.includes("moon"), `${t.id}: Muninn sem lua`);
    assert.ok(t.huginn.marks.includes("crest") || t.huginn.marks.some((m) => m === "crown" || m === "helm"), `${t.id}: Huginn sem crista/coroa/elmo`);
    if (t.id !== "bifrost") {
      assert.ok(Object.keys(t.families).length >= 8, `${t.id}: poucas famílias`);
      for (const fam of Object.keys(t.families)) for (const lit of CSS_FAMILIES[fam]) assert.ok(themeVars(t)[`--tk-${lit}`], `${t.id} ${lit}`);
    }
  }
});

test("contraste WCAG AA (ou melhor) em todo tema", () => {
  for (const t of THEMES) {
    const v = themeVars(t);
    const night = v["--tk-0a0f1f"] ?? "#0a0f1f", card = v["--tk-0f1529"] ?? "#0f1529";
    const ink = v["--tk-eef2ff"] ?? "#eef2ff", dim = v["--tk-9aa6c8"] ?? "#9aa6c8";
    for (const [fg, bg, min, what] of [[t.ink, t.night, 7, "texto"], [t.dim, t.night, 4.5, "texto secundário"], [t.errorText, t.night, 4.5, "texto de erro"],
      [t.onAccent, t.accent, 4.5, "botão"], [ink, night, 7, "texto CSS"], [ink, card, 7, "texto no cartão"], [dim, night, 4.5, "secundário CSS"], [t.error, t.night, 3, "erro (UI)"]]) {
      const c = contrast(fg, bg);
      assert.ok(c >= min, `${t.id}: ${what} ${fg} sobre ${bg} = ${c.toFixed(2)} < ${min}`);
    }
  }
});

test("recolor preserva a hierarquia claro/escuro da família", () => {
  const lum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  for (const t of THEMES.slice(1)) {
    const a = recolor("#05070f", "night", t.families.night), b = recolor("#18213f", "night", t.families.night);
    assert.ok(lum(a) < lum(b), t.id);
  }
});

test("marcas dos corvos: simétricas, na testa, sem tocar olhos, bico ou crista", () => {
  const pts = (svg) => [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) => { const n = m[1].match(/-?\d+(?:\.\d+)?/g).map(Number); const out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; });
  const beakTop = Math.min(...RAVEN.beak.match(/-?\d+(?:\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1));
  for (const t of THEMES) for (const [who, L] of [["huginn", t.huginn], ["muninn", t.muninn]]) {
    for (const m of L.marks) {
      if (m === "crest" || m === "moon") continue;
      const p = pts(markSvg(m, L, who === "huginn"));
      assert.ok(p.length, `${t.id}/${m}`);
      const xs = p.map((q) => q[0]);
      assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 60) < 0.3, `${t.id}/${m} assimétrica`);
      for (const [x, y] of p) {
        for (const s of [-1, 1]) {
          const ex = 60 + s * RAVEN.eyes.dx, ey = RAVEN.eyes.y;
          assert.ok(((x - ex) / 5) ** 2 + ((y - ey) / 5.4) ** 2 > 1, `${t.id}/${m} toca o olho em ${x},${y}`);
        }
        assert.ok(y < beakTop - 0.5 || Math.abs(x - 60) > 6, `${t.id}/${m} toca o bico`);
        assert.ok(y > 22, `${t.id}/${m} sobe na crista`);
        if (who === "muninn") assert.ok(y > 28.2 || Math.abs(x - 60) > 7, `${t.id}/${m} toca a lua`);
      }
    }
  }
});

test("todo botão e aba usa os mixins compartilhados de press e transição", () => {
  const motion = readFileSync(join(root, "theme/motion.css"), "utf8");
  const block = (sel) => { const i = motion.indexOf("/* ── Mixins compartilhados"); return motion.slice(i, motion.indexOf("/* Brilho de hover", i)); };
  const mix = block();
  const [transitionRule, , activeRule] = mix.split("}");
  for (const sel of ["button", '[role="tab"]', '[role="radio"]', ".tab", ".seg button", ".hub-item", ".th-card", ".bf-tray-item", ".bf-tray-theme", ".bf-menu-item", '[role="button"]']) {
    assert.ok(transitionRule.includes(sel), `transição sem ${sel}`);
    assert.ok(activeRule.includes(sel === "button" ? "button:active" : sel.replace(/\]$/, "]") ), `press sem ${sel}`);
  }
  assert.match(transitionRule, /transform var\(--m-base\) var\(--m-bouncy\)/);
  assert.match(activeRule, /scale\(var\(--m-press\)\)/);
  assert.match(motion, /--m-press: 0\.97/);
  // Ninguém mais define o próprio :active (o press é um só).
  for (const f of walk(root).filter((p) => p.endsWith(".css") && !p.endsWith("motion.css"))) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /:active/, f);
  }
  // Elemento clicável que não é <button> declara um papel (pega o mixin por [role]).
  for (const f of walk(root).filter((p) => p.endsWith(".ts"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/h\("(div|span|li|a|section)", \{([^}]*)onclick/g)) {
      assert.match(m[2], /role: "(button|tab|radio)"|m-press/, `${f}: ${m[0].slice(0, 80)}`);
    }
    for (const m of readFileSync(f, "utf8").matchAll(/class: "([^"]*\btab\b[^"]*)"/g)) {
      assert.ok(/h\("button"/.test(readFileSync(f, "utf8")), `${f}: aba ${m[1]} fora de <button>`);
    }
  }
});

test("abas deslizam: ilha, hub e controle segmentado usam slidingInk", () => {
  for (const f of ["views/header.ts", "hub/shell.ts", "views/kit.ts"]) assert.match(readFileSync(join(root, f), "utf8"), /slidingInk\(/, f);
  assert.match(readFileSync(join(root, "island/island.ts"), "utf8"), /slideSwap\(/);
  assert.match(readFileSync(join(root, "hub/shell.ts"), "utf8"), /--m-dir/);
});

test("toda janela liga o motor de temas", () => {
  for (const m of ["main.ts", "desktop/main.ts", "pill/main.ts", "settings/main.ts", "traymenu/main.ts"]) {
    const s = readFileSync(join(root, m), "utf8");
    assert.match(s, /theme\/themes"/, m);
    assert.match(s, /theme\/themes\.css"/, m);
  }
});
