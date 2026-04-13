/** FP elevator landing call prompt — in-car floor control is world-space raycast buttons (see `fpElevatorWorld`). */

export type FpElevatorHudView =
  | { kind: "hidden" }
  | {
      kind: "call";
      shaftPlanKey: string;
      /** e.g. "Story 5" */
      floorLabel: string;
    };

const listeners = new Set<() => void>();

let view: FpElevatorHudView = { kind: "hidden" };

function same(a: FpElevatorHudView, b: FpElevatorHudView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "hidden" && b.kind === "hidden") return true;
  if (a.kind === "call" && b.kind === "call") {
    return a.shaftPlanKey === b.shaftPlanKey && a.floorLabel === b.floorLabel;
  }
  return false;
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
