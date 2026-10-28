// v25: o fundo da faixa do hub — runas do Futhark Antigo subindo devagar e
// sumindo, em tamanhos variados, com um leve paralaxe e brilho na cor de
// destaque do tema. Um canvas por faixa, um laço só para todas; pausa quando a
// janela some (bf-hub-hidden), quando a aba fica oculta ou quando a faixa sai
// da tela. Com movimento reduzido: uma constelação parada.
//
// Easter egg (original, sem nomes nem arte de terceiros): clicar 7 vezes no
// escudo do Huginn, ou digitar ↑↑↓↓←→←→BA, chama o "Fimbulwinter" — geada nas
// bordas e neve por ~4 s, enquanto as runas se alinham em ᚱᚨᚷᚾᚨᚱᛟᚲ.

import { windowShown } from "./hero";

const FUTHARK = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
export const SECRET = "ᚱᚨᚷᚾᚨᚱᛟᚲ";
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
export const WINTER_MS = 4000;

interface Rune { ch: string; x: number; y: number; size: number; depth: number; speed: number; phase: number; life: number }
interface Flake { x: number; y: number; r: number; vy: number; vx: number }
interface Field { canvas: HTMLCanvasElement; host: HTMLElement; runes: Rune[]; flakes: Flake[]; visible: boolean; winterUntil: number; px: number; py: number; color: string }

const fields = new Set<Field>();
let raf = 0;
let last = 0;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function spawn(w: number, h: number, anywhere: boolean): Rune {
  return {
    ch: FUTHARK[(Math.random() * FUTHARK.length) | 0], x: rand(0, w), y: anywhere ? rand(0, h) : h + rand(4, 30),
    size: rand(10, 30), depth: rand(0.2, 1), speed: rand(5, 14), phase: rand(0, Math.PI * 2), life: anywhere ? rand(0, 1) : 0,
  };
}

function accent(host: HTMLElement): string {
  const cs = getComputedStyle(host);
  return cs.getPropertyValue("--bf-aurora-1").trim() || cs.getPropertyValue("--hero-accent").trim() || "#5ef2c9";
}

function size(f: Field): [number, number, number] {
  const r = f.host.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (f.canvas.width !== Math.round(w * dpr) || f.canvas.height !== Math.round(h * dpr)) {
    f.canvas.width = Math.round(w * dpr); f.canvas.height = Math.round(h * dpr);
  }
  return [w, h, dpr];
}

function draw(f: Field, now: number, dt: number) {
  const [w, h, dpr] = size(f);
  const g = f.canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const target = Math.max(14, Math.round(w / 34));
  while (f.runes.length < target) f.runes.push(spawn(w, h, f.runes.length < target / 2 || reduced()));
  const winter = now < f.winterUntil;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = f.color; g.fillStyle = f.color;
  f.runes.forEach((r, i) => {
    if (!reduced() && !winter) {
      r.y -= r.speed * r.depth * dt;
      r.life += dt / 18;
      if (r.y < -30 || r.life > 1) f.runes[i] = spawn(w, h, false);
    }
    let x = r.x + f.px * 10 * r.depth, y = r.y + f.py * 6 * r.depth;
    let alpha = Math.min(1, (h - r.y) / 40) * Math.max(0, Math.min(1, r.y / (h * 0.5))) * (0.08 + 0.14 * r.depth);
    let ch = r.ch, sz = r.size;
    if (winter && i < SECRET.length) {
      // As runas do segredo deslizam para uma linha no meio da faixa.
      const k = Math.min(1, 1 - (f.winterUntil - now) / 900);
      const tx = w * 0.5 + (i - (SECRET.length - 1) / 2) * 26, ty = h * 0.5;
      x += (tx - x) * k; y += (ty - y) * k; ch = SECRET[i]; sz = 22; alpha = 0.18 + 0.5 * k;
    }
    if (reduced()) alpha = 0.06 + 0.12 * r.depth;
    g.globalAlpha = alpha;
    g.shadowBlur = 6 + 8 * r.depth;
    g.font = `${sz}px "Segoe UI Historic", "Noto Sans Runic", serif`;
    g.fillText(ch, x, y + Math.sin(now / 1400 + r.phase) * 2);
  });
  if (winter) {
    if (f.flakes.length < 70) for (let i = 0; i < 4; i++) f.flakes.push({ x: rand(0, w), y: -4, r: rand(0.8, 2.4), vy: rand(18, 46), vx: rand(-8, 8) });
    g.shadowBlur = 0; g.fillStyle = "#eef6ff";
    for (const s of f.flakes) {
      s.y += s.vy * dt; s.x += s.vx * dt;
      g.globalAlpha = 0.75; g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
    }
    f.flakes = f.flakes.filter((s) => s.y < h + 4);
  } else f.flakes.length = 0;
  g.globalAlpha = 1;
}

function tick(now: number) {
  raf = 0;
  const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
  last = now;
  let any = false;
  for (const f of fields) {
    if (!f.host.isConnected) { fields.delete(f); continue; }
    if (!f.visible || !windowShown() || document.hidden) continue;
    draw(f, now, dt);
    any = true;
  }
  // Movimento reduzido: desenha uma vez e para (a não ser no inverno).
  const winter = [...fields].some((f) => now < f.winterUntil);
  if (any && (!reduced() || winter)) raf = requestAnimationFrame(tick);
  else last = 0;
}

export function wake() { if (!raf) raf = requestAnimationFrame(tick); }

/** O canvas das runas para uma faixa. `trigger` é o escudo que guarda o segredo. */
export function runeField(host: HTMLElement, trigger?: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "bf-hero-runes";
  canvas.setAttribute("aria-hidden", "true");
  const f: Field = { canvas, host, runes: [], flakes: [], visible: true, winterUntil: 0, px: 0, py: 0, color: "#5ef2c9" };
  fields.add(f);
  requestAnimationFrame(() => { f.color = accent(host); wake(); });
  new IntersectionObserver(([e]) => { f.visible = e.isIntersecting; if (f.visible) wake(); }).observe(host);
  new MutationObserver(() => { f.color = accent(host); wake(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    f.px = (e.clientX - r.left) / r.width - 0.5; f.py = (e.clientY - r.top) / r.height - 0.5;
  }, { passive: true });
  const winter = () => {
    f.winterUntil = performance.now() + WINTER_MS;
    host.classList.add("bf-fimbulwinter");
    setTimeout(() => host.classList.remove("bf-fimbulwinter"), WINTER_MS);
    wake();
  };
  let clicks: number[] = [];
  trigger?.addEventListener("click", () => {
    const t = performance.now();
    clicks = [...clicks.filter((c) => t - c < 3000), t];
    if (clicks.length >= 7) { clicks = []; winter(); }
  });
  let seq = 0;
  const onKey = (e: KeyboardEvent) => {
    if (!host.isConnected) { window.removeEventListener("keydown", onKey); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    seq = k === KONAMI[seq] ? seq + 1 : k === KONAMI[0] ? 1 : 0;
    if (seq === KONAMI.length) { seq = 0; winter(); }
  };
  window.addEventListener("keydown", onKey);
  (host as HTMLElement & { __winter?: () => void }).__winter = winter;
  return canvas;
}
