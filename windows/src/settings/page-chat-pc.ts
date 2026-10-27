// Ajustes da ilha — parte de settings/main.ts, separada por página.

import { formBtn } from "../views/kit";
import { Bridge } from "../core/bridge";
import { h, clear } from "../views/dom";

import { save, S } from "./store";

// ── IAs do PC ────────────────────────────────────────────────────────────────

/** As IAs instaladas que respondem o chat sem chave nenhuma. */
export function aiSection(): HTMLElement {
  const body = h("div", { class: "bf-ai-grid" });
  const section = h("section", { class: "bf-section" },
    h("h2", {}, h("span", { class: "bf-rune", text: "ᚨ" }), h("span", { text: "IAs do seu PC" })),
    h("div", { class: "hint", text: "O Huginn conversa pelas IAs que você já tem instaladas, com o login delas. Nada de chave: escolha uma e pronto." }),
    body,
  );
  const draw = async () => {
    clear(body);
    const scan = await Bridge.mcpScan().catch(() => null);
    const ais = [
      { id: "claude", name: "Claude Code", provider: "cli" as const },
      { id: "codex", name: "Codex CLI", provider: "cli" as const },
      { id: "gemini", name: "Gemini CLI", provider: "cli" as const },
      { id: "ollama", name: "Ollama", provider: "ollama" as const },
      { id: "lmstudio", name: "LM Studio", provider: "lmstudio" as const },
    ];
    for (const ai of ais) {
      const found = scan?.programs.find((p) => p.id === ai.id)?.found ?? false;
      const inUse = S.settings.chatProvider === ai.provider && (ai.provider !== "cli" || (S.settings.chatModels.cli ?? "claude") === ai.id);
      const use = formBtn(inUse ? "Em uso" : "Usar no chat", inUse ? "plain" : "primary") as HTMLButtonElement;
      use.disabled = inUse || !found;
      use.addEventListener("click", async () => {
        S.settings.chatProvider = ai.provider;
        if (ai.provider === "cli") S.settings.chatModels = { ...S.settings.chatModels, cli: ai.id };
        if (ai.provider === "ollama" && !S.settings.ollamaUrl) S.settings.ollamaUrl = "http://127.0.0.1:11434";
        if (ai.provider === "lmstudio" && !S.settings.lmstudioUrl) S.settings.lmstudioUrl = "http://127.0.0.1:1234";
        await save();
        void draw();
      });
      body.append(h("div", { class: `bf-ai-card${found ? " found" : ""}${inUse ? " active" : ""}` },
        h("span", { class: "bf-ai-name", text: ai.name }),
        h("span", { class: `bf-badge ${found ? "ok" : "off"}`, text: found ? "detectado" : "não instalado" }),
        use,
      ));
    }
  };
  void draw();
  return section;
}

