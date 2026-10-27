// Ajustes › Gesto do Huginn e Conversor: liga o Ctrl + botão direito sobre um
// arquivo, escolhe o gatilho e a entrada "Bifrost ›" do Explorador. As mesmas
// opções aparecem na página Conversor (src/hub/pages/converter.ts).

import { h } from "../views/dom";
import { choice } from "../views/kit";
import { toggle } from "./store";
import { Convert, type FileePrefs } from "../filee/api";

export function fileeSection(): HTMLElement {
  const box = h("section", {}, h("h2", {}, h("span", { text: "Gesto do Huginn e Conversor" })));
  const body = h("div", {});
  box.append(body);
  let prefs: FileePrefs = { gesture: true, trigger: "ctrl-hold", holdMs: 280, contextMenu: false, outDir: "" };
  const save = async () => { prefs = (await Convert.setPrefs(prefs).catch(() => null)) ?? prefs; void checkFilee(); };
  const filee = h("div", { class: "hint" });
  // O Filee instalado: mostra os gatilhos dele e avisa se o nosso briga.
  const checkFilee = async () => {
    const st = await Convert.gestureStatus(prefs.trigger).catch(() => null);
    filee.textContent = !st?.filee ? "" : st.conflict ?? `O Filee também está instalado (${st.fileeTriggers.join(", ") || "sem gatilhos"}). Sem conflito com este gatilho.`;
    filee.classList.toggle("warn", !!st?.conflict);
  };
  const draw = () => {
    body.replaceChildren();
    void checkFilee();
    const trig = choice([["ctrl-hold", "Ctrl + segurar o botão direito"], ["ctrl", "Ctrl + clique direito"], ["ctrl-alt", "Ctrl + Alt + clique direito"], ["alt-hold", "Alt + segurar o botão direito"]], prefs.trigger, (v) => { prefs.trigger = v as FileePrefs["trigger"]; void save(); });
    body.append(
      h("div", { class: "row" }, h("label", { text: "Ctrl + botão direito sobre um arquivo" }), toggle(prefs.gesture, (v) => { prefs.gesture = v; void save(); })),
      h("div", { class: "hint", text: "No Explorador ou na área de trabalho, um anel de fatias abre em volta do cursor com as conversões do tipo do arquivo (como no Filee), mais comprimir, redimensionar, enviar para a IA e abrir no Conversor. Solte no meio para cancelar. Sem o Ctrl, o clique direito continua normal." }),
      h("div", { class: "row" }, h("label", { text: "Gatilho" }), trig),
      filee,
      h("div", { class: "row" }, h("label", { text: "“Bifrost ›” no menu do Explorador" }), toggle(prefs.contextMenu, (v) => { prefs.contextMenu = v; void save(); })),
      h("div", { class: "hint", text: "Entrada clássica do menu do botão direito (no Windows 11, em “Mostrar mais opções”). Só para o seu usuário, sem administrador. Desligada por padrão." }),
    );
  };
  draw();
  void Convert.prefs().then((p) => { if (p) { prefs = p; draw(); } }).catch(() => undefined);
  return box;
}
