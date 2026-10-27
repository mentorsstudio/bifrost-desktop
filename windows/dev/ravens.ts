// Prancha dos corvos para capturas (só desenvolvimento): SVG (Huginn/Muninn × estados)
// e motor de canvas (estados × adornos). ?only=svg|states|outfits|anim  &m=huginn|muninn
import "../src/bifrost/nordic.css";
import "../src/theme/themes.css";
import "../src/theme/themes";
import "../src/theme/aurora";
import { Mascot, MASCOT_STATES, type MascotName } from "../src/bifrost/mascots";
import { BotEngine, BOT_STATES } from "../src/bifrost/raven";
import { OUTFIT_SELECTIONS, type Outfit } from "../src/huginn/wardrobe";
import type { BotStateName } from "../src/core/layout";
const q = new URLSearchParams(location.search);
const only = q.get("only");
const SZ = Number(q.get("sz") ?? 120);
document.documentElement.style.setProperty("--sz", SZ + "px");
const root = document.getElementById("root")!;
const engines: { e: InstanceType<typeof BotEngine>; c: CanvasRenderingContext2D; s: number }[] = [];
function cell(label: string, row: HTMLElement) {
  const f = document.createElement("div"); f.className = "f"; row.append(f);
  const l = document.createElement("div"); l.textContent = label; f.append(l); return f;
}
function section(title: string) {
  const h = document.createElement("h2"); h.textContent = title; root.append(h);
  const r = document.createElement("div"); r.className = "row"; root.append(r); return r;
}
function engine(f: HTMLElement, st: BotStateName, outfit: Outfit = "none", who: MascotName = "huginn") {
  const cv = document.createElement("canvas"); cv.width = cv.height = SZ * 2; f.prepend(cv);
  const e = new BotEngine();
  (e as unknown as { identity: MascotName }).identity = who;
  e.setOutfit(outfit, false); e.outfitPresence = 1; e.setState(st, true);
  const c = cv.getContext("2d")!; engines.push({ e, c, s: SZ * 2 });
}
if (!q.get("gait") && (!only || only === "svg")) for (const m of ["huginn", "muninn"] as MascotName[]) {
  const r = section(`SVG · ${m}`);
  for (const st of MASCOT_STATES) { const f = cell(st, r); const x = new Mascot(m, f); x.set(st); f.prepend(x.el); }
}
if (!q.get("gait") && (!only || only === "states")) for (const m of ["huginn", "muninn"] as MascotName[]) {
  const r = section(`Motor · ${m} · estados`);
  for (const st of Object.keys(BOT_STATES) as BotStateName[]) engine(cell(st, r), st, "none", m);
}
if (!q.get("gait") && (!only || only === "outfits")) {
  const r = section("Motor · adornos (mochiOutfit)");
  for (const o of OUTFIT_SELECTIONS.filter((o) => o !== "auto") as Outfit[]) engine(cell(o, r), "idle", o);
  const r2 = section("Adornos × estados");
  for (const o of ["helm", "frostScarf", "starCrown", "lantern"] as Outfit[]) for (const st of ["working", "approval", "sleeping", "finished"] as BotStateName[]) engine(cell(`${o} · ${st}`, r2), st, o);
}
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const { e, c, s } of engines) { e.update(dt); c.clearRect(0, 0, s, s); c.save(); e.draw(c, s, s); c.restore(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { freeze: (f: number) => void }).freeze = (f: number) => {
  for (const a of document.getAnimations()) {
    a.pause(); const t = a.effect?.getComputedTiming(); a.currentTime = (Number(t?.delay) || 0) + (Number(t?.duration) || 0) * f;
  }
};

// ── Tiras quadro a quadro da locomoção (fase 13): ?gait=walk|flap|takeoff|fly|glide|land&n=12
import { RHYTHM, type Gait } from "../src/bifrost/locomotion";
const gaitQ = q.get("gait") as Gait | null;
if (gaitQ) {
  const N = Number(q.get("n") ?? 12);
  const len = (who: MascotName) => {
    const r = RHYTHM[who];
    return ({ flap: r.flap * 2, walk: r.hop * 2, takeoff: r.takeoff, fly: r.flight * 2, glide: 2, land: r.land, none: 1 } as Record<Gait, number>)[gaitQ];
  };
  const outfits = (q.get("outfits") ?? "none").split(",") as Outfit[];
  for (const who of ["huginn", "muninn"] as MascotName[]) for (const o of outfits) {
    const r = section(`${gaitQ} · ${who} · ${o}`);
    for (let i = 0; i < N; i++) {
      const tt = gaitQ === "takeoff" || gaitQ === "land" ? (i / (N - 1)) * len(who) : (i / N) * len(who);
      const f = cell(`${(tt * 1000).toFixed(0)} ms`, r);
      engine(f, "idle", o, who);
      const e = engines[engines.length - 1].e as unknown as { gaitClock: number | null; setGait(g: Gait, o?: object): void; travelTilt: number };
      e.setGait(gaitQ, { tilt: gaitQ === "fly" || gaitQ === "glide" || gaitQ === "takeoff" || gaitQ === "land" ? 0.18 : 0 });
      e.gaitClock = tt;
    }
  }
}
// ?gait=…&live=1: os mesmos corvos tocando a marcha em tempo real, em laço (para os vídeos).
if (gaitQ && q.get("live")) {
  const all = engines.map(({ e }) => e as unknown as { gaitClock: number | null; identity: MascotName });
  const r = (who: MascotName) => RHYTHM[who];
  const L = (who: MascotName) => ({ flap: r(who).flap * 2, walk: r(who).hop * 2, takeoff: r(who).takeoff, fly: r(who).flight * 2, glide: 2, land: r(who).land, none: 1 } as Record<string, number>)[gaitQ];
  const tick = () => {
    const now = performance.now() / 1000;
    for (const e of all) {
      const len = L(e.identity);
      const once = gaitQ === "takeoff" || gaitQ === "land";
      e.gaitClock = once ? Math.min(len, now % (len + 0.5)) : now % len + Math.floor(now / len) * len;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
