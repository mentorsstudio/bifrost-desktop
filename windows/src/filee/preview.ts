// Prévias ao vivo dos estilos do anel (Ajustes): o mesmo desenho da janela do
// gesto (donut.ts), já aberto, com fatias de exemplo de uma imagem PNG e o
// mouse sobre "JPG". Seguem o tema e o personagem ativos.

import "./menu.css";
import { Mascot } from "../bifrost/mascots";
import type { RingSlice } from "./api";
import { Donut } from "./donut";
import { RING_STYLES, chooseRingStyle, readRingStyle, type RingStyle } from "./ring-style";

const S = (id: string, label: string, enabled = true, caption: string | null = null, reason: string | null = null): RingSlice =>
  ({ id, action: id, label, caption, enabled, reason, needs: null, children: [] }) as RingSlice;

export const SAMPLE: RingSlice[] = [
  S("to-png", "PNG", false, null, "Mesmo formato"), S("to-jpg", "JPG"), S("to-webp", "WEBP"), S("to-pdf", "PDF"),
  S("to-tiff", "TIFF"), S("half", "Tamanho 50%", true, "PNG"), S("compress", "Comprimir", true, "PNG"),
  S("ask", "Enviar para a IA", true, "Grupo de 6"), S("open", "Abrir no Conversor", true, "Bifrost"),
];

/** Um anel estático num quadro de `size` px. */
export function ringPreview(style: RingStyle, size = 168): HTMLElement {
  const frame = document.createElement("div");
  frame.className = "fm-style-frame";
  frame.style.width = frame.style.height = `${size}px`;
  const root = document.createElement("div");
  root.className = "fm-ring fm-preview shown open";
  root.style.transform = `scale(${size / 460})`;
  frame.append(root);
  const d = new Donut(root, () => true);
  d.setStyle(style);
  new Mascot("huginn", d.ravenBox);
  d.hubIcon.append(Object.assign(document.createElement("span"), { className: "fm-file-rune c-image", textContent: "ᛒ" }));
  d.hubTitle.textContent = "1 × PNG";
  // A dica da fatia acesa (JPG): curta, cabe no miolo pequeno da prévia com folga.
  d.hint("Solte → JPG");
  // As medidas dos rótulos precisam do quadro no documento.
  requestAnimationFrame(() => { d.draw(SAMPLE); d.mark({ kind: "slice", index: 1 }); });
  return frame;
}

/** Os quatro estilos lado a lado, cada um com a prévia; clicar escolhe. */
export function ringStylePicker(): HTMLElement {
  const box = document.createElement("div");
  box.className = "fm-style-cards";
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", "Estilo do anel");
  let current = readRingStyle();
  const cards = RING_STYLES.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fm-style-card";
    b.setAttribute("role", "radio");
    b.title = s.tagline;
    const name = document.createElement("strong");
    name.textContent = s.name;
    const tag = document.createElement("span");
    tag.textContent = s.tagline;
    b.append(ringPreview(s.id), name, tag);
    b.addEventListener("click", () => { current = s.id; chooseRingStyle(s.id); sync(); });
    return { b, id: s.id };
  });
  const sync = () => cards.forEach(({ b, id }) => { b.classList.toggle("on", id === current); b.setAttribute("aria-checked", String(id === current)); });
  sync();
  box.append(...cards.map((c) => c.b));
  return box;
}
