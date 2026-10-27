// Varre as strings de interface atrás de inglês esquecido (a interface é pt-BR).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(root).filter((f) => f.endsWith(".ts") && !f.includes(`${"i18n"}`));
const MAC = JSON.parse(readFileSync(join(root, "i18n/strings.json"), "utf8")).strings;
const EXTRA = JSON.parse(readFileSync(join(root, "i18n/extra.json"), "utf8")).strings;
const TABLE = { ...MAC, ...EXTRA };

// Palavras de interface inglesas comuns que nunca são português.
export const ENGLISH = /\b(the|and|your|you|with|open|close|settings|session|click|save|cancel|loading|error|please|delete|remove|search|show|hide|enable|disable|connect|copy|paste|send|done|ready|waiting|allow|deny|back|next|later|update|download|install|sign in|log in|new|edit|add|start|stop|record|recording|notes?|notetaker|untitled|unknown|today|yesterday)\b/i;
// Nomes próprios e termos técnicos aceitos.
const OK = /^(OK Bifrost|OK|Bifrost|Huginn|Muninn|Claude Code|Codex|GitHub|Stripe|Vercel|Notion|n8n|MCP|Wi-Fi|Spotify|WhatsApp|Gemini|Cursor|Ctrl|Alt|Shift|Esc|Enter|Tab)$/;

const keysOf = (src) => [...src.matchAll(/\bt[l]?\(\s*"((?:[^"\\]|\\.)+)"/g)].map((m) => m[1]);
const literals = (src) => [...src.matchAll(/\b(text|placeholder|title|label|"aria-label"|ariaLabel)\s*:\s*"((?:[^"\\]|\\.)+)"/g), ...src.matchAll(/\.(textContent|placeholder|title)\s*=\s*"((?:[^"\\]|\\.)+)"/g)].map((m) => m[2]);

test("toda chave t(…) tem tradução pt-BR", () => {
  const missing = new Set();
  for (const f of files) for (const k of keysOf(readFileSync(f, "utf8"))) {
    const key = k.replace(/\\"/g, '"');
    if (!TABLE[key]?.["pt-BR"] && ENGLISH.test(key) && !OK.test(key)) missing.add(`${f.slice(root.length)}: ${key}`);
  }
  assert.deepEqual([...missing], []);
});

test("nenhum texto literal de interface em inglês", () => {
  const bad = [];
  for (const f of files) {
    if (/\/dev\/|\.test\./.test(f)) continue;
    for (const s of literals(readFileSync(f, "utf8"))) if (!TABLE[s]?.["pt-BR"] && !/\.json$/.test(s) && ENGLISH.test(s) && !OK.test(s) && !/^[a-z0-9-]+$/.test(s)) bad.push(`${f.slice(root.length)}: ${s}`);
  }
  assert.deepEqual(bad, []);
});

test("traduções pt-BR não ficaram em inglês", () => {
  const bad = [];
  for (const [k, v] of Object.entries(TABLE)) {
    const pt = v["pt-BR"]; if (typeof pt !== "string") continue;
    if (pt === k && ENGLISH.test(k) && !OK.test(k)) bad.push(k);
  }
  assert.deepEqual(bad, []);
});

test("frases soltas (maiúscula + palavra inglesa) fora do t(…) nas telas", () => {
  const bad = [];
  for (const f of files) {
    if (!/\/(island|views|hub|pill|settings|desktop|traymenu|huginn)\//.test(f)) continue;
    const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*|import|export type|case )/.test(l) && !/===?\s*\"|!==?\s*\"/.test(l) && !/console\.|invoke\(|emit\(|listen\(|onEvent|querySelector|classList|className|class:|Error\(|throw /.test(l)).join("\n");
    for (const m of src.matchAll(/(?<![\w.(]t\(|tl\()"([A-Z][A-Za-z' ,.!?…-]{2,})"/g)) {
      const s = m[1];
      if (ENGLISH.test(s) && !OK.test(s) && !TABLE[s]?.["pt-BR"] && !/^[A-Z][a-z]+[A-Z]/.test(s)) bad.push(`${f.slice(root.length)}: ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});
