// Fase 21: as marcas do Spotify e do YouTube Music em vetor limpo, nítidas em
// 14–24 px (nada de "mascote" com olhos na pílula de mídia). Sem innerHTML.
const NS = "http://www.w3.org/2000/svg";
type Node = [string, Record<string, string>];

function el(tag: string, attrs: Record<string, string>): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const wave = (d: string, w: string): Node => ["path", { d, fill: "none", stroke: "#0B0F0C", "stroke-width": w, "stroke-linecap": "round" }];

/** O círculo verde com as três ondas. */
export const SPOTIFY_MARK: Node[] = [
  ["circle", { cx: "12", cy: "12", r: "11", fill: "#1DB954" }],
  wave("M6.4 9.1c3.9-1.2 8.3-.8 11.6 1.1", "1.9"),
  wave("M7 12.4c3.2-.9 6.6-.5 9.3 1", "1.6"),
  wave("M7.6 15.5c2.5-.6 5-.3 7.1.8", "1.35"),
];

/** O círculo vermelho com o anel e o play do YouTube Music. */
export const YTMUSIC_MARK: Node[] = [
  ["circle", { cx: "12", cy: "12", r: "11", fill: "#FF0033" }],
  ["circle", { cx: "12", cy: "12", r: "5.6", fill: "none", stroke: "#fff", "stroke-width": "1.3" }],
  ["path", { d: "M10.4 9.6v4.8l4.1-2.4z", fill: "#fff" }],
];

export function mediaMark(source: "spotify" | "ytmusic", size = 18): SVGElement {
  const label = MEDIA_NAME[source];
  const s = el("svg", { viewBox: "0 0 24 24", width: String(size), height: String(size), role: "img", "aria-label": label, class: "media-mark" });
  for (const [tag, attrs] of source === "ytmusic" ? YTMUSIC_MARK : SPOTIFY_MARK) s.append(el(tag, attrs));
  return s;
}

export const MEDIA_NAME = { spotify: "Spotify", ytmusic: "YouTube Music" } as const;
