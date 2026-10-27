// Janela da pílula (Ditado): reescrita do zero sobre model.ts (lógica pura),
// view.ts (DOM) e speech.ts (voz). Mesmo contrato com o Rust: ouve
// `pill-state`, `pill-bands`, `pill-visible`, `pill-pointer`, `voice-say`,
// `settings-changed`; chama pill_hot / pill_hover / pill_action / voice_done.
// Só desenha enquanto algo se mexe.

import "../theme/runic.css";
import "./pill.css";
import "../theme/bifrost.css";
import "../bifrost/nordic.css";
import "../bifrost/skin.css";
import "../theme/motion.css";
import "../theme/themes.css";
import "../theme/themes";
import "../theme/aurora";
import "../bifrost/contextmenu";
import { Bridge, onEvent } from "../core/bridge";
import { FlowBridge, clock, type PillState } from "../core/flow";
import type { Settings } from "../core/state";
import { BotEngine, hexToRGB } from "../bifrost/raven";
import { resolveLanguage, setLanguage, systemLanguages } from "../i18n/i18n";
import {
  BANDS, IDLE_STATE, bandGoal, bandPx, capsuleSize, contentKey, distance, easeBands, frameMode, hotRects, isShown,
  isVertical, lookOf, type Look,
} from "./model";
import { bubble, content, makeBars, message, node } from "./view";
import { speak, type Say } from "./speech";

class Pill {
  s: PillState = IDLE_STATE;
  platform = navigator.userAgent.includes("Windows") ? "windows" : "linux";
  hovered = false;
  tip: string | null = null;
  visible = false;
  speaking = false;
  readonly mic = new Array<number>(BANDS).fill(0);
  readonly levels = new Array<number>(BANDS).fill(0);
  private readonly root = document.getElementById("pill")!;
  private readonly bars = makeBars();
  private readonly raven = new BotEngine();
  private readonly ravenCanvas = node("canvas");
  private capsule: HTMLElement | null = null;
  private builtFor = "";
  private unhover: number | null = null;
  private raf: number | null = null;
  private last = performance.now();
  private textCtx = document.createElement("canvas").getContext("2d");

  constructor() {
    this.raven.isMini = true;
    this.raven.bodyColor = hexToRGB("#F5F6F8");
    this.raven.setState("idle", true);
    document.addEventListener("pointermove", (e) => {
      const t = e.target as HTMLElement | null;
      const over = Boolean(this.capsule?.contains(t) || t?.closest?.(".bubble"));
      const near = this.capsule ? distance(this.capsule.getBoundingClientRect(), e.clientX, e.clientY) < 14 : false;
      this.hover(over || near);
    });
    document.addEventListener("pointerleave", () => this.hover(false));
  }

  get look(): Look { return lookOf(this.s, this.hovered); }

  private textWidth(): number {
    const m = message(this.s);
    if (!m || !this.textCtx) return 0;
    this.textCtx.font = "500 12px system-ui, 'Segoe UI', sans-serif";
    return Math.ceil(this.textCtx.measureText(m).width);
  }

  render(): void {
    const look = this.look;
    const open = look !== "resting";
    const { w, h } = capsuleSize(look, this.s, Date.now(), this.textWidth());
    this.root.className = `${this.s.edge}${isVertical(this.s) ? " vertical" : ""}`;
    const key = contentKey(look, this.s, this.platform);
    if (!this.capsule || key !== this.builtFor) {
      this.builtFor = key;
      const next = node("div", "capsule");
      next.append(content(look, this.s, {
        tip: (x) => { this.tip = x; this.render(); },
        currentTip: () => this.tip,
        raven: () => { const slot = node("span", "mochi"); slot.append(this.ravenCanvas); return slot; },
        bars: this.bars,
        platform: this.platform,
      }));
      // A nova placa nasce do tamanho da anterior e cresce dali (mola do CSS).
      if (this.capsule) { next.style.width = this.capsule.style.width; next.style.height = this.capsule.style.height; }
      this.capsule = next;
    }
    const cap = this.capsule;
    cap.classList.toggle("open", open);
    cap.classList.toggle("handsfree", look === "handsFree");
    requestAnimationFrame(() => { cap.style.width = `${w}px`; cap.style.height = `${h}px`; });
    const b = bubble(this.s, this.tip);
    this.root.replaceChildren(...(b ? [b] : []), cap); // o balão vem antes: o flex o põe ao lado
    this.raven.setState(this.s.phase === "thinking" || this.s.voice?.phase === "thinking" ? "thinking" : "idle");
    this.wake();
    setTimeout(() => this.reportHot(), 60);
    setTimeout(() => this.reportHot(), 420);
  }

  private reportHot(): void {
    const b = this.root.querySelector<HTMLElement>(".bubble");
    void FlowBridge.pillHot(hotRects(this.s, this.look !== "resting", innerWidth, innerHeight, b?.getBoundingClientRect() ?? null));
  }

  hover(inside: boolean): void {
    if (inside) {
      if (this.unhover !== null) { clearTimeout(this.unhover); this.unhover = null; }
      if (!this.hovered) { this.hovered = true; void FlowBridge.pillHover(true); this.render(); }
    } else if (this.hovered && this.unhover === null) {
      // Uma pequena tolerância para ir da placa ao balão.
      this.unhover = window.setTimeout(() => {
        this.unhover = null; this.hovered = false; this.tip = null;
        void FlowBridge.pillHover(false); this.render();
      }, 250);
    }
  }

  wake(): void {
    if (this.raf === null && this.visible) { this.last = performance.now(); this.raf = requestAnimationFrame((n) => this.frame(n)); }
  }

  private frame(now: number): void {
    this.raf = null;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const look = this.look;
    const goals = Array.from({ length: BANDS }, (_, i) => bandGoal(this.s, now, i, this.mic, this.speaking));
    easeBands(this.levels, goals, dt);
    const v = isVertical(this.s);
    this.levels.forEach((l, i) => { (this.bars.children[i] as HTMLElement).style[v ? "width" : "height"] = `${bandPx(l)}px`; });
    if (look !== "note" || this.hovered) this.drawRaven(now, dt);
    const c = this.root.querySelector<HTMLElement>("[data-clock]");
    if (c && this.s.noteStartedAt) c.textContent = clock((Date.now() - this.s.noteStartedAt) / 1000);
    const mode = frameMode(this.visible, look, this.hovered);
    if (mode === "raf") this.raf = requestAnimationFrame((n) => this.frame(n));
    else if (mode === "second") setTimeout(() => this.wake(), 1000);
  }

  private drawRaven(now: number, dt: number): void {
    this.raven.lookX = Math.sin(now / 900) * 0.6;
    this.raven.lookY = Math.cos(now / 1300) * 0.3;
    this.raven.update(dt);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = 22 / 0.6;
    const px = Math.round(size * dpr);
    if (this.ravenCanvas.width !== px) { this.ravenCanvas.width = px; this.ravenCanvas.height = px; }
    const ctx = this.ravenCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    this.raven.draw(ctx, size, size);
  }
}

async function main() {
  const pill = new Pill();
  const boot = await Bridge.boot();
  setLanguage(resolveLanguage(boot?.settings.language, systemLanguages()));
  const status = await FlowBridge.status();
  if (status) pill.platform = status.platform;
  pill.s = (await FlowBridge.pillState()) ?? pill.s;
  pill.visible = isShown(pill.s);
  pill.render();
  void onEvent<PillState>("pill-state", (s) => { pill.s = s; if (s.phase === "listening") pill.mic.fill(0); pill.render(); });
  void onEvent<number[]>("pill-bands", (b) => { for (let i = 0; i < BANDS; i++) pill.mic[i] = b[i] ?? 0; pill.wake(); });
  void onEvent<boolean>("pill-visible", (v) => { pill.visible = v; if (!v) { pill.hovered = false; pill.tip = null; } pill.render(); });
  void onEvent<boolean>("pill-pointer", (inside) => { if (!inside) pill.hover(false); }); // Windows: o cursor é lido pelo Rust
  void onEvent<Say>("voice-say", (s) => void speak(s, (on) => { pill.speaking = on; pill.wake(); }));
  void onEvent<Settings>("settings-changed", (s) => { setLanguage(resolveLanguage(s.language, systemLanguages())); pill.render(); });
}

void main();
