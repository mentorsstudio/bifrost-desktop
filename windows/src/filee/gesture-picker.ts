// O gravador do gatilho do anel ("aperte a combinação"), usado em Ajustes e no Conversor.

import { h } from "../views/dom";
import { DEFAULT_GESTURE, gestureLabel, gestureProblem, parseGesture, recordGesture } from "../core/gesture-trigger";

export function gesturePicker(value: string, holdMs: number, onPick: (id: string) => void): HTMLElement {
  const wrap = h("span", { class: "bf-rec" });
  const cap = h("button", { class: "bf-rec-cap", type: "button", title: "Clique e faça o gesto: segure os modificadores e aperte um botão do mouse (não o esquerdo). Esc cancela." }) as HTMLButtonElement;
  const reset = h("button", { class: "bf-rec-reset", type: "button", text: "Padrão", title: `Volta para ${gestureLabel(DEFAULT_GESTURE)}` }) as HTMLButtonElement;
  const note = h("span", { class: "bf-rec-note" });
  const show = (id: string) => { cap.textContent = gestureLabel(id); reset.hidden = id === DEFAULT_GESTURE; };
  show(value);
  let stop: (() => void) | null = null;
  cap.addEventListener("click", () => {
    if (stop) return;
    cap.textContent = "Faça o gesto…";
    cap.classList.add("on");
    note.textContent = "";
    stop = recordGesture(document.body, holdMs, (id) => {
      stop = null;
      cap.classList.remove("on");
      const g = id ? parseGesture(id) : null;
      const bad = g ? gestureProblem(g) : null;
      if (!id || bad) { note.textContent = bad ?? ""; show(value); return; }
      value = id; show(id); onPick(id);
    });
  });
  reset.addEventListener("click", () => { value = DEFAULT_GESTURE; show(value); onPick(value); });
  wrap.append(cap, reset, note);
  return wrap;
}
