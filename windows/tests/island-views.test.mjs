import { test } from "node:test";
import assert from "node:assert/strict";
import { headerModel } from "../src/views/header.ts";
import { pillLook, badgeLook, lighten } from "../src/views/pill-chip.ts";
import { quickModel, AUTO_CLOSE } from "../src/views/quick-settings.ts";

test("cabeçalho: aba certa por vista, some no confuso", () => {
  assert.equal(headerModel("overview", true).tab, "home");
  assert.equal(headerModel("empty", true).tab, "home");
  assert.equal(headerModel("prompt", true).tab, "chat");
  assert.equal(headerModel("upload", false).tab, "drop");
  assert.equal(headerModel("settings", false).tab, "settings");
  assert.equal(headerModel("approval", true).tab, null);
  assert.equal(headerModel("confused", true).hidden, true);
  assert.equal(headerModel("overview", false).soundOn, false);
});
test("pílula: cor no hover e selos", () => {
  assert.equal(lighten("#000000", 0.5), "rgb(128,128,128)");
  assert.equal(pillLook("#112233", false).border, "#11223324");
  assert.equal(pillLook("#112233", true).background, "#1122332e");
  assert.equal(badgeLook("finished").icon, "check");
  assert.equal(badgeLook("approval").color, "#F5A524");
});
test("ajustes rápidos: estado real do chat, não um 'API' vermelho fixo", () => {
  const base = { soundEnabled: true, soundVolume: 0.1, autoCloseInterval: 15, hooksInstalled: true, chatProvider: "cli", chatModels: { cli: "codex" }, model: "" };
  const m = quickModel(base);
  assert.equal(m.chatOk, true);
  assert.equal(m.chatLabel, "IA do PC · codex");
  assert.equal(m.autoClose, 15);
  assert.ok(AUTO_CLOSE.includes(m.autoClose));
  assert.equal(quickModel({ ...base, soundEnabled: false }).volumeDim, true);
  assert.equal(quickModel({ ...base, chatProvider: "ollama", chatModels: {} }).chatOk, false);
});
