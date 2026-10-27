// Vista vazia: nada rodando, convite para o chat.


import { h } from "./dom";
import { tl } from "../i18n/i18n";
import { card, btn } from "./kit";

import type { ViewActions, ViewHost } from "./views";

// ── Empty ─────────────────────────────────────────────────────────────────────

export function buildEmpty(actions: ViewActions): ViewHost {
  const body = h(
    "div",
    { class: "stack", style: "padding:0 18px 0 118px;flex-direction:row;align-items:center;gap:16px" },
    h(
      "div",
      { style: "display:flex;flex-direction:column;gap:5px" },
      h("div", { class: "title", text: tl("Nothing running right now.") }),
      h("div", { class: "sub", text: tl("Drop a file or window, or ask me anything.") }),
    ),
    h("div", { class: "grow" }),
    btn(tl("Ask Claude"), "primary", () => actions.setView("prompt")),
  );
  return { el: h("div", { class: "view" }, card(null, body)), sync() {} };
}

