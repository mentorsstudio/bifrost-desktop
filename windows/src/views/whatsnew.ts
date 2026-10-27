// Bifrost — "Novidades" depois de uma atualização, escrita do zero.
// Passo 1, a pedra rúnica: cada novidade é uma inscrição (runa, título, linha).
// Passo 2, "Sua saga até aqui": os números que este computador guardou,
// entalhados como marcas. Quem decide quando aparece é whats-new/controller.ts.
// Sem link de doação: o botão leva às notas da versão no repositório do Bifrost.

import { h, clear, svg } from "./dom";
import { Updates } from "../island/update";
import { formatCount, formatDuration } from "../recap/summary";
import { STAT_ICONS, WHATS_NEW_ICONS } from "../whats-new/icons";
import { WhatsNew } from "../whats-new/controller";
import { iconName, localized, releasePage, type Stat } from "../whats-new/whats-new";
import type { ViewHost } from "./views";
import { language, t } from "../i18n/i18n";

const RUNES = ["ᚠ", "ᚱ", "ᚲ", "ᚷ", "ᚹ", "ᚺ"];

function button(label: string, primary: boolean, run: () => void): HTMLButtonElement {
  return h("button", { class: `btn ${primary ? "primary" : "secondary"} bf-stone-btn`, onclick: run }, h("span", { text: label }));
}

const many = (n: number, one: string, other: string) => (n === 1 ? one : other);

function label(s: Stat): string {
  switch (s.kind) {
    case "agentSessions": return many(s.value, t("agent session"), t("agent sessions"));
    case "agentTime": return t("with your agents");
    case "linesAdded": return t("lines written");
    case "approvals": return many(s.value, t("approval from the island"), t("approvals from the island"));
    case "words": return t("words dictated");
    case "saved": return t("saved by dictating");
    case "calls": return many(s.value, t("call transcribed"), t("calls transcribed"));
  }
}

const value = (s: Stat) => (s.kind === "agentTime" || s.kind === "saved" ? formatDuration(s.value) : formatCount(s.value));

export function buildWhatsNew(): ViewHost {
  const stone = h("div", { class: "stack whatsnew-stack bf-stone" });
  const el = h("div", { class: "view" }, h("div", { class: "card bf-stone-card" }, stone));
  let shown = "";

  function inscriptions() {
    const release = WhatsNew.release;
    if (!release) return;
    const lang = language();
    const list = h("div", { class: "whatsnew-items bf-stone-lines" });
    release.items.slice(0, 4).forEach((item, i) => {
      const title = localized(item.title, lang);
      const detail = localized(item.detail, lang);
      list.append(h("div", { class: "whatsnew-item bf-stone-line", style: `--i:${i}` },
        h("span", { class: "bf-stone-rune", text: RUNES[i % RUNES.length] }),
        h("span", { class: "whatsnew-icon" }, svg(WHATS_NEW_ICONS[iconName(item.icon)], 14, { stroke: 1.8 })),
        h("div", { class: "whatsnew-text" },
          h("div", { class: "whatsnew-item-title", text: title, title }),
          h("div", { class: "whatsnew-item-detail", text: detail, title: detail }))));
    });
    const notes = releasePage(Updates.status.platform, release.version);
    stone.append(
      h("div", { class: "title one-line bf-stone-title", text: t("You're on Bifrost {version}", { version: release.version }) }),
      list,
      h("div", { class: "actions" }, button(t("Next"), true, () => WhatsNew.next()), button(t("All changes"), false, () => WhatsNew.openReleasePage(notes))),
    );
  }

  function saga() {
    const marks = h("div", { class: "whatsnew-stats bf-stone-marks" });
    for (const s of WhatsNew.stats) {
      marks.append(h("div", { class: "whatsnew-stat bf-stone-mark" },
        h("span", { class: "whatsnew-stat-icon" }, svg(STAT_ICONS[s.kind], 12, { stroke: 2 })),
        h("div", {}, h("div", { class: "v", text: value(s) }), h("div", { class: "l", text: label(s) }))));
    }
    stone.append(h("div", { class: "title one-line bf-stone-title", text: "Sua saga até aqui" }));
    if (WhatsNew.stats.length > 0) stone.append(marks);
    stone.append(h("div", { class: "actions" }, button(t("OK"), true, () => WhatsNew.done())));
  }

  return {
    el,
    sync() {
      const k = `${WhatsNew.generation}~${WhatsNew.step}~${language()}`;
      if (k === shown) return;
      shown = k;
      clear(stone);
      if (WhatsNew.step === 1) inscriptions(); else saga();
    },
  };
}
