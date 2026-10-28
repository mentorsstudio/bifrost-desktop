// The Bifrost window: a sidebar with Flow (dictation, the Notetaker, the
// statistics, the dictionary, the snippets, the styles and their settings)
// and Notch (every setting of the island), and the page on the right, under
// its coloured band. Port of FlowHub.swift.

import "./hub.css";
import { Durations, parallax, reducedMotion, stagger, tweenNumber } from "../bifrost/motion";

/** Movimento de entrada da página: listas em cascata e números deslizando. */
/** Fase 19: os blocos da página entram em cascata (fade + subida), até 12 degraus. */
export const RISE_SELECTOR = ":scope > :not(.bf-hero):not(.hub-label), #settings-root > *, #settings-root section > *, .hub-card, .card-grid > *, .th-grid > *";
/** Prazo para um bloco aparecer mesmo que a animação de entrada não rode. */
export const RISE_FALLBACK_MS = 900;
export function riseIn(page: HTMLElement): number {
  let i = 0;
  for (const el of page.querySelectorAll<HTMLElement>(RISE_SELECTOR)) el.classList.remove("m-rise");
  for (const el of page.querySelectorAll<HTMLElement>(RISE_SELECTOR)) {
    // Um bloco dentro de outro que já sobe não sobe de novo (seria o dobro do deslocamento).
    if (el.parentElement?.closest(".m-rise")) continue;
    const r = el.getBoundingClientRect();
    // Só o que aparece na primeira tela; o resto chega pelo autoReveal ao rolar.
    if (r.top > (page.ownerDocument.defaultView?.innerHeight ?? 900) + 40) continue;
    el.style.setProperty("--i", String(Math.min(i++, 12)));
    el.classList.add("m-rise");
    el.addEventListener("animationend", () => el.classList.remove("m-rise"), { once: true });
    // Fase 20: a animação é só um enfeite. Se ela não terminar (janela pausada,
    // WebView2 economizando), o bloco aparece mesmo assim.
    window.setTimeout(() => el.classList.remove("m-rise"), RISE_FALLBACK_MS);
  }
  return i;
}

export function animatePage(page: HTMLElement): void {
  riseIn(page);
  for (const list of page.querySelectorAll<HTMLElement>(".hub-stat-row, .hub-notes-list, .hub-list, .hub-grid, ul")) stagger(list);
  for (const b of page.querySelectorAll<HTMLElement>(".hub-stat b")) {
    const raw = (b.textContent ?? "").trim();
    if (!/^[\d.]+$/.test(raw)) continue;
    const n = Number(raw.replace(/\./g, ""));
    // O contador começa depois da entrada da página, para não pedir layout durante ela.
    b.textContent = "0";
    setTimeout(() => tweenNumber(b, n), Durations.slow);
  }
}
import "../theme/bifrost.css";
import { h, clear } from "../views/dom";
import { t } from "../i18n/i18n";
import { onEvent } from "../core/bridge";
import { FlowBridge, type FlowPrefs, type FlowStatus, type ModelsStatus } from "../core/flow";
import { hero, liveRaven, setWindowShown, watchWindowShown, windowShown } from "./hero";
import { icon, keyLabel } from "./ui";
import { THEME_TXT } from "../theme/strings";
import { autoReveal, slidingInk } from "../theme/interact";

export type PageId =
  | "dictation" | "notes" | "insights" | "dictionary" | "snippets" | "styles" | "flowsettings"
  | "general" | "themes" | "pills" | "agents" | "chat" | "voice" | "integrations" | "phone" | "shortcuts"
  | "converter";

interface PageDef {
  id: PageId;
  icon: string;
  title: () => string;
  /** The band's line; none for pages that draw their own band. */
  subtitle?: () => string;
}

export const FLOW_PAGES: PageDef[] = [
  { id: "dictation", icon: "mic", title: () => t("Dictation") },
  { id: "notes", icon: "record", title: () => t("Notetaker") },
  { id: "insights", icon: "chart", title: () => t("Statistics") },
  { id: "dictionary", icon: "book", title: () => t("Dictionary") },
  { id: "snippets", icon: "bolt", title: () => t("Snippets") },
  { id: "styles", icon: "text", title: () => t("Styles") },
  { id: "flowsettings", icon: "sliders", title: () => t("Settings") },
];

export const NOTCH_PAGES: PageDef[] = [
  { id: "general", icon: "gear", title: () => t("General"), subtitle: () => t("Huginn, his sounds and how the island behaves.") },
  { id: "themes", icon: "palette", title: () => THEME_TXT.pageTitle, subtitle: () => THEME_TXT.pageSubtitle },
  { id: "pills", icon: "grid", title: () => t("Active pills"), subtitle: () => t("The pills shown in the island, their order and their colours.") },
  { id: "agents", icon: "terminal", title: () => t("Agents"), subtitle: () => t("Claude Code, Codex and the other agents Huginn follows.") },
  { id: "chat", icon: "chat", title: () => t("Chat"), subtitle: () => "As IAs do seu PC e os servidores MCP — sem chave nenhuma." },
  { id: "voice", icon: "wave", title: () => "OK Bifrost" },
  { id: "integrations", icon: "puzzle", title: () => t("Integrations"), subtitle: () => t("Stripe, GitHub, Vercel, n8n, Notion and the rest.") },
  { id: "phone", icon: "phone", title: () => t("Android phone"), subtitle: () => t("Your agents and their approvals on your Android phone, over your Wi-Fi.") },
  { id: "shortcuts", icon: "keyboard", title: () => t("Shortcuts"), subtitle: () => t("The keys that open the island and its actions.") },
];

/** Forja: as ferramentas de arquivo (o Conversor, o Filee dentro do Bifrost). */
export const FORGE_PAGES: PageDef[] = [
  { id: "converter", icon: "convert", title: () => "Conversor" },
];

const ALL = [...FLOW_PAGES, ...NOTCH_PAGES, ...FORGE_PAGES];

/** What a page gets to draw itself and reach the rest of the window. */
export interface HubContext {
  status: FlowStatus;
  navigate(page: PageId): void;
  /** Reads the status again (prefs, models) and redraws the sidebar's line. */
  refresh(): Promise<FlowStatus>;
  /** Saves new preferences and keeps them as the window's. */
  setPrefs(change: (p: FlowPrefs) => void): Promise<void>;
  /** The band of a page, its Huginns walking. */
  hero(page: PageId, title: string, subtitle: string | null, actions?: HTMLElement[], compact?: boolean): HTMLElement;
  /** Set by a page: called when the page is left. */
  onLeave?: () => void;
}

export type FlowPageRenderer = (container: HTMLElement, ctx: HubContext) => void | Promise<void>;

export interface HubOptions {
  version: string;
  flowPages: Partial<Record<PageId, FlowPageRenderer>>;
  /** Draws the island's settings for one of the Notch pages into `container`. */
  /**
   * Draws the island's settings for one of the Notch pages into `container`.
   * `prefetch`: built ahead, not shown yet — the active page's state stays as is.
   * Returns what makes it the active page.
   */
  renderNotch(page: PageId, container: HTMLElement, prefetch?: boolean): Promise<(() => void) | void>;
}

const DEFAULT_STATUS: FlowStatus = {
  prefs: {
    enabled: false, key: "left_ctrl_super", edge: "bottom", mic: "", keepDays: 30, cleanup: false,
    defaultStyle: "natural", summaryEngine: "claude", openAtLaunch: true, voice: false, voiceOutput: "system", voiceGender: "female",
  },
  models: { parakeet: { state: "missing" }, downloadMb: 700 },
  keys: "ok",
  hasClaudeKey: false,
  mics: [],
  platform: navigator.userAgent.includes("Windows") ? "windows" : "linux",
  autostarted: false,
};

export async function startHub(root: HTMLElement, opts: HubOptions) {
  document.body.classList.add("hub-window");
  // The window is created hidden and only shown and hidden afterwards: its
  // canvases animate only while it is on screen (#792).
  await onEvent<boolean>("hub-visible", setWindowShown);
  const shown = await FlowBridge.hubShown();
  if (shown !== null) setWindowShown(shown);
  watchWindowShown();
  let current: PageId = "dictation";
  let status: FlowStatus = (await FlowBridge.status()) ?? DEFAULT_STATUS;
  const items = new Map<PageId, HTMLElement>();
  const statusLine = h("div", { class: "hub-status" });
  const scroll = h("div", { class: "hub-scroll" });
  const stage = h("div", { class: "hub-stage" });
  autoReveal(stage);
  scroll.append(stage);
  let rendering = 0;

  const ctx: HubContext = {
    get status() {
      return status;
    },
    navigate: (page) => void show(page),
    refresh: async () => {
      status = (await FlowBridge.status()) ?? status;
      drawStatus();
      return status;
    },
    setPrefs: async (change) => {
      const next = { ...status.prefs };
      change(next);
      status = { ...status, prefs: next };
      drawStatus();
      await FlowBridge.setPrefs(next);
    },
    hero: (page, title, subtitle, actions = [], compact = false) => hero(page, title, subtitle, actions, compact),
  };

  function drawStatus() {
    clear(statusLine);
    const models = status.models.parakeet.state;
    let color = "#6b7079";
    let text: string;
    if (!status.prefs.enabled) {
      text = t("Dictation is off");
    } else if (models !== "ready") {
      color = "#f7b32b";
      text = models === "downloading" ? t("Downloading the voice model…") : t("Download the voice model to dictate");
    } else if (status.keys !== "ok" && status.keys !== "wayland") {
      color = "#f7b32b";
      text = t("Use the pill's microphone to dictate");
    } else {
      color = "#34d399";
      text = t("Ready · hold {0}", { 0: keyLabel(status.keys === "wayland" ? "wayland" : status.prefs.key, status.platform) });
    }
    statusLine.title = text;
    statusLine.append(h("i", { class: "dot", style: `background:${color}` }), h("span", { class: "hub-status-text", text }));
  }

  // ── Montagem separada da ativação ──
  // Uma página é montada com um contexto só dela (o onLeave dela, não o da ativa).
  // Montada de antemão (a próxima da lista, no ócio; no hover custava um quadro longo),
  // ela já tem layout e pintura prontos num palco escondido; o clique só a ativa.
  interface Built { id: PageId; el: HTMLElement; local: HubContext; activate?: () => void; at: number; epoch: number }
  // Páginas da ilha já mostradas ficam vivas (desanexadas) por 60 s: voltar a uma não remonta nada.
  const alive = new Map<PageId, Built>();
  // Camadas sobrepostas: toda página montada mora no palco; as escondidas ficam
  // em .m-layer (absolutas, invisíveis, com estilo e layout prontos). Trocar é só
  // mudar classes e animar opacity/transform — nada é montado no quadro da animação.
  let pre: Built | null = null;
  let active: Built | null = null;
  let epoch = 0;
  let navDir = 0;

  async function build(def: PageDef, prefetch: boolean): Promise<Built> {
    const local = Object.create(ctx) as HubContext;
    local.onLeave = undefined;
    const page_ = h("div", { class: "hub-page" });
    page_.dataset.page = def.id;
    const renderer = opts.flowPages[def.id];
    let activate: (() => void) | undefined;
    page_.classList.add("m-layer");
    page_.setAttribute("aria-hidden", "true");
    stage.append(page_);
    if (renderer) {
      await renderer(page_, local);
    } else {
      page_.append(hero(def.id, def.title(), def.subtitle?.() ?? null));
      const container = h("div", { id: prefetch ? "settings-root-next" : "settings-root" });
      page_.append(container);
      activate = (await opts.renderNotch(def.id, container, prefetch)) ?? undefined;
    }
    return { id: def.id, el: page_, local, activate, at: Date.now(), epoch };
  }

  function drop(b: Built | null) {
    if (!b) return;
    b.local.onLeave?.();
    b.el.remove();
  }

  async function prefetch(id: PageId) {
    if (reducedMotion() || id === current || pre?.id === id || !windowShown()) return;
    const def = ALL.find((p) => p.id === id);
    if (!def) return;
    const mine = epoch;
    drop(pre);
    pre = null;
    const b = await build(def, true);
    if (mine !== epoch || id === current) { drop(b); return; }
    b.el.dataset.ready = "1";
    pre = b;
  }

  function idle(fn: () => void) {
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 1500 }); else window.setTimeout(fn, 300);
  }

  async function show(page: PageId) {
    const def = ALL.find((p) => p.id === page) ?? FLOW_PAGES[0];
    const from = ALL.findIndex((p) => p.id === current), to = ALL.findIndex((p) => p.id === def.id);
    navDir = from < 0 || to === from ? 0 : to > from ? 1 : -1;
    active?.local.onLeave?.();
    if (active) active.local.onLeave = undefined;
    current = def.id;
    for (const [id, el] of items) el.classList.toggle("on", id === current);
    const token = ++rendering;
    let next: Built;
    const kept = alive.get(def.id);
    if (kept && kept.epoch === epoch && Date.now() - kept.at < 60_000) {
      next = kept;
    } else if (pre && pre.id === def.id && Date.now() - pre.at < 20_000) {
      next = pre;
      pre = null;
      if (next.el.querySelector("#settings-root-next")) next.el.querySelector("#settings-root-next")!.id = "settings-root";
    } else {
      drop(pre);
      pre = null;
      next = await build(def, false);
    }
    if (token !== rendering) { drop(next); return; }
    next.activate?.();
    active = next;
    if (next.activate) { next.at = Date.now(); alive.set(next.id, next); }
    await swapPage(next.el, token);
    // No ócio: a próxima página da lista fica pronta.
    const i = ALL.findIndex((p) => p.id === current);
    const after = ALL[i + 1]?.id;
    // Depois da entrada e de uma pausa: montar no meio de uma animação custaria quadros.
    const mine = rendering;
    if (after) window.setTimeout(() => idle(() => { if (mine === rendering) void prefetch(after); }), 700);
  }

  /**
   * Troca sem engasgar: a página nova é montada e medida antes (opaca 0, na
   * mesma célula de grade da antiga), e só então as duas se cruzam com
   * transform/opacity. Nenhum layout acontece durante a animação.
   */
  async function swapPage(page_: HTMLElement, token: number) {
    const motion = !reducedMotion();
    // Montada agora há pouco: dois quadros para estilo/layout/pintura acontecerem escondidos.
    if (motion && !page_.dataset.ready) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (token !== rendering) { page_.remove(); return; }
    }
    page_.dataset.ready = "1";
    // Lido antes de mexer nas classes (layout limpo, leitura barata); escrito só se preciso.
    const scrolled = scroll.scrollTop !== 0;
    for (const el of [...stage.children] as HTMLElement[]) {
      if (el === page_ || el.classList.contains("m-layer")) continue;
      const id = el.dataset.page as PageId | undefined;
      const keep = !!id && (alive.get(id)?.el === el || pre?.el === el);
      const park = () => {
        el.classList.remove("m-entering", "m-leaving");
        if (keep) { el.classList.add("m-layer"); el.setAttribute("aria-hidden", "true"); } else el.remove();
      };
      // Fase 18: a página que sai cruza com a que entra, deslizando para o lado oposto.
      if (motion && el.classList.contains("hub-page")) {
        el.style.setProperty("--m-dir", String(navDir));
        el.classList.remove("m-entering");
        el.classList.add("m-leaving");
        window.setTimeout(() => {
          if (el === active?.el) { el.classList.remove("m-leaving"); return; }
          if (!el.classList.contains("m-layer")) park();
        }, Durations.fast);
      } else park();
    }
    page_.style.setProperty("--m-dir", String(navDir));
    page_.classList.remove("m-layer", "m-leaving");
    page_.removeAttribute("aria-hidden");
    if (scrolled) scroll.scrollTop = 0;
    if (!motion) return;
    page_.classList.add("m-entering");
    animatePage(page_);
    await new Promise((r) => setTimeout(r, Durations.slow));
    page_.classList.remove("m-entering");
  }

  parallax(scroll, () => scroll.querySelector<HTMLElement>(".hub-hero"));

  // ── The sidebar ──
  const side = h("nav", { class: "hub-side" });
  const logo = h("span", { class: "bf-brand-raven" });
  side.append(h("div", { class: "hub-brand" }, logo, h("span", { text: "Bifrost" })));
  liveRaven(logo);
  // Fase 13: navegação própria do Bifrost — em vez da barra lateral, dois "reinos"
  // (Voz e Ilha) numa ponte horizontal no topo; cada página é uma runa-ícone, e o
  // nome aparece só na escolhida (e no title). Mesmas páginas, mesma ordem.
  const group = (title: string, pages: PageDef[]) => {
    const realm = h("div", { class: "hub-realm" });
    realm.append(h("div", { class: "hub-group", text: title }));
    const rail = h("div", { class: "hub-rail" });
    for (const p of pages) {
      const b = h("button", { class: "hub-item", title: p.title(), "aria-label": p.title(), onclick: () => void show(p.id) });
      b.append(icon(p.icon), h("span", { text: p.title() }));
      items.set(p.id, b);
      rail.append(b);
    }
    realm.append(rail);
    side.append(realm);
  };
  group("Voz", FLOW_PAGES);
  group("Ilha", NOTCH_PAGES);
  group("Forja", FORGE_PAGES);
  side.append(h("div", { class: "spacer" }), h("div", { class: "hub-meta" }, statusLine, h("div", { class: "hub-version", text: `Bifrost ${opts.version}` })));
  // Fase 18: a seleção desliza entre as runas (inclusive de um reino para o outro).
  slidingInk(side, ".hub-item.on", "hub");

  clear(root);
  root.append(side, h("main", { class: "hub-panel" }, scroll));
  drawStatus();
  await show(current);

  void onEvent<string>("hub-page", (page) => {
    const id = (page === "settings" ? "flowsettings" : page) as PageId;
    if (ALL.some((p) => p.id === id)) void show(id);
  });
  void onEvent<FlowPrefs>("flow-prefs", (prefs) => {
    status = { ...status, prefs };
    drawStatus();
  });
  void onEvent<ModelsStatus>("speech-models", (models) => {
    status = { ...status, models };
    drawStatus();
  });
  return {
    redraw: () => { epoch++; drop(pre); pre = null; for (const b of alive.values()) if (b !== active) b.el.remove(); alive.clear(); void show(current); },
    current: () => current,
  };
}
