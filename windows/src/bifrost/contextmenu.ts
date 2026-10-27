// Menu de contexto do Bifrost: o menu nativo do WebView2 nunca aparece.
// Onde um menu faz sentido (texto, campos, corvos) desenhamos o nosso, nórdico.
// Um ouvinte que já tratou o clique direito (o guarda-roupa do Huginn) chama
// preventDefault antes, e aqui nada mais é aberto.

export interface MenuItem {
  label: string;
  rune?: string;
  run: () => void | Promise<void>;
  disabled?: boolean;
}

let open: HTMLElement | null = null;

export function closeMenu(): void {
  open?.remove();
  open = null;
}

export function showMenu(x: number, y: number, items: MenuItem[]): HTMLElement {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "bf-menu m-stagger";
  menu.setAttribute("role", "menu");
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "bf-menu-item";
    b.setAttribute("role", "menuitem");
    b.disabled = !!it.disabled;
    b.style.setProperty("--i", String(menu.childElementCount));
    b.innerHTML = `<span class="bf-menu-rune">${it.rune ?? "᛫"}</span><span></span>`;
    (b.lastChild as HTMLElement).textContent = it.label;
    b.addEventListener("click", async () => {
      closeMenu();
      await it.run();
    });
    menu.append(b);
  }
  document.body.append(menu);
  const w = menu.offsetWidth || 180;
  const h = menu.offsetHeight || items.length * 30;
  const left = Math.max(4, Math.min(x, innerWidth - w - 4));
  const top = Math.max(4, Math.min(y, innerHeight - h - 4));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  // Abre em escala a partir do ponto do clique.
  menu.style.setProperty("--m-origin", `${Math.round(x - left)}px ${Math.round(y - top)}px`);
  open = menu;
  return menu;
}

function editable(t: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  const el = t as HTMLElement | null;
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "range"].includes(el.type)) return el;
  return null;
}

/** Os itens para onde o clique caiu. */
export function itemsFor(target: EventTarget | null, selection: string): MenuItem[] {
  const field = editable(target);
  const items: MenuItem[] = [];
  if (field) {
    const sel = () => field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
    const replace = (text: string) => field.setRangeText(text, field.selectionStart ?? 0, field.selectionEnd ?? 0, "end");
    items.push(
      { label: "Recortar", rune: "ᚲ", disabled: !sel() || field.type === "password", run: async () => { await navigator.clipboard?.writeText(sel()); replace(""); } },
      { label: "Copiar", rune: "ᚷ", disabled: !sel() || field.type === "password", run: () => navigator.clipboard?.writeText(sel()) },
      { label: "Colar", rune: "ᛈ", run: async () => { const t = await navigator.clipboard?.readText(); if (t) replace(t); } },
      { label: "Selecionar tudo", rune: "ᛟ", run: () => field.select() },
    );
  } else if (selection) {
    items.push({ label: "Copiar", rune: "ᚷ", run: () => navigator.clipboard?.writeText(selection) });
  }
  return items;
}

export function installContextMenu(doc: Document = document): void {
  doc.addEventListener("contextmenu", (e) => {
    if (e.defaultPrevented) return; // já tratado (ex.: guarda-roupa do Huginn)
    e.preventDefault();
    const items = itemsFor(e.target, doc.getSelection()?.toString() ?? "");
    if (items.length) showMenu(e.clientX, e.clientY, items);
  });
  doc.addEventListener("pointerdown", (e) => {
    if (open && !open.contains(e.target as Node)) closeMenu();
  });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
  window.addEventListener("blur", closeMenu);
}

installContextMenu();
