let open = false;
const listeners = new Set<() => void>();

export function getFpMissionsPanelOpen(): boolean {
  return open;
}

export function setFpMissionsPanelOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of [...listeners]) l();
}

export function subscribeFpMissionsPanel(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function toggleFpMissionsPanel(): boolean {
  setFpMissionsPanelOpen(!open);
  return open;
}
