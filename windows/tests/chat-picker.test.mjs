import { test } from "node:test";
import assert from "node:assert/strict";
import { keepChatChoice } from "../src/views/chat.ts";
test("sem gravação pendente, o eco do Rust vale", () => {
  const inc = { chatProvider: "mcp", chatModels: {}, model: "" };
  assert.equal(keepChatChoice(inc, { chatProvider: "cli", chatModels: {}, model: "" }).chatProvider, "mcp");
});
