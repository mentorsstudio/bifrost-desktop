// Mapa latino → Futhark antigo, usado onde o Bifrost escreve em runas
// (faixas do hub, sono do Huginn). Toda letra tem runa: nada de "z" cru.

export const RUNE_MAP: Readonly<Record<string, string>> = {
  a: "ᚨ", b: "ᛒ", c: "ᚲ", d: "ᛞ", e: "ᛖ", f: "ᚠ", g: "ᚷ", h: "ᚺ", i: "ᛁ", j: "ᛃ", k: "ᚲ", l: "ᛚ", m: "ᛗ",
  n: "ᚾ", o: "ᛟ", p: "ᛈ", q: "ᚲ", r: "ᚱ", s: "ᛊ", t: "ᛏ", u: "ᚢ", v: "ᚹ", w: "ᚹ", x: "ᚷ", y: "ᛃ", z: "ᛉ",
  ç: "ᚲ", á: "ᚨ", à: "ᚨ", â: "ᚨ", ã: "ᚨ", é: "ᛖ", ê: "ᛖ", í: "ᛁ", ó: "ᛟ", ô: "ᛟ", õ: "ᛟ", ú: "ᚢ",
};

/** "Ajustes" → "ᚨᛃᚢᛊᛏᛖᛊ"; o que não é letra passa igual. */
export function toRunes(text: string, sep = ""): string {
  return [...text.toLowerCase()].map((ch) => RUNE_MAP[ch] ?? ch).join(sep);
}

/** A runa do sono (o "z" do Huginn dormindo). */
export const SLEEP_RUNE = RUNE_MAP.z;
