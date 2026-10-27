// Prancha "Vida dos corvos" (só desenvolvimento): cada célula é a janela do corvo
// da área de trabalho (120 px, desenho em 96 px centrado) repetindo um estado.
// window.__clip conta quadros em que algum pixel tocou a borda da janela.
import "../src/bifrost/nordic.css";
import "../src/theme/themes.css";
import "../src/theme/themes";
import { BotEngine } from "../src/bifrost/raven";
import { RavenLife, type IdleAct } from "../src/bifrost/raven-life";
const P = 120, DW = P * 0.8, SIDE = (P - DW) / 2, DPR = 2;
const STATES = ["assinatura", "olhar", "inclinar", "ajeitar asa", "pulinho", "andar", "voo curto", "cochilo", "pensando", "ouvindo", "falando", "sucesso", "erro", "hover", "clique"] as const;
const root = document.getElementById("root")!;
const W = window as unknown as { __clip: number; __clipWho: string[]; __frames: number };
W.__clip = 0; W.__clipWho = []; W.__frames = 0;
type Cell = { e: InstanceType<typeof BotEngine>; life: RavenLife; c: CanvasRenderingContext2D; name: string; t: number };
const cells: Cell[] = [];
for (const name of STATES) {
  const f = document.createElement("div"); f.className = "f";
  const cv = document.createElement("canvas"); cv.width = cv.height = P * DPR;
  const l = document.createElement("div"); l.textContent = name; f.append(cv, l); root.append(f);
  const e = new BotEngine(); e.particleOverhang = 0; e.setState("idle", true);
  e.identity = (new URLSearchParams(location.search).get("who") as "huginn" | "muninn") ?? "huginn";
  const life = new RavenLife(e, { desktop: true, ownSleep: true }); life.level = "normal";
  e.life = life;
  cells.push({ e, life, c: cv.getContext("2d", { willReadFrequently: true })!, name, t: -1 });
}
const ACT: Record<string, IdleAct> = { "assinatura": "signature", "olhar": "look", "inclinar": "tilt", "ajeitar asa": "preen", "pulinho": "hop", "andar": "walk", "voo curto": "fly" };
function cue(x: Cell) {
  const { e, life } = x;
  life.level = "normal";
  if (ACT[x.name]) life.play(ACT[x.name]);
  else if (x.name === "cochilo") e.setState("sleeping");
  else if (x.name === "pensando") life.signal({ kind: "thinking" });
  else if (x.name === "ouvindo") life.signal({ kind: "listening" });
  else if (x.name === "falando") life.signal({ kind: "speaking" });
  else if (x.name === "sucesso") life.success();
  else if (x.name === "erro") life.error();
  else if (x.name === "hover") life.hover();
  else if (x.name === "clique") life.click();
}
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  W.__frames++;
  for (const x of cells) {
    if (x.t < 0 || now - x.t > (x.name === "assinatura" ? 6100 : 2600)) { x.t = now; cue(x); }
    if (x.name === "falando" && Math.random() < 0.25) x.life.signal({ kind: "chunk" });
    if (x.name === "ouvindo") x.life.signal({ kind: "level", value: 0.5 + 0.5 * Math.sin(now / 140) });
    x.life.level = "normal";
    x.e.update(dt);
    const c = x.c;
    c.setTransform(DPR, 0, 0, DPR, SIDE * DPR, 0);
    c.clearRect(-SIDE, 0, P, P);
    c.save(); x.e.applyDance(c, DW, P); x.e.draw(c, DW, P); c.restore();
    // Borda de 1 px da janela: nada pode encostar (seria recorte na janela real).
    const s = P * DPR, d = c.getImageData(0, 0, s, s).data;
    let hit = false;
    for (let i = 0; i < s && !hit; i++) for (const [px, py] of [[i, 0], [i, s - 1], [0, i], [s - 1, i]]) if (d[(py * s + px) * 4 + 3] > 8) { hit = true; break; }
    if (hit) { W.__clip++; if (!W.__clipWho.includes(x.name)) W.__clipWho.push(x.name); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ?bench=1: o corvo da área de trabalho à toa, a 30 qps como desktop/main.ts;
// window.__bench = ms de CPU do quadro (update + draw) por segundo de relógio.
if (new URLSearchParams(location.search).get("bench")) {
  const cv = document.createElement("canvas"); cv.width = cv.height = P * DPR;
  const c = cv.getContext("2d")!;
  const e = new BotEngine(); e.particleOverhang = 0; e.setState("idle", true);
  e.life = new RavenLife(e, { desktop: true, ownSleep: true }); e.life.level = "normal";
  let busy = 0; const t0 = performance.now(); let prev = t0;
  const B = window as unknown as { __bench: { msPerSec: number; frames: number } };
  let frames = 0;
  const step = () => {
    const a = performance.now();
    e.update(Math.min(0.05, (a - prev) / 1000)); prev = a;
    c.setTransform(DPR, 0, 0, DPR, SIDE * DPR, 0); c.clearRect(-SIDE, 0, P, P);
    c.save(); e.applyDance(c, DW, P); e.draw(c, DW, P); c.restore();
    busy += performance.now() - a; frames++;
    B.__bench = { msPerSec: busy / ((performance.now() - t0) / 1000), frames };
    setTimeout(step, 1000 / 30);
  };
  step();
}
