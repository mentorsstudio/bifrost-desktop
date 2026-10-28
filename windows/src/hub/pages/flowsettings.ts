// Flow → Settings: the key, where the pill is, the microphone, the voice
// model, the Notetaker's summaries, the window and the history. Port of
// FlowHubSettings.swift.

import { h, clear } from "../../views/dom";
import { t } from "../../i18n/i18n";
import { onEvent } from "../../core/bridge";
import { FlowBridge, type Edge, type FlowKey, type ModelsStatus } from "../../core/flow";
import type { HubContext } from "../shell";
import { button, card, divider, keyKeycap, keycap, keyLabel, label, number, row, segmented, select, toggle } from "../ui";
import { DEFAULT_HOLD_KEY, holdKeyCodes, holdKeyId, holdKeyProblem, recordHoldKey } from "../../core/hold-key";
import { Convert } from "../../filee/api";
import { parseGesture } from "../../core/gesture-trigger";

/** Ring gesture modifiers held alone would also start dictation: say so. */
async function ringClash(key: FlowKey): Promise<string | null> {
  const codes = holdKeyCodes(key);
  const p = await Convert.prefs().catch(() => null);
  const g = p?.gesture ? parseGesture(p.trigger) : null;
  if (!g) return null;
  const mod = (vk: number) => ([0x11, 0xa2, 0xa3].includes(vk) ? "ctrl" : [0x12, 0xa4, 0xa5].includes(vk) ? "alt" : [0x10, 0xa0, 0xa1].includes(vk) ? "shift" : [0x5b, 0x5c].includes(vk) ? "win" : "");
  const mods = [...new Set(codes.map(mod))];
  return mods.every(Boolean) && mods.length === g.mods.length && mods.every((m) => g.mods.includes(m))
    ? t("The file ring uses the same keys with the mouse: dictation starts only when you hold them without clicking.")
    : null;
}

/** "Press the combination" recorder for the hold-to-talk key, with reset. */
function holdKeyRecorder(ctx: HubContext, key: FlowKey, platform: "windows" | "linux"): HTMLElement {
  const wrap = h("span", { class: "bf-rec" });
  const cap = h("button", { class: "bf-rec-cap", type: "button", title: t("Click, then hold the new keys together and let go. Esc cancels.") }) as HTMLButtonElement;
  const reset = h("button", { class: "bf-rec-reset", type: "button", text: t("Default"), title: keyLabel(DEFAULT_HOLD_KEY, platform) }) as HTMLButtonElement;
  cap.textContent = keyLabel(key, platform);
  reset.hidden = key === DEFAULT_HOLD_KEY;
  const note = h("div", { class: "bf-rec-note" });
  void ringClash(key).then((w) => { if (w) note.textContent = w; });
  const pick = (k: FlowKey) => void ctx.setPrefs((p) => { p.key = k; }).then(() => ctx.navigate("flowsettings"));
  let stop: (() => void) | null = null;
  cap.addEventListener("click", () => {
    if (stop) return;
    cap.textContent = t("Press keys…");
    cap.classList.add("on");
    cap.focus();
    stop = recordHoldKey(document.body, (codes) => {
      stop = null;
      cap.classList.remove("on");
      if (!codes) { cap.textContent = keyLabel(key, platform); return; }
      const bad = holdKeyProblem(codes);
      if (bad) { cap.textContent = keyLabel(key, platform); note.textContent = t("Hold Ctrl, Alt or the Windows key with it."); return; }
      pick(holdKeyId(codes));
    });
  });
  reset.addEventListener("click", () => pick(DEFAULT_HOLD_KEY));
  wrap.append(cap, reset);
  return h("span", { class: "bf-rec-col" }, wrap, note);
}

/** Download / progress / installed, for the voice model. Redraws itself. */
export function modelsControl(ctx: HubContext, onReady?: () => void): HTMLElement {
  const el = h("div", { style: "display:flex;align-items:center;gap:8px" });
  let confirming = false;
  const draw = (models: ModelsStatus) => {
    clear(el);
    const m = models.parakeet;
    if (m.state === "missing") {
      el.append(button(t("Download"), () => void FlowBridge.download(), "primary"));
    } else if (m.state === "downloading") {
      const bar = h("div", { class: "hub-progress" }, h("i", { style: `width:${Math.round(m.fraction * 100)}%` }));
      el.append(bar, h("span", { class: "hub-note", text: `${Math.round(m.fraction * 100)} %` }));
    } else if (m.state === "failed") {
      el.append(h("span", { class: "hub-note", text: m.error, title: m.error, style: "max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }));
      el.append(button(t("Retry"), () => void FlowBridge.download()));
    } else if (confirming) {
      el.append(
        button(t("Remove the models"), () => {
          confirming = false;
          void FlowBridge.removeModels();
        }, "danger", true),
        button(t("Cancel"), () => {
          confirming = false;
          draw(ctx.status.models);
        }, "", true),
      );
    } else {
      const ok = h("button", { class: "hub-link", style: "color:var(--hub-green)", text: `✓ ${t("Installed")}`, title: t("Remove the models") });
      ok.addEventListener("click", () => {
        confirming = true;
        draw(ctx.status.models);
      });
      el.append(ok);
    }
  };
  draw(ctx.status.models);
  void onEvent<ModelsStatus>("speech-models", (models) => {
    if (!el.isConnected) return;
    const wasReady = ctx.status.models.parakeet.state === "ready";
    ctx.status.models = models;
    draw(models);
    if (!wasReady && models.parakeet.state === "ready") onReady?.();
  });
  return el;
}

export async function flowSettingsPage(page: HTMLElement, ctx: HubContext) {
  const status = await ctx.refresh();
  const prefs = status.prefs;
  page.append(ctx.hero("flowsettings", t("Settings"), t("Dictation keys, microphone, transcription and privacy.")));

  // ── Keys ──
  const edges: [Edge, string][] = [["bottom", t("Bottom")], ["left", t("Left")], ["right", t("Right")]];
  page.append(label(t("Keys")));
  const keysCard = card(
    row(t("Hold a key to dictate anywhere"), null, toggle(prefs.enabled, (on) => void ctx.setPrefs((p) => (p.enabled = on)))),
    divider(),
    status.keys === "wayland"
      ? row(t("Hold to dictate"), null, keyKeycap("wayland", status.platform))
      : row(t("Hold to dictate"), prefs.key === "right_alt" ? t("On a keyboard with AltGr, the right Alt types characters: pick another key.") : null,
        holdKeyRecorder(ctx, prefs.key, status.platform)),
    divider(),
    row(t("Where the pill is"), null, segmented(edges, prefs.edge, (edge) => void ctx.setPrefs((p) => (p.edge = edge)))),
    divider(),
    row(t("Hands-free"), t("Tap twice, speak as long as you like, tap once to paste."), keyKeycap(status.keys === "wayland" ? "wayland" : prefs.key, status.platform, true)),
    divider(),
    row(t("Paste the last dictation again"), t("When the words went to the wrong place."), button(t("Paste again"), () => void FlowBridge.pasteAgain(), "", true)),
    divider(),
    row(t("Cancel a dictation"), null, keycap(t("Esc"))),
  );
  if (status.keys === "wayland") {
    keysCard.append(h("div", {
      class: "hub-warn",
      text: t("On Wayland, the desktop holds the dictation key for Bifrost: Ctrl+Alt+V, or the keys you picked when it asked. The first paste asks once to let Bifrost type for you."),
    }));
  } else if (status.keys !== "ok") {
    keysCard.append(h("div", { class: "hub-warn", text: t("Bifrost can't watch the keyboard here: use the pill's microphone to dictate.") }));
  }
  page.append(keysCard);

  // ── Microphone ──
  page.append(label(t("Microphone")));
  const mics: [string, string][] = [["", t("System default")], ...status.mics.map((m): [string, string] => [m.name, m.name])];
  if (prefs.mic && !mics.some(([id]) => id === prefs.mic)) mics.push([prefs.mic, prefs.mic]);
  page.append(card(row(t("Microphone"), t("The one Bifrost listens to for dictation and calls."), select(mics, prefs.mic, (mic) => void ctx.setPrefs((p) => (p.mic = mic))))));

  // ── Recognition ──
  page.append(label(t("Recognition")));
  page.append(card(
    row(t("Parakeet, on your computer"), t("The most accurate, offline, 25 languages. Downloaded once (about {0} MB).", { 0: number(status.models.downloadMb) }), modelsControl(ctx)),
    h("div", { class: "hub-note", text: t("Your voice never leaves this computer: Parakeet turns it into text here, and the recording is dropped as soon as it is pasted.") }),
  ));

  // ── Notetaker ──
  page.append(label(t("Notetaker")));
  page.append(card(
    row(t("Summaries"), null, select([["claude", t("Claude (your key)")], ["off", t("No summary")]], prefs.summaryEngine, (engine) => void ctx.setPrefs((p) => (p.summaryEngine = engine)))),
    h("div", { class: "hub-note", text: t("With Claude, the transcript (never the audio) goes to Anthropic with your key from Notch → Chat.") }),
    divider(),
    h("div", { class: "hub-note", text: t("Everything stays on this computer. Tell the people in the call that you are recording.") }),
  ));

  // ── App ──
  page.append(label(t("App")));
  page.append(card(
    row(t("Open this window when you open Bifrost"), t("Not when Bifrost starts with the computer."), toggle(prefs.openAtLaunch, (on) => void ctx.setPrefs((p) => (p.openAtLaunch = on)))),
  ));

  // ── Privacy ──
  page.append(label(t("Privacy")));
  const keep: [string, string][] = [["0", t("Don't keep")], ["7", t("7 days")], ["30", t("30 days")], ["365", t("1 year")], ["-1", t("Forever")]];
  const confirmRow = h("div", { class: "hub-row" });
  const erase = () => {
    clear(confirmRow);
    confirmRow.append(
      button(t("Erase the history"), () => void FlowBridge.clear(false), "", true),
      button(t("Erase everything"), () => {
        clear(confirmRow);
        confirmRow.append(
          h("span", { class: "hub-note", style: "flex:1", text: t("Erase the history and the statistics?") }),
          button(t("Erase everything"), () => {
            void FlowBridge.clear(true);
            erase();
          }, "danger", true),
          button(t("Cancel"), erase, "", true),
        );
      }, "", true),
    );
  };
  erase();
  page.append(card(
    row(t("Keep the history"), null, select(keep, String(prefs.keepDays), (v) => void ctx.setPrefs((p) => (p.keepDays = Number(v))))),
    divider(),
    confirmRow,
    h("div", { class: "hub-note", text: t("The history, the statistics and your notes stay on this computer, in Bifrost's folder. Dictations are never saved as audio; a call's audio is deleted as soon as its transcript is written.") }),
  ));
}
