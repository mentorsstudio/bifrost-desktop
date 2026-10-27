// The Bifrost window (settings.html): Flow dictation, the Notetaker and, under
// Notch, every setting of the island — the place where anything that writes to
// disk is confirmed. The window's frame and the Flow pages live in ../hub; the
// island's settings are drawn here, one Notch page at a time.

import "./settings.css";
import "./themes-page.css";
import "../theme/bifrost.css";
import "../bifrost/nordic.css";
import "../bifrost/skin.css";
import "../bifrost/hub.css";
import "../bifrost/hub-pages.css";
import "../theme/motion.css";
import "../bifrost/realm.css";
import "../theme/themes.css";
import "../theme/themes";
import "../theme/aurora";
import "../bifrost/contextmenu";

// Céu nórdico atrás da janela inteira: aurora e ponte.
document.body.classList.add("bf-sky", "bf-scope");
document.body.prepend(Object.assign(document.createElement("div"), { className: "bf-aurora" }));
import { Bridge, onEvent, type ShortcutsReport } from "../core/bridge";
import { type Settings } from "../core/state";
import type { UpdateStatus } from "../core/update";
import { availablePills, sanitizeDeclared } from "../core/pills";
import { h, clear } from "../views/dom";
import { startHub, type PageId } from "../hub/shell";
import { FLOW_PAGE_RENDERERS } from "../hub/pages";
import { agentsSection } from "./agents";
import { phoneSection } from "./phone";
import { mcpSections } from "./mcp";
import { updatesListener } from "./updates";
import { isRtl, onLanguageChange, resolveLanguage, setLanguage, systemLanguages, t } from "../i18n/i18n";

import { S, applyLanguage, save, toggle } from "./store";
import { claudeSection, planSection } from "./page-agents";
import { aiSection } from "./page-chat-pc";
import { activePillsSection } from "./page-pills";
import { localSection } from "./page-chat";
import { integrationsSection, whatsappSections } from "./page-integrations";
import { generalSection } from "./page-general";
import { charactersSection, themesSection } from "./page-themes";
import { shortcutsSection } from "./page-shortcuts";

// ── Language ──────────────────────────────────────────────────────────────────

/** The shortcuts section on screen, told about the events listened to once in main. */

function applyDirection() {
  document.documentElement.dir = isRtl() ? "rtl" : "ltr";
  document.title = "Bifrost";
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const boot = await Bridge.boot();
  if (boot) {
    S.settings = { ...S.settings, ...boot.settings };
    S.version = boot.version;
  }
  setLanguage(resolveLanguage(S.settings.language, systemLanguages()));
  applyDirection();
  S.hub = await startHub(document.getElementById("hub")!, {
    version: S.version,
    flowPages: FLOW_PAGE_RENDERERS,
    // Cada página guarda o próprio estado (o que redesenhar, quem ouve atalhos);
    // montar uma página de antemão (prefetch) não mexe no da página ativa.
    renderNotch: async (page, container, prefetch) => {
      const keys = ["notchPage", "root", "declaredViews", "localRedraw", "shortcutsListener"] as const;
      const snap = () => Object.fromEntries(keys.map((k) => [k, S[k]])) as Pick<typeof S, (typeof keys)[number]>;
      const before = snap();
      S.notchPage = page;
      S.root = container;
      await render();
      const mine = snap();
      if (prefetch) Object.assign(S, before);
      return () => { Object.assign(S, mine); };
    },
  });
  onLanguageChange(() => {
    applyDirection();
    S.hub?.redraw();
  });

  void onEvent<ShortcutsReport>("shortcuts-status", (fresh) => S.shortcutsListener?.report(fresh));
  void onEvent<UpdateStatus>("update-status", (fresh) => updatesListener?.(fresh));
  void onEvent<Settings>("settings-changed", (s) => {
    const before = `${S.settings.chatProvider}|${S.settings.ollamaUrl}|${S.settings.lmstudioUrl}|${S.settings.customUrl}`;
    S.settings = { ...S.settings, ...s };
    S.shortcutsListener?.settingsChanged();
    for (const redraw of S.declaredViews) redraw();
    const after = `${S.settings.chatProvider}|${S.settings.ollamaUrl}|${S.settings.lmstudioUrl}|${S.settings.customUrl}`;
    if (before !== after) S.localRedraw?.();
    applyLanguage();
  });
}

/** The Notch page being shown. */

/** Reads what the sections of the Notch page show and draws them. */
async function render() {
  const status = (await Bridge.hooksStatus()) ?? {
    installed: false, planRelayInstalled: false, settingsPath: "", hookPath: "", hookReady: false,
  };
  const agents = await Bridge.agentHooksList();

  const shortcutReport = await Bridge.shortcutsStatus();

  const keys: string[] = [];
  const present: Record<string, boolean> = {};
  for (const k of keys) present[k] = (await Bridge.secretPresent(k)) ?? false;

  // A main pill this build can run, and no pill declared twice.
  S.settings = { ...S.settings, ...sanitizeDeclared(S.settings) };
  const connected: Record<string, boolean> = { ...((await Bridge.agentHooksStatus()) ?? {}) };
  for (const def of availablePills()) {
    if (def.connect.kind === "key") {
      connected[def.id] = present[def.connect.key] ?? (await Bridge.secretPresent(def.connect.key)) ?? false;
    }
  }

  S.declaredViews = [];
  S.localRedraw = null;
  S.shortcutsListener = null;
  clear(S.root);
  const sections: Partial<Record<PageId, () => HTMLElement[]>> = {
    general: () => [generalSection()],
    themes: () => [themesSection(), charactersSection()],
    pills: () => [activePillsSection(connected)],
    agents: () => [claudeSection(status), agentsSection(agents), planSection(status)],
    chat: () => [aiSection(), ...mcpSections(S.settings, save, "chat"), localSection(false)],
    integrations: () => [integrationsSection(present), ...whatsappSections(), ...mcpSections(S.settings, save, "integrations")],
    phone: () => [phoneSection(S.settings.phoneLink ?? false, toggle, S.settings)],
    shortcuts: () => [shortcutsSection(shortcutReport)],
  };
  S.root.append(...(sections[S.notchPage]?.() ?? []));
  if (S.notchPage === "general") {
    S.root.append(h("div", {
      class: "hint",
      text: t("No telemetry. Network requests only go to the services you configure yourself."),
    }));
  }
}

void main();

