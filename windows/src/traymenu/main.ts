// O menu da bandeja do Bifrost: uma janela própria, nórdica, no lugar do menu
// nativo do Windows. Cada item chama tray_menu_activate, que faz o mesmo que o
// menu antigo fazia (abrir, resumo, adornos, configurações, pausar, sair).

import "../theme/bifrost.css";
import "../bifrost/nordic.css";
import "./traymenu.css";
import "../theme/motion.css";
import "../theme/themes.css";
import "../theme/themes";
import "../theme/aurora";
import "../bifrost/contextmenu";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Mascot } from "../bifrost/mascots";
import { THEMES, chooseTheme, currentTheme, onThemeChange } from "../theme/themes";
import { THEME_TXT, fmt } from "../theme/strings";

export interface TrayItem { id: string; label: string }

/** Runa de cada item. */
export const TRAY_RUNES: Record<string, string> = {
  open: "ᛒ", update: "ᛏ", recap: "ᛃ", wardrobe: "ᚹ", settings: "ᛟ", pause: "ᛁ", quit: "ᛞ",
};
/** Onde vai uma linha entalhada (separador). */
const BREAK_AFTER = new Set(["recap", "pause"]);

export function renderTray(root: HTMLElement, items: TrayItem[], run: (id: string) => void): HTMLElement[] {
  root.textContent = "";
  const head = document.createElement("div");
  head.className = "bf-tray-head";
  const pair = document.createElement("div");
  pair.className = "bf-pair-row";
  new Mascot("huginn", pair);
  new Mascot("muninn", pair);
  head.append(pair);
  const title = document.createElement("div");
  title.className = "bf-title bf-tray-title";
  title.textContent = "Bifrost";
  head.append(title);
  root.append(head, Object.assign(document.createElement("div"), { className: "bf-bridge" }));
  const buttons: HTMLElement[] = [];
  for (const it of items) {
    const b = document.createElement("button");
    b.className = `bf-tray-item${it.id === "quit" ? " danger" : ""}${it.id === "update" ? " update" : ""}`;
    b.dataset.id = it.id;
    const rune = document.createElement("span");
    rune.className = "bf-menu-rune";
    rune.textContent = TRAY_RUNES[it.id] ?? "᛫";
    const label = document.createElement("span");
    label.textContent = it.label;
    b.append(rune, label);
    b.addEventListener("click", () => run(it.id));
    root.append(b);
    buttons.push(b);
    if (BREAK_AFTER.has(it.id)) root.append(Object.assign(document.createElement("div"), { className: "bf-tray-sep" }));
  }
  root.append(themeStrip());
  return buttons;
}

/** Fase 18: troca de tema direto da bandeja — uma runa por reino. */
export function themeStrip(): HTMLElement {
  const row = document.createElement("div");
  row.className = "bf-tray-themes";
  row.setAttribute("role", "radiogroup");
  row.setAttribute("aria-label", THEME_TXT.trayLabel);
  const chips = THEMES.map((t, i) => {
    const b = document.createElement("button");
    b.className = "bf-tray-theme";
    b.setAttribute("role", "radio");
    b.title = fmt(THEME_TXT.menuTheme, t.name);
    b.setAttribute("aria-label", b.title);
    b.textContent = t.rune;
    b.style.setProperty("--i", String(i));
    b.style.setProperty("--chip", t.accent);
    b.style.setProperty("--chip-2", t.aurora[1]);
    b.addEventListener("click", () => chooseTheme(t.id));
    row.append(b);
    return [t.id, b] as const;
  });
  const mark = (id: string) => { for (const [cid, b] of chips) { b.classList.toggle("on", cid === id); b.setAttribute("aria-checked", String(cid === id)); } };
  mark(currentTheme().id);
  onThemeChange((t) => mark(t.id));
  return row;
}

async function open() {
  const root = document.getElementById("menu")!;
  const items = (await invoke<TrayItem[]>("tray_menu_items").catch(() => [])) ?? [];
  root.classList.remove("in");
  renderTray(root, items, (id) => void invoke("tray_menu_activate", { id }));
  requestAnimationFrame(() => root.classList.add("in"));
}

if (typeof window !== "undefined" && document.getElementById("menu")) {
  void open();
  void listen("traymenu-open", () => void open());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") void invoke("tray_menu_activate", { id: "__close" });
  });
}
