import type { FpAuthoringPick, LocalFirstPersonPresenter } from "@the-mammoth/engine";

let getPicks: (() => FpAuthoringPick[]) | null = null;
let getFpPresenter: (() => LocalFirstPersonPresenter | undefined) | null = null;
let frameOrbitOnViewmodel: (() => void) | null = null;
let frameMountIntoGameplayView: (() => void) | null = null;

export function registerFpViewmodelAuthoringBridge(
  handlers: {
    getPicks: () => FpAuthoringPick[];
    /** Live FP presenter (hand + weapon) for swing capture, etc. */
    getPresenter?: () => LocalFirstPersonPresenter | undefined;
    /** Repositions the editor orbit camera so the hand/weapon cluster is in view. */
    frameOrbitOnViewmodel?: () => void;
    /**
     * Gameplay lens: snap rig to engine defaults, then nudge so the crowbar mount sits in the
     * camera frame (see editor look pitch). In-memory until Save layout.
     */
    frameMountIntoGameplayView?: () => void;
  } | null,
): void {
  if (!handlers) {
    getPicks = null;
    getFpPresenter = null;
    frameOrbitOnViewmodel = null;
    frameMountIntoGameplayView = null;
    return;
  }
  getPicks = handlers.getPicks;
  getFpPresenter = handlers.getPresenter ?? null;
  frameOrbitOnViewmodel = handlers.frameOrbitOnViewmodel ?? null;
  frameMountIntoGameplayView = handlers.frameMountIntoGameplayView ?? null;
}

export function getFpViewmodelAuthoringPicks(): FpAuthoringPick[] {
  return getPicks?.() ?? [];
}

export function getFpViewmodelPresenterForAuthoring(): LocalFirstPersonPresenter | undefined {
  return getFpPresenter?.();
}

/** Orbit camera → viewmodel bounds; also switch to Orbit mode via {@link useEditorStore}. */
export function frameFpViewmodelOrbitCamera(): void {
  frameOrbitOnViewmodel?.();
}

/** Snap defaults + align hand/weapon so the crowbar mount sits in the gameplay FP frustum. */
export function frameFpMountIntoGameplayView(): void {
  frameMountIntoGameplayView?.();
}
