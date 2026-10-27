// O estilo do anel do gesto (Ajustes › Gesto do Huginn e Conversor). A função
// segue a do Filee; o visual é nosso: quatro estilos, todos recoloridos pelo
// tema nórdico ativo. Fica no localStorage do WebView2 (compartilhado por todas
// as janelas), lido a cada vez que o anel abre.

export type RingStyle = "runa" | "aurora" | "escudo" | "minimal";

export const RING_STYLES: readonly { id: RingStyle; name: string; tagline: string }[] = [
  { id: "runa", name: "Runa", tagline: "Pedra entalhada, separadores de runa e um cinto de futhark na borda." },
  { id: "aurora", name: "Aurora", tagline: "Vidro escuro com a borda acesa nas cores da ponte Bifröst." },
  { id: "escudo", name: "Escudo", tagline: "Tábuas de madeira de um escudo redondo, aro e umbo de metal." },
  { id: "minimal", name: "Minimal", tagline: "Liso e discreto: só o anel, linhas finas e o realce do tema." },
];

export const DEFAULT_RING_STYLE: RingStyle = "runa";
export const RING_STYLE_KEY = "bifrost.ringStyle";

export function ringStyleById(id: string | null | undefined): RingStyle {
  return RING_STYLES.find((s) => s.id === id)?.id ?? DEFAULT_RING_STYLE;
}

export function readRingStyle(): RingStyle {
  try {
    const forced = new URLSearchParams(globalThis.location?.search ?? "").get("ring");
    return ringStyleById(forced ?? globalThis.localStorage?.getItem(RING_STYLE_KEY));
  } catch {
    return DEFAULT_RING_STYLE;
  }
}

export function chooseRingStyle(id: RingStyle): void {
  try { globalThis.localStorage?.setItem(RING_STYLE_KEY, id); } catch { /* sem armazenamento */ }
}

/** O cinto de runas da borda (futhark antigo, repetido). */
export const FUTHARK = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
