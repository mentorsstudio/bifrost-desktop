// Ajustes da ilha — parte de settings/main.ts, separada por página.

import { formBtn, textField, switchEl } from "../views/kit";
import { Bridge } from "../core/bridge";
import { MAX_DECLARED, availablePills } from "../core/pills";
import { h } from "../views/dom";
import { whatsappSection } from "./whatsapp";
import { WHATSAPP_ID } from "../core/whatsapp";
import { colorDot } from "./colors";
import { statusDot } from "./parts";
import { t } from "../i18n/i18n";

import { save, pickColor, toggle, S } from "./store";
import { CHAT_STRINGS } from "./page-chat";

// ── Integrations section ──────────────────────────────────────────────────────

export interface IntegrationDef {
  id: string;
  name: string;
  color: string;
  /** Credential Manager keys, in the order they are shown. */
  fields: { key: string; label: string; placeholder: string; secret: boolean }[];
  /** What the key needs, shown under its field. */
  hint?: string;
}

// Bifrost: GitHub, GitLab, Notion, Stripe, Vercel, Resend, n8n e Cal.com saíram
// daqui — agora são servidores MCP oficiais (Configurações → Servidores MCP),
// com login OAuth e sem chave. Sobra o que não precisa de nada.
export const INTEGRATIONS: IntegrationDef[] = [
  // Nothing to enter: Spotify is read from the OS (src-tauri/src/spotify.rs).
  { id: "integration_spotify", name: "Spotify", color: "#1DB954", fields: [] },
];

export const MAX_ACTIVE = MAX_DECLARED;

/** Everything that shows the declared pills, redrawn when any of them changes. */

export function declaredChanged() {
  for (const redraw of S.declaredViews) redraw();
  void save();
}

export function integrationsSection(present: Record<string, boolean>): HTMLElement {
  const note = h("div", { class: "hint" });
  const list = h("div", { style: "display:flex;flex-direction:column;gap:14px" });

  function updateNote() {
    const used = S.settings.activeIntegrations.length;
    note.textContent = `Ligue quantas pílulas quiser ao lado do Huginn — ${used} em uso, sem limite. Serviços (GitHub, Notion, Stripe…) agora vivem em Servidores MCP.`;
  }
  S.declaredViews.push(updateNote);

  const offered = new Set(availablePills().map((p) => p.id));
  for (const def of INTEGRATIONS.filter((d) => offered.has(d.id))) {
    const active = S.settings.activeIntegrations.includes(def.id);
    const sw = switchEl(active, { label: def.name });
    sw.addEventListener("click", () => {
      const on = S.settings.activeIntegrations.includes(def.id);
      if (on) {
        S.settings.activeIntegrations = S.settings.activeIntegrations.filter((x) => x !== def.id);
      } else {
        if (S.settings.activeIntegrations.length >= MAX_ACTIVE) return;
        S.settings.activeIntegrations = [...S.settings.activeIntegrations, def.id];
      }
      sw.classList.toggle("on", !on);
      declaredChanged();
    });

    const rows = h("div", { style: "display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-width:0" });
    for (const field of def.fields) {
      const input = textField({
        type: field.secret ? "password" : "text",
        placeholder: present[field.key] ? CHAT_STRINGS.stored : field.placeholder,
        autocomplete: "off",
        spellcheck: "false",
        style: "flex:1 1 auto;min-width:0",
      }) as HTMLInputElement;
      const saveBtn = formBtn(t("Save"));
      const dotEl = statusDot(present[field.key] ?? false);
      saveBtn.addEventListener("click", async () => {
        const value = input.value.trim();
        try {
          await Bridge.secretSet(field.key, value);
          present[field.key] = value.length > 0;
          input.value = "";
          input.placeholder = value ? CHAT_STRINGS.stored : field.placeholder;
          dotEl.style.background = value ? "#22c55e" : "#f4505e";
        } catch {
          dotEl.style.background = "#C9DCCF";
        }
      });
      rows.append(
        h("div", { class: "row" },
          h("label", { style: "min-width:104px", text: t(field.label) }),
          input, saveBtn, dotEl,
        ),
      );
    }

    if (def.hint) rows.append(h("div", { class: "hint", text: t(def.hint) }));
    if (def.id === "integration_spotify") {
      // As on the Mac's row: said only when there is no Spotify to launch.
      const hint = h("div", { class: "hint", style: "padding-top:5px" });
      rows.append(hint);
      void Bridge.spotifyInstalled().then((ok) => {
        hint.textContent = ok === false ? t("Not installed") : "";
      });
    }

    list.append(
      h("div", { style: "display:flex;gap:12px;align-items:flex-start" },
        h("div", { style: "display:flex;align-items:center;gap:8px;min-width:132px;padding-top:4px" },
          sw,
          colorDot(def, "", () => S.settings.pillColors, pickColor),
          h("span", { style: "font-size:12.5px", text: def.name }),
        ),
        rows,
      ),
    );
  }

  updateNote();
  return h("section", {}, h("h2", {}, h("span", { text: t("Integrations") })), note, list);
}

/** WhatsApp (experimental), under the other integrations: its pill is turned on from its own switch. */
export function whatsappSections(): HTMLElement[] {
  if (!availablePills().some((p) => p.id === WHATSAPP_ID)) return [];
  return [whatsappSection({
    toggle,
    maxPills: MAX_ACTIVE,
    pillActive: () => S.settings.activeIntegrations.includes(WHATSAPP_ID),
    setPill: (on) => {
      const has = S.settings.activeIntegrations.includes(WHATSAPP_ID);
      if (on && !has && S.settings.activeIntegrations.length < MAX_ACTIVE) {
        S.settings.activeIntegrations = [...S.settings.activeIntegrations, WHATSAPP_ID];
      } else if (!on && has) {
        S.settings.activeIntegrations = S.settings.activeIntegrations.filter((x) => x !== WHATSAPP_ID);
      } else {
        return;
      }
      declaredChanged();
    },
  })];
}

