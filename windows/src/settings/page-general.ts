// Ajustes da ilha — parte de settings/main.ts, separada por página.

import { formBtn, textField, choice } from "../views/kit";
import { Bridge } from "../core/bridge";
import { SOUND_NAMES } from "../core/sound";
import { h } from "../views/dom";
import { updateRows } from "./updates";
import { LANGUAGES, t } from "../i18n/i18n";

import { save, toggle, S } from "./store";
import { applyLanguage } from "./store";
import { recapRows } from "./page-shortcuts";

// ── General section ───────────────────────────────────────────────────────────

export function generalSection(): HTMLElement {
  const volume = textField({
    type: "range", min: "0", max: "0.2", step: "0.005",
    value: String(S.settings.soundVolume),
  }) as HTMLInputElement;
  volume.addEventListener("input", () => {
    S.settings.soundVolume = Number(volume.value);
    void save();
  });

  // Your own sounds: the folder, a reload, and how many are replaced.
  const customCount = h("span", { class: "hint" });
  const countCustom = () =>
    void Bridge.customSounds(SOUND_NAMES).then((own) => {
      const n = own?.length ?? 0;
      customCount.textContent = n > 0 ? t("{0} custom", { 0: n }) : "";
    });
  countCustom();
  const soundsFolder = formBtn(t("Open sounds folder"), "plain", () => void Bridge.revealSoundsFolder());
  const reloadSounds = formBtn(t("Reload sounds"), "plain", () => void Bridge.reloadSounds().then(() => window.setTimeout(countCustom, 300)));

  const autoClose = textField({
    type: "number", min: "5", max: "120", step: "1",
    value: String(Math.round(S.settings.autoCloseInterval)),
    style: "width:72px",
  }) as HTMLInputElement;
  autoClose.addEventListener("change", () => {
    S.settings.autoCloseInterval = Math.max(5, Math.min(120, Number(autoClose.value) || 15));
    autoClose.value = String(S.settings.autoCloseInterval);
    void save();
  });

  const screen = choice() as HTMLSelectElement;
  screen.append(
    h("option", { value: "primary", text: t("Main display") }),
    h("option", { value: "cursor", text: t("Display under the cursor") }),
  );
  screen.value = S.settings.screen;
  void Bridge.listMonitors().then((list) => {
    for (const m of list ?? []) screen.append(h("option", { value: m.key, text: m.label }));
    // Set again now the option exists. A display saved under an older key (moved,
    // resized, or saved before names were kept) is shown by its place or its
    // name; one that is gone shows as the main one.
    const saved = S.settings.screen;
    const [place, name] = saved.split("|");
    const keys = (list ?? []).map((m) => m.key);
    screen.value =
      keys.find((k) => k === saved) ??
      (saved.startsWith("at:") ? keys.find((k) => k.split("|")[0] === place) : undefined) ??
      (name ? keys.find((k) => k.split("|")[1] === name) : undefined) ??
      saved;
    if (!screen.value) screen.value = "primary";
  });
  screen.addEventListener("change", () => {
    S.settings.screen = screen.value;
    void save();
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { text: t("General") })),
    h("div", { class: "row" },
      h("label", { text: t("Sound") }),
      toggle(S.settings.soundEnabled, (v) => { S.settings.soundEnabled = v; void save(); }),
      volume,
    ),
    h("div", { class: "row" }, soundsFolder, reloadSounds, customCount),
    h("div", { class: "hint", text: t("Drop a file named like one of Huginn's sounds (finish.wav, approval.mp3, greet.m4a…) in the sounds folder to replace it, then Reload.") }),
    h("div", { class: "row" },
      h("label", { text: t("Open on hover") }),
      toggle(S.settings.openOnHover, (v) => { S.settings.openOnHover = v; void save(); }),
    ),
    h("div", { class: "hint", text: t("Hovering the island opens it; it folds again shortly after the pointer leaves. Click inside to keep it open.") }),
    h("div", { class: "row" },
      h("label", { text: t("Show clock in the island") }),
      toggle(S.settings.showClock, (v) => { S.settings.showClock = v; void save(); }),
    ),
    h("div", { class: "hint", text: t("The date and the time in the middle of the island when it is compact.") }),
    h("div", { class: "row" },
      h("label", { text: "Huginn passeia pela tela" }),
      toggle(S.settings.desktopWander !== false, (v) => { S.settings.desktopWander = v; void save(); }),
    ),
    h("div", { class: "hint", text: "Na área de trabalho, de vez em quando ele anda um pouco aos pulinhos pela borda e para. Desligado, ele fica onde você o deixou." }),
    h("div", { class: "row" },
      h("label", { text: t("Auto-close") }),
      autoClose,
      h("span", { class: "hint", text: t("seconds after you leave the island") }),
    ),
    h("div", { class: "row" },
      h("label", { text: t("Island lives on") }),
      screen,
    ),
    h("div", { class: "row" },
      h("label", { text: t("Launch at startup") }),
      toggle(S.settings.autostart, (v) => { S.settings.autostart = v; void save(); }),
    ),
    ...recapRows(),
    ...updateRows(toggle, S.version),
    languageRow(),
  );
}

/**
 * Settings → General → Language, as on the Mac: "System" follows the
 * system's language when Bifrost has it (else English), or one of the ten.
 * Both windows and the tray switch in place, without a restart.
 */
export function languageRow(): HTMLElement {
  const select = choice() as HTMLSelectElement;
  select.append(h("option", { value: "", text: t("System") }));
  for (const { code, name } of LANGUAGES) select.append(h("option", { value: code, text: name, lang: code }));
  select.value = LANGUAGES.some((l) => l.code === S.settings.language) ? S.settings.language : "";
  select.addEventListener("change", () => {
    S.settings.language = select.value;
    void save();
    applyLanguage();
  });
  return h("div", { class: "row" }, h("label", { text: t("Language") }), select);
}

