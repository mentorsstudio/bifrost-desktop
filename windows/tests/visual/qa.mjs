// QA visual automático (fase 19).
//   node tests/visual/qa.mjs [--full] [--json out.json]
// Precisa do Vite (npm run dev, ou BIFROST_QA_URL) e do playwright-core
// (BIFROST_PLAYWRIGHT=/caminho/playwright-core se não estiver no node_modules).
// Renderiza páginas do hub, cenas da ilha, a pílula e a bandeja em cada tema,
// escala (100/125/150 %) e largura, e roda tests/visual/checks.js em cada uma.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const BASE = process.env.BIFROST_QA_URL || "http://localhost:5191";
const CHECKS = readFileSync(join(here, "checks.js"), "utf8");
const FULL = process.argv.includes("--full");
const jsonAt = process.argv.indexOf("--json");

export const THEMES = ["bifrost", "asgard", "muspelheim", "niflheim", "yggdrasil", "valhalla", "ragnarok"];
export const PAGES = ["dictation", "notes", "insights", "dictionary", "snippets", "styles", "flowsettings",
  "general", "themes", "pills", "agents", "chat", "voice", "integrations", "phone", "shortcuts"];
export const ISLAND = ["idle", "home", "home-last", "home-session", "home-empty", "quick", "notification", "approval", "approval-pair", "chat", "chat-picker", "upload"];
// Fase 19: cada tema roda a ilha e a pílula com um personagem diferente.
export const CHARS = ["theme", "classic", "snow", "ember", "moss", "dusk", "gold", "storm"];
const SCALES = [1, 1.25, 1.5];
const HUB_W = [{ w: 900, h: 700 }, { w: 1400, h: 900 }];
const ISL_W = [{ w: 860, h: 520 }, { w: 1100, h: 560 }];

/** Rápido: todos os temas a 100 % largo + Bifröst em todas as escalas/larguras. --full: tudo × tudo. */
export function matrix(full = FULL) {
  const runs = [];
  for (const theme of THEMES) for (const scale of SCALES) for (const size of [0, 1]) {
    if (!full && theme !== "bifrost" && !(scale === 1 && size === 1)) continue;
    runs.push({ theme, scale, size });
  }
  return runs;
}

async function main() {
  const pw = require(process.env.BIFROST_PLAYWRIGHT || "playwright-core");
  const browser = await pw.chromium.launch({ args: ["--no-sandbox"] });
  const found = [];
  const add = (ctx, list) => { for (const p of list) found.push({ ...ctx, ...p }); };
  for (const { theme, scale, size } of matrix()) {
    {
      const vp = HUB_W[size];
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: scale, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dev/settings-shot.html?theme=${theme}`);
      await page.waitForTimeout(1500);
      for (const id of PAGES) {
        await page.evaluate((id) => (window.__TAURI_INTERNALS__?.__emit?.("hub-page", id) ?? window.__emit?.("hub-page", id)), id);
        await page.waitForTimeout(450);
        add({ scene: `hub:${id}`, theme, scale, width: vp.w }, await page.evaluate(CHECKS));
        await page.evaluate(() => document.querySelectorAll(".hub-scroll").forEach((s) => (s.scrollTop = s.scrollHeight)));
        await page.waitForTimeout(80);
        add({ scene: `hub:${id}@fim`, theme, scale, width: vp.w }, (await page.evaluate(CHECKS)).filter((p) => p.kind !== "tail"));
      }
      await ctx.close();
    }
    const vp = ISL_W[size];
    const ch = CHARS[(THEMES.indexOf(theme) + scale * 4) % CHARS.length | 0];
    const q = `theme=${theme}&character=${ch}`;
    const scenes = [...ISLAND.map((s) => [`ilha:${s}`, `/dev/screens.html?shot=${s}&${q}`]),
      ["bandeja", `/traymenu.html?${q}`], ["pilula", `/dev/pill.html?${q}`]];
    for (const [scene, url] of scenes) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: scale, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(BASE + url);
      await page.waitForTimeout(1300);
      add({ scene, theme, scale, width: vp.w }, await page.evaluate(CHECKS));
      await ctx.close();
    }
  }
  // Fase 20: o Conversor (hub) e o anel do gesto em cada estado, a 100/125/150 %.
  for (const theme of FULL ? THEMES : ["bifrost", "ragnarok"]) for (const scale of SCALES) {
    const ch = CHARS[(THEMES.indexOf(theme) + 1) % CHARS.length];
    for (const vp of HUB_W) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: scale, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dev/filee-hub.html?theme=${theme}&character=${ch}`);
      await page.waitForTimeout(1300);
      await page.evaluate(() => window.__emit?.("hub-page", "converter"));
      await page.waitForTimeout(700);
      add({ scene: "hub:converter", theme, scale, width: vp.w }, await page.evaluate(CHECKS));
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 460, height: 460 }, deviceScaleFactor: scale, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/filee-menu.html?theme=${theme}&character=${ch}`);
    await page.waitForTimeout(900);
    const ring = async (state) => { await page.waitForTimeout(450); add({ scene: `anel:${state}`, theme, scale, width: 460 }, await page.evaluate(CHECKS)); };
    const open = async (plan) => {
      await page.evaluate(() => window.__emit("filee-menu-open", null)); await ring("abrindo");
      await page.evaluate((k) => window.__emit("filee-menu-plan", { plan: window[k], error: null }), plan);
    };
    await open("__FILEE_PLAN__"); await ring("imagens");
    const at = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, sel);
    const first = await at(".fm-slice:not(.off)");
    if (first) { await page.mouse.move(first.x, first.y); await ring("hover"); }
    const sub = await at(".fm-slice.has-sub");
    if (sub) { await page.evaluate((p) => window.__emit("filee-menu-release", p), sub); await ring("sub"); }
    await open("__FILEE_PDFS__"); await ring("pdfs");
    await page.evaluate(() => { window.__FIXTURES__.filee_menu_action = 7; });
    const tool = await at('.fm-slice[data-act="merge-pdf"], .fm-slice:not(.has-sub):not(.off)');
    if (tool) { await page.evaluate((p) => window.__emit("filee-menu-release", p), tool); await page.waitForTimeout(200);
      await page.evaluate(() => window.__emit("convert-item", { job: 7, index: 0, name: "x", state: "running", progress: 0.5, outputs: [], error: null })); await ring("progresso");
      await page.evaluate(() => window.__emit("convert-item", { job: 7, index: 0, name: "x", state: "done", progress: 1, outputs: ["C:\\Users\\paulo\\Documents\\contrato-unido.pdf"], error: null })); await ring("pronto"); }
    await page.evaluate(() => window.__emit("filee-menu-open", null));
    await page.evaluate(() => window.__emit("filee-menu-plan", { plan: null, error: "Não achei um arquivo aqui." })); await ring("erro");
    await ctx.close();
  }
  // Com movimento: a aba ativa abre o rótulo numa transição; o indicador tem de acabar igual a ela.
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/settings-shot.html?theme=bifrost`);
    await page.waitForTimeout(1500);
    for (const id of PAGES) {
      await page.evaluate((id) => (window.__TAURI_INTERNALS__?.__emit?.("hub-page", id) ?? window.__emit?.("hub-page", id)), id);
      await page.waitForTimeout(900);
      add({ scene: `hub:${id}~movimento`, theme: "bifrost", scale: 1, width: 1400 }, (await page.evaluate(CHECKS)).filter((p) => p.kind === "double"));
    }
    await ctx.close();
  }
  await browser.close();
  const by = {};
  for (const f of found) by[f.kind] = (by[f.kind] || 0) + 1;
  const uniq = new Map();
  for (const f of found) { const k = `${f.kind}|${f.scene.replace(/@fim$/, "")}|${f.what}`; if (!uniq.has(k)) uniq.set(k, f); }
  const summary = { total: found.length, unique: uniq.size, byKind: by, issues: [...uniq.values()] };
  if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ total: summary.total, unique: summary.unique, byKind: by }));
  for (const f of summary.issues) console.log(`  [${f.kind}] ${f.scene} ${f.theme} ${f.scale}x ${f.width}px — ${f.what}${f.detail ? ` (${f.detail})` : ""}`);
  process.exitCode = found.length ? 1 : 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exitCode = 2; });
