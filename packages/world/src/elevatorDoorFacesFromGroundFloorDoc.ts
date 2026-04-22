import type { FloorDoc, PlacedObject, StairWellDef } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import { shaftPlanKey } from "./buildingStairShafts.js";
import { elevatorDoorFaceFromFloorCorridors } from "./shaftCorridorFlush.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import type { ShaftSlabHole } from "./shaftPlanformClip.js";

export type BuildFloorMeshesOptions = {
  /**
   * Skip per-plate stair geometry for columns that are drawn once as full-height shafts
   * (`shaftPlanKey` from `obj.position` XZ).
   */
  stairShaftSkipKeys?: ReadonlySet<string>;
  /** 1-based storey index (elevator pit / grass occluder / lobby shell use this). */
  storyLevelIndex?: number;
  /**
   * When stacking plates, union of all shaft/stair holes (plate-space XZ). Passed from
   * {@link instantiateBuildingFloorStack} so upper slabs/shells never cap another storey’s hoistway.
   */
  shaftHolesPlateMerged?: readonly ShaftSlabHole[];
  /** Elevator-only merged holes (plate-space); extra punch on hollow shell floor/ceiling. */
  shaftElevatorsMerged?: readonly ShaftSlabHole[];
  /**
   * World-space Y of this plate’s origin (building `worldOrigin[1]` + storey offset). Used so
   * the ground-storey grass occluder lines up with {@link FP_OUTDOOR_GROUND_VISUAL_Y}.
   */
  plateWorldOriginY?: number;
  /**
   * Per {@link shaftPlanKey}, door wall face chosen on **story 1** of a stacked building.
   * Passed from {@link instantiateBuildingFloorStack} so upper storeys match the ground door side.
   */
  elevatorDoorFaceByShaftKey?: ReadonlyMap<string, CardinalFace>;
  /** Shared authored stairwell appearance / delta transforms. */
  stairWellDef?: StairWellDef;
  /**
   * True when this plate is the highest level in the stacked building (see
   * {@link instantiateBuildingFloorStack}). Used for roof-exit stair landing props.
   */
  isTopOccupiedFloor?: boolean;
  /** Optional authored compact floor label for landing signs, e.g. `PR`, `1`, `19`. */
  storyShortLabel?: string;
  /**
   * Salt for deterministic unit exterior window layout (facade). Same building content yields the
   * same windows until this value changes.
   */
  facadeSalt?: number;
};

type ElevatorDoorFaceOverrideMeta = {
  elevatorDoorFace?: unknown;
};

export function readElevatorDoorFaceOverride(
  obj: Pick<PlacedObject, "metadata">,
): CardinalFace | undefined {
  const face = (obj.metadata as ElevatorDoorFaceOverrideMeta | undefined)?.elevatorDoorFace;
  return face === "e" || face === "w" || face === "n" || face === "s" ? face : undefined;
}

/**
 * Ground-storey elevator door faces (plate-space), keyed by {@link shaftPlanKey} at each car’s XZ.
 */
export function elevatorDoorFacesFromGroundFloorDoc(
  doc: FloorDoc,
): Map<string, CardinalFace> {
  const floor = withoutElevatorsInStairwells(doc);
  let plateCx = 0;
  let plateCz = 0;
  let plateN = 0;
  for (const o of floor.objects) {
    plateCx += o.position[0];
    plateCz += o.position[2];
    plateN += 1;
  }
  if (plateN > 0) {
    plateCx /= plateN;
    plateCz /= plateN;
  }
  const out = new Map<string, CardinalFace>();
  for (const o of floor.objects) {
    if (!o.prefabId.toLowerCase().includes("elevator")) continue;
    const k = shaftPlanKey(o.position[0], o.position[2]);
    const overrideFace = readElevatorDoorFaceOverride(o);
    out.set(
      k,
      overrideFace ??
        elevatorDoorFaceFromFloorCorridors(
          o.position[0],
          o.position[2],
          floor,
          plateCx,
          plateCz,
        ),
    );
  }
  return out;
}
