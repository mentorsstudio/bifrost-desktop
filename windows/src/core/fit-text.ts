// Regra geral de "texto cabe": qualquer elemento com a classe `bf-fit` diminui a
// letra (até `data-fit-min` px, padrão 10) até o texto inteiro caber na caixa do
// pai com folga de `data-fit-gap` px (padrão 2) de cada lado, em vez de cortar
// com reticências ou encostar na borda. Um ResizeObserver refaz ao mudar a largura.

const FIT_CLASS = "bf-fit";

function contentWidth(el: HTMLElement): number {
  const s = getComputedStyle(el);
  return el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
}

function textWidth(el: HTMLElement): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().width;
}

/** Ajusta um elemento já no DOM. Devolve o tamanho final (px). */
export function fitText(el: HTMLElement): number {
  const host = el.parentElement;
  if (!host) return 0;
  el.style.fontSize = "";
  const min = parseFloat(el.dataset.fitMin ?? "") || 10;
  const gap = parseFloat(el.dataset.fitGap ?? "") || 2;
  const room = contentWidth(host) - 2 * gap;
  let size = parseFloat(getComputedStyle(el).fontSize) || 13;
  if (room <= 0) return size;
  const need = textWidth(el);
  if (need <= room) return size;
  size = Math.max(min, Math.floor(((size * room) / need) * 2) / 2);
  el.style.fontSize = `${size}px`;
  while (textWidth(el) > room && size > min) {
    size -= 0.5;
    el.style.fontSize = `${size}px`;
  }
  return size;
}

let ro: ResizeObserver | null = null;
const watched = new WeakSet<Element>();

/** Ajusta todos os `.bf-fit` dentro de `root` e continua ajustando quando o pai muda de largura. */
export function fitAll(root: ParentNode = document): void {
  const els = root.querySelectorAll<HTMLElement>(`.${FIT_CLASS}`);
  if (typeof ResizeObserver !== "undefined" && !ro) {
    ro = new ResizeObserver((entries) => {
      for (const e of entries) for (const c of (e.target as HTMLElement).querySelectorAll<HTMLElement>(`:scope > .${FIT_CLASS}`)) fitText(c);
    });
  }
  for (const el of els) {
    fitText(el);
    const host = el.parentElement;
    if (ro && host && !watched.has(host)) { watched.add(host); ro.observe(host); }
  }
}
