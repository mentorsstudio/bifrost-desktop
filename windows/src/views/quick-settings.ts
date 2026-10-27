// Ajustes rápidos da ilha (engrenagem): som e volume, fechar sozinho, e o
// estado de verdade das ligações (hooks do Claude Code, para onde vai o chat).
// Feito com as peças de kit.ts; o modelo é puro e testado.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { State, type Settings } from "../core/state";
import { providerDef, activeModel } from "../core/providers";
import { t, tl } from "../i18n/i18n";
import { card, formRow, segmented, statusBadge, toggle } from "./kit";
import type { ViewActions, ViewHost } from "./views";

export const AUTO_CLOSE = [10, 15, 30] as const;

export interface QuickModel {
  sound: boolean; volume: number; volumeDim: boolean;
  autoClose: number; autoLabel: string;
  hooks: boolean; chatOk: boolean; chatLabel: string;
}

export function quickModel(s: Pick<Settings, "soundEnabled" | "soundVolume" | "autoCloseInterval" | "hooksInstalled" | "chatProvider" | "chatModels" | "model">): QuickModel {
  const p = providerDef(s.chatProvider);
  const model = activeModel(s as Settings);
  return {
    sound: s.soundEnabled,
    volume: s.soundVolume,
    volumeDim: !s.soundEnabled,
    autoClose: Math.round(s.autoCloseInterval),
    autoLabel: `${Math.round(s.autoCloseInterval)}s`,
    hooks: s.hooksInstalled,
    chatOk: Boolean(model) || p.id === "mcp",
    chatLabel: model ? `${p.name} · ${model}` : p.name,
  };
}

export function buildQuickSettings(actions: ViewActions): ViewHost {
  const sound = toggle(t("Sound"), () => actions.toggleSound());
  const volume = h("input", {
    type: "range", min: "0", max: "0.2", step: "0.005", "aria-label": t("Sound"),
    oninput: (e: Event) => actions.setVolume(Number((e.target as HTMLInputElement).value)),
  }) as HTMLInputElement;
  const autoLabel = h("span", {});
  const auto = segmented(AUTO_CLOSE.map((s) => ({ value: s, label: `${s}s` })), (s) => actions.setAutoClose(s));
  const hooks = statusBadge();
  const chat = statusBadge();
  const rows = h("div", { class: "settings-rows" },
    formRow(sound.el, h("span", { text: tl("Sound") }), volume),
    formRow(svg(ICONS.timer, 12), autoLabel, auto.el),
    formRow(hooks.el, chat.el, h("div", { class: "grow" }),
      h("button", { class: "link-btn qs-more", text: tl("Settings…"), onclick: () => actions.openSettingsWindow() })),
  );
  const el = h("div", { class: "view" }, card(null, h("div", { class: "stack qs-stack" }, rows)));
  return {
    el,
    sync() {
      const m = quickModel(State.settings);
      sound.set(m.sound);
      if (document.activeElement !== volume) volume.value = String(m.volume);
      volume.style.opacity = m.volumeDim ? "0.4" : "1";
      autoLabel.textContent = t("Auto-close · {seconds}s", { seconds: m.autoClose });
      auto.set(m.autoClose as (typeof AUTO_CLOSE)[number]);
      hooks.set(m.hooks, "Claude Code");
      chat.set(m.chatOk, m.chatLabel);
    },
  };
}
