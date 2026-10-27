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
// Checagens próprias do anel do gesto (rodam na página).
const RING_CHECKS = () => {
  const out = [];
  const hub = document.querySelector(".fm-hub")?.getBoundingClientRect();
  const round = (cs, r) => cs.borderTopLeftRadius.endsWith("%") ? parseFloat(cs.borderTopLeftRadius) >= 50 : parseFloat(cs.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 1;
  if (hub) for (const e of document.querySelectorAll("#fm-root *")) {
    if (e instanceof SVGElement) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if (!r.width || cs.display === "none" || cs.visibility === "hidden") continue;
    const near = r.left < hub.right + 6 && r.right > hub.left - 6 && r.top < hub.bottom + 6 && r.bottom > hub.top - 6;
    const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || ((parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none") && !round(cs, r));
    if (near && ring) out.push({ kind: "hub-rect", what: String(e.className), detail: "contorno retangular perto do miolo" });
  }
  const disc = document.querySelector(".fm-disc");
  if (!disc) out.push({ kind: "ring-bleed", what: "fm-disc", detail: "sem disco de apoio" });
  else {
    const cs = getComputedStyle(disc); const bg = cs.backgroundColor; const m = bg.match(/\/\s*([\d.]+)\s*\)$/) || bg.match(/^rgba\([^)]*,\s*([\d.]+)\)$/); const a = bg === "transparent" ? "0" : m ? m[1] : "1";
    if (+a < 1 || +cs.opacity < 1 || !round(cs, disc.getBoundingClientRect())) out.push({ kind: "ring-bleed", what: "fm-disc", detail: `fundo ${cs.backgroundColor}, opacidade ${cs.opacity}` });
    if (disc.getBoundingClientRect().width / 2 < 166) out.push({ kind: "ring-bleed", what: "fm-disc", detail: "não cobre até a borda" });
  }
  for (const n of document.querySelectorAll(".fm-label-name")) {
    if (/\u00AD|-/.test(n.textContent)) out.push({ kind: "word-split", what: n.textContent, detail: "hífen no rótulo" });
    if (n.scrollWidth > n.clientWidth + 0.5 || n.scrollHeight > n.clientHeight + 0.5) out.push({ kind: "word-split", what: n.textContent, detail: "rótulo cortado" });
    const words = n.textContent.trim().split(/\s+/);
    const lh = parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.15;
    if (words.length === 1 && n.getBoundingClientRect().height > lh * 1.5) out.push({ kind: "word-split", what: n.textContent, detail: "palavra partida em duas linhas" });
  }
  return out;
};
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
  // v24: os 4 estilos do anel × 100/125/150 % × PNG/PDF. Nada retangular em volta
  // do miolo (contorno, borda ou sombra num elemento de cantos retos), o disco de
  // apoio opaco cobre do centro até o cinto (nada da área de trabalho atravessa) e
  // nenhuma palavra do rótulo se parte nem é cortada.
  for (const style of ["runa", "aurora", "escudo", "minimal"]) for (const scale of SCALES) for (const kind of ["png", "pdf"]) {
    const ctx = await browser.newContext({ viewport: { width: 460, height: 460 }, deviceScaleFactor: scale, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/filee-menu.html?theme=bifrost&ring=${style}`);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__emit("filee-menu-open", null)); await page.waitForTimeout(450);
    await page.evaluate((k) => window.__emit("filee-menu-plan", { plan: { ...(k === "pdf" ? window.__FILEE_PDFS__ : window.__FILEE_PLAN__), ring: window.__FILEE_RINGS__[k] }, error: null }), kind);
    await page.waitForTimeout(700);
    add({ scene: `anel:${style}:${kind}`, theme: "bifrost", scale, width: 460 }, [...await page.evaluate(CHECKS), ...await page.evaluate(RING_CHECKS)]);
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
  // Vida dos corvos: nenhuma pose (voo incluído) encosta na borda da janela de 120 px.
  for (const sc of [1, 1.25, 1.5]) for (const who of ["huginn", "muninn"]) for (const ch of sc === 1 ? CHARS : ["classic"]) {
    const ctx = await browser.newContext({ viewport: { width: 1140, height: 330 }, deviceScaleFactor: sc, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/life.html?character=${ch}&who=${who}`);
    await page.waitForTimeout(6500);
    const r = await page.evaluate(() => ({ clip: window.__clip, who: window.__clipWho }));
    add({ scene: `corvo:vida:${who}`, theme: ch, scale: sc, width: 120 }, r.clip ? r.who.map((w) => ({ kind: "raven-clip", what: w, detail: `${r.clip} quadro(s)` })) : []);
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
