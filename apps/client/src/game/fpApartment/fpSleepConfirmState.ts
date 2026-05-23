export type FpSleepConfirmState = {
  unitKey: string;
};

const listeners = new Set<() => void>();
let state: FpSleepConfirmState | null = null;

export function getFpSleepConfirmState(): FpSleepConfirmState | null {
  return state;
}

export function openFpSleepConfirm(next: FpSleepConfirmState): void {
  state = next;
  for (const l of listeners) l();
}

export function closeFpSleepConfirm(): void {
  if (state === null) return;
  state = null;
  for (const l of listeners) l();
}

export function subscribeFpSleepConfirm(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

let flushPoseBeforeSleep: (() => Promise<void>) | null = null;

/** FP session registers locomotion snapshot flush before `sleep_in_bed`. */
export function registerFpSleepPoseFlush(fn: (() => Promise<void>) | null): void {
  flushPoseBeforeSleep = fn;
}

export async function flushPoseBeforeFpSleep(): Promise<void> {
  if (flushPoseBeforeSleep) await flushPoseBeforeSleep();
}
