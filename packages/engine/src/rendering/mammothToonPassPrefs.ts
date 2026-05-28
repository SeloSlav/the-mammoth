/** Shared localStorage key — editor + FP session read the same toggle. */
export const MAMMOTH_TOON_PASS_LS_KEY = "mammothToonPass";

/** Legacy FP-only key before editor shared toggle — still read for migration. */
const LEGACY_FP_TOON_PASS_LS_KEY = "mammothFpToonPass";

/** @deprecated Use {@link MAMMOTH_TOON_PASS_LS_KEY}. */
export const LS_FP_TOON_PASS = MAMMOTH_TOON_PASS_LS_KEY;

const listeners = new Set<() => void>();

function notifyMammothToonPassListeners(): void {
  for (const listener of listeners) listener();
}

export function isMammothToonPassEnabled(): boolean {
  try {
    const storage = globalThis.localStorage;
    if (storage?.getItem(MAMMOTH_TOON_PASS_LS_KEY) === "1") return true;
    if (storage?.getItem(LEGACY_FP_TOON_PASS_LS_KEY) === "1") return true;
    return false;
  } catch {
    return false;
  }
}

export function setMammothToonPassEnabled(on: boolean): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      notifyMammothToonPassListeners();
      return;
    }
    if (on) {
      storage.setItem(MAMMOTH_TOON_PASS_LS_KEY, "1");
      storage.removeItem(LEGACY_FP_TOON_PASS_LS_KEY);
    } else {
      storage.removeItem(MAMMOTH_TOON_PASS_LS_KEY);
      storage.removeItem(LEGACY_FP_TOON_PASS_LS_KEY);
    }
  } catch {
    /* quota / private mode */
  }
  notifyMammothToonPassListeners();
}

export function subscribeMammothToonPassEnabled(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent): void => {
    if (
      event.key === MAMMOTH_TOON_PASS_LS_KEY ||
      event.key === LEGACY_FP_TOON_PASS_LS_KEY
    ) {
      onChange();
    }
  };
  globalThis.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    globalThis.removeEventListener?.("storage", onStorage);
  };
}

export function getMammothToonPassEnabledSnapshot(): boolean {
  return isMammothToonPassEnabled();
}
