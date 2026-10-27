import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
test("session card: rótulos curtos com title completo", () => {
  const s = r("src/views/session-card.ts");
  for (const l of ["Pasta", "Conversar", "Ajustes"]) assert.match(s, new RegExp(`"${l}"`));
  assert.match(s, /title:\s*full/);
});
test("session card: botões quebram linha e não usam reticências", () => {
  const c = r("src/bifrost/saga.css");
  assert.match(c, /\.overview \.sc-actions \{[^}]*flex-wrap: wrap/);
  assert.match(c, /\.sc-btn \{[^}]*text-overflow:\s*clip/);
});
test("QA: regra button-cut existe", () => assert.match(r("tests/visual/checks.js"), /button-cut/));
test("pílula: vira só ícone em vez de cortar o nome", () => {
  assert.match(r("src/views/pill-chip.ts"), /icon-only/);
  assert.match(r("src/style.css"), /\.pill\.icon-only \.lbl \{ display: none; \}/);
});
test("agentes instalados: Claude/Codex/Hermes/Grok/VS Code + última sessão", () => {
  const rs = r("src-tauri/src/agents_scan.rs");
  for (const n of ["Claude Code", "Claude (app)", "Codex", "Hermes", "Grok", "LM Studio", "anthropic.claude-code", ".claude/projects", ".codex/sessions"]) assert.ok(rs.includes(n), n);
  assert.match(r("src/views/agents-model.ts"), /idle: N_\("installed"\)/);
});
test("mídia: marca vetorial e YouTube Music pela sessão do Windows", async () => {
  const { SPOTIFY_MARK, YTMUSIC_MARK, MEDIA_NAME } = await import("../src/views/media-marks.ts");
  assert.equal(SPOTIFY_MARK.filter(([t]) => t === "path").length, 3);
  assert.equal(MEDIA_NAME.ytmusic, "YouTube Music");
  assert.ok(YTMUSIC_MARK.length >= 3);
  assert.match(r("src-tauri/src/spotify.rs"), /fn is_ytmusic_app/);
  assert.doesNotMatch(r("src/views/spotify.ts"), /createMiniBot/);
});
test("preset Hermes (VPS): base → /mcp e /task/mcp, credencial no cofre", async () => {
  const { hermesVpsServers } = await import("../src/core/mcp.ts");
  assert.deepEqual(hermesVpsServers("https://vps.x/mcp/"), [{ name: "hermes-vps", url: "https://vps.x/mcp" }, { name: "hermes-vps-tarefas", url: "https://vps.x/task/mcp" }]);
  assert.equal(hermesVpsServers("vps"), null);
  const ui = r("src/settings/mcp.ts");
  assert.match(ui, /Hermes \(VPS\)/);
  assert.match(ui, /mcpSetBasicAuth\(s\.name/);
});
