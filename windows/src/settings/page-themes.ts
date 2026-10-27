// Fase 18 — Ajustes → Temas: a galeria. Cada cartão é uma prévia viva no próprio
// tema (as variáveis do tema valem só dentro do cartão): a ilha, a aurora que
// corre e os dois corvos animando. Clicar aplica com cruzamento suave.

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
