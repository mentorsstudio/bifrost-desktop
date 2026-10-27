// Grade dos estilos de personagem sobre a arte raster (só desenvolvimento).
import { drawRig, rigPalette, signature, REST_POSE, onRasterReady, type Who } from "../src/bifrost/rig";
const root = document.getElementById("root")!;
const ids = ["classic", "snow", "ember", "moss", "dusk", "gold", "storm", "theme"];
const q = new URLSearchParams(location.search); const t = q.get("t");
const cs: [CanvasRenderingContext2D, Who, string][] = [];
for (const who of ["huginn", "muninn"] as Who[]) for (const id of ids) {
  const c = document.createElement("canvas"); c.width = c.height = 360; c.style.width = c.style.height = "180px"; root.append(c);
  cs.push([c.getContext("2d")!, who, id]);
}
const paint = () => { for (const [c, who, id] of cs) { c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 180, 180); c.translate(90, 101);
  drawRig(c, who, t ? signature(who, Number(t)) : REST_POSE, rigPalette(who, id, null, undefined, "asgard"), 144 / 112); } (window as any).__ok = 1; };
onRasterReady(paint); paint();
