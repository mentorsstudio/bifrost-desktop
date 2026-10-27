// Bifrost — a máquina de estados da ilha, escrita do zero.
// Quatro estados: "hidden" (recolhida), "petit" (compacta), "home" (aberta) e
// "bifrost-desktop" (a saudação ao abrir). Entradas são os gestos (cursor,
// clique), os eventos de trabalho e os pedidos explícitos; saídas são só as
// transições, por `onTransition`. Sem DOM, sem Tauri — os testes a dirigem.
// Um único relógio por nome ("hide", "fold", "greet") guarda cada contagem.

export type FsmState = "hidden" | "petit" | "home" | "bifrost-desktop";
type Clock = "hide" | "fold" | "greet";

export class IslandStateMachine {
  state: FsmState = "hidden";
  onTransition: ((from: FsmState, to: FsmState) => void) | null = null;

  /** compacta → recolhida, em segundos. */
  petitToHiddenDelay = 60;
  /** saudação → compacta depois que a animação acaba (sem cursor). */
  greetAutoCollapseDelay = 0.6;
  /** saudação → compacta com o cursor em cima. */
  greetHoverCollapseDelay = 10;
  /** Um alerta esperando resposta segura a ilha aberta. */
  pinned = false;
  /** Passar o cursor abre de vez (Configurações → Geral). */
  openOnHover = false;
  /** Fase 18 — com a faixa do notch reservada a ilha nunca recolhe: a compacta é o piso. */
  floorPetit = false;
  /** Folga depois que o cursor sai de uma ilha aberta pelo cursor. */
  hoverCloseDelay = 0.6;
  /** Quando a ilha aberta vai fechar (relógio performance.now), ou null. */
  homeCollapseDueAt: number | null = null;

  private foldAfter = 15;
  private hoverOpen = false;
  private clocks = new Map<Clock, number>();

  /** aberta → compacta: a preferência de fechar sozinho. Mudar no meio da contagem recomeça com o novo valor. */
  get homeToPetitDelay(): number { return this.foldAfter; }
  set homeToPetitDelay(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds === this.foldAfter) return;
    this.foldAfter = seconds;
    if (this.state === "home" && this.clocks.has("fold")) this.startFold();
  }

  /** Aberta por passar o cursor, até o primeiro clique dentro. */
  get openedByHover(): boolean { return this.hoverOpen; }

  // ── Gestos ────────────────────────────────────────────────────────────────

  launch() { this.cancelTimers(); this.go("bifrost-desktop"); }

  mouseEntered() {
    const s = this.state;
    if (this.openOnHover && !this.pinned && (s === "hidden" || s === "petit")) {
      this.cancelTimers();
      this.hoverOpen = true;
      this.go("home");
      return;
    }
    if (s === "hidden") { this.cancelTimers(); this.go("petit"); }
    else if (s === "petit") this.stop("hide");
    else if (s === "home") this.stop("fold");
    else this.startGreet(this.greetHoverCollapseDelay);
  }

  mouseLeft() {
    const s = this.state;
    if (s === "petit") this.startHide();
    else if (s === "home") this.startFold();
    else if (s === "bifrost-desktop") { this.stop("greet"); this.go("petit"); }
  }

  click() {
    this.hoverOpen = false;
    if (this.state !== "petit") return;
    this.cancelTimers();
    this.go("home");
  }

  /** A animação da saudação acabou; não passa por cima de uma contagem do cursor. */
  greetComplete() {
    if (this.state === "bifrost-desktop" && !this.clocks.has("greet")) this.startGreet(this.greetAutoCollapseDelay);
  }

  /** Trabalho que não é alerta: mostra a compacta se estava recolhida. */
  reveal() {
    if (this.state !== "hidden") return;
    this.cancelTimers();
    this.go("petit");
    this.startHide();
  }

  /** Clique dentro: a ilha aberta pelo cursor passa a fechar no tempo normal. */
  userInteracted() {
    if (!this.hoverOpen) return;
    this.hoverOpen = false;
    if (this.state === "home" && this.clocks.has("fold")) this.startFold();
  }

  /** Alerta ou pedido explícito: abre de vez. */
  forceHome() { this.hoverOpen = false; this.cancelTimers(); this.go("home"); }
  /** Fechar explícito (OK, Esc, alerta respondido). */
  forcePetit() { this.hoverOpen = false; this.cancelTimers(); this.go("petit"); }
  forceHidden() { this.hoverOpen = false; this.cancelTimers(); this.go("hidden"); }

  cancelTimers() { for (const c of [...this.clocks.keys()]) this.stop(c); }

  // ── Relógios ──────────────────────────────────────────────────────────────

  private startHide() {
    this.stop("hide");
    // Um cartão esperando resposta mantém a compacta na tela.
    if (this.pinned) return;
    this.after("hide", this.petitToHiddenDelay, () => { if (this.state === "petit" && !this.pinned) this.go("hidden"); });
  }

  private startFold() {
    this.stop("fold");
    if (this.pinned) return;
    const seconds = this.hoverOpen ? this.hoverCloseDelay : this.foldAfter;
    this.homeCollapseDueAt = performance.now() + seconds * 1000;
    this.after("fold", seconds, () => {
      this.homeCollapseDueAt = null;
      if (this.state === "home" && !this.pinned) { this.hoverOpen = false; this.go("petit"); }
    });
  }

  private startGreet(seconds: number) {
    this.stop("greet");
    this.after("greet", seconds, () => { if (this.state === "bifrost-desktop") this.go("petit"); });
  }

  private after(name: Clock, seconds: number, run: () => void) {
    this.clocks.set(name, window.setTimeout(() => { this.clocks.delete(name); run(); }, seconds * 1000));
  }

  private stop(name: Clock) {
    const id = this.clocks.get(name);
    if (id != null) window.clearTimeout(id);
    this.clocks.delete(name);
    if (name === "fold") this.homeCollapseDueAt = null;
  }

  private go(next: FsmState) {
    if (next === "hidden" && this.floorPetit) next = "petit";
    if (next === this.state) return;
    const from = this.state;
    this.state = next;
    this.onTransition?.(from, next);
  }
}
