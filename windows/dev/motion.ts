// Página de captura do sistema de movimento (dev only).
import "../src/bifrost/nordic.css";
import { Mascot, MASCOT_STATES, type MascotState } from "../src/bifrost/mascots";
import { showMenu } from "../src/bifrost/contextmenu";

const stage = document.getElementById("stage")!;
const states = MASCOT_STATES.filter((s) => s !== "blink");
const cells: { m: Mascot; s: MascotState }[] = [];
states.forEach((s, i) => {
  const cell = document.createElement("div");
  cell.className = "cell bf-card";
  const m = new Mascot(i % 2 ? "muninn" : "huginn", cell);
  const label = document.createElement("span");
  label.textContent = ({ idle: "parado", flyIn: "chegando", flyOut: "partindo", thinking: "pensando", listening: "ouvindo", success: "feito", error: "erro", sleeping: "dormindo" } as Record<string, string>)[s] ?? s;
  cell.append(label);
  stage.append(cell);
  m.set(s);
  cells.push({ m, s });
});
// Voo em laço para o vídeo.
setInterval(() => {
  for (const c of cells) if (c.s === "flyIn" || c.s === "flyOut" || c.s === "success" || c.s === "error") {
    c.m.set("idle");
    requestAnimationFrame(() => c.m.set(c.s));
  }
}, 2200);
(window as unknown as { menu: () => void }).menu = () =>
  // Abre logo abaixo da grade, alinhado ao último cartão, sem cobrir nenhum estado.
  showMenu(
    (document.querySelector(".cell:last-child, [class*=cell]:last-child") as HTMLElement | null)?.getBoundingClientRect().left ?? window.innerWidth - 230,
    Math.max(...Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((e) => e.childElementCount && e.getBoundingClientRect().height < 220).map((e) => e.getBoundingClientRect().bottom).filter((b) => b < window.innerHeight)) + 14, [
    { label: "Abrir conversa", rune: "ᚺ", run: () => {} },
    { label: "Copiar", rune: "ᚷ", run: () => {} },
    { label: "Colar", rune: "ᛈ", run: () => {} },
    { label: "Configurações", rune: "ᛟ", run: () => {} },
  ]);
