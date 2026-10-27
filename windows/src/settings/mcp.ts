// Settings → Chat → t("MCP servers") (Paulo build): the agents the chat talks
// to without keys, how the chat reaches one of them, and Bifrost's own MCP
// server that lets Grok Bot, Hermes… drive Huginn.

import { t } from "../i18n/i18n";
import { formBtn, choice, textField, switchEl } from "../views/kit";
import {
  Bridge, type McpChat, type McpServerConfig, type McpServerView, type McpStatus,
} from "../core/bridge";
import { HERMES_VPS_BASE, hermesVpsServers, MCP_NAME, clientSnippet, credentialFromForm, configFromForm, formFromConfig, type McpForm } from "../core/mcp";
import type { Settings } from "../core/state";
import { h, clear } from "../views/dom";
import { statusDot } from "./parts";
import { Mascot } from "../bifrost/mascots";
import { cascade } from "../bifrost/motion";

const notice = (kind: "err" | "ok" | "hint", text: string) =>
  h("div", { class: kind === "hint" ? "hint" : kind === "err" ? "notice err" : "notice", text });

/** "google-flow" → "Google Flow", "n8n-vault" → "n8n Vault": o nome técnico fica no title. */
export function prettyName(name: string): string {
  return name.split(/[-_.\s]+/).filter(Boolean)
    .map((w) => (/^[a-z]+$/.test(w) && !/^n8n$/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function describe(c: McpServerConfig): string {
  return "url" in c ? c.url : [c.command, ...(c.args ?? [])].join(" ");
}

/** chat: provedor do chat e servidor do Bifrost; integrations: detectados e servidores (cartões). */
export function mcpSections(settings: Settings, save: () => Promise<void>, which: "chat" | "integrations" | "all" = "all"): HTMLElement[] {
  const serversBody = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
  const chatBody = h("div", { style: "display:flex;flex-direction:column;gap:8px" });
  const ownBody = h("div", { style: "display:flex;flex-direction:column;gap:8px" });
  let status: McpStatus | null = null;
  /** Nomes do catálogo encontrados neste PC (selo «detectado» nos cartões). */
  let detectedNames = new Set<string>();

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
      serversBody.append(notice("hint", t("Loading…")));
      return;
    }
    if (!status.servers.length) serversBody.append(notice("hint", t("No server yet. Add one or paste an mcpServers JSON.")));
    const grid = h("div", { class: "bf-grid mcp-servers" });
    for (const s of status.servers) grid.append(serverRow(s));
    if (status.servers.length) serversBody.append(grid);
    const add = formBtn(t("Add server"), "primary");
    add.addEventListener("click", () => {
      clear(serversBody);
      serversBody.append(editor(null));
    });
    const hermes = formBtn("Hermes (VPS)");
    hermes.addEventListener("click", () => {
      clear(serversBody);
      serversBody.append(hermesPreset());
    });
    const imp = formBtn(t("Import JSON"));
    imp.addEventListener("click", () => {
      clear(serversBody);
      serversBody.append(importer());
    });
    serversBody.append(h("div", { class: "row" }, add, hermes, imp));
  }

  function serverRow(s: McpServerView): HTMLElement {
    const out = h("div", {});
    const edit = formBtn(t("Edit"));
    edit.addEventListener("click", () => {
      clear(serversBody);
      serversBody.append(editor(s));
    });
    const test = formBtn(t("Test"));
    test.addEventListener("click", async () => {
      clear(out);
      out.append(notice("hint", t("Connecting…")));
      try {
        const tools = await Bridge.mcpTest(s.name, s.config);
        clear(out);
        out.append(notice("ok", t("Connected — {0} tool(s): {1}", { 0: tools.length, 1: tools.map((x) => x.name).join(", ") })));
      } catch (err) {
        clear(out);
        out.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const remove = formBtn(t("Remove"), "danger");
    remove.addEventListener("click", async () => {
      if (!confirm(t("Remove the server {0}?", { 0: s.name }))) return;
      status = await Bridge.mcpRemoveServer(s.name);
      redraw();
    });
    const remote = "url" in s.config;
    const on = !s.config.disabled;
    // Remoto (mcp-remote / HTTP): conectar abre o login OAuth no navegador, sem chave.
    const login = remote && !s.hasToken ? formBtn(t("Sign in"), "primary") : null;
    login?.addEventListener("click", () => test.click());
    const badges = h("div", { class: "bf-chips" },
      h("span", { class: `bf-badge ${on ? "ok" : "off"}`, text: on ? t("switched on") : t("switched off") }),
      h("span", { class: "bf-badge", text: remote ? t("remote · HTTP") : t("command · stdio") }),
      ...(s.hasToken ? [h("span", { class: "bf-badge ok", text: t("token saved") })] : []),
      ...(detectedNames.has(s.name) ? [h("span", { class: "bf-badge ok", text: t("found") })] : []),
      ...(s.source ? [h("span", { class: "bf-badge imp", title: s.source, text: t("imported · {0}", { 0: s.source }) })] : []));
    return h("div", { class: `bf-card mcp-server${on ? " on" : ""}` },
      h("div", { class: "row", style: "justify-content:space-between;gap:8px" },
        h("span", { class: "bf-card-name", title: s.name }, statusDot(on), h("span", { text: ` ${prettyName(s.name)}` })),
        login ?? ""),
      badges,
      h("div", { class: "bf-card-note path", title: describe(s.config), text: describe(s.config) }),
      h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" }, test, edit, remove),
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

  /** Preset Hermes (VPS): URL + usuário/senha (Basic Auth) → /mcp e /task/mcp, credencial no cofre do Windows. */
  function hermesPreset(): HTMLElement {
    const url = input(HERMES_VPS_BASE, "https://seu-vps.exemplo.com");
    const user = input("", t("User (Basic Auth, optional)"));
    const pass = input("", t("Password (Basic Auth)"), "password");
    const msg = h("div", {});
    const show = (n: HTMLElement) => { clear(msg); msg.append(n); };
    const run = async (save: boolean) => {
      const list = hermesVpsServers(url.value);
      if (!list) return show(notice("err", "URL"));
      const c = credentialFromForm(user.value, pass.value, "");
      if (typeof c === "string") return show(notice("err", c));
      show(notice("hint", t("Connecting…")));
      try {
        const lines: string[] = [];
        for (const s of list) {
          const cfg = configFromForm({ kind: "http", command: "", args: "", env: "", url: s.url, headers: "", disabled: false });
          if (typeof cfg === "string") throw new Error(cfg);
          if (c.kind === "basic") await Bridge.mcpSetBasicAuth(s.name, c.user, c.password);
          if (save) status = await Bridge.mcpSaveServer(s.name, cfg, null);
          const tools = await Bridge.mcpTest(s.name, cfg);
          lines.push(`${s.name}: ${t("tools/list OK — {0} tool(s): {1}", { 0: tools.length, 1: tools.map((x) => x.name).join(", ") })}`);
        }
        pass.value = user.value = "";
        if (save) redraw(); else show(notice("ok", lines.join("\n")));
      } catch (err) {
        show(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    };
    const test = formBtn(t("Test connection"));
    test.addEventListener("click", () => void run(false));
    const save = formBtn(t("Save"), "primary");
    save.addEventListener("click", () => void run(true));
    const cancel = formBtn(t("Cancel"));
    cancel.addEventListener("click", redraw);
    return h("div", { class: "bf-card mcp-hermes-preset", style: "display:flex;flex-direction:column;gap:8px" },
      h("b", { text: "Hermes (VPS)" }),
      field("URL", url), field(t("User"), user), field(t("Password"), pass),
      notice("hint", t("Use the Bearer token OR user + password (Basic Auth, e.g. Traefik). The credential goes to the system vault, never to settings.json.")),
      h("div", { class: "row" }, test, save, cancel), msg);
  }

  function editor(existing: McpServerView | null): HTMLElement {
    const f: McpForm = formFromConfig(existing?.config ?? null);
    const name = input(existing?.name ?? "", "ex.: hermes");
    const kind = h("select", {}, h("option", { value: "stdio", text: t("Command (stdio)") }), h("option", { value: "http", text: t("Remote (Streamable HTTP)") })) as HTMLSelectElement;
    kind.value = f.kind;
    const command = input(f.command, "C:\\Users\\paulo\\AppData\\Local\\hermes\\bin\\hermes.exe");
    const args = input(f.args, "mcp-serve --tools");
    const env = area(f.env, t("VAR=value (one per line)"));
    const url = input(f.url, "https://mcp.exemplo.com/mcp");
    const headers = area(f.headers, t("Header: value (one per line)"));
    const token = input("", existing?.hasToken ? t("•••• token saved (leave empty to keep it)") : t("Bearer token (optional)"), "password");
    const basicUser = input("", existing?.hasToken ? t("(credential saved — leave empty to keep it)") : t("User (Basic Auth, optional)"));
    const basicPass = input("", t("Password (Basic Auth)"), "password");
    const disabled = textField({ type: "checkbox" }) as HTMLInputElement;
    disabled.checked = f.disabled;
    const msg = h("div", {});
    const stdioRows = h("div", { style: "display:flex;flex-direction:column;gap:6px" }, field(t("Command"), command), field(t("Arguments"), args), field(t("Environment"), env));
    const httpRows = h("div", { style: "display:flex;flex-direction:column;gap:6px" }, field("URL", url), field(t("Headers"), headers), field(t("Bearer token"), token),
      field(t("User"), basicUser), field(t("Password"), basicPass),
      notice("hint", t("Use the Bearer token OR user + password (Basic Auth, e.g. Traefik). The credential goes to the system vault, never to settings.json.")));
    const sync = () => {
      stdioRows.style.display = kind.value === "stdio" ? "" : "none";
      httpRows.style.display = kind.value === "http" ? "" : "none";
    };
    kind.addEventListener("change", sync);
    sync();

    const read = (): { name: string; config: McpServerConfig } | string => {
      if (!MCP_NAME.test(name.value.trim())) return t("Invalid name (letters, numbers, - _ .).");
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

    const test = formBtn(t("Test connection"));
    test.addEventListener("click", async () => {
      const r = read();
      if (typeof r === "string") return show(notice("err", r));
      show(notice("hint", t("Connecting…")));
      try {
        await storeToken(r.name);
        const tools = await Bridge.mcpTest(r.name, r.config);
        show(notice("ok", t("tools/list OK — {0} tool(s): {1}", { 0: tools.length, 1: tools.map((x) => x.name).join(", ") })));
      } catch (err) {
        show(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const saveBtn = formBtn(t("Save"), "primary");
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
    const clearToken = formBtn(t("Delete credential"), "danger");
    clearToken.style.display = existing?.hasToken ? "" : "none";
    clearToken.addEventListener("click", async () => {
      await Bridge.mcpSetToken(existing!.name, "");
      status = await Bridge.mcpStatus();
      redraw();
    });
    const cancel = formBtn(t("Cancel"));
    cancel.addEventListener("click", redraw);

    return h(
      "div",
      { style: "display:flex;flex-direction:column;gap:6px" },
      field(t("Name"), name),
      field(t("Type"), kind),
      stdioRows,
      httpRows,
      field(t("Off"), disabled),
      h("div", { class: "row" }, saveBtn, test, clearToken, cancel),
      msg,
    );
  }

  function importer(): HTMLElement {
    const text = area("", '{\n  "mcpServers": {\n    "hermes": { "command": "hermes.exe", "args": ["mcp-serve", "--tools"] }\n  }\n}');
    text.rows = 10;
    const msg = h("div", {});
    const go = formBtn(t("Import"), "primary");
    go.addEventListener("click", async () => {
      try {
        status = await Bridge.mcpImport(text.value);
        redraw();
      } catch (err) {
        clear(msg);
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const cancel = formBtn(t("Cancel"));
    cancel.addEventListener("click", redraw);
    return h("div", { style: "display:flex;flex-direction:column;gap:6px" },
      notice("hint", t("Paste a JSON in the mcpServers format (the same as Claude Desktop, Cursor and Grok Bot). Tokens don't go in the JSON: add them under Edit.")),
      text, h("div", { class: "row" }, go, cancel), msg);
  }

  // ── Chat through MCP ────────────────────────────────────────────────────
  function drawChat() {
    clear(chatBody);
    if (!status) return;
    const c: McpChat = { ...status.chat };
    const inUse = settings.chatProvider === "mcp";
    const use = formBtn(inUse ? t("In use in the chat") : t("Use MCP in the chat"), inUse ? "plain" : "primary");
    use.disabled = inUse;
    use.addEventListener("click", async () => {
      settings.chatProvider = "mcp";
      await save();
      drawChat();
    });
    const server = choice() as HTMLSelectElement;
    for (const s of status.servers) server.append(h("option", { value: s.name, text: s.name }));
    if (!status.servers.some((s) => s.name === c.server)) server.append(h("option", { value: c.server, text: t("{0} (not set up)", { 0: c.server }) }));
    server.value = c.server;
    const mode = h("select", {},
      h("option", { value: "task", text: t("Task (start + check status) — Hermes") }),
      h("option", { value: "tool", text: t("Single tool (the answer comes right away)") })) as HTMLSelectElement;
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
      field(t("Status tool"), statusTool), field(t("ID argument"), idArg), field(t("Max time (s)"), timeout));
    const sync = () => (taskRows.style.display = mode.value === "task" ? "" : "none");
    mode.addEventListener("change", sync);
    sync();
    const msg = h("div", {});

    const loadTools = formBtn(t("Show tools"));
    loadTools.addEventListener("click", async () => {
      clear(msg);
      try {
        const tools = await Bridge.mcpListTools(server.value);
        clear(toolList);
        for (const t of tools) toolList.append(h("option", { value: t.name, text: t.description.slice(0, 80) }));
        msg.append(notice("ok", tools.map((t) => t.name).join(", ") || t("No tools.")));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const saveBtn = formBtn(t("Save"), "primary");
    saveBtn.addEventListener("click", async () => {
      clear(msg);
      let extraArgs: Record<string, unknown>;
      try {
        extraArgs = extra.value.trim() ? JSON.parse(extra.value) : {};
        if (typeof extraArgs !== "object" || Array.isArray(extraArgs) || extraArgs === null) throw new Error();
      } catch {
        msg.append(notice("err", t("Extra arguments: must be a JSON object.")));
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
        msg.append(notice("ok", t("Saved.")));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });

    chatBody.append(
      h("div", { class: "row" }, h("label", {}, statusDot(inUse), h("span", { text: t(" Chat provider"), style: "margin-left:6px" })), use),
      field(t("Server"), server),
      field(t("Mode"), mode),
      field(t("Tool"), tool),
      toolList,
      field(t("Message argument"), argument),
      field(t("Extra arguments"), extra),
      taskRows,
      field(t("Send history"), history),
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
    const saveBtn = formBtn(t("Save"));
    saveBtn.addEventListener("click", async () => {
      clear(msg);
      try {
        status = await Bridge.mcpSetServer(on.checked, Number(port.value) || 47821);
        msg.append(notice("ok", t("Saved — takes effect the next time Bifrost starts.")));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    const copy = formBtn(t("Copy config for clients"), "primary");
    copy.addEventListener("click", async () => {
      clear(msg);
      try {
        const token = await Bridge.mcpServerToken();
        await navigator.clipboard.writeText(clientSnippet(status!.serverUrl, token));
        msg.append(notice("ok", t("mcpServers JSON copied (with the token). Paste it into Grok Bot, Hermes, Claude or Cursor.")));
      } catch (err) {
        msg.append(notice("err", String(err).replace(/^Error:\s*/, "")));
      }
    });
    ownBody.append(
      notice("hint", t("Address: {0} — only on this computer, with a Bearer token. Tools: notify, ask_approval, show_session, update_session, end_session, chat.", { 0: status.serverUrl })),
      field(t("On"), on),
      field(t("Port"), port),
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
      detBody.append(notice("err", t("Couldn't read the programs on this PC.")));
      return;
    }
    detectedNames = new Set(scan.catalog.filter((e) => e.detected).map((e) => e.name));
    drawServers();
    huginn.set("success");
    setTimeout(() => huginn.set("idle"), 1400);
    const chips = h("div", { class: "bf-chips" });
    for (const p of scan.programs.filter((p) => p.found)) {
      chips.append(h("span", { class: "bf-badge ok", title: p.path ?? "", text: t("{0} · found", { 0: p.name }) }));
    }
    detBody.append(h("div", { class: "bf-card-note", text: t("Programs and AIs found on this PC:") }), chips);
    const grid = h("div", { class: "bf-grid" });
    const servers = new Map((status?.servers ?? []).map((s) => [s.name, s]));
    const cards: HTMLElement[] = [];
    for (const e of scan.catalog) {
      const mine = servers.get(e.name);
      const on = !!mine && !mine.config.disabled;
      const sw = switchEl(on, { title: on ? t("Turn off") : t("Turn on") });
      sw.addEventListener("click", async () => {
        const base = mine?.config ?? e.config;
        status = await Bridge.mcpSaveServer(e.name, { ...base, disabled: on ? true : undefined } as McpServerConfig, mine ? e.name : null);
        redraw();
        void drawDetected();
      });
      const badge = e.origin === "nuvem"
        ? h("span", { class: "bf-badge cloud", text: t("cloud · OAuth") })
        : h("span", { class: `bf-badge ${e.detected ? "ok" : "off"}`, text: e.detected ? t("found") : t("not installed") });
      const card = h("div", { class: `bf-card${on ? " on" : ""}` },
        h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "bf-card-name", text: e.label }), sw),
        badge,
        h("div", { class: "bf-card-note", text: e.note }),
      );
      cards.push(card);
      grid.append(card);
    }
    for (const i of scan.imported) {
      // Juntado a um embutido (mesmo servidor): já aparece no cartão dele.
      if (status && !servers.has(i.name)) continue;
      const card = h("div", { class: "bf-card on" },
        h("span", { class: "bf-card-name", title: i.name, text: prettyName(i.name) }),
        h("span", { class: "bf-badge imp", text: t("imported · {0}", { 0: i.source }) }),
      );
      cards.push(card);
      grid.append(card);
    }
    const rescan = formBtn(t("Look again"), "primary");
    rescan.addEventListener("click", async () => {
      status = await Bridge.mcpRescan();
      redraw();
      void drawDetected();
    });
    detBody.append(grid, h("div", { class: "row" }, rescan));
    void cascade(cards);
  }

  void load().then(drawDetected);
  const detected = h("section", { class: "bf-section" },
      h("div", { class: "row", style: "align-items:center;gap:14px" },
        h("div", { class: "bf-mascot-pair" }, huginn.el, muninn.el),
        h("div", {},
          h("h2", { class: "bf-title" }, h("span", { class: "bf-rune", text: "ᛉ" }), h("span", { text: t("Found on your PC") })),
          notice("hint", t("Bifrost looks for installed AIs and programs (Claude Code, Codex, Ollama, Docker, Git, OBS…) and gets their MCP servers ready. Cloud services use the official MCP server with an OAuth sign-in in the browser — no key.")),
        ),
      ),
      h("div", { class: "bf-bridge" }),
      detBody);
  const servers = h("section", { class: "mcp-servers-section" }, h("h2", {}, h("span", { text: t("MCP servers") })),
    notice("hint", t("Every server connected to Huginn: Hermes, Alethe, Orca, Freya, the ones found on this PC and the imported ones. Remote ones ask you to sign in in the browser when they connect.")), serversBody);
  const chat = h("section", {}, h("h2", {}, h("span", { text: t("Chat via MCP") })),
    notice("hint", t("How the message reaches the agent. For Hermes: Task mode, hermes_task_start / prompt, status hermes_task_status / job_id.")), chatBody);
  const own = h("section", {}, h("h2", {}, h("span", { text: t("Bifrost's MCP server") })),
    notice("hint", t("Lets other agents (Grok Bot, Hermes…) show notices, ask for approval and open sessions on Huginn.")), ownBody);
  if (which === "chat") return [chat, own];
  if (which === "integrations") return [detected, servers];
  return [detected, servers, chat, own];
}
