/** Legacy landing-call prompt state removed; landing hails now come from blue-button raycasts only. */

export type FpElevatorHudView = { kind: "hidden" };

const listeners = new Set<() => void>();

let view: FpElevatorHudView = { kind: "hidden" };

function same(a: FpElevatorHudView, b: FpElevatorHudView): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "hidden" && b.kind === "hidden";
}

export function getFpElevatorHudView(): FpElevatorHudView {
  return view;
}

export function setFpElevatorHudView(next: FpElevatorHudView): void {
  if (same(view, next)) return;
  view = next;
  for (const l of listeners) l();
}

export function subscribeFpElevatorHud(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
