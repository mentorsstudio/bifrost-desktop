// A ilha do Bifrost: a casca que junta a máquina de estados (fsm.ts), a
// geometria (geometry.ts), as ações das views (actions.ts), o envio de arquivo
// (drop.ts) e o Huginn desenhado pelo RavenEngine. Reescrita do zero sobre o
// mesmo contrato público (o que main.ts, hooks.ts, shortcuts.ts e companhia chamam).

import { Tracked, Spring } from "../core/anim";
import { Springs } from "../bifrost/motion";
import { Bridge, IS_TAURI, onDragDrop } from "../core/bridge";
import {
  EXPANDED_W, NOTCH_W, PANEL_H, PANEL_W, ROUNDED_CORNER, VIEW_LAYOUTS,
  botGlowColor, botGlowOpacity, botPosition, chatPromptHeight,
  type BotEmoteName, type IslandMode, type IslandViewName,
} from "../core/layout";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { islandDances } from "../core/spotify";
import { BotEngine, hexToRGB } from "../bifrost/raven";
import { Greeting } from "../huginn/greeting";
import { createMiniBot, pruneMiniBots, syncMiniBotStates, tickMiniBots } from "../huginn/minibots";
import { SeasonCache, parseOutfit } from "../huginn/wardrobe";
import { UploadCanvas } from "../upload/canvas";
import { UploadSeq } from "../upload/sequence";
import { closePlanCard, openPlanColor, planCardOpen } from "../views/usage";
import { buildHeader, buildViews, type ViewHost } from "../views/views";
import { h } from "../views/dom";
import { DRAG_THRESHOLD } from "../huginn/desktop-logic";
import { UPDATE_BLUE, showsUpdateHint } from "../whats-new/whats-new";
import { IslandStateMachine } from "./fsm";
import { refreshHookPills } from "./integrations";
import { DesktopLink } from "./desktop";
import type { ViewCommand } from "./shortcuts";
import { Updates } from "./update";
import { islandActions } from "./actions";
import { DropFlow } from "./drop";
import { slideSwap } from "../theme/interact";

/** A ordem das abas da ilha, para saber de que lado a vista nova entra. */
const TAB_ORDER: Partial<Record<IslandViewName, number>> = { overview: 0, empty: 0, prompt: 1, upload: 2, settings: 3 };
const tabOrder = (v: IslandViewName) => TAB_ORDER[v] ?? 0;
import {
  BOT_OVERHANG, BOT_SIDE, clockText, countdownWidth, gazeX, gazeY, insideWithMargin, islandRect, modeRank,
  onRaven, ravenCanvasBox, rectMoved, targetShape, type Rect,
} from "./geometry";

const BLUE = hexToRGB(UPDATE_BLUE);
const FAR = -10_000;
const LOVE_COOLDOWN_S = 6;
const LOVE_AFTER_MS = 1900;
const DIZZY_MS = 3300;
const COLLAPSE_AFTER_MS = 420;

const dprNow = () => Math.min(2, window.devicePixelRatio || 1);

/** Os elementos da ilha, criados uma vez. */
interface Dom {
  wake: HTMLElement; island: HTMLElement; clip: HTMLElement; content: HTMLElement; views: HTMLElement;
  bot: HTMLCanvasElement; glow: HTMLElement; greeting: HTMLCanvasElement; grid: HTMLElement; clock: HTMLElement; countdown: HTMLElement;
}

export class Island {
  readonly fsm = new IslandStateMachine();
  /** O Huginn na área de trabalho: ciclo de vida e o arrasto para fora da ilha. */
  readonly desktop: DesktopLink;
  readonly engine = new BotEngine();

  onGreetingDone: (() => void) | null = null;
  onWake: (() => void) | null = null;

  private readonly root: HTMLElement;
  private dom!: Dom;
  private header!: ViewHost;
  private views!: Map<IslandViewName, ViewHost>;
  private upload!: UploadCanvas;
  private readonly drop: DropFlow;

  // Forma (molas interrompíveis) e o Huginn.
  private readonly w = new Tracked(NOTCH_W);
  private readonly hgt = new Tracked(0);
  private readonly rad = new Tracked(ROUNDED_CORNER);
  private readonly ravenX = new Spring(46);
  private readonly ravenY = new Spring(16);
  private readonly ravenSize = new Spring(10);

  private readonly greeting = new Greeting();
  private greetingOn = false;
  private readonly seasons = new SeasonCache();

  private looping = false;
  private lastMs = 0;
  private stale = true;
  private bitmap = { px: 0, dpr: 0 };
  private sentRect: Rect = { x: -1, y: -1, w: -1, h: -1 };

  private windowSmall = false;
  private collapseTimer: number | null = null;
  private pointerOver = false;
  private compositorPointer: boolean | null = null;

  private loveHover = false;
  private loveTimer: number | null = null;
  private lastLoveS = 0;
  private loveFrom = { x: 0, y: 0 };
  private press: { x: number; y: number } | null = null;

  private dizzyTimer: number | null = null;
  private viewBeforeDizzy: IslandViewName = "overview";
  private syncedView: IslandViewName | null = null;
  private shownView: IslandViewName | null = null;
  private quietReveal = false;
  private clockTimer?: number;

  constructor(root: HTMLElement) {
    this.root = root;
    this.desktop = new DesktopLink({
      reveal: () => this.reveal(),
      wardrobeFromDesktop: () => this.wardrobeFromDesktop(),
      dizzyFromDesktop: () => this.handleDizzy(),
    });
    this.drop = new DropFlow({
      engine: this.engine,
      alert: (v) => this.alert(v),
      setView: (v) => this.setView(v),
      wake: () => this.ensureRunning(),
    });
    this.mount();
    this.listenFsm();
    this.listenInput();
    this.engine.onDizzy = () => this.handleDizzy();
    this.greeting.onComplete = () => { this.fsm.greetComplete(); this.onGreetingDone?.(); };
    State.subscribe(() => { this.stale = true; this.ensureRunning(); });
  }

  // ── Montagem ────────────────────────────────────────────────────────────────

  private mount(): void {
    const actions = islandActions({
      fsm: this.fsm,
      engine: this.engine,
      setView: (v) => this.setView(v),
      collapse: () => this.collapse(),
      foldApproval: () => this.foldApproval(),
      discardDrop: () => this.discardDrop(),
      closeApproval: () => this.closeApproval(),
      pointerIn: () => this.pointerOver,
    });
    this.header = buildHeader(actions);
    this.views = buildViews(actions, () => this.reshape(false));
    this.upload = new UploadCanvas({
      ask: () => {
        const f = State.droppedFile;
        State.promptContext = f ? { kind: "file", name: f.name, path: f.path } : null;
        this.setView("prompt");
      },
      cancel: () => this.discardDrop(),
    });
    const views = h("div", { id: "views" }, ...[...this.views.values()].map((v) => v.el));
    const content = h("div", { id: "content" }, this.header.el, views);
    const greeting = h("canvas", { id: "greeting-canvas" });
    // A sequência de envio fica sob o cabeçalho, que continua visível por cima.
    const clip = h("div", { id: "island-clip" }, greeting, this.upload.el, content);
    const bot = h("canvas", { id: "bot-canvas" });
    const glow = h("div", { id: "bot-glow" });
    const grid = h("div", { id: "mini-grid" });
    const clock = h("div", { id: "island-clock" });
    const countdown = h("div", { id: "countdown" });
    const island = h("div", { id: "island" }, clip, glow, bot, grid, clock, countdown);
    const wake = h("div", { id: "wake-strip" });
    this.dom = { wake, island, clip, content, views, bot, glow, greeting, grid, clock, countdown };
    const dpr = dprNow();
    greeting.width = Math.round(EXPANDED_W * dpr);
    greeting.height = Math.round(150 * dpr);
    greeting.style.width = `${EXPANDED_W}px`;
    greeting.style.height = "150px";
    this.root.append(wake, island);
    this.paintShape();
  }

  private listenFsm(): void {
    this.fsm.homeToPetitDelay = State.settings.autoCloseInterval;
    this.fsm.openOnHover = State.settings.openOnHover;
    this.fsm.floorPetit = State.settings.notchReserve !== false;
    this.fsm.onTransition = (from, to) => {
      // A saudação acabou, como quer que tenha sido: ele volta ao seu canto.
      if (from === "bifrost-desktop" && to !== "bifrost-desktop") this.desktop.launch();
      if (to === "hidden") this.setMode("hidden");
      else if (to === "petit") {
        if (from === "bifrost-desktop") this.greeting.interrupt();
        else if (from === "hidden" && !this.quietReveal) Sound.play("peek");
        this.setMode("compact");
        if (from === "bifrost-desktop") State.view = State.defaultView();
        if (!this.pointerOver) this.fsm.mouseLeft();
      } else if (to === "home") {
        this.expand(this.openingView());
        if (!this.pointerOver) this.fsm.mouseLeft();
        void refreshHookPills(); // ganchos instalados desde então aparecem ao abrir
      } else if (to === "bifrost-desktop") {
        this.expand("greeting");
        this.greeting.start();
      }
      State.notify();
      if (from === "hidden") this.onWake?.();
    };
  }

  launch(): void { this.fsm.launch(); }

  // ── Modo e view ─────────────────────────────────────────────────────────────

  private setMode(mode: IslandMode): void {
    const prev = State.mode;
    if (mode === prev) return;
    State.mode = mode;
    if (mode === "expanded") Sound.play("open");
    if (prev === "expanded") {
      Sound.play("close");
      if (!State.pendingApproval) State.isPinned = false; // um cartão dobrado continua preso
      void Bridge.focusWindow(false);
    }
    if (mode !== "expanded") {
      closePlanCard();
      this.engine.resetMorph();
      UploadSeq.deactivate(); // fechada, a ilha não pode gastar quadros
    }
    this.syncWindowSize();
    this.reshape(modeRank(mode) < modeRank(prev));
    State.notify();
  }

  private enterView(view: IslandViewName): void {
    this.drop.leaveIfNeeded(view);
    if (view !== "overview") closePlanCard();
  }

  expand(view: IslandViewName): void {
    this.enterView(view);
    State.view = view;
    if (State.mode !== "expanded") this.setMode("expanded");
    else this.reshape(false);
    State.lastActivity = performance.now();
    State.notify();
  }

  setView(view: IslandViewName): void {
    this.enterView(view);
    if (State.mode !== "expanded") {
      this.fsm.forceHome();
      State.view = view;
      this.reshape(false);
      State.notify();
      return;
    }
    const grows = VIEW_LAYOUTS[view].height >= VIEW_LAYOUTS[State.view].height;
    State.view = view;
    State.lastActivity = performance.now();
    this.reshape(!grows);
    State.notify();
  }

  private closeApproval(): void {
    State.endApproval();
    this.fsm.pinned = false;
    this.setView(State.defaultView());
  }

  /** Dobra um cartão que espera resposta até a ilha compacta, sem responder (Mac #290). */
  foldApproval(): void {
    if (!State.pendingApproval || State.mode !== "expanded") return;
    State.isPinned = true;
    this.fsm.pinned = true;
    this.fsm.forcePetit();
  }

  collapse(): void {
    if (State.pendingApproval) { this.foldApproval(); return; } // um cartão esperando só é dobrado
    State.isPinned = false;
    this.fsm.pinned = false;
    this.fsm.forcePetit(); // pela máquina de estados, nunca só pelo modo
  }

  /** Aviso do servidor de ganchos: abre nesta view. */
  alert(view: IslandViewName): void {
    this.fsm.pinned = State.isPinned;
    this.fsm.forceHome();
    this.expand(view);
  }

  private hintOn(): boolean {
    return !State.paused && showsUpdateHint(Updates.waiting(), State.effectiveState, State.pendingApproval != null);
  }

  /** Com o Huginn azul, abre na nova versão; um pedido esperando vem sempre antes. */
  private openingView(): IslandViewName {
    return this.hintOn() ? "update" : State.defaultView();
  }

  reveal(): void { this.fsm.reveal(); }

  /** A música começou: a ilha compacta, sem o som de espiada. */
  revealSilently(): void {
    this.quietReveal = true;
    this.fsm.reveal();
    this.quietReveal = false;
  }

  private ownHuginnBusy(): boolean {
    return State.mode === "expanded" && (State.view === "greeting" || this.drop.active);
  }

  /** Clique direito no Huginn: guarda-roupa ↔ a view de sempre. */
  toggleWardrobe(): void {
    if (State.paused || State.mode === "hidden" || this.ownHuginnBusy()) return;
    this.setView(State.mode === "expanded" && State.view === "wardrobe" ? State.defaultView() : "wardrobe");
  }

  wardrobeFromDesktop(): void { this.wardrobeAnywhere(); }

  /** O guarda-roupa de qualquer estado, ou de volta se já está aberto. */
  wardrobeAnywhere(): void {
    if (State.mode === "expanded" && State.view === "wardrobe") { this.setView(State.defaultView()); return; }
    if (State.paused) return;
    this.alert("wardrobe");
  }

  /** O aviso parou de esperar: a ilha pode fechar sozinha de novo. */
  dropPin(): void {
    this.fsm.pinned = false;
    if (!this.pointerOver) this.fsm.mouseLeft();
  }

  // ── Atalhos ─────────────────────────────────────────────────────────────────

  emote(name: BotEmoteName): void { this.engine.triggerEmote(name); this.ensureRunning(); }

  setPinned(on: boolean): void {
    State.isPinned = on;
    this.fsm.pinned = on;
    if (on) this.fsm.cancelTimers();
    else if (!this.pointerOver && this.fsm.state === "home") this.fsm.mouseLeft();
    State.notify();
  }

  takeKeyboard(): void { void Bridge.focusWindow(true); }
  canLeaveIsland(): boolean { return this.desktop.supported; }

  flyOutOrHome(): void {
    if (this.ownHuginnBusy() && !State.mochiOnDesktop) return;
    this.desktop.flyOutOrHome();
  }

  viewCommand(command: ViewCommand): void { this.views.get(State.view)?.command?.(command); }

  private discardDrop(): void {
    State.droppedFile = null;
    State.promptContext = null;
    this.setView(State.defaultView());
  }

  // ── Forma ───────────────────────────────────────────────────────────────────

  /** Encolher desliza na curva; crescer usa as molas (Dynamic Island). */
  private reshape(shrinking: boolean): void {
    const s = targetShape(State.mode, State.view, State.chatHistory.length, Boolean(State.pendingApproval?.questions));
    if (shrinking) {
      this.w.curveTowards(s.w); this.hgt.curveTowards(s.h); this.rad.curveTowards(s.r);
    } else {
      const b = Springs.bouncy, sn = Springs.snappy;
      this.w.springTo(s.w, b.response, b.damping);
      this.hgt.springTo(s.h, b.response, b.damping);
      this.rad.springTo(s.r, sn.response, sn.damping);
    }
    this.ensureRunning();
  }

  private rect(): Rect { return islandRect(window.innerWidth, this.w.value, this.hgt.value); }

  private paintShape(): void {
    const { island, grid, clock, greeting } = this.dom;
    const w = this.w.value, hh = this.hgt.value, r = this.rad.value;
    island.style.width = `${w}px`;
    island.style.height = `${hh}px`;
    island.style.borderRadius = `0 0 ${r}px ${r}px`;
    island.style.transform = "translateX(-50%)";
    grid.style.left = `${w - 54.5}px`;
    grid.style.top = `${hh / 2 - 14.5}px`;
    clock.style.height = `${hh}px`;
    const off = `${(w - EXPANDED_W) / 2}px`;
    greeting.style.left = off;
    this.upload.el.style.left = off;
    const rect = this.rect();
    if (rectMoved(this.sentRect, rect)) {
      this.sentRect = rect;
      void Bridge.setIslandRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  /** Escondida, a janela vira a faixa de despertar: o sistema não manda cursor, nada sonda. */
  private syncWindowSize(): void {
    if (this.collapseTimer != null) { clearTimeout(this.collapseTimer); this.collapseTimer = null; }
    if (State.mode === "hidden") {
      this.collapseTimer = window.setTimeout(() => {
        this.collapseTimer = null;
        if (State.mode !== "hidden") return;
        this.windowSmall = true;
        void Bridge.setCollapsed(true);
      }, COLLAPSE_AFTER_MS);
    } else if (this.windowSmall) {
      this.windowSmall = false;
      void Bridge.setCollapsed(false);
    }
  }

  // ── Entrada ─────────────────────────────────────────────────────────────────

  private listenInput(): void {
    const { wake, island } = this.dom;
    wake.addEventListener("mouseenter", () => { Sound.resume(); if (State.mode === "hidden") this.fsm.mouseEntered(); });
    island.addEventListener("mousedown", (e) => this.onPress(e));
    // Sobre o Huginn, nada de menu do navegador: o clique direito é o guarda-roupa.
    island.addEventListener("contextmenu", (e) => { if (this.hitsRaven(e.clientX, e.clientY)) e.preventDefault(); });
    window.addEventListener("mousemove", (e) => this.onDragMove(e));
    window.addEventListener("mouseup", (e) => {
      this.press = null;
      if (this.desktop.carrying) this.desktop.carryEnd(e.clientX, e.clientY);
    });
    // Só teclas digitadas na própria ilha chegam aqui.
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && State.mode === "expanded") {
        if (State.pendingApproval) this.foldApproval();
        else if (!State.isPinned) this.collapse();
      }
      State.lastActivity = performance.now();
    });
    void onDragDrop((e) => this.drop.onEvent(e));
    if (!IS_TAURI) this.followPageCursor();
  }

  private onPress(e: MouseEvent): void {
    Sound.resume();
    State.lastActivity = performance.now();
    this.fsm.userInteracted();
    const onBot = this.hitsRaven(e.clientX, e.clientY);
    if (e.button === 0 && onBot) this.press = { x: e.clientX, y: e.clientY };
    if (e.button === 2 && onBot) { this.stopLove(); this.toggleWardrobe(); return; }
    if (State.mode !== "expanded") { this.fsm.click(); return; }
    if (onBot) { this.stopLove(); this.engine.slap(); }
  }

  private onDragMove(e: MouseEvent): void {
    if (this.desktop.carrying) { this.desktop.carry(e.clientX, e.clientY); return; }
    const p = this.press;
    if (!p) return;
    if (!(e.buttons & 1)) { this.press = null; return; }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= DRAG_THRESHOLD) return;
    this.press = null;
    if (!this.canDragOut()) return;
    this.stopLove();
    this.desktop.pickUp(e.clientX, e.clientY);
  }

  /** O cursor vindo dos eventos da página (Wayland, ou o navegador no dev). */
  followPageCursor(): void {
    window.addEventListener("mousemove", (e) => this.onCursor(e.clientX, e.clientY));
    window.addEventListener("mouseout", (e) => { if (e.relatedTarget == null) this.onCursor(FAR, FAR); });
  }

  setPointerInside(inside: boolean): void { this.compositorPointer = inside; }

  /** Cursor em coordenadas lógicas da janela. */
  onCursor(x: number, y: number): void {
    // O WebKitGTK pode mandar um mousemove depois de o ponteiro sair: não confiar nele.
    if (this.compositorPointer === false) { x = FAR; y = FAR; }
    State.mouse = { x, y };
    const rect = this.rect();
    State.mouseInIsland = { x: x - rect.x, y: y - rect.y };
    // O Windows não manda cursor num arrasto OLE: a sequência lê a sondagem do Win32.
    if (UploadSeq.isActive && !UploadSeq.dropped) UploadSeq.updateCursor(State.mouseInIsland.x, State.mouseInIsland.y);
    const inside = insideWithMargin(rect, x, y);
    const was = this.pointerOver;
    this.pointerOver = inside; // antes da máquina: uma transição imediata lê isto
    if (inside && !was) {
      if (this.fsm.state === "bifrost-desktop") this.greeting.hover();
      this.fsm.mouseEntered();
    }
    if (!inside && was) this.fsm.mouseLeft();
    this.trackLove(x, y);
    this.ensureRunning();
  }

  private canDragOut(): boolean {
    return State.mode !== "hidden" && this.desktop.canPickUp() && !this.ownHuginnBusy();
  }

  private hitsRaven(x: number, y: number): boolean {
    return !State.mochiOnDesktop && onRaven(this.rect(), this.ravenX.value, this.ravenY.value, this.ravenSize.value, x, y);
  }

  // Passar o mouse no Huginn → coração (botHoverIn do macOS).
  private trackLove(x: number, y: number): void {
    const over = State.mode === "expanded" && State.stateOverride == null && this.hitsRaven(x, y);
    if (over && !this.loveHover) this.startLove(x, y);
    if (!over && this.loveHover) this.stopLove();
    this.loveHover = over;
    if (over && Math.hypot(x - this.loveFrom.x, y - this.loveFrom.y) > 40) {
      this.loveFrom = { x, y };
      this.armLove();
    }
  }

  private coolingDown(): boolean { return performance.now() / 1000 - this.lastLoveS < LOVE_COOLDOWN_S; }

  private startLove(x: number, y: number): void {
    if (this.coolingDown()) return;
    this.loveFrom = { x, y };
    this.engine.blink();
    this.engine.tgEs = 1.08;
    Sound.play("hover");
    this.armLove();
  }

  private armLove(): void {
    if (this.loveTimer != null) clearTimeout(this.loveTimer);
    this.loveTimer = window.setTimeout(() => {
      this.loveTimer = null;
      if (!this.loveHover || State.stateOverride != null || this.coolingDown()) return;
      this.lastLoveS = performance.now() / 1000;
      this.engine.triggerEmote("love");
      Sound.play("love");
    }, LOVE_AFTER_MS);
  }

  private stopLove(): void {
    if (this.loveTimer != null) clearTimeout(this.loveTimer);
    this.loveTimer = null;
    this.engine.tgEs = 1;
  }

  /** Três tapas → tonto e a view "confuso" por 3,3 s, depois de volta. */
  handleDizzy(): void {
    this.viewBeforeDizzy = State.view;
    State.stateOverride = "dizzy";
    this.engine.setState("dizzy");
    Sound.play("dizzy");
    this.alert("confused");
    if (this.dizzyTimer != null) clearTimeout(this.dizzyTimer);
    this.dizzyTimer = window.setTimeout(() => {
      this.dizzyTimer = null;
      State.stateOverride = null;
      this.engine.setState(State.effectiveState);
      if (State.view === "confused") this.setView(this.viewBeforeDizzy === "confused" ? State.defaultView() : this.viewBeforeDizzy);
      this.engine.triggerEmote("happy");
    }, DIZZY_MS);
  }

  // ── Quadros ─────────────────────────────────────────────────────────────────

  ensureRunning(): void {
    if (this.looping) return;
    this.looping = true;
    this.lastMs = performance.now();
    requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastMs) / 1000);
    this.lastMs = now;
    this.w.step(dt, now); this.hgt.step(dt, now); this.rad.step(dt, now);
    this.paintShape();
    if (this.stale) { this.stale = false; this.syncDom(); }
    this.aimRaven();
    this.ravenX.step(dt); this.ravenY.step(dt); this.ravenSize.step(dt);

    const greeting = State.mode === "expanded" && State.view === "greeting";
    if (greeting) this.drawGreeting();
    else this.drawRaven(dt); // segue rodando sob o envio, para já estar no lugar quando ele some

    const uploading = this.drop.active;
    if (uploading) this.upload.draw(UploadSeq.frame(), now / 1000);
    this.upload.el.classList.toggle("on", uploading);
    this.dom.views.classList.toggle("hidden-by-upload", uploading);
    tickMiniBots(dt);
    const viewMoving = this.views.get(State.view)?.tick?.(now) === true;
    if (UploadSeq.isActive) this.drop.step();
    this.dom.countdown.style.width = `${countdownWidth(this.fsm.homeCollapseDueAt, now, this.fsm.homeToPetitDelay, State.mode === "expanded" && !State.isPinned)}px`;

    // Escondida, nada pode manter o laço vivo além da forma terminando de recolher.
    const settling = this.w.animating || this.hgt.animating || this.rad.animating;
    const more = State.mode === "hidden"
      ? settling
      : settling || !this.ravenX.settled || !this.ravenY.settled || !this.ravenSize.settled ||
        greeting || this.engine.busy || UploadSeq.isActive || viewMoving;
    if (more) requestAnimationFrame(this.tick);
    else { this.looping = false; Sound.idle(); }
  };

  private drawGreeting(): void {
    const c = this.dom.greeting;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = dprNow();
    if (c.width !== Math.round(EXPANDED_W * dpr)) { c.width = Math.round(EXPANDED_W * dpr); c.height = Math.round(150 * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.greeting.draw(ctx);
  }

  private aimRaven(): void {
    const p = botPosition(State.mode, State.view, this.hgt.value, State.uploadProgress);
    this.ravenX.target = p.cx;
    this.ravenY.target = p.cy;
    this.ravenSize.target = p.diameter / 0.6;
    const greeting = State.mode === "expanded" && State.view === "greeting";
    const away = State.mochiOnDesktop;
    // O envio desenha o seu próprio Huginn; dois se sobreporiam.
    this.dom.bot.style.opacity = p.opacity > 0 && !greeting && !this.drop.active && !away ? "1" : "0";
    const glow = this.dom.glow;
    if (State.mode === "expanded" && State.view !== "uploading" && !greeting && !this.drop.active && !away) {
      const d = p.diameter;
      glow.style.display = "block";
      glow.style.width = glow.style.height = `${d * 2.2}px`;
      glow.style.left = `${this.ravenX.value - d * 1.1}px`;
      glow.style.top = `${this.ravenY.value - d * 1.1}px`;
      glow.style.background = `radial-gradient(circle, ${botGlowColor(State.effectiveState)} 0%, transparent 62%)`;
      glow.style.opacity = String(botGlowOpacity(State.effectiveState));
    } else glow.style.display = "none";
  }

  private drawRaven(dt: number): void {
    const c = this.dom.bot;
    const box = ravenCanvasBox(this.ravenSize.value, this.ravenX.value, this.ravenY.value);
    const dpr = dprNow();
    // Desenhado na densidade atual: outro monitor mudaria o tamanho.
    if (this.bitmap.px !== box.px || this.bitmap.dpr !== dpr) {
      this.bitmap = { px: box.px, dpr };
      c.width = Math.round(box.w * dpr);
      c.height = Math.round(box.h * dpr);
      c.style.width = `${box.w}px`;
      c.style.height = `${box.h}px`;
    }
    c.style.left = `${box.left}px`;
    c.style.top = `${box.top}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const e = this.engine;
    const focus = State.focusTask;
    e.setUpdateHint(this.hintOn() ? BLUE : null);
    // Com um cartão de plano aberto ele veste a cor do plano, como a pílula.
    e.bodyColor = planCardOpen() ? hexToRGB(openPlanColor()) : e.showsUpdateHint ? BLUE : focus?.isIntegration ? hexToRGB(focus.color) : null;
    e.particleOverhang = BOT_OVERHANG;
    const rect = this.rect();
    e.lookX = gazeX(State.mouse.x, rect.x + this.ravenX.value);
    e.lookY = gazeY(State.mouse.y, this.ravenY.value);
    if (e.morph > 0.3) e.slotHTarget = State.fileDragOver ? 0.2 : 0;
    else {
      e.slotHTarget = 0;
      if (e.morph < 0.05) { e.slotH = 0; e.slotHVel = 0; }
    }
    // Só o Huginn principal se veste; no guarda-roupa a roupa apontada entra na hora.
    const wardrobe = State.mode === "expanded" && State.view === "wardrobe";
    const mainFocused = State.focusId == null || State.focusId === State.mainPillId;
    const outfit = State.wardrobePreview ?? this.seasons.get(parseOutfit(State.settings.mochiOutfit));
    e.setOutfit(mainFocused || State.mode !== "expanded" || wardrobe ? outfit : "none", !wardrobe);
    e.setDancing(islandDances({ music: State.spotifyPlaying, state: State.effectiveState, mode: State.mode, view: State.view, focusId: State.focusTask?.id }));
    e.update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, BOT_SIDE * dpr, 0);
    ctx.clearRect(-BOT_SIDE, 0, box.w, box.h);
    ctx.save();
    e.applyDance(ctx, box.px, box.h);
    e.draw(ctx, box.px, box.h);
    ctx.restore();
  }

  // ── DOM a partir do estado ──────────────────────────────────────────────────

  private syncDom(): void {
    const { content, greeting, grid } = this.dom;
    const expanded = State.mode === "expanded";
    const greetingOn = expanded && State.view === "greeting";
    const live = expanded && !greetingOn;
    content.style.opacity = live ? "1" : "0";
    // Com o envio no corpo, só o cabeçalho recebe cliques aqui em cima.
    content.style.pointerEvents = live && !this.drop.active ? "auto" : "none";
    this.header.el.style.pointerEvents = live ? "auto" : "none";
    greeting.style.display = greetingOn ? "block" : "none";
    if (this.greetingOn && !greetingOn) this.greeting.leave();
    this.greetingOn = greetingOn;
    if (State.wardrobePreview && !(expanded && State.view === "wardrobe")) State.wardrobePreview = null;

    this.header.sync();
    document.body.classList.toggle("bf-pair", State.tasks.filter((t) => t.source !== "n8n" && (t.sessionCwd || t.sessionId || t.state !== "idle")).length >= 2);
    const prevView = this.shownView;
    for (const [name, view] of this.views) {
      const on = name === State.view;
      view.el.classList.toggle("on", on);
      if (on) view.sync();
    }
    // Fase 18: trocar de aba cruza as vistas e desliza na direção da aba.
    if (prevView !== State.view) {
      if (prevView && expanded) slideSwap(this.views.get(prevView)?.el ?? null, this.views.get(State.view)?.el ?? null, tabOrder(State.view) - tabOrder(prevView));
      this.shownView = State.view;
    }
    // Só o chat tem campo de texto: é a única hora em que a ilha pega o teclado.
    if (this.syncedView !== State.view) {
      const leftChat = this.syncedView === "prompt";
      this.syncedView = State.view;
      if (State.view === "prompt") {
        void Bridge.focusWindow(true);
        window.setTimeout(() => this.views.get("prompt")?.focus?.(), 120);
      } else if (leftChat) void Bridge.focusWindow(false);
    }
    const compact = State.mode === "compact";
    grid.style.opacity = compact ? "1" : "0";
    if (compact) {
      const others = State.otherTasks.slice(0, 4);
      const key = others.map((t) => t.id).join("|");
      if (grid.dataset.key !== key) {
        grid.dataset.key = key;
        grid.replaceChildren(...others.map((t) => createMiniBot(t, 13)));
        pruneMiniBots();
      }
    }
    this.updateClock();
    syncMiniBotStates(State.tasks);
    this.engine.setState(State.effectiveState);
  }

  private updateClock(): void {
    const on = State.mode === "compact" && State.settings.showClock;
    const el = this.dom.clock;
    el.style.opacity = on ? "1" : "0";
    if (!on) return;
    const text = clockText(new Date());
    if (el.textContent !== text) el.textContent = text;
  }

  applySettings(): void {
    Sound.setEnabled(State.settings.soundEnabled);
    Sound.setVolume(State.settings.soundVolume);
    this.fsm.homeToPetitDelay = State.settings.autoCloseInterval;
    this.fsm.openOnHover = State.settings.openOnHover;
    this.fsm.floorPetit = State.settings.notchReserve !== false;
    if (this.fsm.floorPetit && this.fsm.state === "hidden") this.fsm.forcePetit();
    State.notify();
    this.clockTimer ??= window.setInterval(() => this.updateClock(), 10_000);
  }

  get panelSize() { return { w: PANEL_W, h: PANEL_H }; }
  get chatHeight() { return chatPromptHeight(State.chatHistory.length); }
}
