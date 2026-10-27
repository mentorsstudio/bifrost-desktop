// A ponte do Conversor (Filee no Bifrost): comandos e eventos do Rust
// (src-tauri/src/convert e src-tauri/src/gesture). Fora do Tauri tudo é nulo,
// para as páginas de desenvolvimento.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[filee] ${cmd}`, err);
    throw err;
  }
}

export type Category = "image" | "vector" | "pdf" | "document" | "text" | "audio" | "video" | "archive" | "other";
export type ToolId = "ffmpeg" | "pdfium" | "pandoc" | "libreoffice" | "magick" | "7zip";

export interface FileInfo { path: string; name: string; ext: string; category: Category; categoryLabel: string; size: number }
export interface TargetInfo { id: string; label: string; group: "convert" | "tools"; needs: ToolId | null; ready: boolean; needsLabel: string | null }
export interface ToolStatus { id: ToolId; label: string; path: string | null; downloadable: boolean; downloadMb: number; hint: string }
export interface RingSlice { id: string; action: string; label: string; caption: string | null; enabled: boolean; reason: string | null; needs: ToolId | null; children: RingSlice[] }
export interface Ring { profile: string; title: string; slices: RingSlice[] }
export interface Plan { files: FileInfo[]; targets: TargetInfo[]; tools: ToolStatus[]; ring?: Ring }
export interface Options { quality?: number; maxSide?: number; percent?: number; outDir?: string; dpi?: number }
export type ItemState = "queued" | "running" | "done" | "failed" | "cancelled";
export interface ItemReport { job: number; index: number; name: string; state: ItemState; progress: number; outputs: string[]; error: string | null }
export interface FileePrefs { gesture: boolean; trigger: "ctrl-hold" | "ctrl" | "ctrl-alt" | "alt-hold"; holdMs: number; contextMenu: boolean; outDir: string }
export interface GestureStatus { conflict: string | null; filee: boolean; fileeTriggers: string[] }
export interface ToolProgress { id: ToolId; got: number; total: number; done: boolean; error: string | null }

export const Convert = {
  plan: (paths: string[]) => call<Plan>("convert_plan", { paths }),
  tools: () => call<ToolStatus[]>("convert_tools"),
  installTool: (id: ToolId) => call<string>("convert_install_tool", { id }),
  start: (paths: string[], action: string, options: Options = {}) => call<number>("convert_start", { spec: { paths, action, options } }),
  cancel: (job: number) => call<void>("convert_cancel", { job }),
  reveal: (path: string) => call<void>("convert_reveal", { path }),
  extractText: (path: string) => call<string>("convert_extract_text", { path }),
  prefs: () => call<FileePrefs>("convert_prefs"),
  setPrefs: (prefs: FileePrefs) => call<FileePrefs>("convert_set_prefs", { prefs }),
  pickFiles: () => call<string[]>("convert_pick_files"),
  takePending: () => call<string[]>("convert_take_pending"),
  menuAction: (action: string, paths: string[], prompt?: string) => call<number | null>("filee_menu_action", { action, paths, prompt: prompt ?? null }),
  menuClose: () => call<void>("filee_menu_close"),
  gestureStatus: (trigger: string) => call<GestureStatus>("filee_gesture_status", { trigger }),
  menuRadius: (radius: number) => call<void>("filee_menu_radius", { radius }),
};

export async function on<T>(name: string, fn: (p: T) => void): Promise<() => void> {
  if (!IS_TAURI) return () => {};
  return listen<T>(name, (e) => fn(e.payload));
}

// ── Textos e ícones ──────────────────────────────────────────────────────────

/** Os atalhos de pergunta do "Enviar para a IA". */
export const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  { label: "O que é isso?", prompt: "O que é este arquivo? Diga em poucas linhas do que se trata." },
  { label: "Resumir", prompt: "Resuma este arquivo em tópicos curtos." },
  { label: "Explicar", prompt: "Explique este arquivo de forma simples, como para alguém que nunca o viu." },
  { label: "Extrair dados", prompt: "Extraia os dados importantes deste arquivo (nomes, datas, valores, contatos) numa lista organizada." },
  { label: "Traduzir", prompt: "Traduza o conteúdo deste arquivo para o português do Brasil." },
];

/** Runa de cada categoria (a identidade nórdica do Bifrost). */
export const CATEGORY_RUNE: Record<Category, string> = {
  image: "ᛒ", vector: "ᚹ", pdf: "ᛈ", document: "ᛞ", text: "ᛏ", audio: "ᛚ", video: "ᚢ", archive: "ᚨ", other: "ᛟ",
};

export const TOOL_ACTION_LABEL: Record<string, string> = {
  compress: "Comprimir",
  resize: "Redimensionar",
  "merge-pdf": "Juntar PDFs",
  "split-pdf": "Dividir páginas",
  text: "Extrair texto",
  extract: "Extrair aqui",
  zip: "Compactar em ZIP",
};

export function actionLabel(id: string): string {
  if (id.startsWith("to:")) return `Converter para ${id.slice(3).toUpperCase()}`;
  return TOOL_ACTION_LABEL[id] ?? id;
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}

export function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Os 5 formatos que aparecem primeiro no balão, por categoria. */
export function topTargets(targets: TargetInfo[], max = 6): TargetInfo[] {
  return targets.filter((t) => t.group === "convert").slice(0, max);
}
