// Os adornos do Huginn — a lógica pura. Escolhidos na vista "Adornos" (clique
// direito no Huginn, ou no menu da bandeja) e guardados nas preferências como
// `mochiOutfit` (nome da chave mantido por compatibilidade). O desenho fica em ./outfits.ts.

import { N_, labels, t } from "../i18n/i18n";

/** Every outfit, plus "auto" (dress for the season) and "none". Order of the wardrobe. */
export const OUTFIT_SELECTIONS = [
  "auto", "none", "auroraHalo", "runeBand", "frostScarf", "starCrown", "helm", "lantern",
] as const;

/** What can be stored in the preferences. The raw values are the Mac's, keep them stable. */
export type OutfitSelection = (typeof OUTFIT_SELECTIONS)[number];

/** What Huginn actually wears: a selection with "auto" resolved. */
export type Outfit = Exclude<OutfitSelection, "auto">;

export const DEFAULT_OUTFIT: OutfitSelection = "auto";

// ── User-visible strings ──────────────────────────────────────────────────────

/** The English names, the keys of their translations (src/i18n). */
export const OUTFIT_KEYS: Record<OutfitSelection, string> = {
  auto: N_("Auto (seasons)"),
  none: N_("None"),
  auroraHalo: N_("Aurora halo"),
  runeBand: N_("Rune band"),
  frostScarf: N_("Frost scarf"),
  starCrown: N_("Star crown"),
  helm: N_("Helm"),
  lantern: N_("Lantern"),
};

/** In the current language: every read goes through `t()`. */
export const OUTFIT_LABELS: Record<OutfitSelection, string> = labels(OUTFIT_KEYS);

export const WARDROBE_STRINGS = {
  get title() { return t("Adornments"); },
  get autoBadge() { return t("AUTO"); },
  autoNow: (current: string) => t("Auto · {outfit}", { outfit: current }),
  autoHover: (current: string) => t("Auto · follows the seasons (now: {outfit})", { outfit: current }),
};

// ── Logic ─────────────────────────────────────────────────────────────────────

const SELECTION_SET: ReadonlySet<string> = new Set(OUTFIT_SELECTIONS);

/**
 * A stored preference → a selection. Anything unknown (a value from a newer or
 * older build, such as the Mac's removed "topHat", or garbage) means "auto",
 * exactly like `Outfit.stored` on macOS.
 */
export function parseOutfit(raw: unknown): OutfitSelection {
  return typeof raw === "string" && SELECTION_SET.has(raw) ? (raw as OutfitSelection) : DEFAULT_OUTFIT;
}

/** Easter Sunday of `year` (Meeus/Jones/Butcher), as [month 1–12, day]. */
export function easterDate(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const DAY_MS = 86_400_000;

/**
 * O adorno da estação para `date`, no calendário local do usuário.
 * Prioridade: Yule (21 dez – 6 jan) cachecol de gelo > solstício de verão
 * (19–25 jun) coroa de estrelas > noites longas (31 out – 2 nov) lanterna >
 * equinócio de primavera (Páscoa −2…+1) faixa de runas > nada.
 */
export function seasonalOutfit(date: Date): Outfit {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if ((month === 12 && day >= 21) || (month === 1 && day <= 6)) return "frostScarf";
  if (month === 6 && day >= 19 && day <= 25) return "starCrown";
  if ((month === 10 && day === 31) || (month === 11 && day <= 2)) return "lantern";
  // Calendar days counted in UTC so a daylight-saving change can't shift the count.
  const [em, ed] = easterDate(year);
  const delta = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, em - 1, ed)) / DAY_MS);
  if (delta >= -2 && delta <= 1) return "runeBand";
  return "none";
}

/** "auto" → the season's outfit; anything else is worn as chosen. */
export function resolveOutfit(selection: OutfitSelection, date: Date): Outfit {
  return selection === "auto" ? seasonalOutfit(date) : selection;
}

/**
 * The grey text at the right of the wardrobe header: the hovered outfit,
 * otherwise the current choice — WardrobeView.headerRight on macOS.
 */
export function wardrobeHeader(
  hovered: OutfitSelection | null,
  selection: OutfitSelection,
  date: Date,
): string {
  const season = OUTFIT_LABELS[seasonalOutfit(date)];
  if (hovered) return hovered === "auto" ? WARDROBE_STRINGS.autoHover(season) : OUTFIT_LABELS[hovered];
  return selection === "auto" ? WARDROBE_STRINGS.autoNow(season) : OUTFIT_LABELS[selection];
}

/** Same as resolveOutfit, remembered for the day — it is asked every frame. */
export class SeasonCache {
  private key = "";
  private value: Outfit = "none";

  get(selection: OutfitSelection, date = new Date()): Outfit {
    if (selection !== "auto") return selection;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (key !== this.key) {
      this.key = key;
      this.value = seasonalOutfit(date);
    }
    return this.value;
  }
}
