// O cabeçalho da ilha: abas (início, chat, soltar), pílulas de uso do plano,
// ajustes e som. O estado visual sai de headerModel(), puro e testado.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import type { IslandViewName } from "../core/layout";
import { tl, type Msg } from "../i18n/i18n";
import { buildPlanPill, claudePillVisible, codexPillVisible, refreshCodexPlanUsage } from "./usage";
import type { ViewActions, ViewHost } from "./views";
import { slidingInk } from "../theme/interact";

export type HeaderTab = "home" | "chat" | "drop" | "settings" | null;

export interface HeaderModel { tab: HeaderTab; soundOn: boolean; hidden: boolean }

export function headerModel(view: IslandViewName, soundEnabled: boolean): HeaderModel {
  const tab: HeaderTab =
    view === "overview" || view === "empty" ? "home"
    : view === "prompt" ? "chat"
    : view === "upload" ? "drop"
    : view === "settings" ? "settings"
    : null;
  return { tab, soundOn: soundEnabled, hidden: view === "confused" };
}

export function buildHeader(actions: ViewActions): ViewHost {
  const go = (v: IslandViewName) => { actions.blip(); actions.setView(v); };
  const tab = (title: string | Msg, icon: string, v: IslandViewName) =>
    h("button", { class: "tab", title, "aria-label": title, onclick: () => go(v) }, svg(icon, 13));
  const tabs = { home: tab(tl("Overview"), ICONS.house, "overview"), chat: tab(tl("Ask"), ICONS.bubble, "prompt"), drop: tab(tl("Drop"), ICONS.plus, "upload") };
  const gear = h("button", { title: tl("Settings"), "aria-label": tl("Settings"), onclick: () => go("settings") });
  const sound = h("button", { title: tl("Mute"), "aria-label": tl("Mute"), onclick: () => actions.toggleSound() });
  const claudePill = buildPlanPill(false);
  const codexPill = buildPlanPill(true);
  const planPills = h("div", { class: "plan-pills" }, claudePill.el, codexPill.el);
  const right = h("div", { class: "header-actions" }, planPills, gear, sound);
  const tabRow = h("div", { class: "tabs", role: "tablist" }, tabs.home, tabs.chat, tabs.drop);
  for (const b of Object.values(tabs)) b.setAttribute("role", "tab");
  const el = h("div", { id: "header" }, tabRow, right);
  // Fase 18: o fundo da aba escolhida desliza de uma para outra com mola.
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") slidingInk(tabRow, ".tab.on", "tabs");
  let last = "";
  let codexShown = false;

  return {
    el,
    sync() {
      const m = headerModel(State.view, State.settings.soundEnabled);
      const key = `${m.tab}|${m.soundOn}|${m.hidden}`;
      if (key !== last) {
        last = key;
        for (const [id, b] of Object.entries(tabs)) { b.classList.toggle("on", m.tab === id); b.setAttribute("aria-selected", String(m.tab === id)); }
        gear.classList.toggle("on", m.tab === "settings");
        gear.replaceChildren(svg(m.tab === "settings" ? ICONS.gearFill : ICONS.gear, 14));
        sound.replaceChildren(svg(m.soundOn ? ICONS.speakerOn : ICONS.speakerOff, 14));
        el.style.opacity = m.hidden ? "0" : "1";
      }
      const claudeOn = claudePillVisible();
      const codexOn = codexPillVisible();
      claudePill.el.style.display = claudeOn ? "" : "none";
      codexPill.el.style.display = codexOn ? "" : "none";
      planPills.classList.toggle("on", claudeOn || codexOn);
      right.classList.toggle("both-plans", claudeOn && codexOn);
      if (claudeOn) claudePill.sync();
      if (codexOn) codexPill.sync();
      const shown = codexOn && State.mode === "expanded";
      if (shown && !codexShown) refreshCodexPlanUsage();
      codexShown = shown;
    },
  };
}
