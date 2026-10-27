// O estado compartilhado da janela de ajustes: as configurações em edição e o
// que pertence à página ativa (o que redesenhar, quem ouve os atalhos).
// As páginas (page-*.ts) leem e escrevem aqui; main.ts troca o da página ativa.

import { Bridge, type ShortcutsReport } from "../core/bridge";
import { DEFAULT_SETTINGS, type Settings } from "../core/state";
import type { PageId } from "../hub/shell";
import { toggle as kitToggle } from "../views/kit";
import { resolveLanguage, setLanguage, systemLanguages } from "../i18n/i18n";

export const S = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  version: "",
  /** Onde a página da ilha sendo montada desenha suas seções. */
  root: document.getElementById("hub") as HTMLElement,
  hub: null as { redraw(): void; current(): PageId } | null,
  /** Redesenha a seção de modelos locais após uma mudança feita na ilha. */
  localRedraw: null as (() => void) | null,
  /** Tudo que mostra as pílulas declaradas, redesenhado quando uma muda. */
  declaredViews: [] as (() => void)[],
  /** A seção de atalhos na tela, avisada dos eventos ouvidos uma vez em main. */
  shortcutsListener: null as { report(fresh: ShortcutsReport): void; settingsChanged(): void } | null,
  notchPage: "general" as PageId,
};

export async function save() {
  await Bridge.saveSettings(S.settings);
}

/** Uma cor escolhida para o Huginn de uma pílula (./colors.ts): a ilha acompanha. */
export function pickColor(next: Record<string, string>) {
  S.settings.pillColors = next;
  void save();
}

/** Interruptor dos formulários (kit.ts), com o valor novo a cada clique. */
export function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  let value = on;
  const sw = kitToggle("", () => { value = !value; sw.set(value); onChange(value); });
  sw.set(on);
  sw.el.removeAttribute("aria-label");
  sw.el.setAttribute("aria-pressed", String(on));
  return sw.el;
}

/**
 * Shows the language Settings asks for. A change redraws the window in place,
 * where it was scrolled to: nothing reloads, nothing is written.
 */
export function applyLanguage() {
  setLanguage(resolveLanguage(S.settings.language, systemLanguages()));
}

