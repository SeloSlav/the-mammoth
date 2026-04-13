import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import { shaftPlanKey } from "./buildingStairShafts.js";
import { elevatorDoorFacesFromGroundFloorDoc } from "./elevatorDoorFacesFromGroundFloorDoc.js";
import { shaftFloorLocalTopY } from "./stairWellGeometry.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";

/** One hoistway column (plan XZ) used to mount a moving car + doors. */
export type ElevatorShaftLayout = {
  planKey: string;
  /** Plate-space X (m), same convention as `PlacedObject.position`. */
  plateX: number;
  /** Plate-space Z (m). */
  plateZ: number;
  /** Elevator object local Y on each stacked plate (m). */
  plateLocalY: number;
  sx: number;
  sy: number;
  sz: number;
  doorFace: CardinalFace;
};

const WT = 0.11;

/** Inner half-width / half-depth inside hoistway walls (plate-local axes). */
export function elevatorHoistwayInnerHalfExtents(sx: number, sz: number): {
  halfX: number;
  halfZ: number;
} {
  return { halfX: sx * 0.5 - WT, halfZ: sz * 0.5 - WT };
}

/**
 * World-space Y where FP feet should snap on this level (matches walk AABB top +
 * {@link FP_LOCOMOTION_SKIN} used in `@the-mammoth/engine` `fpLocomotion`).
 */
export function elevatorSupportFeetWorldY(opts: {
  buildingWorldOriginY: number;
  /** `BuildingFloorRef.levelIndex` (1 = ground plate). */
  levelIndex: number;
  floorSpacingM: number;
  shaftPlateLocalY: number;
  shaftSy: number;
}): number {
  const plateWorldY =
    opts.buildingWorldOriginY + (opts.levelIndex - 1) * opts.floorSpacingM;
  const slabTop =
    plateWorldY + opts.shaftPlateLocalY + shaftFloorLocalTopY(opts.shaftSy);
  return slabTop + FP_LOCOMOTION_SKIN;
}

/** Keep in sync with `SKIN` in `packages/engine/src/fpLocomotion.ts`. */
export const FP_LOCOMOTION_SKIN = 0.034;

function isElevatorPrefab(prefabId: string): boolean {
  return prefabId.toLowerCase().includes("elevator");
}

/**
 * Lists distinct elevator hoistways for gameplay (one car per {@link shaftPlanKey}).
 * Door faces come from the **ground** plate so stacked storeys match the mesher.
 */
export function listElevatorShaftLayouts(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
): ElevatorShaftLayout[] {
  const sorted = [...building.floorRefs].sort(
    (a, b) => a.levelIndex - b.levelIndex,
  );
  const groundRef = sorted.find((r) => r.levelIndex === 1);
  const doorMap = groundRef
    ? elevatorDoorFacesFromGroundFloorDoc(getFloorDoc(groundRef.floorDocId))
    : new Map<string, CardinalFace>();

  const byKey = new Map<string, ElevatorShaftLayout>();
  for (const ref of sorted) {
    const doc = getFloorDoc(ref.floorDocId);
    for (const o of doc.objects) {
      if (!isElevatorPrefab(o.prefabId)) continue;
      const [x, y, z] = o.position;
      const k = shaftPlanKey(x, z);
      if (byKey.has(k)) continue;
      const sx = o.scale?.[0] ?? 1;
      const sy = o.scale?.[1] ?? 1;
      const sz = o.scale?.[2] ?? 1;
      const doorFace = doorMap.get(k) ?? "n";
      byKey.set(k, {
        planKey: k,
        plateX: x,
        plateZ: z,
        plateLocalY: y,
        sx,
        sy,
        sz,
        doorFace,
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.planKey < b.planKey ? -1 : a.planKey > b.planKey ? 1 : 0,
  );
}

export function maxBuildingLevelIndex(building: BuildingDoc): number {
  let m = 1;
  for (const r of building.floorRefs) {
    m = Math.max(m, r.levelIndex);
  }
  return m;
}
