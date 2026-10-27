// Fase 18 — Ajustes → Temas: a galeria. Cada cartão é uma prévia viva no próprio
// tema (as variáveis do tema valem só dentro do cartão): a ilha, a aurora que
// corre e os dois corvos animando. Clicar aplica com cruzamento suave.

import { LIFE_LEVELS, readLevel, saveLevel, ravenSignal, type LifeLevel } from "../bifrost/raven-life";
import { reducedMotion } from "../bifrost/motion";
import { h } from "../views/dom";
import { Mascot } from "../bifrost/mascots";
import { THEMES, chooseTheme, currentTheme, onThemeChange, themeVars, type Theme } from "../theme/themes";
import { THEME_TXT } from "../theme/strings";

function preview(t: Theme): HTMLElement {
  const box = h("div", { class: "th-preview", "aria-hidden": "true" });
  for (const [k, v] of Object.entries(themeVars(t, true))) box.style.setProperty(k, v);
  const island = h("div", { class: "th-island" },
    h("span", { class: "th-dot" }), h("span", { class: "th-line" }), h("span", { class: "th-line short" }));
  const aurora = h("div", { class: "th-aurora" }, h("i"));
  const birds = h("div", { class: "th-birds" });
  const hu = new Mascot("huginn", birds, t);
  const mu = new Mascot("muninn", birds, t);
  hu.set("idle"); mu.set("idle");
  box.append(h("div", { class: "th-sky" }), island, aurora, birds);
  return box;
}

export function themesSection(): HTMLElement {
  const sec = h("section", { class: "th-section" });
  sec.append(h("h2", { text: THEME_TXT.pageTitle }), h("div", { class: "hint", text: THEME_TXT.intro }));
  const grid = h("div", { class: "th-grid m-stagger", role: "radiogroup", "aria-label": THEME_TXT.pageTitle });
  const cards = new Map<string, HTMLElement>();
  THEMES.forEach((t, i) => {
    const on = t.id === currentTheme().id;
    const card = h("button", {
      class: `th-card${on ? " on" : ""}`, role: "radio", "aria-checked": String(on), title: `${t.name} — ${t.tagline}`,
      onclick: () => chooseTheme(t.id),
    });
    card.style.setProperty("--i", String(i));
    card.style.setProperty("--th-card-accent", t.accent);
    card.style.setProperty("--th-card-glow", `rgba(${themeVars(t)["--th-accent-rgb"]}, .35)`);
    const head = h("div", { class: "th-meta" },
      h("span", { class: "th-rune", text: t.rune }),
      h("span", { class: "th-name", text: t.name }),
      h("span", { class: "th-badge", text: THEME_TXT.inUse }));
    card.append(preview(t), head, h("div", { class: "th-tag", text: t.tagline }));
    cards.set(t.id, card);
    grid.append(card);
  });
  const off = onThemeChange((t) => {
    if (!sec.isConnected && off) { off(); return; }
    for (const [id, c] of cards) { const on = id === t.id; c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); }
  });
  sec.append(grid);
  return sec;
}

// Fase 19 — Personagens: o visual dos corvos, separado do tema. Cada cartão é uma
// prévia viva (os dois corvos respirando e piscando); escolher faz um pulinho
// curto de comemoração (some com movimento reduzido, pelo próprio nordic.css).
import { CHARACTERS, chooseCharacter, currentCharacter, onCharacterChange, ravenTheme, type Character } from "../theme/characters";

export const CHARACTER_TXT = {
  title: "Personagens",
  intro: "O visual do Huginn e do Muninn, à parte do tema. Vale para a ilha, o corvo da área de trabalho, a pílula e o chat.",
  inUse: "Em uso",
} as const;

export function charactersSection(): HTMLElement {
  const sec = h("section", { class: "th-section ch-section" });
  sec.append(h("h2", { text: CHARACTER_TXT.title }), h("div", { class: "hint", text: CHARACTER_TXT.intro }));
  const grid = h("div", { class: "ch-grid m-stagger", role: "radiogroup", "aria-label": CHARACTER_TXT.title });
  const cards = new Map<string, { card: HTMLElement; birds: Mascot[]; box: HTMLElement }>();
  const draw = (c: Character, box: HTMLElement): Mascot[] => {
    box.replaceChildren();
    const T = ravenTheme(currentTheme(), c);
    return [new Mascot("huginn", box, T), new Mascot("muninn", box, T)];
  };
  CHARACTERS.forEach((c, i) => {
    const on = c.id === currentCharacter().id;
    const box = h("div", { class: "ch-birds", "aria-hidden": "true" });
    const card = h("button", {
      class: `ch-card${on ? " on" : ""}`, role: "radio", "aria-checked": String(on), "data-character": c.id,
      title: `${c.name} — ${c.tagline}`, onclick: () => chooseCharacter(c.id),
    });
    card.style.setProperty("--i", String(i));
    card.append(box,
      h("div", { class: "th-meta" }, h("span", { class: "th-name", text: c.name }), h("span", { class: "th-badge", text: CHARACTER_TXT.inUse })),
      h("div", { class: "th-tag", text: c.tagline }));
    cards.set(c.id, { card, box, birds: draw(c, box) });
    grid.append(card);
  });
  const offC = onCharacterChange((c) => {
    if (!sec.isConnected) { offC(); offT(); return; }
    for (const [id, e] of cards) {
      const on = id === c.id;
      e.card.classList.toggle("on", on); e.card.setAttribute("aria-checked", String(on));
      if (on) for (const b of e.birds) { b.set("success"); setTimeout(() => b.set("idle"), 900); }
    }
  });
  // "Seguir o tema" mostra os corvos do tema atual: redesenha quando o tema troca.
  const offT = onThemeChange(() => {
    if (!sec.isConnected) { offC(); offT(); return; }
    const e = cards.get("theme");
    if (e) e.birds = draw(CHARACTERS[0], e.box);
  });
  sec.append(grid);
  return sec;
}

/** Fase 22: "Vida dos corvos" — quanto Huginn e Muninn se mexem sozinhos. */
export const LIFE_TXT = {
  title: "Vida dos corvos",
  intro: "Gestos discretos quando estão à toa (piscar, olhar de lado, ajeitar a asa, um pulinho), cochilo depois de um tempo parado e reações ao chat, ao ditado e aos agentes.",
  reduced: "O Windows pede menos movimento: os corvos ficam quietos.",
  names: { off: "Desligado", calmo: "Calmo", normal: "Normal", animado: "Animado" } as Record<LifeLevel, string>,
};

export function lifeSection(): HTMLElement {
  const sec = h("section", { class: "th-section life-section" });
  sec.append(h("h2", { text: LIFE_TXT.title }), h("div", { class: "hint", text: LIFE_TXT.intro }));
  const seg = h("div", { class: "hub-segmented life-seg", role: "radiogroup", "aria-label": LIFE_TXT.title });
  const paint = () => { const cur = readLevel(); for (const b of seg.children) { const on = (b as HTMLElement).dataset.level === cur; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); } };
  for (const l of LIFE_LEVELS) {
    seg.append(h("button", { class: "seg-cell", role: "radio", "data-level": l, text: LIFE_TXT.names[l],
      onclick: () => { saveLevel(l); paint(); ravenSignal({ kind: "activity" }); } }));
  }
  paint();
  sec.append(seg);
  if (reducedMotion()) { sec.append(h("div", { class: "hint", text: LIFE_TXT.reduced })); seg.setAttribute("aria-disabled", "true"); }
  return sec;
}
