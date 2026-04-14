/** FP elevator landing call prompt — in-car floor control is world-space raycast buttons (see `fpElevatorWorld`). */

export type FpElevatorHudView =
  | { kind: "hidden" }
  | {
      kind: "exterior_door";
      shaftPlanKey: string;
      landingLevel: number;
      /** Next toggle will drive toward closed. */
      willClose: boolean;
    }
  | {
      kind: "call";
      shaftPlanKey: string;
      /** 1-based landing level sent to `elevatorHail` (matches server `near_call_pose`). */
      callLevel: number;
      /** e.g. "Story 5" */
      floorLabel: string;
    };

const listeners = new Set<() => void>();

let view: FpElevatorHudView = { kind: "hidden" };

function same(a: FpElevatorHudView, b: FpElevatorHudView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "hidden" && b.kind === "hidden") return true;
  if (a.kind === "exterior_door" && b.kind === "exterior_door") {
    return (
      a.shaftPlanKey === b.shaftPlanKey &&
      a.landingLevel === b.landingLevel &&
      a.willClose === b.willClose
    );
  }
  if (a.kind === "call" && b.kind === "call") {
    return (
      a.shaftPlanKey === b.shaftPlanKey &&
      a.callLevel === b.callLevel &&
      a.floorLabel === b.floorLabel
    );
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
