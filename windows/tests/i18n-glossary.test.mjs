import { test } from "node:test";
import assert from "node:assert/strict";
import { lookup, bifrostGlossary } from "../src/i18n/i18n.ts";
test("pt-BR diz ilha, não notch", () => {
  assert.equal(bifrostGlossary("Mostrar no notch"), "Mostrar na ilha");
  assert.equal(lookup("Show in notch", "pt-BR"), "Mostrar na ilha");
  assert.ok(!String(lookup("The keys that open the notch and its actions.", "pt-BR")).includes("notch"));
});
