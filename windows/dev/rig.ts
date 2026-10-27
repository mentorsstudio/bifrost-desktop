// Prancha do rig novo (só desenvolvimento). ?loop=huginn|muninn anima o laço de 6 s
// num quadro grande; sem loop: os dois parados em 240/64/32/24 px e quadros do laço.
import { drawRig, signature, REF_PALETTE, REST_POSE, type Who } from "../src/bifrost/rig";
const q = new URLSearchParams(location.search);
const root = document.getElementById("root")!;
const bg = q.get("bg");
if (bg) document.body.style.background = bg;
function cv(size: number) { const c = document.createElement("canvas"); c.width = c.height = size * 2; c.style.width = c.style.height = size + "px"; root.append(c); return c.getContext("2d")!; }
function paint(c: CanvasRenderingContext2D, size: number, who: Who, pose = REST_POSE) {
  c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, size, size);
  c.translate(size / 2, size / 2 + size * 0.06); drawRig(c, who, pose, REF_PALETTE[who], (size * 0.8) / 112);
}
const loop = q.get("loop") as Who | null;
if (loop) {
  const size = Number(q.get("sz") ?? 360);
  const c = cv(size); const t0 = performance.now();
  const W = window as unknown as { __t: number };
  const f = () => { const t = q.get("t") ? Number(q.get("t")) : (performance.now() - t0) / 1000; W.__t = t; paint(c, size, loop, signature(loop, t)); requestAnimationFrame(f); };
  f();
} else {
  for (const who of ["huginn", "muninn"] as Who[]) for (const s of [240, 64, 32, 24]) paint(cv(s), s, who);
  for (const who of ["huginn", "muninn"] as Who[]) for (const t of [0, 1.65, 2.6, 3.5, 4.5, 5.5]) paint(cv(120), 120, who, signature(who, t));
}
