// Paulo build: the "Servidores MCP" form helpers (src/core/mcp.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_NAME, clientSnippet, credentialFromForm, configFromForm, formFromConfig, joinArgs, parsePairs, splitArgs } from "../src/core/mcp.ts";
import { providerDef } from "../src/core/providers.ts";
import { DEFAULT_SETTINGS } from "../src/core/state.ts";

const form = (over = {}) => ({ kind: "stdio", command: "", args: "", env: "", url: "", headers: "", disabled: false, ...over });

test("MCP is the default chat provider and needs no key", () => {
  assert.equal(DEFAULT_SETTINGS.chatProvider, "mcp");
  assert.equal(providerDef("mcp").key, null);
});

test("arguments split and join with quotes", () => {
  assert.deepEqual(splitArgs('mcp-serve --tools "C:\\Program Files\\x"'), ["mcp-serve", "--tools", "C:\\Program Files\\x"]);
  assert.equal(joinArgs(["a", "b c"]), 'a "b c"');
  assert.deepEqual(splitArgs(joinArgs(["x", "y z"])), ["x", "y z"]);
});

test("pairs skip comments and blanks", () => {
  assert.deepEqual(parsePairs("A=1\n# no\n\nB = dois=2"), { A: "1", B: "dois=2" });
  assert.deepEqual(parsePairs("X-Key: abc", ":"), { "X-Key": "abc" });
});

test("a stdio form becomes the standard entry", () => {
  assert.deepEqual(configFromForm(form({ command: "hermes.exe", args: "mcp-serve --tools" })), { command: "hermes.exe", args: ["mcp-serve", "--tools"] });
  assert.equal(typeof configFromForm(form()), "string");
});

test("remote servers need https, except on this computer", () => {
  assert.deepEqual(configFromForm(form({ kind: "http", url: "https://mcp.x.com/mcp", headers: "X-A: b" })), { url: "https://mcp.x.com/mcp", headers: { "X-A": "b" } });
  assert.equal(typeof configFromForm(form({ kind: "http", url: "http://mcp.x.com/mcp" })), "string");
  assert.equal(typeof configFromForm(form({ kind: "http", url: "http://127.0.0.1:47821/mcp" })), "object");
  assert.equal(typeof configFromForm(form({ kind: "http", url: "nope" })), "string");
});

test("forms round-trip and names are checked", () => {
  const c = { command: "a b.exe", args: ["x y"], env: { K: "v" } };
  assert.deepEqual(configFromForm(formFromConfig(c)), c);
  assert.ok(MCP_NAME.test("hermes-vps") && !MCP_NAME.test("a b"));
  const snippet = JSON.parse(clientSnippet("http://127.0.0.1:1/mcp", "tok"));
  assert.equal(snippet.mcpServers.coucou.headers.Authorization, "Bearer tok");
});

test("credential: user + password is Basic, else token, else none", () => {
  assert.deepEqual(credentialFromForm(" u ", "p", "tok"), { kind: "basic", user: "u", password: "p" });
  assert.deepEqual(credentialFromForm("", "", " tok "), { kind: "token", token: "tok" });
  assert.deepEqual(credentialFromForm("", "", ""), { kind: "none" });
  assert.equal(typeof credentialFromForm("u", "", ""), "string");
  assert.equal(typeof credentialFromForm("", "p", ""), "string");
  assert.equal(typeof credentialFromForm("a:b", "p", ""), "string");
});
