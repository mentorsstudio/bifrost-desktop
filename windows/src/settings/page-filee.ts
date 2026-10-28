// Ajustes › Gesto do Huginn e Conversor: liga o gesto sobre um arquivo, grava o
// gatilho e a entrada "Bifrost ›" do Explorador. As mesmas opções aparecem na
// página Conversor (src/hub/pages/converter.ts).
// v25: cada opção numa linha (título e descrição à esquerda, controle à direita),
// sem nada sobreposto ao texto.

import { h } from "../views/dom";
import { toggle } from "./store";
import { Convert, type FileePrefs } from "../filee/api";
import { ringStylePicker } from "../filee/preview";
import { gesturePicker } from "../filee/gesture-picker";
import { gestureShort } from "../core/gesture-trigger";

function setRow(title: string, detail: string | null, control: HTMLElement | null): HTMLElement {
  return h("div", { class: "bf-setrow" },
    h("div", { class: "bf-setrow-text" }, h("div", { class: "bf-setrow-title", text: title }), detail ? h("div", { class: "bf-setrow-detail", text: detail }) : null),
    control ? h("div", { class: "bf-setrow-ctl" }, control) : null);
}

export function fileeSection(): HTMLElement {
  const box = h("section", {}, h("h2", {}, h("span", { text: "Gesto do Huginn e Conversor" })));
  const body = h("div", { class: "bf-setlist" });
  box.append(body);
  let prefs: FileePrefs = { gesture: true, trigger: "ctrl-hold", holdMs: 280, contextMenu: false, outDir: "" };
  const save = async () => { prefs = (await Convert.setPrefs(prefs).catch(() => null)) ?? prefs; void check(); };
  const warn = h("div", { class: "bf-setrow-warn" });
  // Outro programa já usa o mesmo gesto: um aviso genérico, sem nomear ninguém.
  const check = async () => {
    const st = await Convert.gestureStatus(prefs.trigger).catch(() => null);
    warn.textContent = st?.conflict ? "Outro programa já usa este gesto. Escolha outro gatilho para o anel do Bifrost abrir." : "";
  };
  const draw = () => {
    body.replaceChildren(
      setRow(`${gestureShort(prefs.trigger)} sobre um arquivo`, "No Explorador ou na área de trabalho, um anel de fatias abre em volta do cursor com as conversões do tipo do arquivo, mais comprimir, redimensionar, enviar para a IA e abrir no Conversor. Solte no meio para cancelar.", toggle(prefs.gesture, (v) => { prefs.gesture = v; void save(); })),
      setRow("Gatilho", "Clique no botão e faça o gesto: segure os modificadores e aperte um botão do mouse (não o esquerdo). Esc cancela.", gesturePicker(prefs.trigger, prefs.holdMs, (v) => { prefs.trigger = v; void save().then(draw); })),
      warn,
      setRow("Estilo do anel", "O anel segue o tema nórdico e o personagem escolhidos. A função é a mesma em todos os estilos.", null),
      ringStylePicker(),
      setRow("“Bifrost ›” no menu do Explorador", "Entrada clássica do menu do botão direito (no Windows 11, em “Mostrar mais opções”). Só para o seu usuário, sem administrador.", toggle(prefs.contextMenu, (v) => { prefs.contextMenu = v; void save(); })),
    );
    void check();
  };
  draw();
  void Convert.prefs().then((p) => { if (p) { prefs = p; draw(); } }).catch(() => undefined);
  return box;
}
