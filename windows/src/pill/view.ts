// A placa e o balão da pílula, montados a partir do modelo. Mesmas classes que
// pill.css espera (.capsule, .content, .pbtn, .bars, .bubble…).

import { FlowBridge, clock, type PillState } from "../core/flow";
import { t } from "../i18n/i18n";
import { HUB_ICONS, keyLabel } from "../hub/ui";
import { ANNOUNCE_ICON, BANDS, isVertical, messageKey, type Look } from "./model";

const SVG = "http://www.w3.org/2000/svg";

export function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", HUB_ICONS[name] ?? "");
  svg.append(p);
  return svg;
}

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export interface ViewHooks {
  /** O balão de dica mudou (botão apontado ou deixado). */
  tip(text: string | null): void;
  currentTip(): string | null;
  /** O lugar do Huginn (o canvas é um só, movido entre as placas). */
  raven(): HTMLElement;
  bars: HTMLElement;
  platform: string;
}

export function makeBars(): HTMLElement {
  const b = node("span", "bars");
  for (let i = 0; i < BANDS; i++) b.append(node("i"));
  return b;
}

const act = (action: string, id?: number) => () => void FlowBridge.pillAction(action, id);

function button(h: ViewHooks, name: string, tip: string, run: () => void, o: { small?: boolean; filled?: boolean } = {}): HTMLButtonElement {
  const b = node("button", ["pbtn", o.small && "small", o.filled && "filled"].filter(Boolean).join(" "));
  b.append(icon(name));
  b.setAttribute("aria-label", tip);
  b.addEventListener("click", (e) => { e.stopPropagation(); run(); });
  b.addEventListener("pointerenter", () => h.tip(tip));
  b.addEventListener("pointerleave", () => { if (h.currentTip() === tip) h.tip(null); });
  return b;
}

export const message = (s: PillState) => { const k = messageKey(s.phase); return k ? t(k) : null; };

/** O miolo da placa para cada aparência. */
export function content(look: Look, s: PillState, h: ViewHooks): HTMLElement {
  const c = node("div", "content");
  const v = isVertical(s);
  const key = keyLabel(s.key, h.platform as "windows" | "linux");
  const raven = () => h.raven();
  switch (look) {
    case "toolbar": {
      c.style.gap = "4px";
      const r = raven();
      r.style.margin = v ? "0 0 5px" : "0 5px 0 0";
      c.append(r,
        button(h, "mic", t("Dictate · {0}", { 0: key }), act("dictate")),
        button(h, "record", t("Record a call"), act("note")),
        button(h, "window", t("Open Bifrost"), act("hub")));
      break;
    }
    case "handsFree":
      c.append(button(h, "x", t("Cancel"), act("cancel"), { small: true }), h.bars,
        button(h, "check", t("Paste · or press {0}", { 0: key }), act("finish"), { small: true, filled: true }));
      break;
    case "message":
      if (v) {
        const i = node("span");
        const svg = icon(s.phase === "failed" ? "mic" : "copy");
        svg.setAttribute("style", "width:13px;height:13px;fill:none;stroke:#e8e9ec;stroke-width:2");
        i.append(svg);
        c.append(raven(), i);
      } else c.append(raven(), node("span", "message", message(s) ?? ""));
      break;
    case "note": {
      c.style.gap = v ? "6px" : "8px";
      const stop = node("button", "stop");
      stop.title = t("Stop");
      stop.append(node("i"));
      stop.addEventListener("click", (e) => { e.stopPropagation(); act("stopNote")(); });
      const time = node("span", "clock", clock((Date.now() - (s.noteStartedAt ?? Date.now())) / 1000));
      time.dataset.clock = "1";
      c.append(raven(), node("span", "rec"), time, stop);
      break;
    }
    default:
      c.append(raven(), h.bars);
  }
  return c;
}

/** O balão ao lado: anúncio, a conversa da voz, ou a dica. */
export function bubble(s: PillState, tip: string | null): HTMLElement | null {
  const a = s.announcement;
  if (a) {
    const b = node("div", "bubble announce");
    const ic = node("span", "icon");
    ic.append(icon(ANNOUNCE_ICON[a.icon] ?? "check"));
    ic.style.color = a.tint;
    b.append(ic, node("span", "text", a.text));
    if (a.action) {
      const go = node("button", "act", a.action);
      go.addEventListener("click", act("announcement", a.id));
      b.append(go);
    }
    const x = node("button", "close");
    x.title = t("Close");
    x.append(icon("x"));
    x.addEventListener("click", act("dismiss", a.id));
    b.append(x);
    return b;
  }
  const vo = s.voice;
  if (vo && (vo.heard || vo.answer || vo.phase === "listening")) {
    const b = node("div", "bubble voice");
    if (vo.heard) b.append(node("span", "heard", vo.heard));
    if (vo.answer) b.append(node("span", "answer", vo.answer));
    else if (!vo.heard) b.append(node("span", "heard", t("Listening…")));
    return b;
  }
  const text = tip ?? (isVertical(s) ? message(s) : null);
  return text ? node("div", "bubble", text) : null;
}
