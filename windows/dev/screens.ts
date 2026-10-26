// Páginas para as capturas de tela do Bifrost (só desenvolvimento, não vai no app).
// /dev/screens.html?shot=idle|notification|approval|chat|mascots
import "../src/style.css";
import "../src/theme/bifrost.css";
import { Island } from "../src/island/island";
import { registerHookHandlers } from "../src/island/hooks";
import { State } from "../src/core/state";
import { setLanguage } from "../src/i18n/i18n";
import { BotEngine, BOT_STATES } from "../src/mochi/engine";
import type { BotStateName } from "../src/core/layout";

declare global { interface Window { __emit(e: string, p: unknown): void } }
const shot = new URLSearchParams(location.search).get("shot") ?? "idle";
setLanguage("pt-BR");
State.settings = { ...State.settings, soundEnabled: false };
const hook = (p: Record<string, unknown>) => window.__emit("hook", p);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (shot === "mascots") {
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
  hook({ hook_event_name: "SessionStart", session_id: "s1", cwd: "C:\\Users\\paulo\\projetos\\bifrost-desktop" });
  hook({ hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "Revise o servidor MCP" });
  if (shot === "idle") { island.collapse(); }
  if (shot === "notification") {
    hook({ hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Edit", tool_input: { file_path: "src/mcp/client.rs" } });
    await wait(200);
    hook({ hook_event_name: "Stop", session_id: "s1", last_assistant_message: "Pronto: o login Basic Auth agora vai para o cofre do sistema e os testes passam." });
  }
  if (shot === "approval") {
    hook({ hook_event_name: "PermissionRequest", session_id: "s1", request_id: "r1", tool_name: "Bash", tool_input: { command: "cargo test --workspace" } });
  }
  if (shot === "chat") {
    island.expand("prompt");
  }
}
