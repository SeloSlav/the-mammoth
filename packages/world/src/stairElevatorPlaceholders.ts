import * as THREE from "three";
import type { StairWellDef } from "@the-mammoth/schemas";
import {
  computeSwitchbackStairLayout,
  STOREY_SPACING_M,
  type SwitchbackStairOpts,
} from "./stairWellGeometry.js";
import {
  addDoorFrameTrimConstantX,
  addDoorFrameTrimConstantZ,
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  pickFaceTowardPoint,
  type CardinalFace,
  type WallHoleXY,
  type WallHoleYZ,
} from "./wallWithDoorCutout.js";
import { concreteMaterial } from "./floorPlaceholderMeshMaterials.js";
import { applyCabMaterialSlot } from "./elevatorVisualMaterialUtils.js";

/** Elevator hoistway exterior: light brutalist brick-red concrete so shafts read as distinct tower cores. */
const shaftWall = concreteMaterial(0xd5a19b);
/** Pit / landing slab at hoistway bottom (world slab is open here — must not read as outdoor grass). */
const hoistwayFloor = new THREE.MeshStandardMaterial({
  color: 0xa09d99,
  roughness: 0.94,
  metalness: 0.025,
});
const shaftCeil = new THREE.MeshStandardMaterial({
  color: 0xe0e6ee,
  roughness: 0.88,
  metalness: 0.03,
});
const doorFrameMat = new THREE.MeshStandardMaterial({
  color: 0x4a4846,
  roughness: 0.42,
  metalness: 0.55,
});

export const STAIR_WELL_EDITOR_PART_IDS = [
  "shaft_floor",
  "shaft_wall",
  "stair_tread",
  "stair_corner_landing",
  "stair_rail_post",
] as const;

export type StairWellEditorPartId = (typeof STAIR_WELL_EDITOR_PART_IDS)[number];
export type StairWellAuthoringScope = "typical" | "ground";

type StairWellMaterialSet = {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  tread: THREE.MeshStandardMaterial;
  landing: THREE.MeshStandardMaterial;
  railing: THREE.MeshStandardMaterial;
};

function createStairWellMaterials(def: StairWellDef | undefined): StairWellMaterialSet {
  const wall = concreteMaterial(0xd7dce2);
  const floor = new THREE.MeshStandardMaterial({
    color: 0xa09d99,
    roughness: 0.94,
    metalness: 0.025,
  });
  const tread = new THREE.MeshStandardMaterial({
    color: 0xc5cad2,
    roughness: 0.92,
    metalness: 0.025,
  });
  const landing = new THREE.MeshStandardMaterial({
    color: 0xb8c0ca,
    roughness: 0.92,
    metalness: 0.025,
  });
  const railing = new THREE.MeshStandardMaterial({
    color: 0x5c5a58,
    roughness: 0.35,
    metalness: 0.35,
  });
  applyCabMaterialSlot(wall, def?.materials?.wall);
  applyCabMaterialSlot(floor, def?.materials?.floor);
  applyCabMaterialSlot(tread, def?.materials?.tread);
  applyCabMaterialSlot(landing, def?.materials?.landing);
  applyCabMaterialSlot(railing, def?.materials?.railing);
  return { wall, floor, tread, landing, railing };
}

function setStairWellEditorPartId(
  obj: THREE.Object3D,
  partId: StairWellEditorPartId,
  scope: StairWellAuthoringScope,
): void {
  obj.userData.editorStairPartId = partId;
  obj.userData.editorStairAuthoringScope = scope;
  obj.userData.editorStairBasePosition = [
    obj.position.x,
    obj.position.y,
    obj.position.z,
  ] as const;
  obj.userData.editorStairBaseScale = [
    obj.scale.x,
    obj.scale.y,
    obj.scale.z,
  ] as const;
  obj.userData.editorStairBaseRotation = [
    obj.quaternion.x,
    obj.quaternion.y,
    obj.quaternion.z,
    obj.quaternion.w,
  ] as const;
}

function recordStairWellBaseTransforms(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const partId = obj.userData.editorStairPartId as StairWellEditorPartId | undefined;
    if (!partId) return;
    const scope =
      (obj.userData.editorStairAuthoringScope as StairWellAuthoringScope | undefined) ??
      "typical";
    setStairWellEditorPartId(obj, partId, scope);
  });
}

/**
 * Ground-level hoistway / stair entry: **double-door clear width** (m).
 * Leaf geometry comes later — opening + frame trim only for now.
 */
export const SHAFT_DOUBLE_DOOR_W = 1.86;

/** Exported for mega-shaft corridor door band spacing (m). */
export const SHAFT_DOUBLE_DOOR_H = 2.2;
const SHAFT_DOOR_SILL = 0.05;
/** Ground-level door cutout only reaches this high on mega stair shafts (m). */
export const SHAFT_GROUND_DOOR_BAND_M = STOREY_SPACING_M - 0.38;

export type ShaftGroundDoorOpts = {
  /**
   * Elevators: set explicitly. Stair wells: omit and provide `towardPlateXZ` + `shaftPlateXZ`
   * so a face is chosen away from circulating treads / corner landings.
   */
  face?: CardinalFace;
  /**
   * Vertical band from interior floor where a door opening may be cut (m).
   * Full-height shells use the whole wall; mega shafts use ~one storey.
   */
  bandHeightM: number;
  /** Plate-space XZ (e.g. floor centroid) for stair door tie-break / fallback. */
  towardPlateXZ?: readonly [number, number];
  /** Plate-space XZ of this shaft’s column (stair auto door only). */
  shaftPlateXZ?: readonly [number, number];
  /**
   * Hole centre offset along wall tangent (+Z for E/W, +X for N/S). Stairs: set by auto placement.
   */
  tangentOffsetAlongWall?: number;
  /**
   * When set (stair only), overrides sill-based vertical extent for the door cutout / frame
   * (shaft interior local Y, same frame as treads / landings).
   */
  doorHoleY0Local?: number;
  doorHoleY1Local?: number;
};

type ShaftShellOpts = {
  /** If false, no bottom slab (hoistway stays open through stacked floors). */
  includeFloor: boolean;
  /** If false, top stays open so you can see through stacked storeys. */
  includeCeiling: boolean;
  /** Bottom slab mat when `includeFloor`; defaults to wall mat. */
  floorMat?: THREE.MeshStandardMaterial;
  /** When no ceiling: lengthen interior walls slightly to tuck past storey plate seams. */
  openTopWallExtend?: number;
  /** Single ground-level opening (toward lobby / building core). */
  groundDoor?: ShaftGroundDoorOpts | null;
  /**
   * Extra corridor door holes on the **east/west** door wall (same YZ convention as the primary
   * door). When non-empty, the shell is not split; used for full-height mega shafts (one band
   * per storey).
   */
  corridorDoorExtraHolesYZ?: readonly WallHoleYZ[];
  /** Same for **north/south** door walls (XY holes). */
  corridorDoorExtraHolesXY?: readonly WallHoleXY[];
  /**
   * Extend the **door** façade wall outward (toward the adjacent corridor shell) by this much
   * so thin air gaps between shaft boxes and hollow corridor shells do not read as missing exterior.
   */
  corridorFlushGapM?: number;
};

/**
 * Door opening span along the tangent axis in **shaft-local** coordinates.
 * Must stay in sync with {@link addShaftShell} hole clamping (`vlen*` / `zMinWall` / `xMinWall`).
 */
export function stairShaftDoorTangentSpanShaftLocal(
  sx: number,
  sz: number,
  doorFace: CardinalFace,
  tangentOffsetAlongWall: number,
  doorHalfW: number,
): { z0: number; z1: number } | { x0: number; x1: number } {
  const wt = 0.11;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;
  if (doorFace === "e" || doorFace === "w") {
    const z0 = Math.max(zMin, tangentOffsetAlongWall - doorHalfW);
    const z1 = Math.min(zMax, tangentOffsetAlongWall + doorHalfW);
    return { z0, z1 };
  }
  const x0 = Math.max(xMin, tangentOffsetAlongWall - doorHalfW);
  const x1 = Math.min(xMax, tangentOffsetAlongWall + doorHalfW);
  return { x0, x1 };
}

function addShaftShell(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  wallM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
  opts: ShaftShellOpts,
): void {
  const wt = 0.11;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const topExtend =
    opts.includeCeiling ? 0 : Math.max(0, opts.openTopWallExtend ?? 0);
  const innerWallH = Math.max(sy - 2 * wt + topExtend, 0.08);
  const wallCenterY = (-hy + wt) + innerWallH * 0.5;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const yWallBottom = wallCenterY - innerWallH * 0.5;
  const yWallTop = wallCenterY + innerWallH * 0.5;

  if (opts.includeFloor) {
    const floorMat = opts.floorMat ?? wallM;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), floorMat);
    floor.name = "shaft_floor";
    floor.position.set(0, -hy + wt * 0.5, 0);
    group.add(floor);
  }

  if (opts.includeCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), ceilM);
    ceiling.name = "shaft_ceiling";
    ceiling.position.set(0, hy - wt * 0.5, 0);
    group.add(ceiling);
  }

  const door = opts.groundDoor ?? null;
  const extraHolesYZ = opts.corridorDoorExtraHolesYZ ?? [];
  const extraHolesXY = opts.corridorDoorExtraHolesXY ?? [];
  const multiCorridorDoors = extraHolesYZ.length > 0 || extraHolesXY.length > 0;
  const bandCap = door
    ? Math.max(0.55, Math.min(door.bandHeightM, innerWallH))
    : innerWallH;
  const splitShaft =
    Boolean(door && bandCap < innerWallH - 0.08) && !multiCorridorDoors;
  const ySplit = yWallBottom + bandCap;

  const doorHalfW = Math.min(
    SHAFT_DOUBLE_DOOR_W * 0.5,
    vlenZ * 0.5 - 0.06,
    vlenX * 0.5 - 0.06,
  );
  const doorH = Math.min(
    SHAFT_DOUBLE_DOOR_H,
    bandCap - SHAFT_DOOR_SILL - 0.06,
  );
  let yDoor0 = yWallBottom + SHAFT_DOOR_SILL;
  let yDoor1 = yDoor0 + Math.max(0.55, doorH);
  if (
    door?.doorHoleY0Local != null &&
    door?.doorHoleY1Local != null &&
    Number.isFinite(door.doorHoleY0Local) &&
    Number.isFinite(door.doorHoleY1Local)
  ) {
    const a = Math.min(door.doorHoleY0Local, door.doorHoleY1Local);
    const b = Math.max(door.doorHoleY0Local, door.doorHoleY1Local);
    yDoor0 = Math.max(yWallBottom + 0.02, a);
    yDoor1 = Math.min(yWallTop - 0.04, b);
    if (yDoor1 < yDoor0 + 0.52) {
      const mid = (yDoor0 + yDoor1) * 0.5;
      yDoor0 = Math.max(yWallBottom + 0.02, mid - 0.28);
      yDoor1 = Math.min(yWallTop - 0.04, mid + 0.28);
    }
  }
  /** Along-wall shift: +Z for E/W door walls, +X for N/S (matches stair placement). */
  const doorTangent = door?.tangentOffsetAlongWall ?? 0;

  const addEastWest = (
    face: "e" | "w",
    xCenter: number,
    wallThickness: number,
    withDoor: boolean,
    y0: number,
    y1: number,
    name: string,
  ): void => {
    const zMin = -vlenZ * 0.5;
    const zMax = vlenZ * 0.5;
    if (withDoor && door && yDoor1 <= y1 + 1e-3 && yDoor0 >= y0 - 1e-3) {
      const z0 = Math.max(zMin, doorTangent - doorHalfW);
      const z1 = Math.min(zMax, doorTangent + doorHalfW);
      const holes: WallHoleYZ[] =
        z1 > z0 + 0.08
          ? [
              {
                z0,
                z1,
                y0: yDoor0,
                y1: Math.min(yDoor1, y1),
              },
            ]
          : [];
      addWallConstantXWithHoles(
        group,
        wallM,
        xCenter,
        wallThickness,
        zMin,
        zMax,
        y0,
        y1,
        holes,
        name,
      );
      const xInner = face === "e" ? hx - wt : -hx + wt;
      const inwardX = face === "e" ? -1 : 1;
      if (holes.length > 0) {
        addDoorFrameTrimConstantX(
          group,
          doorFrameMat,
          xInner,
          inwardX,
          z0,
          z1,
          yDoor0,
          Math.min(yDoor1, y1),
          `${name}_frame`,
        );
      }
    } else {
      addWallConstantXWithHoles(
        group,
        wallM,
        xCenter,
        wallThickness,
        zMin,
        zMax,
        y0,
        y1,
        [],
        name,
      );
    }
  };

  const addNorthSouth = (
    face: "n" | "s",
    zCenter: number,
    wallThickness: number,
    withDoor: boolean,
    y0: number,
    y1: number,
    name: string,
  ): void => {
    const xMin = -vlenX * 0.5;
    const xMax = vlenX * 0.5;
    if (withDoor && door && yDoor1 <= y1 + 1e-3 && yDoor0 >= y0 - 1e-3) {
      const x0 = Math.max(xMin, doorTangent - doorHalfW);
      const x1 = Math.min(xMax, doorTangent + doorHalfW);
      const holes: WallHoleXY[] =
        x1 > x0 + 0.08
          ? [
              {
                x0,
                x1,
                y0: yDoor0,
                y1: Math.min(yDoor1, y1),
              },
            ]
          : [];
      addWallConstantZWithHoles(
        group,
        wallM,
        zCenter,
        wallThickness,
        xMin,
        xMax,
        y0,
        y1,
        holes,
        name,
      );
      const zInner = face === "n" ? hz - wt : -hz + wt;
      const inwardZ = face === "n" ? -1 : 1;
      if (holes.length > 0) {
        addDoorFrameTrimConstantZ(
          group,
          doorFrameMat,
          zInner,
          inwardZ,
          x0,
          x1,
          yDoor0,
          Math.min(yDoor1, y1),
          `${name}_frame`,
        );
      }
    } else {
      addWallConstantZWithHoles(
        group,
        wallM,
        zCenter,
        wallThickness,
        xMin,
        xMax,
        y0,
        y1,
        [],
        name,
      );
    }
  };

  if (!door) {
    addEastWest("e", hx - wt * 0.5, wt, false, yWallBottom, yWallTop, "shaft_wall_e");
    addEastWest("w", -hx + wt * 0.5, wt, false, yWallBottom, yWallTop, "shaft_wall_w");
    addNorthSouth("n", hz - wt * 0.5, wt, false, yWallBottom, yWallTop, "shaft_wall_n");
    addNorthSouth("s", -hz + wt * 0.5, wt, false, yWallBottom, yWallTop, "shaft_wall_s");
    return;
  }

  const face =
    door.face ??
    pickFaceTowardPoint(0, 0, 1, 0);
  const flushG = Math.max(0, Math.min(0.35, opts.corridorFlushGapM ?? 0));
  const thE = face === "e" && flushG > 0 ? wt + flushG : wt;
  const xE = face === "e" && flushG > 0 ? hx - wt * 0.5 + flushG * 0.5 : hx - wt * 0.5;
  const thW = face === "w" && flushG > 0 ? wt + flushG : wt;
  const xW = face === "w" && flushG > 0 ? -hx + wt * 0.5 - flushG * 0.5 : -hx + wt * 0.5;
  const thN = face === "n" && flushG > 0 ? wt + flushG : wt;
  const zN = face === "n" && flushG > 0 ? hz - wt * 0.5 + flushG * 0.5 : hz - wt * 0.5;
  const thS = face === "s" && flushG > 0 ? wt + flushG : wt;
  const zS = face === "s" && flushG > 0 ? -hz + wt * 0.5 - flushG * 0.5 : -hz + wt * 0.5;
  const zMinWall = -vlenZ * 0.5;
  const zMaxWall = vlenZ * 0.5;
  const xMinWall = -vlenX * 0.5;
  const xMaxWall = vlenX * 0.5;

  const clampHolesYZ = (holes: readonly WallHoleYZ[]): WallHoleYZ[] => {
    const out: WallHoleYZ[] = [];
    for (const h of holes) {
      const y0 = Math.max(yWallBottom, Math.min(h.y0, h.y1));
      const y1 = Math.min(yWallTop, Math.max(h.y0, h.y1));
      const z0 = Math.max(zMinWall, Math.min(h.z0, h.z1));
      const z1 = Math.min(zMaxWall, Math.max(h.z0, h.z1));
      if (y1 > y0 + 0.08 && z1 > z0 + 0.08) out.push({ y0, y1, z0, z1 });
    }
    return out;
  };

  const clampHolesXY = (holes: readonly WallHoleXY[]): WallHoleXY[] => {
    const out: WallHoleXY[] = [];
    for (const h of holes) {
      const y0 = Math.max(yWallBottom, Math.min(h.y0, h.y1));
      const y1 = Math.min(yWallTop, Math.max(h.y0, h.y1));
      const x0 = Math.max(xMinWall, Math.min(h.x0, h.x1));
      const x1 = Math.min(xMaxWall, Math.max(h.x0, h.x1));
      if (y1 > y0 + 0.08 && x1 > x0 + 0.08) out.push({ y0, y1, x0, x1 });
    }
    return out;
  };

  if (!splitShaft) {
    if (multiCorridorDoors) {
      if (face === "e" || face === "w") {
        /** Mega stair: per-storey extras did not include the primary entry cut — prepend it so ground doors stay open. */
        const mergedExtraYZ: WallHoleYZ[] = [];
        if (door && yDoor1 > yDoor0 + 0.45) {
          const pz0 = Math.max(zMinWall, doorTangent - doorHalfW);
          const pz1 = Math.min(zMaxWall, doorTangent + doorHalfW);
          if (pz1 > pz0 + 0.08) {
            mergedExtraYZ.push({
              z0: pz0,
              z1: pz1,
              y0: yDoor0,
              y1: yDoor1,
            });
          }
        }
        mergedExtraYZ.push(...extraHolesYZ);
        const holes = clampHolesYZ(mergedExtraYZ);
        const xeUse = face === "e" ? xE : hx - wt * 0.5;
        const teUse = face === "e" ? thE : wt;
        const xwUse = face === "w" ? xW : -hx + wt * 0.5;
        const twUse = face === "w" ? thW : wt;
        if (face === "e") {
          addWallConstantXWithHoles(
            group,
            wallM,
            xeUse,
            teUse,
            zMinWall,
            zMaxWall,
            yWallBottom,
            yWallTop,
            holes,
            "shaft_wall_e",
          );
          const xInnerE = hx - wt;
          for (let i = 0; i < holes.length; i++) {
            const h = holes[i]!;
            addDoorFrameTrimConstantX(
              group,
              doorFrameMat,
              xInnerE,
              -1,
              h.z0,
              h.z1,
              h.y0,
              h.y1,
              `shaft_wall_e_frame_${i}`,
            );
          }
          addWallConstantXWithHoles(
            group,
            wallM,
            xwUse,
            twUse,
            zMinWall,
            zMaxWall,
            yWallBottom,
            yWallTop,
            [],
            "shaft_wall_w",
          );
        } else {
          addWallConstantXWithHoles(
            group,
            wallM,
            xeUse,
            teUse,
            zMinWall,
            zMaxWall,
            yWallBottom,
            yWallTop,
            [],
            "shaft_wall_e",
          );
          addWallConstantXWithHoles(
            group,
            wallM,
            xwUse,
            twUse,
            zMinWall,
            zMaxWall,
            yWallBottom,
            yWallTop,
            holes,
            "shaft_wall_w",
          );
          const xInnerW = -hx + wt;
          for (let i = 0; i < holes.length; i++) {
            const h = holes[i]!;
            addDoorFrameTrimConstantX(
              group,
              doorFrameMat,
              xInnerW,
              1,
              h.z0,
              h.z1,
              h.y0,
              h.y1,
              `shaft_wall_w_frame_${i}`,
            );
          }
        }
        addWallConstantZWithHoles(
          group,
          wallM,
          hz - wt * 0.5,
          wt,
          xMinWall,
          xMaxWall,
          yWallBottom,
          yWallTop,
          [],
          "shaft_wall_n",
        );
        addWallConstantZWithHoles(
          group,
          wallM,
          -hz + wt * 0.5,
          wt,
          xMinWall,
          xMaxWall,
          yWallBottom,
          yWallTop,
          [],
          "shaft_wall_s",
        );
      } else {
        const mergedExtraXY: WallHoleXY[] = [];
        if (door && yDoor1 > yDoor0 + 0.45) {
          const px0 = Math.max(xMinWall, doorTangent - doorHalfW);
          const px1 = Math.min(xMaxWall, doorTangent + doorHalfW);
          if (px1 > px0 + 0.08) {
            mergedExtraXY.push({
              x0: px0,
              x1: px1,
              y0: yDoor0,
              y1: yDoor1,
            });
          }
        }
        mergedExtraXY.push(...extraHolesXY);
        const holes = clampHolesXY(mergedExtraXY);
        const znUse = face === "n" ? zN : hz - wt * 0.5;
        const tnUse = face === "n" ? thN : wt;
        const zsUse = face === "s" ? zS : -hz + wt * 0.5;
        const tsUse = face === "s" ? thS : wt;
        addWallConstantXWithHoles(
          group,
          wallM,
          xE,
          thE,
          zMinWall,
          zMaxWall,
          yWallBottom,
          yWallTop,
          [],
          "shaft_wall_e",
        );
        addWallConstantXWithHoles(
          group,
          wallM,
          xW,
          thW,
          zMinWall,
          zMaxWall,
          yWallBottom,
          yWallTop,
          [],
          "shaft_wall_w",
        );
        if (face === "n") {
          addWallConstantZWithHoles(
            group,
            wallM,
            znUse,
            tnUse,
            xMinWall,
            xMaxWall,
            yWallBottom,
            yWallTop,
            holes,
            "shaft_wall_n",
          );
          const zInnerN = hz - wt;
          for (let i = 0; i < holes.length; i++) {
            const h = holes[i]!;
            addDoorFrameTrimConstantZ(
              group,
              doorFrameMat,
              zInnerN,
              -1,
              h.x0,
              h.x1,
              h.y0,
              h.y1,
              `shaft_wall_n_frame_${i}`,
            );
          }
          addWallConstantZWithHoles(
            group,
            wallM,
            zsUse,
            tsUse,
            xMinWall,
            xMaxWall,
            yWallBottom,
            yWallTop,
            [],
            "shaft_wall_s",
          );
        } else {
          addWallConstantZWithHoles(
            group,
            wallM,
            znUse,
            tnUse,
            xMinWall,
            xMaxWall,
            yWallBottom,
            yWallTop,
            [],
            "shaft_wall_n",
          );
          addWallConstantZWithHoles(
            group,
            wallM,
            zsUse,
            tsUse,
            xMinWall,
            xMaxWall,
            yWallBottom,
            yWallTop,
            holes,
            "shaft_wall_s",
          );
          const zInnerS = -hz + wt;
          for (let i = 0; i < holes.length; i++) {
            const h = holes[i]!;
            addDoorFrameTrimConstantZ(
              group,
              doorFrameMat,
              zInnerS,
              1,
              h.x0,
              h.x1,
              h.y0,
              h.y1,
              `shaft_wall_s_frame_${i}`,
            );
          }
        }
      }
    } else {
      addEastWest("e", xE, thE, face === "e", yWallBottom, yWallTop, "shaft_wall_e");
      addEastWest("w", xW, thW, face === "w", yWallBottom, yWallTop, "shaft_wall_w");
      addNorthSouth("n", zN, thN, face === "n", yWallBottom, yWallTop, "shaft_wall_n");
      addNorthSouth("s", zS, thS, face === "s", yWallBottom, yWallTop, "shaft_wall_s");
    }
    return;
  }

  addEastWest("e", xE, thE, face === "e", yWallBottom, ySplit, "shaft_wall_e_lo");
  addEastWest("e", xE, thE, false, ySplit, yWallTop, "shaft_wall_e_hi");
  addEastWest("w", xW, thW, face === "w", yWallBottom, ySplit, "shaft_wall_w_lo");
  addEastWest("w", xW, thW, false, ySplit, yWallTop, "shaft_wall_w_hi");
  addNorthSouth("n", zN, thN, face === "n", yWallBottom, ySplit, "shaft_wall_n_lo");
  addNorthSouth("n", zN, thN, false, ySplit, yWallTop, "shaft_wall_n_hi");
  addNorthSouth("s", zS, thS, face === "s", yWallBottom, ySplit, "shaft_wall_s_lo");
  addNorthSouth("s", zS, thS, false, ySplit, yWallTop, "shaft_wall_s_hi");
}

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
  /** See {@link ShaftShellOpts.corridorFlushGapM}. */
  corridorFlushGapM?: number;
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
  const doorH = Math.min(
    SHAFT_DOUBLE_DOOR_H,
    bandCap - SHAFT_DOOR_SILL - 0.06,
  );
  const yDoor0 = yWallBottom + SHAFT_DOOR_SILL;
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

export function addElevatorShaftPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  opts?: ElevatorShaftPlaceholderOpts | null,
): void {
  const includePitFloor = opts?.includePitFloor !== false;
  addShaftShell(group, sx, sy, sz, shaftWall, shaftCeil, {
    includeFloor: includePitFloor,
    includeCeiling: false,
    floorMat: hoistwayFloor,
    openTopWallExtend: 0.06,
    groundDoor: opts?.groundDoor ?? null,
    corridorFlushGapM: opts?.corridorFlushGapM,
  });
}

/**
 * Circulating stair in a rectangular shaft (open top): perimeter runs + corner landings, stacked
 * per storey on tall shafts.
 */
export type StairWellPlaceholderOpts = SwitchbackStairOpts & {
  /**
   * When true: skip exactly **one** interior corner pad — the lowest deck in the bottom storey
   * (building base / first plate). Other corner landings on that storey stay. Per-plate: story 1.
   * Mega: lowest pad among those with `y` in the bottom ~`STOREY_SPACING_M` of the shaft.
   */
  omitGroundStoreyCornerLandings?: boolean;
  /** Shared authored appearance / delta transforms applied to every stairwell. */
  def?: StairWellDef;
  /** Which authored stairwell bucket this instance belongs to. */
  authoringScope?: StairWellAuthoringScope;
};

function tagGeneratedStairWellShellParts(
  root: THREE.Object3D,
  scope: StairWellAuthoringScope,
): void {
  root.traverse((obj) => {
    if (obj.name === "shaft_floor") {
      setStairWellEditorPartId(obj, "shaft_floor", scope);
    } else if (obj.name.startsWith("shaft_wall_")) {
      setStairWellEditorPartId(obj, "shaft_wall", scope);
    }
  });
}

function stairWellPartTransformsForScope(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): StairWellDef["partTransforms"] {
  return scope === "ground" ? def?.groundPartTransforms : def?.partTransforms;
}

export function applyStairWellPartTransforms(
  root: THREE.Object3D,
  def: StairWellDef | undefined,
): void {
  const _baseQ = new THREE.Quaternion();
  const _deltaQ = new THREE.Quaternion();
  root.traverse((obj) => {
    const partId = obj.userData.editorStairPartId as string | undefined;
    if (!partId) return;
    const scope =
      (obj.userData.editorStairAuthoringScope as StairWellAuthoringScope | undefined) ??
      "typical";
    const partTransforms = stairWellPartTransformsForScope(def, scope);
    const basePos = obj.userData.editorStairBasePosition as readonly number[] | undefined;
    const baseScale = obj.userData.editorStairBaseScale as readonly number[] | undefined;
    const baseRot = obj.userData.editorStairBaseRotation as readonly number[] | undefined;
    if (!basePos || !baseScale || !baseRot) return;

    obj.position.set(basePos[0] ?? 0, basePos[1] ?? 0, basePos[2] ?? 0);
    obj.scale.set(baseScale[0] ?? 1, baseScale[1] ?? 1, baseScale[2] ?? 1);
    obj.quaternion.set(baseRot[0] ?? 0, baseRot[1] ?? 0, baseRot[2] ?? 0, baseRot[3] ?? 1);

    const tweak = partTransforms?.[partId];
    if (!tweak) return;

    if (tweak.position) {
      obj.position.x += tweak.position[0];
      obj.position.y += tweak.position[1];
      obj.position.z += tweak.position[2];
    }
    if (tweak.scale) {
      obj.scale.x *= tweak.scale[0];
      obj.scale.y *= tweak.scale[1];
      obj.scale.z *= tweak.scale[2];
    }
    if (tweak.rotation) {
      _baseQ.set(baseRot[0] ?? 0, baseRot[1] ?? 0, baseRot[2] ?? 0, baseRot[3] ?? 1);
      _deltaQ.set(
        tweak.rotation[0],
        tweak.rotation[1],
        tweak.rotation[2],
        tweak.rotation[3] ?? 1,
      );
      obj.quaternion.copy(_baseQ).multiply(_deltaQ);
    }
  });
}

export function buildStairWellPreviewRoot(args: {
  sx: number;
  sy: number;
  sz: number;
  def?: StairWellDef;
  authoringScope?: StairWellAuthoringScope;
}): THREE.Group {
  const root = new THREE.Group();
  root.name = "editor_stair_well_preview";
  addStairWellPlaceholder(root, args.sx, args.sy, args.sz, {
    def: args.def,
    authoringScope: args.authoringScope,
    omitGroundStoreyCornerLandings: args.authoringScope === "ground",
  });
  return root;
}

export function addStairWellPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  opts?: StairWellPlaceholderOpts,
): void {
  const { omitGroundStoreyCornerLandings, def: _def, ...layoutOpts } = opts ?? {};
  const L = computeSwitchbackStairLayout(sx, sy, sz, layoutOpts);
  const mats = createStairWellMaterials(opts?.def);
  const authoringScope = opts?.authoringScope ?? "typical";

  addShaftShell(group, sx, sy, sz, mats.wall, shaftCeil, {
    includeFloor: true,
    includeCeiling: false,
    floorMat: mats.floor,
    groundDoor: null,
  });
  tagGeneratedStairWellShellParts(group, authoringScope);

  const { innerWallH, wallCenterY, ix0, ix1, iz0, iz1 } = L;

  let ti = 0;
  for (const tr of L.treads) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(tr.halfAlong * 2, tr.riseHalf * 2, tr.halfAcross * 2),
      mats.tread,
    );
    mesh.name = `stair_tread_${ti}`;
    setStairWellEditorPartId(mesh, "stair_tread", authoringScope);
    ti += 1;
    mesh.position.set(tr.x, tr.y, tr.z);
    mesh.rotation.y = tr.yaw;
    group.add(mesh);
  }

  const climbFull = opts?.climbFullShaft ?? false;
  const omitGroundPads = omitGroundStoreyCornerLandings === true;
  const yShaftInnerBot = L.wallCenterY - L.innerWallH * 0.5;
  const groundLandingYMax = yShaftInnerBot + STOREY_SPACING_M * 0.98;

  let omitOnlyLanding: (typeof L.cornerLandings)[number] | undefined;
  if (omitGroundPads) {
    const candidates = climbFull
      ? L.cornerLandings.filter((cl) => cl.y < groundLandingYMax)
      : L.cornerLandings;
    let bestDeck = Infinity;
    for (const cl of candidates) {
      const deckBot = cl.y - cl.thicknessHalf;
      if (deckBot < bestDeck - 1e-6) {
        bestDeck = deckBot;
        omitOnlyLanding = cl;
      }
    }
  }

  let li = 0;
  for (const cl of L.cornerLandings) {
    if (omitOnlyLanding !== undefined && cl === omitOnlyLanding) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        cl.halfW * 2,
        cl.thicknessHalf * 2,
        cl.halfD * 2,
      ),
      mats.landing,
    );
    mesh.name = `stair_corner_landing_${li}`;
    setStairWellEditorPartId(mesh, "stair_corner_landing", authoringScope);
    li += 1;
    mesh.position.set(cl.x, cl.y, cl.z);
    group.add(mesh);
  }

  const railPost = 0.055;
  const corners: readonly [number, number][] = [
    [ix0, iz0],
    [ix1, iz0],
    [ix1, iz1],
    [ix0, iz1],
  ];
  let pi = 0;
  for (const [rx, rz] of corners) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(railPost, innerWallH, railPost),
      mats.railing,
    );
    post.name = `stair_rail_post_${pi}`;
    setStairWellEditorPartId(post, "stair_rail_post", authoringScope);
    pi += 1;
    post.position.set(rx, wallCenterY, rz);
    group.add(post);
  }

  recordStairWellBaseTransforms(group);
  applyStairWellPartTransforms(group, opts?.def);
}
