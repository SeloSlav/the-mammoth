export type FpDebugMenuSessionSnapshot = {
  doorDebugEnabled: boolean;
  wallProbeEnabled: boolean;
  elevDebugEnabled: boolean;
};

let snapshotFn: (() => FpDebugMenuSessionSnapshot) | null = null;

/** Called when an FP session mounts — enables the debug menu to sync session-only flags. */
export function registerFpDebugMenuSessionSnapshot(fn: () => FpDebugMenuSessionSnapshot): void {
  snapshotFn = fn;
}

export function unregisterFpDebugMenuSessionSnapshot(): void {
  snapshotFn = null;
}

export function getFpDebugMenuSessionSnapshot(): FpDebugMenuSessionSnapshot | null {
  return snapshotFn ? snapshotFn() : null;
}
