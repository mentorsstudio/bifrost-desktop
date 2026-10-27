// Páginas para as capturas de tela do Bifrost (só desenvolvimento, não vai no app).
// /dev/screens.html?shot=idle|notification|approval|chat|mascots
import "../src/style.css";
import "../src/theme/bifrost.css";
import "../src/bifrost/nordic.css";
import "../src/bifrost/skin.css";
import "../src/bifrost/saga.css";
import "../src/bifrost/realm.css";
import "../src/traymenu/traymenu.css";
import "../src/theme/freya.css";
import "../src/theme/aurora";
import { renderTray } from "../src/traymenu/main";
import { showMenu } from "../src/bifrost/contextmenu";
import { Greeting, GREETING_W, GREETING_H } from "../src/huginn/greeting";
import { Island } from "../src/island/island";
import { registerHookHandlers } from "../src/island/hooks";
import { State } from "../src/core/state";
import { setLanguage } from "../src/i18n/i18n";
import { BotEngine, BOT_STATES } from "../src/bifrost/raven";
import type { BotStateName } from "../src/core/layout";

declare global { interface Window { __emit(e: string, p: unknown): void } }
const shot = new URLSearchParams(location.search).get("shot") ?? "idle";
setLanguage("pt-BR");
State.settings = { ...State.settings, soundEnabled: false };
const hook = (p: Record<string, unknown>) => window.__emit("hook", p);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (shot === "greeting") {
  const root = document.getElementById("root")!;
  const c = document.createElement("canvas");
  c.width = GREETING_W * 2; c.height = GREETING_H * 2;
  c.style.cssText = `position:absolute;left:calc(50% - ${GREETING_W / 2}px);top:0;width:${GREETING_W}px;height:${GREETING_H}px;background:#000;border-radius:0 0 22px 22px`;
  root.append(c);
  const ctx = c.getContext("2d")!; ctx.scale(2, 2);
  const g = new Greeting();
  const go = () => g.start();
  go(); setInterval(go, 6000);
  Object.assign(window, { greeting: g });
  const frame = () => { g.draw(ctx); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
} else if (shot === "tray") {
  const root = document.getElementById("root")!;
  root.style.cssText = "background:linear-gradient(160deg,#0c1a33,#14213f 60%,#22183a)";
  const bar = document.createElement("div");
  bar.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:44px;background:rgba(10,12,20,.92);border-top:1px solid #222a3c";
  const menu = document.createElement("div");
  menu.id = "menu"; menu.style.cssText = "position:absolute;right:40px;bottom:54px;width:232px";
  root.append(bar, menu);
  const items = [["open","Abrir o Bifrost"],["update","Atualizar o Bifrost para 0.6.0…"],["recap","Resumo semanal"],["wardrobe","Adornos…"],["settings","Configurações…"],["pause","Pausar"],["quit","Sair"]].map(([id,label]) => ({ id, label }));
  const loop = async () => {
    for (;;) {
      menu.classList.remove("in");
      renderTray(menu, items, () => {});
      await wait(60); menu.classList.add("in");
      await wait(900);
      for (const b of menu.querySelectorAll<HTMLElement>(".bf-tray-item")) { b.dispatchEvent(new MouseEvent("mouseover")); b.style.background = "rgba(94,242,201,.12)"; await wait(260); b.style.background = ""; }
      await wait(800);
    }
  };
  void loop();
} else if (shot === "desktop") {
  const root = document.getElementById("root")!;
  root.style.cssText = "background:linear-gradient(160deg,#10223f,#1b2a4a 55%,#2a1d3f)";
  const c = document.createElement("canvas");
  c.width = c.height = 640; c.style.cssText = "position:absolute;left:calc(50% - 160px);top:calc(50% - 170px);width:320px;height:320px";
  root.append(c);
  const ctx = c.getContext("2d")!; ctx.scale(2, 2);
  const e = new BotEngine();
  const seq: [BotStateName, string | null, number][] = [["idle","auroraHalo",2200],["working","runeBand",2200],["thinking",null,2000],["approval",null,2000],["finished","starCrown",2400],["sleeping","frostScarf",2400]];
  void (async () => { for (;;) for (const [st, of, ms] of seq) { e.setState(st, false); e.setOutfit(of as never, true); await wait(ms); } })();
  c.addEventListener("click", () => e.slap?.());
  c.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    showMenu(ev.clientX, ev.clientY, [
      { label: "Adornos…", rune: "ᚹ", run: () => {} }, { label: "Dançar", rune: "ᛃ", run: () => {} },
      { label: "Esconder Huginn", rune: "ᛁ", run: () => {} }, { label: "Configurações…", rune: "ᛟ", run: () => {} },
    ] as never);
  });
  Object.assign(window, { raven: e });
  let last = performance.now();
  const frame = (t: number) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; e.update(dt); ctx.clearRect(0, 0, 320, 320); e.draw(ctx, 320, 320); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
} else if (shot === "outfits") {
  const root = document.getElementById("root")!;
  root.style.cssText = "display:grid;grid-template-columns:repeat(4,220px);gap:18px;justify-content:center;align-content:center;font:600 14px 'Space Grotesk',sans-serif;color:#eef2ff";
  const list = [["none", "idle"], ["auroraHalo", "idle"], ["runeBand", "working"], ["frostScarf", "sleeping"], ["frostScarf", "idle"], ["starCrown", "finished"], ["helm", "idle"], ["lantern", "thinking"]] as const;
  const engines: [BotEngine, CanvasRenderingContext2D][] = [];
  for (const [o, n] of list) {
    const cell = document.createElement("div");
    cell.style.cssText = "background:linear-gradient(180deg,#18213f,#0b1022);border:1px solid rgba(148,170,255,.12);border-radius:12px;padding:10px;text-align:center";
    const c = document.createElement("canvas"); c.width = c.height = 400; c.style.width = c.style.height = "200px";
    const ctx = c.getContext("2d")!; ctx.scale(2, 2);
    const e = new BotEngine(); e.setState(n as BotStateName, true); e.setOutfit(o as never, false);
    engines.push([e, ctx]);
    const label = document.createElement("div"); label.textContent = `${o} · ${n}`;
    cell.append(c, label); root.append(cell);
  }
  let last = performance.now();
  const frame = (t: number) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; for (const [e, ctx] of engines) { e.update(dt); ctx.clearRect(0, 0, 200, 200); e.draw(ctx, 200, 200); } requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
} else if (shot === "mascots") {
  const root = document.getElementById("root")!;
  root.style.cssText = "display:grid;grid-template-columns:repeat(4,220px);gap:18px;justify-content:center;align-content:center;font:600 14px 'Space Grotesk',sans-serif;color:#eef2ff";
  const names: BotStateName[] = ["idle", "working", "thinking", "approval", "question", "finished", "error", "sleeping"];
  const labels: Record<string, string> = { idle: "Parado", working: "Trabalhando", thinking: "Pensando", approval: "Aprovação", question: "Pergunta", finished: "Concluído", error: "Erro", sleeping: "Dormindo" };
  const engines: [BotEngine, CanvasRenderingContext2D][] = [];
  for (const n of names) {
    const cell = document.createElement("div");
    cell.style.cssText = "background:linear-gradient(180deg,#18213f,#0b1022);border:1px solid rgba(148,170,255,.12);border-radius:12px;padding:10px;text-align:center";
    const c = document.createElement("canvas");
    c.width = c.height = 400; c.style.width = c.style.height = "200px";
    const ctx = c.getContext("2d")!; ctx.scale(2, 2);
    const e = new BotEngine();
    e.setState(n, true);
    if (n === "finished") e.setOutfit("starCrown", false);
    if (n === "idle") e.setOutfit("auroraHalo", false);
    if (n === "sleeping") e.setOutfit("frostScarf", false);
    if (n === "working") e.setOutfit("runeBand", false);
    engines.push([e, ctx]);
    const label = document.createElement("div"); label.textContent = labels[n];
    cell.append(c, label); root.append(cell);
  }
  void BOT_STATES;
  let last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    for (const [e, ctx] of engines) { e.update(dt); ctx.clearRect(0, 0, 200, 200); e.draw(ctx, 200, 200); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} else {
  const island = new Island(document.getElementById("root")!);
  registerHookHandlers(island);
  Object.assign(window, { island, State });
  island.applySettings();
  State.loadIntegrationTasks();
  await wait(50);
  if (shot === "home-empty" || shot === "home-scan") { island.expand("overview"); }
  else if (shot === "quick") { island.expand("settings"); }
  else {
  hook({ hook_event_name: "SessionStart", session_id: "s1", cwd: "C:\\Users\\paulo\\projetos\\bifrost-desktop" });
  hook({ hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "Revise o servidor MCP" });
  if (shot === "idle") { island.collapse(); }
  if (shot === "home-last") {
    hook({ hook_event_name: "PreToolUse", session_id: "s1", cwd: "C:\\Users\\paulo\\projetos\\bifrost-desktop", tool_name: "Edit", tool_input: { file_path: "src/mcp/client.rs" } });
    hook({ hook_event_name: "Stop", session_id: "s1", cwd: "C:\\Users\\paulo\\projetos\\bifrost-desktop", last_assistant_message: "Pronto: o login Basic Auth agora vai para o cofre do sistema e os testes passam." });
    await wait(400);
    island.expand("overview");
  }
  if (shot === "home") {
    hook({ hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Edit", tool_input: { file_path: "src/mcp/client.rs" } });
    hook({ hook_event_name: "SessionStart", session_id: "c1", coucou_agent: "codex", cwd: "C:\\Users\\paulo\\projetos\\site-loja" });
    hook({ hook_event_name: "UserPromptSubmit", session_id: "c1", coucou_agent: "codex", cwd: "C:\\Users\\paulo\\projetos\\site-loja", prompt: "Corrija o checkout" });
    hook({ hook_event_name: "PermissionRequest", session_id: "c1", coucou_agent: "codex", request_id: "r9", tool_name: "Bash", tool_input: { command: "npm run deploy" } });
    hook({ hook_event_name: "SessionStart", session_id: "g1", coucou_agent: "gemini", cwd: "C:\\Users\\paulo\\docs\\relatorio" });
    hook({ hook_event_name: "Stop", session_id: "g1", coucou_agent: "gemini", cwd: "C:\\Users\\paulo\\docs\\relatorio", last_assistant_message: "Relatório revisado e salvo." });
    await wait(300);
    island.expand("overview");
  }
  if (shot === "notification") {
    hook({ hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Edit", tool_input: { file_path: "src/mcp/client.rs" } });
    await wait(200);
    hook({ hook_event_name: "Stop", session_id: "s1", last_assistant_message: "Pronto: o login Basic Auth agora vai para o cofre do sistema e os testes passam." });
  }
  if (shot === "approval") {
    hook({ hook_event_name: "PermissionRequest", session_id: "s1", request_id: "r1", tool_name: "Bash", tool_input: { command: "cargo test --workspace" } });
  }
  if (shot === "approval-pair") {
    hook({ hook_event_name: "SessionStart", session_id: "c1", coucou_agent: "codex", cwd: "C:\\Users\\paulo\\projetos\\site-loja" });
    hook({ hook_event_name: "UserPromptSubmit", session_id: "c1", coucou_agent: "codex", prompt: "Corrija o checkout" });
    hook({ hook_event_name: "PermissionRequest", session_id: "s1", request_id: "r1", tool_name: "Bash", tool_input: { command: "cargo test --workspace" } });
  }
  if (shot === "chat") {
    State.settings = { ...State.settings, chatProvider: "cli", chatModels: { cli: "claude" } } as typeof State.settings;
    State.chatHistory = [
      { id: 1, role: "user", content: "Resuma o README do projeto" },
      { id: 2, role: "assistant", content: "O **Bifrost** é uma ilha no topo da tela que acompanha seus agentes de IA, com ditado, notas e chat pelo MCP." },
    ];
    island.expand("prompt");
  }
  }
}
