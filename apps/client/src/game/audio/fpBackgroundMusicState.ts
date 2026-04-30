const STORAGE_KEY = "mammoth.fpBackgroundMusic.enabled";

let enabled = readInitialEnabled();
const listeners = new Set<() => void>();

function readInitialEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function persistEnabled(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* best effort */
  }
}

export function getFpBackgroundMusicEnabled(): boolean {
  return enabled;
}

export function setFpBackgroundMusicEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  persistEnabled(value);
  for (const listener of listeners) listener();
}

export function toggleFpBackgroundMusicEnabled(): void {
  setFpBackgroundMusicEnabled(!enabled);
}

export function subscribeFpBackgroundMusicEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
