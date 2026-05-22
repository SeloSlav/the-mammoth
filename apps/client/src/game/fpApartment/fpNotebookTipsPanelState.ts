const listeners = new Set<() => void>();

let open = false;

export function isFpNotebookTipsPanelOpen(): boolean {
  return open;
}

export function openFpNotebookTipsPanel(): void {
  if (open) return;
  open = true;
  for (const l of listeners) l();
}

export function closeFpNotebookTipsPanel(): void {
  if (!open) return;
  open = false;
  for (const l of listeners) l();
}

export function toggleFpNotebookTipsPanel(): void {
  if (open) closeFpNotebookTipsPanel();
  else openFpNotebookTipsPanel();
}

export function subscribeFpNotebookTipsPanel(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
