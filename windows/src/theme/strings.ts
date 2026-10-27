// Fase 18: textos do motor de temas, em pt-BR (a língua da interface do Bifrost).
export const THEME_TXT = {
  pageTitle: "Temas",
  pageSubtitle: "A cara do Bifrost e dos corvos — todos da mitologia nórdica.",
  intro: "Escolha um reino. A troca vale na hora para a ilha, o hub, a pílula, a bandeja e os corvos da área de trabalho.",
  inUse: "Em uso",
  apply: "Usar este tema",
  trayLabel: "Tema",
  menuTheme: "Tema: {0}",
} as const;

export const fmt = (s: string, ...a: string[]) => s.replace(/\{(\d)\}/g, (_, i) => a[Number(i)] ?? "");
