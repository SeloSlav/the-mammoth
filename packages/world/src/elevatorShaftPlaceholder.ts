import * as THREE from "three";
import { exteriorConcreteWallMaterial } from "./floorPlaceholderMeshMaterials.js";
import { hoistwayFloor, shaftCeil } from "./shaftHoistwayMaterials.js";
import { addHoistwayUpViewLintelRing } from "./shaftHoistwayUpViewLintels.js";
import { addShaftShell } from "./shaftShell.js";
import {
  SHAFT_DOUBLE_DOOR_H,
  SHAFT_DOUBLE_DOOR_W,
  type ShaftGroundDoorOpts,
} from "./stairElevatorShaftConstants.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";

/**
 * Open-top hoistway (no ceiling) so stacked floors read as one continuous shaft.
 * Optional **concrete pit floor** at the hoistway bottom (use on ground storey only): when every
 * stacked plate adds a slab, each reads as a ceiling to the storey below.
 */
export type ElevatorShaftPlaceholderOpts = {
  groundDoor?: ShaftGroundDoorOpts | null;
  /**
   * Bottom concrete slab inside the shaft. False on upper stacked storeys so the hoistway is
   * open through; true on story 1 (pit over structural hole). Defaults to true when omitted.
   */
  includePitFloor?: boolean;
  /** Flush gap on the door façade wall toward the corridor shell (m); see hoistway shell builder. */
  corridorFlushGapM?: number;
  /** Plate-space perimeter faces for this car's footprint — PBR facade on those walls only. */
  shaftExteriorFaces?: readonly CardinalFace[];
};

/**
 * Ground-door opening in **shaft-interior local Y** and tangent, matching
 * {@link addElevatorShaftPlaceholder} / {@link addShaftShell} (`openTopWallExtend` 0.06,
 * `bandHeightM === sy`). Used to punch matching holes in adjacent corridor shells.
 */
export function elevatorGroundDoorOpeningLocals(
  sx: number,
  sy: number,
  sz: number,
  face: CardinalFace,
  tangentOffsetAlongWall = 0,
): {
  face: CardinalFace;
  tangentOffsetAlongWall: number;
  doorHalfW: number;
  y0Local: number;
  y1Local: number;
} {
  const wt = 0.11;
  const hy = sy * 0.5;
  const topExtend = 0.06;
  const innerWallH = Math.max(sy - 2 * wt + topExtend, 0.08);
  const wallCenterY = (-hy + wt) + innerWallH * 0.5;
  const yWallBottom = wallCenterY - innerWallH * 0.5;
  const yWallTop = wallCenterY + innerWallH * 0.5;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);

  const bandHeightM = sy;
  const bandCap = Math.max(0.55, Math.min(bandHeightM, innerWallH));
  const splitShaft = bandCap < innerWallH - 0.08;
  const ySplit = yWallBottom + bandCap;

  const doorHalfW = Math.min(
    SHAFT_DOUBLE_DOOR_W * 0.5,
    vlenZ * 0.5 - 0.06,
    vlenX * 0.5 - 0.06,
  );
  const doorH = Math.min(SHAFT_DOUBLE_DOOR_H, bandCap - 0.06);
  const yDoor0 = yWallBottom;
  let yDoor1 = yDoor0 + Math.max(0.55, doorH);
  const yCap = splitShaft ? ySplit : yWallTop;
  yDoor1 = Math.min(yDoor1, yCap);

  return {
    face,
    tangentOffsetAlongWall: tangentOffsetAlongWall,
    doorHalfW,
    y0Local: yDoor0,
    y1Local: yDoor1,
  };
}

/**
 * Stair / elevator shaft shells must **not** participate in per-floor-plate
 * {@link mergeGroupDescendantsByMaterial}. Thin `shaft_wall_*_exterior*` skins share
 * `exteriorConcreteWallMaterial` with merged façade concrete — baking them into the same
 * `BufferGeometry` collapses the ~16 mm standoff in floating-point space and breaks depth vs the
 * inner `shaft_wall_*` shells, so distant exterior shots show the brick-toned inner wall "bleeding
 * through". Elevator groups contain only shaft meshes; stair wells share the same `group` with
 * treads/landings, so only `shaft_*`-named meshes are tagged.
 */
export function tagShaftShellMeshesSkipFloorGeometryMerge(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const n = obj.name;
    if (
      n === "shaft_floor" ||
      n === "shaft_ceiling" ||
      n.startsWith("shaft_wall_") ||
      n.startsWith("shaft_hoistway_lintel_")
    ) {
      obj.userData.mammothSkipFloorGeometryMerge = true;
      /** Match unit `shell_*` tagging — frustum tests drop thin shaft walls when the camera is inside. */
      obj.frustumCulled = false;
    }
  });
}

export function addElevatorShaftPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  opts?: ElevatorShaftPlaceholderOpts | null,
): void {
  const includePitFloor = opts?.includePitFloor !== false;
  /** Inner `shaft_wall_*` skins match building exterior concrete; thin perimeter `_exterior` skins use the same mat when listed in `shaftExteriorFaces`. */
  addShaftShell(group, sx, sy, sz, exteriorConcreteWallMaterial, shaftCeil, {
    includeFloor: includePitFloor,
    includeCeiling: false,
    floorMat: hoistwayFloor,
    openTopWallExtend: 0.06,
    groundDoor: opts?.groundDoor ?? null,
    corridorFlushGapM: opts?.corridorFlushGapM,
    exteriorShaftFaces: opts?.shaftExteriorFaces,
    exteriorWallMat: exteriorConcreteWallMaterial,
  });
  {
    const wt = 0.11;
    const hy = sy * 0.5;
    const topExtend = 0.06;
    const innerWallH = Math.max(sy - 2 * wt + topExtend, 0.08);
    const wallCenterY = (-hy + wt) + innerWallH * 0.5;
    const yWallTop = wallCenterY + innerWallH * 0.5;
    const vlenX = Math.max(sx - 2 * wt, 0.05);
    const vlenZ = Math.max(sz - 2 * wt, 0.05);
    addHoistwayUpViewLintelRing(group, exteriorConcreteWallMaterial, vlenX, vlenZ, yWallTop);
  }
  /** Skip {@link mergeGroupDescendantsByMaterial}: hoistway walls are thin shells; merge + frustum / WebGPU paths made them vanish while collision stayed valid. */
  tagShaftShellMeshesSkipFloorGeometryMerge(group);
}
