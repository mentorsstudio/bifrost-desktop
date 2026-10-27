// Tiras de quadros dos corvos (0/25/50/75%) para checar colisões. Só desenvolvimento.
import "../src/bifrost/nordic.css";
import { Mascot, MASCOT_STATES, type MascotName } from "../src/bifrost/mascots";
const root = document.getElementById("root")!;
const name = (new URLSearchParams(location.search).get("m") ?? "huginn") as MascotName;
const fr = [0, 0.25, 0.5, 0.75];
for (const st of MASCOT_STATES) {
  const row = document.createElement("div"); row.className = "row";
  row.innerHTML = `<b>${st}</b>`;
  for (const f of fr) {
    const cell = document.createElement("div"); cell.className = "f";
    const m = new Mascot(name, cell); m.set(st);
    cell.append(Object.assign(document.createElement("div"), { textContent: `${f * 100}%` }));
    cell.dataset.f = String(f); row.append(cell);
  }
  for (const s of [32, 64, 128]) {
    const cell = document.createElement("div"); cell.className = "f sz"; cell.style.setProperty("--s", s + "px");
    const m = new Mascot(name, cell); m.set(st); cell.dataset.f = "0.5";
    row.append(cell);
  }
  root.append(row);
}
(window as unknown as { freeze: () => void }).freeze = () => {
  for (const cell of document.querySelectorAll<HTMLElement>(".f")) {
    const f = Number(cell.dataset.f);
    for (const a of cell.getAnimations({ subtree: true })) {
      a.pause();
      const t = a.effect?.getComputedTiming();
      const d = Number(t?.duration) || 0;
      a.currentTime = (Number(t?.delay) || 0) + d * f + (f === 0 && a.animationName?.includes?.("draw") ? 0 : 0);
    }
  }
};
