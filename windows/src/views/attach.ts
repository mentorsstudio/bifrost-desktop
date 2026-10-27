// Fase 19 — o "+" do compositor do chat. Um registro genérico de ações de anexar:
// qualquer recurso (o conversor de arquivos do ramo filee-integration, por
// exemplo) entra com `registerAttachAction` sem mexer no chat.

export interface AttachAction {
  id: string;
  /** Rótulo em pt-BR, mostrado no menu do "+". */
  label: string;
  /** Caminho SVG 24×24 (ICONS) ou uma runa/emoji curta. */
  icon?: string;
  /** Ordem no menu (menor primeiro). */
  order?: number;
  /** Some do menu quando devolve false. */
  available?: () => boolean;
  run: (ctx: AttachContext) => void | Promise<void>;
}

export interface AttachContext {
  /** Põe texto no campo (no cursor), como um anexo colado. */
  insert(text: string): void;
  /** Anexa um arquivo à conversa (o mesmo de soltar na ilha). */
  attachFile(name: string, path: string): void;
  /** Fecha o menu e devolve o foco ao campo. */
  done(): void;
}

const actions = new Map<string, AttachAction>();
const subs = new Set<() => void>();

export function registerAttachAction(a: AttachAction): () => void {
  actions.set(a.id, a);
  for (const fn of subs) fn();
  return () => { actions.delete(a.id); for (const fn of subs) fn(); };
}

export function attachActions(): AttachAction[] {
  return [...actions.values()].filter((a) => a.available?.() ?? true).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

export function onAttachActionsChange(fn: () => void): () => void { subs.add(fn); return () => subs.delete(fn); }
