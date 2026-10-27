// Lógica da pílula reescrita (src/pill/model.ts, speech.ts): mesmas regras da anterior.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/pill/model.ts";
import { pickVoice } from "../src/pill/speech.ts";

const S = (o = {}) => ({ ...M.IDLE_STATE, ...o });

test("aparência por fase, voz, chamada e mouse", () => {
  assert.equal(M.lookOf(S(), false), "resting");
  assert.equal(M.lookOf(S(), true), "toolbar");
  assert.equal(M.lookOf(S({ phase: "locked" }), false), "handsFree");
  for (const p of ["listening", "thinking"]) assert.equal(M.lookOf(S({ phase: p }), true), "live");
  for (const p of ["copied", "failed", "pastedAgain"]) assert.equal(M.lookOf(S({ phase: p }), false), "message");
  assert.equal(M.lookOf(S({ voice: { phase: "listening", heard: "", answer: "" }, noteStartedAt: 1 }), true), "voice");
  assert.equal(M.lookOf(S({ noteStartedAt: 1 }), true), "note");
});

test("tamanhos: repouso, barra, chamada longa, mensagem, vertical", () => {
  assert.deepEqual(M.capsuleSize("resting", S(), 0, 0), { w: 44, h: 8 });
  assert.deepEqual(M.capsuleSize("toolbar", S(), 0, 0), { w: 150, h: 34 });
  assert.deepEqual(M.capsuleSize("handsFree", S(), 0, 0), { w: 158, h: 34 });
  assert.equal(M.openLength("note", S({ noteStartedAt: 0 }), 3_599_999, 0), 136);
  assert.equal(M.openLength("note", S({ noteStartedAt: 0 }), 3_600_000, 0), 152);
  assert.equal(M.openLength("message", S(), 0, 100), 159);
  assert.equal(M.openLength("message", S({ edge: "left" }), 0, 100), 76);
  assert.deepEqual(M.capsuleSize("live", S({ edge: "right" }), 0, 0), { w: 34, h: 118 });
  assert.deepEqual(M.capsuleSize("resting", S({ edge: "left" }), 0, 0), { w: 8, h: 44 });
});

test("mensagens por fase", () => {
  assert.equal(M.messageKey("copied"), "Copied · press Ctrl+V to paste");
  assert.equal(M.messageKey("failed"), "Microphone unavailable");
  assert.equal(M.messageKey("pastedAgain"), "Last dictation pasted");
  assert.equal(M.messageKey("idle"), null);
});

test("barras: microfone ao ouvir, onda ao pensar, fala viva, silêncio parado", () => {
  const mic = [0.1, 0.9, 0, 0, 0, 0, 0, 0, 0.5];
  assert.equal(M.bandGoal(S({ phase: "listening" }), 0, 1, mic, false), 0.9);
  assert.equal(M.bandGoal(S({ phase: "locked" }), 0, 8, mic, false), 0.5);
  const w = M.bandGoal(S({ phase: "thinking" }), 1234, 3, mic, false);
  assert.ok(w >= 0 && w <= 0.5);
  assert.equal(M.bandGoal(S({ voice: { phase: "speaking", heard: "", answer: "" } }), 0, 0, mic, false), 0.05);
  const sp = M.bandGoal(S({ voice: { phase: "speaking", heard: "", answer: "" } }), 500, 2, mic, true);
  assert.ok(sp >= 0.2 && sp <= 0.55);
  assert.equal(M.bandGoal(S(), 0, 0, mic, false), 0);
});

test("suavização das barras converge e não passa do alvo", () => {
  const lv = new Array(9).fill(0);
  for (let k = 0; k < 30; k++) M.easeBands(lv, new Array(9).fill(1), 1 / 60);
  assert.ok(lv.every((v) => v > 0.99 && v <= 1));
  M.easeBands(lv, new Array(9).fill(0), 1); // dt grande: no máximo chega, nunca inverte
  assert.ok(lv.every((v) => v >= 0));
  assert.equal(M.bandPx(0), 3.4);
  assert.equal(M.bandPx(1), 19.4);
  assert.equal(M.bandPx(-1), 3.4);
});

test("zonas do mouse em cada borda e com balão", () => {
  assert.deepEqual(M.hotRects(S(), false, 400, 100, null), [[152, 74, 96, 26]]);
  assert.deepEqual(M.hotRects(S(), true, 400, 100, null), [[100, 54, 200, 46]]);
  assert.deepEqual(M.hotRects(S({ edge: "left" }), false, 100, 400, null), [[0, 152, 26, 96]]);
  assert.deepEqual(M.hotRects(S({ edge: "right" }), true, 100, 400, null), [[54, 100, 46, 200]]);
  const r = M.hotRects(S(), false, 400, 100, { left: 10, top: 20, width: 30, height: 40 });
  assert.deepEqual(r[1], [4, 14, 42, 52]);
});

test("quadros só quando precisa", () => {
  assert.equal(M.frameMode(false, "live", false), "none");
  assert.equal(M.frameMode(true, "resting", false), "none");
  assert.equal(M.frameMode(true, "note", false), "second");
  assert.equal(M.frameMode(true, "note", true), "raf");
  assert.equal(M.frameMode(true, "live", false), "raf");
});

test("visível, chave do conteúdo e distância", () => {
  assert.equal(M.isShown(S()), false);
  assert.equal(M.isShown(S({ enabled: true })), true);
  assert.equal(M.isShown(S({ announcement: { id: 1 } })), true);
  assert.notEqual(M.contentKey("live", S(), "windows"), M.contentKey("live", S({ edge: "left" }), "windows"));
  assert.equal(M.distance({ left: 0, top: 0, right: 10, bottom: 10 }, 5, 5), 0);
  assert.equal(M.distance({ left: 0, top: 0, right: 10, bottom: 10 }, 13, 14), 5);
});

test("voz: idioma exato, idioma-base, gênero", () => {
  const V = [{ name: "Microsoft Daniel", lang: "pt-BR" }, { name: "Microsoft Francisca", lang: "pt-BR" }, { name: "Google português", lang: "pt-PT" }, { name: "Zira", lang: "en-US" }];
  assert.equal(pickVoice(V, "pt-BR", "female", "en").name, "Microsoft Francisca");
  assert.equal(pickVoice(V, "pt-BR", "male", "en").name, "Microsoft Daniel");
  assert.equal(pickVoice(V, "pt", "female", "en").name, "Microsoft Francisca");
  assert.equal(pickVoice(V, null, "female", "en-US").name, "Zira");
  assert.equal(pickVoice(V, "ja", "female", "en"), null);
});
