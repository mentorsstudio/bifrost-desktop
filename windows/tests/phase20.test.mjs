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
  assert.match(src("bifrost/mascots.ts"), /onRavenLookChange, ravenTheme \} from "\.\.\/theme\/characters"/);
});

test("Ajustes mostra Conversor em Geral e Personagens em Temas", () => {
  const m = src("settings/main.ts");
  assert.match(m, /general: \(\) => \[generalSection\(\), fileeSection\(\)\]/);
  assert.match(m, /themes: \(\) => \[themesSection\(\), charactersSection\(\)(, lifeSection\(\))?\]/);
});

test("a runa d'água não aparece no vão dos cartões das subpáginas", () => {
  assert.match(src("bifrost/hub-pages.css"), /\.hub-page:not\(\[data-page="dictation"\]\)::before \{ content: none; \}/);
});

test("conteúdo nunca depende da animação: janela 'oculta' leva as animações ao fim e a entrada tem prazo", () => {
  assert.match(src("bifrost/hub.css"), /\.bf-hub-hidden \*[^{]*\{ animation-duration: 0s !important; animation-delay: 0s !important;/);
  assert.doesNotMatch(src("bifrost/hub.css"), /bf-hub-hidden \* \{ animation-play-state: paused/);
  const sh = src("hub/shell.ts");
  assert.match(sh, /setTimeout\(\(\) => el\.classList\.remove\("m-rise"\), RISE_FALLBACK_MS\)/);
  assert.match(sh, /watchWindowShown\(\);/);
  assert.match(src("theme/motion.css"), /\.bf-hub-hidden \.m-rise[^{]*\{ animation: none !important; \}/);
});

test("uma forma só: células de grupos sem halo nem borda; raio da aba = raio do ink", () => {
  const r = src("bifrost/realm.css");
  assert.match(r, /\.hub-segmented > button::before[^{]*\{ display: none !important; \}/);
  assert.match(r, /\.m-ink-hub \.hub-item \{ border-radius: 17px !important; \}/);
  assert.match(r, /button:not\(\.hub-item\):not\(\.tab\):not\(\.hub-segmented > \*\)/);
  assert.match(r, /appearance: none;/);
});

test("regra de colisão: pílula de status com respiro e reticências", () => {
  const r = src("bifrost/realm.css");
  assert.match(r, /\.hub-status \{ padding: 9px 16px 9px 14px;/);
  assert.match(r, /\.hub-status \.hub-status-text \{[^}]*text-overflow: ellipsis/);
  assert.match(src("hub/shell.ts"), /statusLine\.title = text;/);
  const c = src("../tests/visual/checks.js".replace("../", "../")) ;
  void c;
});

test("ilha flutuante: sem AppBar reservada nem barra nativa; limpa a reserva antiga ao iniciar", () => {
  const n = readFileSync(new URL("../src-tauri/src/notch.rs", import.meta.url), "utf8");
  const win = n.slice(n.indexOf("mod win {"), n.indexOf("/// Liga o vigia"));
  assert.doesNotMatch(win, /ABM_SETPOS|BifrostNotchBar|WS_EX_LAYERED/);
  assert.match(win, /fn release_old_reservation\(\)/);
  assert.match(win, /SHAppBarMessage\(ABM_NEW, &mut d\) != 0 \{ SHAppBarMessage\(ABM_REMOVE/);
  assert.match(win, /from_millis\(500\)/);
  assert.match(win, /HWND_TOPMOST/);
  assert.match(win, /!IsZoomed\(fg\)\.as_bool\(\)/);
  assert.match(win, /SW_SHOWNOACTIVATE/);
  assert.match(src("island/island.ts"), /this\.fsm\.floorPetit = true;/);
  assert.doesNotMatch(src("settings/page-general.ts"), /Reservar a faixa/);
});
