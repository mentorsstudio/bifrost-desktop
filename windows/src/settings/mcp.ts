// Settings → Chat → "Servidores MCP" (Paulo build): the agents the chat talks
// to without keys, how the chat reaches one of them, and Bifrost's own MCP
// server that lets Grok Bot, Hermes… drive Huginn.

import { formBtn, choice, textField } from "../views/kit";
import {
  Bridge, type McpChat, type McpServerConfig, type McpServerView, type McpStatus,
} from "../core/bridge";
import { MCP_NAME, clientSnippet, credentialFromForm, configFromForm, formFromConfig, type McpForm } from "../core/mcp";
import type { Settings } from "../core/state";
import { h, clear } from "../views/dom";
import { statusDot } from "./parts";
import { Mascot } from "../bifrost/mascots";
import { cascade } from "../bifrost/motion";

const notice = (kind: "err" | "ok" | "hint", text: string) =>
  h("div", { class: kind === "hint" ? "hint" : kind === "err" ? "notice err" : "notice", text });

function describe(c: McpServerConfig): string {
  return "url" in c ? c.url : [c.command, ...(c.args ?? [])].join(" ");
}

export function mcpSections(settings: Settings, save: () => Promise<void>): HTMLElement[] {
  const serversBody = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
  const chatBody = h("div", { style: "display:flex;flex-direction:column;gap:8px" });
  const ownBody = h("div", { style: "display:flex;flex-direction:column;gap:8px" });
  let status: McpStatus | null = null;

  const redraw = () => {
    drawServers();
    drawChat();
    drawOwn();
  };
  const load = async () => {
    status = await Bridge.mcpStatus();
    redraw();
  };

  // ── Servers ─────────────────────────────────────────────────────────────
  function drawServers() {
    clear(serversBody);
    if (!status) {
      serversBody.append(notice("hint", "Carregando…"));
      return;
    }
    if (!status.servers.length) serversBody.append(notice("hint", "Nenhum servidor ainda. Adicione um ou cole um JSON mcpServers."));
    for (const s of status.servers) serversBody.append(serverRow(s));
    const add = formBtn("Adicionar servidor", "primary");
    add.addEventListener("click", () => {
      clear(serversBody);
      serversBody.append(editor(null));
    });
    const imp = formBtn("Importar JSON");
    imp.addEventListener("click", () => {
      clear(serversBody);
      serversBody.append(importer());
    });
    serversBody.append(h("div", { class: "row" }, add, imp));
  }

  function serverRow(s: McpServerView): HTMLElement {
    const out = h("div", {});
    const edit = formBtn("Editar");
    edit.addEventListener("click", () => {
      clear(serversBody);
      serversBody.append(editor(s));
    });
    const test = formBtn("Testar");
    test.addEventListener("click", async () => {
      clear(out);
      out.append(notice("hint", "Conectando…"));
      try {
        const tools = await Bridge.mcpTest(s.name, s.config);
        clear(out);
        out.append(notice("ok", `Conectado — ${tools.length} ferramenta(s): ${tools.map((t) => t.name).join(", ")}`));
      } catch (err) {
        clear(out);
        out.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const remove = formBtn("Remover", "danger");
    remove.addEventListener("click", async () => {
      if (!confirm(`Remover o servidor ${s.name}?`)) return;
      status = await Bridge.mcpRemoveServer(s.name);
      redraw();
    });
    const kind = "url" in s.config ? "HTTP" : "stdio";
    return h(
      "div",
      { style: "display:flex;flex-direction:column;gap:4px" },
      h(
        "div",
        { class: "row" },
        h("label", {}, statusDot(!s.config.disabled), h("span", { text: ` ${s.name}`, style: "margin-left:6px" })),
        h("span", { class: "path", text: `${kind} · ${describe(s.config)}${s.hasToken ? " · token salvo" : ""}` }),
        test, edit, remove,
      ),
      out,
    );
  }

  function field(label: string, input: HTMLElement): HTMLElement {
    return h("div", { class: "row" }, h("label", { text: label }), input);
  }
  function input(value: string, placeholder = "", type = "text"): HTMLInputElement {
    return textField({ type, value, placeholder, spellcheck: "false", autocomplete: "off", style: "flex:1 1 auto;min-width:0" }) as HTMLInputElement;
  }
  function area(value: string, placeholder: string): HTMLTextAreaElement {
    const a = h("textarea", { placeholder, rows: "3", spellcheck: "false", style: "flex:1 1 auto;min-width:0;font-family:monospace" }) as HTMLTextAreaElement;
    a.value = value;
    return a;
  }

  function editor(existing: McpServerView | null): HTMLElement {
    const f: McpForm = formFromConfig(existing?.config ?? null);
    const name = input(existing?.name ?? "", "ex.: hermes");
    const kind = h("select", {}, h("option", { value: "stdio", text: "Comando (stdio)" }), h("option", { value: "http", text: "Remoto (Streamable HTTP)" })) as HTMLSelectElement;
    kind.value = f.kind;
    const command = input(f.command, "C:\\Users\\paulo\\AppData\\Local\\hermes\\bin\\hermes.exe");
    const args = input(f.args, "mcp-serve --tools");
    const env = area(f.env, "VAR=valor (uma por linha)");
    const url = input(f.url, "https://mcp.exemplo.com/mcp");
    const headers = area(f.headers, "Cabeçalho: valor (um por linha)");
    const token = input("", existing?.hasToken ? "•••• token salvo (deixe vazio para manter)" : "Token Bearer (opcional)", "password");
    const basicUser = input("", existing?.hasToken ? "(credencial salva — deixe vazio para manter)" : "Usuário (Basic Auth, opcional)");
    const basicPass = input("", "Senha (Basic Auth)", "password");
    const disabled = textField({ type: "checkbox" }) as HTMLInputElement;
    disabled.checked = f.disabled;
    const msg = h("div", {});
    const stdioRows = h("div", { style: "display:flex;flex-direction:column;gap:6px" }, field("Comando", command), field("Argumentos", args), field("Ambiente", env));
    const httpRows = h("div", { style: "display:flex;flex-direction:column;gap:6px" }, field("URL", url), field("Cabeçalhos", headers), field("Token Bearer", token),
      field("Usuário", basicUser), field("Senha", basicPass),
      notice("hint", "Use o token Bearer OU usuário + senha (Basic Auth, ex.: Traefik). A credencial vai para o cofre do sistema, nunca para o settings.json."));
    const sync = () => {
      stdioRows.style.display = kind.value === "stdio" ? "" : "none";
      httpRows.style.display = kind.value === "http" ? "" : "none";
    };
    kind.addEventListener("change", sync);
    sync();

    const read = (): { name: string; config: McpServerConfig } | string => {
      if (!MCP_NAME.test(name.value.trim())) return "Nome inválido (letras, números, - _ .).";
      const cfg = configFromForm({
        kind: kind.value as "stdio" | "http", command: command.value, args: args.value, env: env.value,
        url: url.value, headers: headers.value, disabled: disabled.checked,
      });
      return typeof cfg === "string" ? cfg : { name: name.value.trim(), config: cfg };
    };
    const show = (n: HTMLElement) => {
      clear(msg);
      msg.append(n);
    };
    const storeToken = async (n: string) => {
      if (kind.value !== "http") return;
      const c = credentialFromForm(basicUser.value, basicPass.value, token.value);
      if (typeof c === "string") throw new Error(c);
      if (c.kind === "basic") await Bridge.mcpSetBasicAuth(n, c.user, c.password);
      else if (c.kind === "token") await Bridge.mcpSetToken(n, c.token);
      token.value = basicPass.value = basicUser.value = "";
    };

    const test = formBtn("Testar conexão");
    test.addEventListener("click", async () => {
      const r = read();
      if (typeof r === "string") return show(notice("err", r));
      show(notice("hint", "Conectando…"));
      try {
        await storeToken(r.name);
        const tools = await Bridge.mcpTest(r.name, r.config);
        show(notice("ok", `tools/list OK — ${tools.length} ferramenta(s): ${tools.map((t) => t.name).join(", ")}`));
      } catch (err) {
        show(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const saveBtn = formBtn("Salvar", "primary");
    saveBtn.addEventListener("click", async () => {
      const r = read();
      if (typeof r === "string") return show(notice("err", r));
      try {
        await storeToken(r.name);
        status = await Bridge.mcpSaveServer(r.name, r.config, existing?.name ?? null);
        redraw();
      } catch (err) {
        show(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const clearToken = formBtn("Apagar credencial", "danger");
    clearToken.style.display = existing?.hasToken ? "" : "none";
    clearToken.addEventListener("click", async () => {
      await Bridge.mcpSetToken(existing!.name, "");
      status = await Bridge.mcpStatus();
      redraw();
    });
    const cancel = formBtn("Cancelar");
    cancel.addEventListener("click", redraw);

    return h(
      "div",
      { style: "display:flex;flex-direction:column;gap:6px" },
      field("Nome", name),
      field("Tipo", kind),
      stdioRows,
      httpRows,
      field("Desativado", disabled),
      h("div", { class: "row" }, saveBtn, test, clearToken, cancel),
      msg,
    );
  }

  function importer(): HTMLElement {
    const text = area("", '{\n  "mcpServers": {\n    "hermes": { "command": "hermes.exe", "args": ["mcp-serve", "--tools"] }\n  }\n}');
    text.rows = 10;
    const msg = h("div", {});
    const go = formBtn("Importar", "primary");
    go.addEventListener("click", async () => {
      try {
        status = await Bridge.mcpImport(text.value);
        redraw();
      } catch (err) {
        clear(msg);
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const cancel = formBtn("Cancelar");
    cancel.addEventListener("click", redraw);
    return h("div", { style: "display:flex;flex-direction:column;gap:6px" },
      notice("hint", "Cole um JSON no formato mcpServers (o mesmo do Claude Desktop, Cursor e Grok Bot). Tokens não vão no JSON: adicione-os em Editar."),
      text, h("div", { class: "row" }, go, cancel), msg);
  }

  // ── Chat through MCP ────────────────────────────────────────────────────
  function drawChat() {
    clear(chatBody);
    if (!status) return;
    const c: McpChat = { ...status.chat };
    const inUse = settings.chatProvider === "mcp";
    const use = formBtn(inUse ? "Em uso no chat" : "Usar MCP no chat", inUse ? "plain" : "primary");
    use.disabled = inUse;
    use.addEventListener("click", async () => {
      settings.chatProvider = "mcp";
      await save();
      drawChat();
    });
    const server = choice() as HTMLSelectElement;
    for (const s of status.servers) server.append(h("option", { value: s.name, text: s.name }));
    if (!status.servers.some((s) => s.name === c.server)) server.append(h("option", { value: c.server, text: `${c.server} (não configurado)` }));
    server.value = c.server;
    const mode = h("select", {},
      h("option", { value: "task", text: "Tarefa (iniciar + consultar status) — Hermes" }),
      h("option", { value: "tool", text: "Ferramenta única (a resposta vem na hora)" })) as HTMLSelectElement;
    mode.value = c.mode;
    const tool = input(c.tool, "hermes_task_start");
    const toolList = h("datalist", { id: "mcp-tools" });
    tool.setAttribute("list", "mcp-tools");
    const argument = input(c.argument, "prompt");
    const statusTool = input(c.statusTool, "hermes_task_status");
    statusTool.setAttribute("list", "mcp-tools");
    const idArg = input(c.idArgument, "job_id");
    const extra = area(JSON.stringify(c.extraArgs ?? {}), '{"skills": "..."}');
    extra.rows = 2;
    const timeout = input(String(c.timeoutSecs), "600", "number");
    const history = textField({ type: "checkbox" }) as HTMLInputElement;
    history.checked = c.includeHistory;
    const taskRows = h("div", { style: "display:flex;flex-direction:column;gap:6px" },
      field("Ferramenta de status", statusTool), field("Argumento do id", idArg), field("Tempo máx. (s)", timeout));
    const sync = () => (taskRows.style.display = mode.value === "task" ? "" : "none");
    mode.addEventListener("change", sync);
    sync();
    const msg = h("div", {});

    const loadTools = formBtn("Ver ferramentas");
    loadTools.addEventListener("click", async () => {
      clear(msg);
      try {
        const tools = await Bridge.mcpListTools(server.value);
        clear(toolList);
        for (const t of tools) toolList.append(h("option", { value: t.name, text: t.description.slice(0, 80) }));
        msg.append(notice("ok", tools.map((t) => t.name).join(", ") || "Nenhuma ferramenta."));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const saveBtn = formBtn("Salvar", "primary");
    saveBtn.addEventListener("click", async () => {
      clear(msg);
      let extraArgs: Record<string, unknown>;
      try {
        extraArgs = extra.value.trim() ? JSON.parse(extra.value) : {};
        if (typeof extraArgs !== "object" || Array.isArray(extraArgs) || extraArgs === null) throw new Error();
      } catch {
        msg.append(notice("err", "Argumentos extras: precisa ser um objeto JSON."));
        return;
      }
      try {
        status = await Bridge.mcpSetChat({
          server: server.value, mode: mode.value, tool: tool.value.trim(), argument: argument.value.trim(),
          extraArgs, statusTool: statusTool.value.trim(), idArgument: idArg.value.trim(),
          timeoutSecs: Math.max(10, Number(timeout.value) || 600), includeHistory: history.checked,
        });
        // The picker's choice of server would otherwise win over this one.
        settings.chatModels = { ...settings.chatModels, mcp: server.value };
        await save();
        msg.append(notice("ok", "Salvo."));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });

    chatBody.append(
      h("div", { class: "row" }, h("label", {}, statusDot(inUse), h("span", { text: " Provedor do chat", style: "margin-left:6px" })), use),
      field("Servidor", server),
      field("Modo", mode),
      field("Ferramenta", tool),
      toolList,
      field("Argumento da mensagem", argument),
      field("Argumentos extras", extra),
      taskRows,
      field("Enviar histórico", history),
      h("div", { class: "row" }, saveBtn, loadTools),
      msg,
    );
  }

  // ── Bifrost's own server ─────────────────────────────────────────────────
  function drawOwn() {
    clear(ownBody);
    if (!status) return;
    const on = textField({ type: "checkbox" }) as HTMLInputElement;
    on.checked = status.serverEnabled;
    const port = input(String(status.serverPort), "47821", "number");
    const msg = h("div", {});
    const saveBtn = formBtn("Salvar");
    saveBtn.addEventListener("click", async () => {
      clear(msg);
      try {
        status = await Bridge.mcpSetServer(on.checked, Number(port.value) || 47821);
        msg.append(notice("ok", "Salvo — vale a partir do próximo início do Bifrost."));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const copy = formBtn("Copiar config para clientes", "primary");
    copy.addEventListener("click", async () => {
      clear(msg);
      try {
        const token = await Bridge.mcpServerToken();
        await navigator.clipboard.writeText(clientSnippet(status!.serverUrl, token));
        msg.append(notice("ok", "JSON mcpServers copiado (com o token). Cole no Grok Bot, Hermes, Claude ou Cursor."));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    ownBody.append(
      notice("hint", `Endereço: ${status.serverUrl} — só neste computador, com token Bearer. Ferramentas: notify, ask_approval, show_session, update_session, end_session, chat.`),
      field("Ativado", on),
      field("Porta", port),
      h("div", { class: "row" }, saveBtn, copy),
      msg,
    );
  }

  // ── Detectados / catálogo ───────────────────────────────────────────────
  const detBody = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const huginn = new Mascot("huginn");
  const muninn = new Mascot("muninn");
  async function drawDetected() {
    clear(detBody);
    huginn.set("thinking");
    const scan = await Bridge.mcpScan().catch(() => null);
    if (!scan) {
      huginn.set("error");
      detBody.append(notice("err", "Não consegui ler os programas do PC."));
      return;
    }
    huginn.set("success");
    setTimeout(() => huginn.set("idle"), 1400);
    const chips = h("div", { class: "bf-chips" });
    for (const p of scan.programs.filter((p) => p.found)) {
      chips.append(h("span", { class: "bf-badge ok", title: p.path ?? "", text: `${p.name} · detectado` }));
    }
    detBody.append(h("div", { class: "bf-card-note", text: "Programas e IAs encontrados neste PC:" }), chips);
    const grid = h("div", { class: "bf-grid" });
    const servers = new Map((status?.servers ?? []).map((s) => [s.name, s]));
    const cards: HTMLElement[] = [];
    for (const e of scan.catalog) {
      const mine = servers.get(e.name);
      const on = !!mine && !mine.config.disabled;
      const sw = h("button", { class: on ? "switch on" : "switch", title: on ? "Desligar" : "Ligar" }) as HTMLButtonElement;
      sw.addEventListener("click", async () => {
        const base = mine?.config ?? e.config;
        status = await Bridge.mcpSaveServer(e.name, { ...base, disabled: on ? true : undefined } as McpServerConfig, mine ? e.name : null);
        redraw();
        void drawDetected();
      });
      const badge = e.origin === "nuvem"
        ? h("span", { class: "bf-badge cloud", text: "nuvem · OAuth" })
        : h("span", { class: `bf-badge ${e.detected ? "ok" : "off"}`, text: e.detected ? "detectado" : "não instalado" });
      const card = h("div", { class: `bf-card${on ? " on" : ""}` },
        h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "bf-card-name", text: e.label }), sw),
        badge,
        h("div", { class: "bf-card-note", text: e.note }),
      );
      cards.push(card);
      grid.append(card);
    }
    for (const i of scan.imported) {
      const card = h("div", { class: "bf-card on" },
        h("span", { class: "bf-card-name", text: i.name }),
        h("span", { class: "bf-badge imp", text: `importado · ${i.source}` }),
      );
      cards.push(card);
      grid.append(card);
    }
    const rescan = formBtn("Procurar de novo", "primary");
    rescan.addEventListener("click", async () => {
      status = await Bridge.mcpRescan();
      redraw();
      void drawDetected();
    });
    detBody.append(grid, h("div", { class: "row" }, rescan));
    void cascade(cards);
  }

  void load().then(drawDetected);
  return [
    h("section", { class: "bf-section" },
      h("div", { class: "row", style: "align-items:center;gap:14px" },
        h("div", { class: "bf-mascot-pair" }, huginn.el, muninn.el),
        h("div", {},
          h("h2", { class: "bf-title" }, h("span", { class: "bf-rune", text: "ᛉ" }), h("span", { text: "Detectados no seu PC" })),
          notice("hint", "O Bifrost procura IAs e programas instalados (Claude Code, Codex, Ollama, Docker, Git, OBS…) e já deixa os servidores MCP prontos. Serviços na nuvem usam o servidor MCP oficial com login OAuth no navegador — sem chave."),
        ),
      ),
      h("div", { class: "bf-bridge" }),
      detBody),
    h("section", {}, h("h2", {}, h("span", { text: "Servidores MCP" })),
      notice("hint", "Todos os servidores ligados ao Huginn: Hermes, Alethe, Orca, Freya, os detectados no PC e os importados."), serversBody),
    h("section", {}, h("h2", {}, h("span", { text: "Chat via MCP" })),
      notice("hint", "Como a mensagem chega ao agente. Para o Hermes: modo Tarefa, hermes_task_start / prompt, status hermes_task_status / job_id."), chatBody),
    h("section", {}, h("h2", {}, h("span", { text: "Servidor MCP do Bifrost" })),
      notice("hint", "Deixa outros agentes (Grok Bot, Hermes…) mostrarem avisos, pedirem aprovação e abrirem sessões no Huginn."), ownBody),
  ];
}
