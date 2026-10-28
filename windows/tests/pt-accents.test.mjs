// Flags common pt-BR words written without their accent (nao, voce, conversao…)
// in the pt-BR catalog values and in hardcoded user-facing strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BAD = ["nao", "voce", "voces", "conversao", "conversoes", "configuracao", "configuracoes",
  "acao", "acoes", "opcao", "opcoes", "ate", "tambem", "ja", "audio", "audios", "video", "videos",
  "pagina", "paginas", "possivel", "disponivel", "sessao", "sessoes", "permissao", "versao",
  "atencao", "informacao", "conexao", "transcricao", "codigo", "usuario", "proximo", "ultimo",
  "historico", "rapido", "facil", "musica", "memoria", "concluido", "concluida"];
// "esta" as a verb ("esta pronto", "esta ligado") — the demonstrative is fine.
const ESTA_VERB = /\besta (pronto|pronta|ligado|ligada|desligado|desligada|ativo|ativa|aberto|aberta|instalado|instalada|conectado|conectada|em |no |na |rodando|funcionando|vazio|vazia|ouvindo)/i;
const RE = new RegExp(`(?<![\\p{L}_./:-])(${BAD.join("|")})(?![\\p{L}_./:-])`, "iu");

function problems(text) {
  const out = [];
  const m = text.match(RE);
  if (m) out.push(m[1]);
  if (ESTA_VERB.test(text)) out.push("esta (verbo)");
  return out;
}

test("pt-BR catalog values are accented", () => {
  const bad = [];
  for (const f of ["src/i18n/strings.json", "src/i18n/extra.json", "src/i18n/pt-fixes.json"]) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    for (const [k, v] of Object.entries(j.strings ?? j)) {
      const pt = typeof v === "string" ? v : v?.["pt-BR"];
      const vals = typeof pt === "string" ? [pt] : pt && typeof pt === "object" ? Object.values(pt) : [];
      for (const s of vals) for (const p of problems(String(s))) bad.push(`${f} «${k}»: ${p}`);
    }
  }
  assert.deepEqual(bad, []);
});

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules" && n !== "target") walk(p, acc); }
    else if (/\.(ts|rs)$/.test(n)) acc.push(p);
  }
  return acc;
}

test("hardcoded user-facing strings are accented", () => {
  const bad = [];
  for (const f of [...walk("src"), ...walk("src-tauri/src")]) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|#\[)/.test(line)) return;
      for (const m of line.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g)) {
        const s = m[1] ?? m[2];
        if (!/\s/.test(s)) continue; // identifiers / ids / mime types — prose has spaces
        if (/\b(the|and|did|not|with|your|you|is|of|to|device)\b/i.test(s)) continue; // English source keys
        for (const p of problems(s)) bad.push(`${f}:${i + 1}: ${p} — ${s.slice(0, 60)}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("pt-fixes.json only corrects strings the Mac catalog has", () => {
  const mac = JSON.parse(readFileSync("src/i18n/strings.json", "utf8")).strings;
  const fixes = JSON.parse(readFileSync("src/i18n/pt-fixes.json", "utf8")).strings;
  assert.deepEqual(Object.keys(fixes).filter((k) => !(k in mac)), []);
});
