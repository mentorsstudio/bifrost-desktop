// A linha do tempo sonora do envio de arquivo: um "tique" a cada 10 %, o sino
// quando a barra completa, e o cartão de escolha depois que o Huginn volta ao tamanho.

export interface UploadMarks { tens: number; done: boolean }
export type UploadCue = "tick" | "complete" | "choose";

/** Avança as marcas para `since` segundos depois da queda; devolve as deixas a tocar. */
export function uploadCues(m: UploadMarks, since: number, preProgress: number, duration: number, viewIsUploading: boolean): UploadCue[] {
  const cues: UploadCue[] = [];
  const p = Math.max(0, Math.min(1, (since - preProgress) / duration));
  const tens = Math.floor(p * 10);
  if (tens > m.tens && tens < 10) { m.tens = tens; cues.push("tick"); }
  if (!m.done && since >= preProgress + duration) { m.done = true; cues.push("complete"); }
  if (since >= preProgress + duration + 1 && viewIsUploading) cues.push("choose");
  return cues;
}

/** Nome do arquivo a partir do caminho (Windows ou Unix). */
export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() || "file";
