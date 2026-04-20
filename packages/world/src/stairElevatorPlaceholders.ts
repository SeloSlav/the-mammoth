import * as THREE from "three";
import type { StairWellDef } from "@the-mammoth/schemas";
import {
  clampStairDoorTangentAlongInnerWall,
  computeSwitchbackStairLayout,
  GROUND_STOREY_EXTRA_BOTTOM_TREADS,
  pickCornerLandingNearDoorBand,
  pickStairShaftGroundDoorPlacement,
  shiftStairDoorTangentViewerRightFromInside,
  snapStairDoorTangentAlongWallToLanding,
  STOREY_SPACING_M,
  STAIR_CORRIDOR_DOOR_EXIT_TANGENT_NUDGE_M,
  type StairSwitchbackLayout,
  type SwitchbackStairOpts,
} from "./stairWellGeometry.js";
import {
  addDoorFrameTrimConstantX,
  addDoorFrameTrimConstantZ,
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  applyWorldMetricUvsToAxisAlignedBoxMesh,
  pickFaceTowardPoint,
  type CardinalFace,
  type WallHoleXY,
  type WallHoleYZ,
} from "./wallWithDoorCutout.js";
import {
  concreteMaterial,
  exteriorConcreteWallMaterial,
  interiorConcreteFloorShellMaterial,
} from "./floorPlaceholderMeshMaterials.js";
import { createStairTreadBoxGeometry } from "./stairTreadUv.js";
import { applyCabMaterialSlot } from "./elevatorVisualMaterialUtils.js";
import { attachStairWellLandingProps } from "./stairWellLandingProps.js";

/** Elevator hoistway exterior: light brutalist brick-red concrete so shafts read as distinct tower cores. */
const shaftWall = concreteMaterial(0xd5a19b);
/** Pit / landing slab at hoistway bottom (world slab is open here — must not read as outdoor grass). */
const hoistwayFloor = interiorConcreteFloorShellMaterial;
const shaftCeil = new THREE.MeshStandardMaterial({
  color: 0xe0e6ee,
  roughness: 0.88,
  metalness: 0.03,
});
/** Reuse hoistway wall concrete so door cutout trim is not a separate dark metallic band. */
const doorFrameMat = shaftWall;

export const STAIR_WELL_EDITOR_PART_IDS = [
  "shaft_floor",
  "shaft_wall",
  "stair_flights",
  "stair_flight_lower",
  "stair_landing_lower",
  "stair_flight_upper",
  "stair_landing_upper",
] as const;

/** Editor-only gizmo target: move/resize the stair corridor opening. */
export const STAIR_WELL_OPENING_PROXY_ID = "stair_entry_opening_proxy" as const;
export const STAIR_WELL_SECONDARY_OPENING_PROXY_ID =
  "stair_entry_opening_proxy_secondary" as const;
export const STAIR_WELL_OPENING_PROXY_IDS = [
  STAIR_WELL_OPENING_PROXY_ID,
  STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
] as const;
export type StairWellOpeningProxyId = (typeof STAIR_WELL_OPENING_PROXY_IDS)[number];

export function isStairWellOpeningProxyId(
  value: string | null | undefined,
): value is StairWellOpeningProxyId {
  return value === STAIR_WELL_OPENING_PROXY_ID || value === STAIR_WELL_SECONDARY_OPENING_PROXY_ID;
}

export type StairWellEditorPartId = (typeof STAIR_WELL_EDITOR_PART_IDS)[number];
export type StairWellAuthoringScope = "typical" | "ground";
type StairWellEntryOpeningDef = NonNullable<StairWellDef["entryOpening"]>;
const LEGACY_STAIR_CORNER_LANDING_PART_ID = "stair_corner_landing";

type StairWellMaterialSet = {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  tread: THREE.MeshStandardMaterial;
  landing: THREE.MeshStandardMaterial;
  railing: THREE.MeshStandardMaterial;
};

function stairWellHasFloorSlab(scope: StairWellAuthoringScope): boolean {
  return scope === "ground";
}

function createStairWellMaterials(def: StairWellDef | undefined): StairWellMaterialSet {
  const wall = concreteMaterial(0xd7dce2);
  const floor = interiorConcreteFloorShellMaterial.clone();
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

function setStairWellEditorPickId(obj: THREE.Object3D, partId: StairWellEditorPartId): void {
  obj.userData.editorStairPickId = partId;
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

function stairWellOpeningDefForScope(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): StairWellEntryOpeningDef | undefined {
  return scope === "ground" ? (def?.groundEntryOpening ?? def?.entryOpening) : def?.entryOpening;
}

function stairWellOpeningDefForProxyId(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
  proxyId: StairWellOpeningProxyId,
): StairWellEntryOpeningDef | undefined {
  if (proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID) {
    return scope === "typical" ? def?.secondaryEntryOpening : undefined;
  }
  return stairWellOpeningDefForScope(def, scope);
}

/**
 * Ground-level hoistway / stair entry: **double-door clear width** (m).
 * Leaf geometry comes later — wall cutout only (no separate frame mesh).
 */
export const SHAFT_DOUBLE_DOOR_W = 1.86;

/** Exported for mega-shaft corridor door band spacing (m). */
export const SHAFT_DOUBLE_DOOR_H = 2.2;
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
  /** Clear opening width in meters. */
  doorWidthM?: number;
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
   * Additional fully resolved door openings. Unlike the legacy extra-hole arrays, these retain the
   * target wall face so mixed-axis combinations (for example west + south) render correctly.
   */
  supplementalDoors?: readonly ShaftGroundDoorOpts[];
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
  /**
   * Inset trim meshes around door cutouts (elevator hoistways). Stairwells omit this — opening is
   * wall material only.
   */
  includeDoorFrameTrim?: boolean;
  /**
   * Plate-space cardinals for faces on the building perimeter; those walls use {@link exteriorWallMat}
   * (facade concrete). Interior faces keep `wallM`.
   */
  exteriorShaftFaces?: readonly CardinalFace[];
  exteriorWallMat?: THREE.MeshStandardMaterial;
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

function normalizeStairDoorVerticalSpan(
  yMin: number,
  yMax: number,
  rawY0: number,
  rawY1: number,
): { y0: number; y1: number } {
  let y0 = Math.max(yMin, Math.min(rawY0, rawY1));
  let y1 = Math.min(yMax, Math.max(rawY0, rawY1));
  if (y1 < y0 + 0.52) {
    const mid = (y0 + y1) * 0.5;
    y0 = Math.max(yMin, mid - 0.28);
    y1 = Math.min(yMax, mid + 0.28);
  }
  if (y0 > yMin) {
    const shiftDown = y0 - yMin;
    y0 = yMin;
    y1 = Math.max(y0 + 0.52, Math.min(yMax, y1 - shiftDown));
  }
  return { y0, y1 };
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
  const exteriorCladdingThickness = 0.016;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const extMat = opts.exteriorWallMat;
  const extFaces = opts.exteriorShaftFaces;
  const hasExteriorFace = (card: CardinalFace): boolean => Boolean(extMat && extFaces?.includes(card));
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
    applyWorldMetricUvsToAxisAlignedBoxMesh(floor);
    floor.userData.mammothAxisAlignedCollisionBox = true;
    group.add(floor);
  }

  if (opts.includeCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), ceilM);
    ceiling.name = "shaft_ceiling";
    ceiling.position.set(0, hy - wt * 0.5, 0);
    group.add(ceiling);
  }

  const door = opts.groundDoor ?? null;
  const supplementalDoors = opts.supplementalDoors ?? [];
  const extraHolesYZ = opts.corridorDoorExtraHolesYZ ?? [];
  const extraHolesXY = opts.corridorDoorExtraHolesXY ?? [];
  const doorFrameTrim = opts.includeDoorFrameTrim === true;
  const multiCorridorDoors =
    supplementalDoors.length > 0 || extraHolesYZ.length > 0 || extraHolesXY.length > 0;
  const bandCap = door
    ? Math.max(0.55, Math.min(door.bandHeightM, innerWallH))
    : innerWallH;
  const doorOpeningYMax =
    door && door.bandHeightM >= innerWallH - 0.02 ? yWallTop : yWallTop - 0.04;
  const splitShaft =
    Boolean(door && bandCap < innerWallH - 0.08) && !multiCorridorDoors;
  const ySplit = yWallBottom + bandCap;

  const doorHalfW = Math.min(
    (door?.doorWidthM ?? SHAFT_DOUBLE_DOOR_W) * 0.5,
    vlenZ * 0.5 - 0.06,
    vlenX * 0.5 - 0.06,
  );
  const doorH = Math.min(SHAFT_DOUBLE_DOOR_H, bandCap - 0.06);
  let yDoor0 = yWallBottom;
  let yDoor1 = yDoor0 + Math.max(0.55, doorH);
  if (
    door?.doorHoleY0Local != null &&
    door?.doorHoleY1Local != null &&
    Number.isFinite(door.doorHoleY0Local) &&
    Number.isFinite(door.doorHoleY1Local)
  ) {
    const a = Math.min(door.doorHoleY0Local, door.doorHoleY1Local);
    const b = Math.max(door.doorHoleY0Local, door.doorHoleY1Local);
    yDoor0 = Math.max(yWallBottom, a);
    yDoor1 = Math.min(doorOpeningYMax, b);
  }
  ({ y0: yDoor0, y1: yDoor1 } = normalizeStairDoorVerticalSpan(
    yWallBottom,
    doorOpeningYMax,
    yDoor0,
    yDoor1,
  ));
  /** Along-wall shift: +Z for E/W door walls, +X for N/S (matches stair placement). */
  const doorTangent = door?.tangentOffsetAlongWall ?? 0;

  const addExteriorCladdingX = (
    face: "e" | "w",
    xCenter: number,
    wallThickness: number,
    zMin: number,
    zMax: number,
    y0: number,
    y1: number,
    holes: readonly WallHoleYZ[],
    name: string,
  ): void => {
    if (!extMat || !hasExteriorFace(face)) return;
    const outward = face === "e" ? 1 : -1;
    const skinX =
      xCenter + outward * (wallThickness * 0.5 + exteriorCladdingThickness * 0.5 + 0.001);
    addWallConstantXWithHoles(
      group,
      extMat,
      skinX,
      exteriorCladdingThickness,
      zMin,
      zMax,
      y0,
      y1,
      holes,
      `${name}_exterior`,
      { noCollision: true },
    );
  };

  const addExteriorCladdingZ = (
    face: "n" | "s",
    zCenter: number,
    wallThickness: number,
    xMin: number,
    xMax: number,
    y0: number,
    y1: number,
    holes: readonly WallHoleXY[],
    name: string,
  ): void => {
    if (!extMat || !hasExteriorFace(face)) return;
    const outward = face === "n" ? 1 : -1;
    const skinZ =
      zCenter + outward * (wallThickness * 0.5 + exteriorCladdingThickness * 0.5 + 0.001);
    addWallConstantZWithHoles(
      group,
      extMat,
      skinZ,
      exteriorCladdingThickness,
      xMin,
      xMax,
      y0,
      y1,
      holes,
      `${name}_exterior`,
      { noCollision: true },
    );
  };

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
      addExteriorCladdingX(face, xCenter, wallThickness, zMin, zMax, y0, y1, holes, name);
      if (doorFrameTrim && holes.length > 0) {
        const xInner = face === "e" ? hx - wt : -hx + wt;
        const inwardX = face === "e" ? -1 : 1;
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
      addExteriorCladdingX(face, xCenter, wallThickness, zMin, zMax, y0, y1, [], name);
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
      addExteriorCladdingZ(face, zCenter, wallThickness, xMin, xMax, y0, y1, holes, name);
      if (doorFrameTrim && holes.length > 0) {
        const zInner = face === "n" ? hz - wt : -hz + wt;
        const inwardZ = face === "n" ? -1 : 1;
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
      addExteriorCladdingZ(face, zCenter, wallThickness, xMin, xMax, y0, y1, [], name);
    }
  };

  if (!door) {
    addWallConstantXWithHoles(
      group,
      wallM,
      hx - wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_e",
    );
    addExteriorCladdingX(
      "e",
      hx - wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_e",
    );
    addWallConstantXWithHoles(
      group,
      wallM,
      -hx + wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_w",
    );
    addExteriorCladdingX(
      "w",
      -hx + wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_w",
    );
    addWallConstantZWithHoles(
      group,
      wallM,
      hz - wt * 0.5,
      wt,
      -vlenX * 0.5,
      vlenX * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_n",
    );
    addExteriorCladdingZ(
      "n",
      hz - wt * 0.5,
      wt,
      -vlenX * 0.5,
      vlenX * 0.5,
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
      -vlenX * 0.5,
      vlenX * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_s",
    );
    addExteriorCladdingZ(
      "s",
      -hz + wt * 0.5,
      wt,
      -vlenX * 0.5,
      vlenX * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_s",
    );
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

  const appendOpeningHole = (
    opening: ShaftGroundDoorOpts,
    yzByFace: { e: WallHoleYZ[]; w: WallHoleYZ[] },
    xyByFace: { n: WallHoleXY[]; s: WallHoleXY[] },
  ): void => {
    const openingFace = opening.face ?? "e";
    const openingHalfW = Math.min(
      (opening.doorWidthM ?? SHAFT_DOUBLE_DOOR_W) * 0.5,
      vlenZ * 0.5 - 0.06,
      vlenX * 0.5 - 0.06,
    );
    const openingBandCap = Math.max(0.55, Math.min(opening.bandHeightM, innerWallH));
    const openingYMax =
      opening.bandHeightM >= innerWallH - 0.02 ? yWallTop : yWallTop - 0.04;
    const openingDoorH = Math.min(SHAFT_DOUBLE_DOOR_H, openingBandCap - 0.06);
    let openingY0 = yWallBottom;
    let openingY1 = openingY0 + Math.max(0.55, openingDoorH);
    if (
      opening.doorHoleY0Local != null &&
      opening.doorHoleY1Local != null &&
      Number.isFinite(opening.doorHoleY0Local) &&
      Number.isFinite(opening.doorHoleY1Local)
    ) {
      const a = Math.min(opening.doorHoleY0Local, opening.doorHoleY1Local);
      const b = Math.max(opening.doorHoleY0Local, opening.doorHoleY1Local);
      openingY0 = Math.max(yWallBottom, a);
      openingY1 = Math.min(openingYMax, b);
    }
    ({ y0: openingY0, y1: openingY1 } = normalizeStairDoorVerticalSpan(
      yWallBottom,
      openingYMax,
      openingY0,
      openingY1,
    ));
    if (openingY1 <= openingY0 + 0.45) return;
    const tangent = opening.tangentOffsetAlongWall ?? 0;
    if (openingFace === "e" || openingFace === "w") {
      const z0 = Math.max(zMinWall, tangent - openingHalfW);
      const z1 = Math.min(zMaxWall, tangent + openingHalfW);
      if (z1 <= z0 + 0.08) return;
      yzByFace[openingFace].push({
        z0,
        z1,
        y0: openingY0,
        y1: openingY1,
      });
      return;
    }
    const x0 = Math.max(xMinWall, tangent - openingHalfW);
    const x1 = Math.min(xMaxWall, tangent + openingHalfW);
    if (x1 <= x0 + 0.08) return;
    xyByFace[openingFace].push({
      x0,
      x1,
      y0: openingY0,
      y1: openingY1,
    });
  };

  if (!splitShaft) {
    if (multiCorridorDoors) {
      const yzByFace: { e: WallHoleYZ[]; w: WallHoleYZ[] } = { e: [], w: [] };
      const xyByFace: { n: WallHoleXY[]; s: WallHoleXY[] } = { n: [], s: [] };
      if (door) appendOpeningHole(door, yzByFace, xyByFace);
      for (const extraDoor of supplementalDoors) {
        appendOpeningHole(extraDoor, yzByFace, xyByFace);
      }
      if (face === "e") yzByFace.e.push(...extraHolesYZ);
      else if (face === "w") yzByFace.w.push(...extraHolesYZ);
      else if (face === "n") xyByFace.n.push(...extraHolesXY);
      else xyByFace.s.push(...extraHolesXY);

      const holesE = clampHolesYZ(yzByFace.e);
      const holesW = clampHolesYZ(yzByFace.w);
      const holesN = clampHolesXY(xyByFace.n);
      const holesS = clampHolesXY(xyByFace.s);

      addWallConstantXWithHoles(
        group,
        wallM,
        xE,
        thE,
        zMinWall,
        zMaxWall,
        yWallBottom,
        yWallTop,
        holesE,
        "shaft_wall_e",
      );
      addExteriorCladdingX(
        "e",
        xE,
        thE,
        zMinWall,
        zMaxWall,
        yWallBottom,
        yWallTop,
        holesE,
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
        holesW,
        "shaft_wall_w",
      );
      addExteriorCladdingX(
        "w",
        xW,
        thW,
        zMinWall,
        zMaxWall,
        yWallBottom,
        yWallTop,
        holesW,
        "shaft_wall_w",
      );
      addWallConstantZWithHoles(
        group,
        wallM,
        zN,
        thN,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesN,
        "shaft_wall_n",
      );
      addExteriorCladdingZ(
        "n",
        zN,
        thN,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesN,
        "shaft_wall_n",
      );
      addWallConstantZWithHoles(
        group,
        wallM,
        zS,
        thS,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesS,
        "shaft_wall_s",
      );
      addExteriorCladdingZ(
        "s",
        zS,
        thS,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesS,
        "shaft_wall_s",
      );

      if (doorFrameTrim) {
        const xInnerE = hx - wt;
        for (let i = 0; i < holesE.length; i++) {
          const h = holesE[i]!;
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
        const xInnerW = -hx + wt;
        for (let i = 0; i < holesW.length; i++) {
          const h = holesW[i]!;
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
        const zInnerN = hz - wt;
        for (let i = 0; i < holesN.length; i++) {
          const h = holesN[i]!;
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
        const zInnerS = -hz + wt;
        for (let i = 0; i < holesS.length; i++) {
          const h = holesS[i]!;
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
  /** Plate-space perimeter faces for this car’s footprint — PBR facade on those walls only. */
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
    exteriorShaftFaces: opts?.shaftExteriorFaces,
    exteriorWallMat: exteriorConcreteWallMaterial,
  });
  /** Skip {@link mergeGroupDescendantsByMaterial}: hoistway walls are thin shells; merge + frustum / WebGPU paths made them vanish while collision stayed valid. */
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData.mammothSkipFloorGeometryMerge = true;
    }
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
  /** Explicit stair entry opening to cut into the shaft shell. */
  groundDoor?: ShaftGroundDoorOpts | null;
  /** Plan-space context used to derive a corridor-side entry opening when no explicit groundDoor is supplied. */
  previewGroundDoorContext?: StairWellGroundDoorContext;
  /** Additional non-primary corridor openings to cut into the shell. */
  supplementalDoors?: readonly ResolvedStairWellGroundDoor[];
  /** Editor-only wireframe gizmo target for the opening. */
  addOpeningEditProxy?: boolean;
  /** Cap this shaft segment with a ceiling slab. Used for the topmost storey only. */
  includeCeiling?: boolean;
  /** Skip generating stair treads while retaining the rest of the shaft shell/openings. */
  omitTreads?: boolean;
  /** Omit the highest landing in this segment. Used for the terminal top storey. */
  omitTopLanding?: boolean;
  /** Plate-space perimeter faces — PBR facade concrete on those shaft walls only (see `addShaftShell`). */
  shaftExteriorFaces?: readonly CardinalFace[];
};

export type StairWellGroundDoorContext = {
  towardPlateXZ: readonly [number, number];
  shaftPlateXZ: readonly [number, number];
};

export type ResolvedStairWellGroundDoor = {
  groundDoor: ShaftGroundDoorOpts;
  doorHalfW: number;
  y0Local: number;
  y1Local: number;
  face: CardinalFace;
  tangentOffsetAlongWallM: number;
  widthM: number;
  heightM: number;
  centerYM: number;
};

function tagGeneratedStairWellShellParts(
  root: THREE.Object3D,
  scope: StairWellAuthoringScope,
  openings: readonly StairWellPreviewOpeningSpec[],
): void {
  root.traverse((obj) => {
    if (obj.name === "shaft_floor") {
      setStairWellEditorPartId(obj, "shaft_floor", scope);
    } else if (obj.name === "shaft_wall") {
      setStairWellEditorPartId(obj, "shaft_wall", scope);
      setStairWellEditorPickId(obj, "shaft_wall");
    } else if (obj.name !== "shaft_wall") {
      for (const opening of openings) {
        const openingFacePrefix = `shaft_wall_${opening.opening.face}`;
        if (obj.name.startsWith(openingFacePrefix)) {
          obj.userData.editorStairPickId = opening.proxyId;
          break;
        }
      }
    }
  });
}

function groupGeneratedStairWellWallParts(root: THREE.Group): void {
  const wallChildren = root.children.filter((child) => child.name.startsWith("shaft_wall_"));
  if (wallChildren.length === 0) return;
  const wallGroup = new THREE.Group();
  wallGroup.name = "shaft_wall";
  for (const child of wallChildren) {
    root.remove(child);
    wallGroup.add(child);
  }
  root.add(wallGroup);
}

function stairWellPartTransformsForScope(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): StairWellDef["partTransforms"] {
  return scope === "ground" ? def?.groundPartTransforms : def?.partTransforms;
}

function lowerFlightLegBoundary(counts: readonly [number, number, number, number]): number {
  const total = counts[0] + counts[1] + counts[2] + counts[3];
  if (total <= 0) return 0;
  let bestBoundary = 1;
  let bestDelta = Infinity;
  let accum = 0;
  for (let i = 0; i < counts.length - 1; i++) {
    accum += counts[i] ?? 0;
    const remaining = total - accum;
    if (accum <= 0 || remaining <= 0) continue;
    const delta = Math.abs(accum - total * 0.5);
    if (delta < bestDelta - 1e-6) {
      bestDelta = delta;
      bestBoundary = i + 1;
    }
  }
  return bestBoundary;
}

function stairLandingPartIdForIndex(
  indexWithinLap: number,
  landingsPerLap: number,
): Extract<StairWellEditorPartId, "stair_landing_lower" | "stair_landing_upper"> {
  if (landingsPerLap <= 1) return "stair_landing_lower";
  return indexWithinLap < Math.ceil(landingsPerLap * 0.5)
    ? "stair_landing_lower"
    : "stair_landing_upper";
}

function stairWellPartTransformEntry(
  partTransforms: StairWellDef["partTransforms"],
  partId: string,
) {
  const direct = partTransforms?.[partId];
  if (direct) return direct;
  if (partId === "stair_landing_lower" || partId === "stair_landing_upper") {
    return partTransforms?.[LEGACY_STAIR_CORNER_LANDING_PART_ID];
  }
  return undefined;
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

    const tweak = stairWellPartTransformEntry(partTransforms, partId);
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

export type BuildStairWellPreviewRootArgs = {
  sx: number;
  sy: number;
  sz: number;
  def?: StairWellDef;
  authoringScope?: StairWellAuthoringScope;
  towardPlateXZ?: readonly [number, number];
  shaftPlateXZ?: readonly [number, number];
  /** Preview-only facade cardinals; lets the editor match runtime shaft exterior cladding. */
  shaftExteriorFaces?: readonly CardinalFace[];
};

export function buildStairWellPreviewRoot(args: BuildStairWellPreviewRootArgs): THREE.Group {
  const root = new THREE.Group();
  root.name = "editor_stair_well_preview";
  root.userData.editorStairPreviewArgs = args;
  addStairWellPlaceholder(root, args.sx, args.sy, args.sz, {
    def: args.def,
    authoringScope: args.authoringScope,
    omitGroundStoreyCornerLandings: args.authoringScope === "ground",
    previewGroundDoorContext:
      args.towardPlateXZ && args.shaftPlateXZ
        ? {
            towardPlateXZ: args.towardPlateXZ,
            shaftPlateXZ: args.shaftPlateXZ,
          }
        : undefined,
    shaftExteriorFaces: args.shaftExteriorFaces,
    addOpeningEditProxy: false,
  });
  return root;
}

function disposeObject3DTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry?.dispose();
    const material = obj.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

export function rebuildStairWellPreviewRoot(
  root: THREE.Group,
  def: StairWellDef | undefined,
): void {
  const args = root.userData.editorStairPreviewArgs as BuildStairWellPreviewRootArgs | undefined;
  if (!args) return;
  while (root.children.length > 0) {
    const child = root.children[0]!;
    root.remove(child);
    disposeObject3DTree(child);
  }
  addStairWellPlaceholder(root, args.sx, args.sy, args.sz, {
    def,
    authoringScope: args.authoringScope,
    omitGroundStoreyCornerLandings: args.authoringScope === "ground",
    previewGroundDoorContext:
      args.towardPlateXZ && args.shaftPlateXZ
        ? {
            towardPlateXZ: args.towardPlateXZ,
            shaftPlateXZ: args.shaftPlateXZ,
          }
        : undefined,
    shaftExteriorFaces: args.shaftExteriorFaces,
    addOpeningEditProxy: false,
  });
}

type StairWellPreviewOpeningSpec = {
  proxyId: StairWellOpeningProxyId;
  opening: ResolvedStairWellGroundDoor;
};

function resolveStairWellPreviewOpenings(args: {
  sx: number;
  sy: number;
  sz: number;
  context?: StairWellGroundDoorContext;
  def?: StairWellDef;
  authoringScope: StairWellAuthoringScope;
}): StairWellPreviewOpeningSpec[] {
  const primary = resolveStairWellGroundDoor({
    sx: args.sx,
    sy: args.sy,
    sz: args.sz,
    context: args.context,
    def: args.def,
    authoringScope: args.authoringScope,
  });
  if (!primary) return [];
  const out: StairWellPreviewOpeningSpec[] = [
    { proxyId: STAIR_WELL_OPENING_PROXY_ID, opening: primary },
  ];
  for (const opening of resolveStairWellSupplementalDoors({
    sx: args.sx,
    sy: args.sy,
    sz: args.sz,
    context: args.context,
    def: args.def,
    authoringScope: args.authoringScope,
    primaryDoor: primary,
  })) {
    out.push({
      proxyId: STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
      opening,
    });
  }
  return out;
}

function syncStairWellOpeningEditProxy(
  proxy: THREE.Mesh,
  proxyId: StairWellOpeningProxyId,
  scope: StairWellAuthoringScope,
  sx: number,
  sy: number,
  sz: number,
  context: StairWellGroundDoorContext | undefined,
  opening: ResolvedStairWellGroundDoor,
): void {
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const wt = 0.11;
  const inwardInset = 0.02;
  const depth = 0.055;
  proxy.geometry?.dispose();
  proxy.geometry =
    opening.face === "e" || opening.face === "w"
      ? new THREE.BoxGeometry(depth, Math.max(0.05, opening.heightM), Math.max(0.05, opening.widthM))
      : new THREE.BoxGeometry(Math.max(0.05, opening.widthM), Math.max(0.05, opening.heightM), depth);
  if (!(proxy.material instanceof THREE.MeshBasicMaterial)) {
    proxy.material = new THREE.MeshBasicMaterial({
      color: 0x55b4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
    });
  }
  proxy.name = proxyId;
  proxy.userData.editorStairOpeningProxy = true;
  proxy.userData.editorStairOpeningId = proxyId;
  proxy.userData.editorStairOpeningScope = scope;
  proxy.userData.editorStairPreviewDims = [sx, sy, sz] as const;
  if (context) proxy.userData.editorStairPreviewContext = context;
  else delete proxy.userData.editorStairPreviewContext;
  proxy.rotation.set(0, 0, 0);
  proxy.scale.set(1, 1, 1);
  if (opening.face === "e") {
    proxy.position.set(hx - wt - inwardInset, opening.centerYM, opening.tangentOffsetAlongWallM);
  } else if (opening.face === "w") {
    proxy.position.set(-hx + wt + inwardInset, opening.centerYM, opening.tangentOffsetAlongWallM);
  } else if (opening.face === "n") {
    proxy.position.set(opening.tangentOffsetAlongWallM, opening.centerYM, hz - wt - inwardInset);
  } else {
    proxy.position.set(opening.tangentOffsetAlongWallM, opening.centerYM, -hz + wt + inwardInset);
  }
}

export function rebuildStairWellPreviewOpening(
  root: THREE.Group,
  def: StairWellDef | undefined,
  opts?: { preserveLiveProxyId?: string | null },
): void {
  const args = root.userData.editorStairPreviewArgs as BuildStairWellPreviewRootArgs | undefined;
  if (!args) return;
  const authoringScope = args.authoringScope ?? "typical";
  const context =
    args.towardPlateXZ && args.shaftPlateXZ
      ? {
          towardPlateXZ: args.towardPlateXZ,
          shaftPlateXZ: args.shaftPlateXZ,
        }
      : undefined;
  const openings = resolveStairWellPreviewOpenings({
    sx: args.sx,
    sy: args.sy,
    sz: args.sz,
    context,
    def,
    authoringScope,
  });
  const doomed: THREE.Object3D[] = [];
  const proxyById = new Map<StairWellOpeningProxyId, THREE.Mesh>();
  for (const child of root.children) {
    if (isStairWellOpeningProxyId(child.name) && child instanceof THREE.Mesh) {
      proxyById.set(child.name, child);
      continue;
    }
    if (
      child.name === "shaft_floor" ||
      child.name === "shaft_ceiling" ||
      child.name === "shaft_wall" ||
      child.name.startsWith("shaft_wall_")
    ) {
      doomed.push(child);
    }
  }
  for (const child of doomed) {
    root.remove(child);
    disposeObject3DTree(child);
  }
  const mats = createStairWellMaterials(def);
  addShaftShell(root, args.sx, args.sy, args.sz, mats.wall, shaftCeil, {
    includeFloor: stairWellHasFloorSlab(authoringScope),
    includeCeiling: false,
    floorMat: mats.floor,
    groundDoor: openings[0]?.opening.groundDoor ?? null,
    supplementalDoors: openings.slice(1).map((entry) => entry.opening.groundDoor),
    exteriorShaftFaces: args.shaftExteriorFaces,
    exteriorWallMat: exteriorConcreteWallMaterial,
  });
  groupGeneratedStairWellWallParts(root);
  tagGeneratedStairWellShellParts(root, authoringScope, openings);
  applyStairWellPartTransforms(root, def);
  for (const entry of openings) {
    const liveProxy = proxyById.get(entry.proxyId) ?? new THREE.Mesh();
    if (!proxyById.has(entry.proxyId)) root.add(liveProxy);
    if (opts?.preserveLiveProxyId === entry.proxyId && proxyById.has(entry.proxyId)) {
      liveProxy.name = entry.proxyId;
      liveProxy.userData.editorStairOpeningProxy = true;
      liveProxy.userData.editorStairOpeningId = entry.proxyId;
      liveProxy.userData.editorStairOpeningScope = authoringScope;
      liveProxy.userData.editorStairPreviewDims = [args.sx, args.sy, args.sz] as const;
      if (context) liveProxy.userData.editorStairPreviewContext = context;
      else delete liveProxy.userData.editorStairPreviewContext;
    } else {
      syncStairWellOpeningEditProxy(
        liveProxy,
        entry.proxyId,
        authoringScope,
        args.sx,
        args.sy,
        args.sz,
        context,
        entry.opening,
      );
    }
    proxyById.delete(entry.proxyId);
  }
  for (const orphan of proxyById.values()) {
    root.remove(orphan);
    disposeObject3DTree(orphan);
  }
  if (openings[0]) {
    root.userData.editorStairPreviewGroundDoor = {
      face: openings[0].opening.face,
      tangentOffsetAlongWall: openings[0].opening.tangentOffsetAlongWallM,
    };
  } else {
    delete root.userData.editorStairPreviewGroundDoor;
  }
}

export function stairWellEntryOpeningFromProxyMesh(
  proxy: THREE.Object3D,
  def: StairWellDef | undefined,
): StairWellEntryOpeningDef | null {
  const scope =
    (proxy.userData.editorStairOpeningScope as StairWellAuthoringScope | undefined) ?? "typical";
  const dims = proxy.userData.editorStairPreviewDims as readonly [number, number, number] | undefined;
  const context = proxy.userData.editorStairPreviewContext as
    | StairWellGroundDoorContext
    | undefined;
  if (!dims) return null;
  const proxyIdRaw = (proxy.userData.editorStairOpeningId as string | undefined) ?? proxy.name;
  const proxyId = isStairWellOpeningProxyId(proxyIdRaw)
    ? proxyIdRaw
    : STAIR_WELL_OPENING_PROXY_ID;
  const current =
    proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID
      ? resolveStairWellSupplementalDoors({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          def,
          authoringScope: scope,
        })[0] ?? null
      : resolveStairWellGroundDoor({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          def,
          authoringScope: scope,
        });
  if (!current) return null;
  const widthScale =
    current.face === "e" || current.face === "w" ? Math.abs(proxy.scale.z) : Math.abs(proxy.scale.x);
  const nextRaw: StairWellEntryOpeningDef = {
    face: current.face,
    tangentOffsetAlongWallM:
      current.face === "e" || current.face === "w" ? proxy.position.z : proxy.position.x,
    widthM: current.widthM * widthScale,
    heightM: current.heightM * Math.abs(proxy.scale.y),
    centerYM: proxy.position.y,
  };
  const baseDef = (def ?? { id: "stair_preview", version: 1 }) as StairWellDef;
  const nextDef: StairWellDef =
    proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID
      ? {
          ...baseDef,
          secondaryEntryOpening: {
            ...stairWellOpeningDefForProxyId(def, scope, proxyId),
            ...nextRaw,
          },
        }
      : scope === "ground"
        ? {
            ...baseDef,
            groundEntryOpening: { ...stairWellOpeningDefForScope(def, scope), ...nextRaw },
          }
        : {
            ...baseDef,
            entryOpening: { ...stairWellOpeningDefForScope(def, scope), ...nextRaw },
          };
  const resolved =
    proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID
      ? resolveStairWellSupplementalDoors({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          def: nextDef,
          authoringScope: scope,
        })[0] ?? null
      : resolveStairWellGroundDoor({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          authoringScope: scope,
          def: nextDef,
        });
  if (!resolved) return null;
  return {
    face: resolved.face,
    tangentOffsetAlongWallM: resolved.tangentOffsetAlongWallM,
    widthM: resolved.widthM,
    heightM: resolved.heightM,
    centerYM: resolved.centerYM,
  };
}

export function resolveStairWellGroundDoor(args: {
  sx: number;
  sy: number;
  sz: number;
  context?: StairWellGroundDoorContext;
  layout?: StairSwitchbackLayout;
  def?: StairWellDef;
  authoringScope?: StairWellAuthoringScope;
}): ResolvedStairWellGroundDoor | null {
  const { sx, sy, sz, context } = args;
  const scope = args.authoringScope ?? "typical";
  const L =
    args.layout ??
    computeSwitchbackStairLayout(sx, sy, sz, {
      extraBottomTreads: scope === "ground" ? GROUND_STOREY_EXTRA_BOTTOM_TREADS : 0,
    });
  const wt = 0.11;
  const hy = sy * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const wallCenterY = (-hy + wt) + innerWallH * 0.5;
  const yWallBottom = wallCenterY - innerWallH * 0.5;
  const bandHeightM = Math.max(0.55, Math.min(SHAFT_GROUND_DOOR_BAND_M, innerWallH));
  const maxDoorHalfW = Math.min(
    Math.max(sx - 2 * wt, 0.05) * 0.5 - 0.06,
    Math.max(sz - 2 * wt, 0.05) * 0.5 - 0.06,
  );
  const maxDoorH = bandHeightM - 0.06;
  const defaultDoorHalfW = THREE.MathUtils.clamp(
    SHAFT_DOUBLE_DOOR_W * 0.5,
    0.325,
    Math.max(0.325, maxDoorHalfW),
  );
  const defaultDoorH = THREE.MathUtils.clamp(
    SHAFT_DOUBLE_DOOR_H,
    0.65,
    Math.max(0.65, maxDoorH),
  );
  const baseYDoor0 = yWallBottom;
  const authored = stairWellOpeningDefForScope(args.def, scope);
  const widthM = THREE.MathUtils.clamp(
    authored?.widthM ?? defaultDoorHalfW * 2,
    0.65,
    Math.max(0.65, maxDoorHalfW * 2),
  );
  const heightM = THREE.MathUtils.clamp(
    authored?.heightM ?? defaultDoorH,
    0.65,
    Math.max(0.65, maxDoorH),
  );
  const doorHalfW = widthM * 0.5;
  const doorH = heightM;
  const baseYDoor1 = baseYDoor0 + doorH;
  const forceTypicalPerpendicularFace = scope === "typical";
  let pickedFace = forceTypicalPerpendicularFace
    ? ("s" as CardinalFace)
    : (authored?.face as CardinalFace | undefined);
  let tangentOffsetAlongWall = authored?.tangentOffsetAlongWallM ?? 0;
  if (!pickedFace && !context) return null;
  if (context && !forceTypicalPerpendicularFace) {
    const picked = pickStairShaftGroundDoorPlacement(L, {
      sx,
      sz,
      wallThickness: wt,
      doorHalfWidthM: doorHalfW,
      doorY0Local: baseYDoor0,
      doorY1Local: baseYDoor1,
      collisionYMaxLocal: yWallBottom + bandHeightM,
      towardX: context.towardPlateXZ[0],
      towardZ: context.towardPlateXZ[1],
      shaftPx: context.shaftPlateXZ[0],
      shaftPz: context.shaftPlateXZ[1],
    });
    pickedFace ??= picked.face;
    if (authored?.tangentOffsetAlongWallM == null) {
      tangentOffsetAlongWall = picked.tangentOffsetM;
      const landing = pickCornerLandingNearDoorBand(
        L,
        picked.face,
        tangentOffsetAlongWall,
        doorHalfW,
        (baseYDoor0 + baseYDoor1) * 0.5,
      );
      if (landing) {
        tangentOffsetAlongWall = snapStairDoorTangentAlongWallToLanding(
          landing,
          picked.face,
          doorHalfW,
          sx,
          sz,
          {
            alignTowardPlateXZ: context.towardPlateXZ,
            shaftPlateXZForAlign: context.shaftPlateXZ,
          },
        );
      }
      tangentOffsetAlongWall = shiftStairDoorTangentViewerRightFromInside(
        picked.face,
        tangentOffsetAlongWall,
        doorHalfW,
        sx,
        sz,
        wt,
      );
      const rightBiasSign = picked.face === "e" || picked.face === "s" ? 1 : -1;
      tangentOffsetAlongWall = clampStairDoorTangentAlongInnerWall(
        picked.face,
        tangentOffsetAlongWall + rightBiasSign * STAIR_CORRIDOR_DOOR_EXIT_TANGENT_NUDGE_M * 0.25,
        doorHalfW,
        sx,
        sz,
        wt,
      );
    }
  }
  if (!pickedFace) return null;
  tangentOffsetAlongWall = clampStairDoorTangentAlongInnerWall(
    pickedFace,
    tangentOffsetAlongWall,
    widthM * 0.5,
    sx,
    sz,
    wt,
  );
  const centerMin = yWallBottom + heightM * 0.5;
  const centerMax = yWallBottom + bandHeightM - 0.04 - heightM * 0.5;
  const authoredCenterYM = THREE.MathUtils.clamp(
    authored?.centerYM ?? (baseYDoor0 + baseYDoor1) * 0.5,
    Math.min(centerMin, centerMax),
    Math.max(centerMin, centerMax),
  );
  let yDoor0 = authoredCenterYM - heightM * 0.5;
  let yDoor1 = authoredCenterYM + heightM * 0.5;
  // Stair/corridor thresholds must be floor-flush; otherwise a thin sill strip survives and
  // causes the same rubber-banding bug we previously had on west apartment doors.
  if (yDoor0 > yWallBottom) {
    yDoor1 -= yDoor0 - yWallBottom;
    yDoor0 = yWallBottom;
  }
  const centerYM = (yDoor0 + yDoor1) * 0.5;
  return {
    groundDoor: {
      face: pickedFace,
      bandHeightM: SHAFT_GROUND_DOOR_BAND_M,
      tangentOffsetAlongWall,
      doorWidthM: widthM,
      doorHoleY0Local: yDoor0,
      doorHoleY1Local: yDoor1,
    },
    doorHalfW: widthM * 0.5,
    y0Local: yDoor0,
    y1Local: yDoor1,
    face: pickedFace,
    tangentOffsetAlongWallM: tangentOffsetAlongWall,
    widthM,
    heightM,
    centerYM,
  };
}

export function resolveStairWellSupplementalDoors(args: {
  sx: number;
  sy: number;
  sz: number;
  context?: StairWellGroundDoorContext;
  layout?: StairSwitchbackLayout;
  def?: StairWellDef;
  authoringScope?: StairWellAuthoringScope;
  primaryDoor?: ResolvedStairWellGroundDoor | null;
}): readonly ResolvedStairWellGroundDoor[] {
  const { sx, sy, sz } = args;
  const authored = args.def?.secondaryEntryOpening;
  if (!authored) return [];

  const primaryDoor =
    args.primaryDoor ??
    resolveStairWellGroundDoor({
      sx,
      sy,
      sz,
      context: args.context,
      layout: args.layout,
      def: args.def,
      authoringScope: args.authoringScope,
    });
  if (!primaryDoor) return [];

  const wt = 0.11;
  const hy = sy * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const yWallBottom = -hy + wt;
  const maxDoorHalfW = Math.min(
    Math.max(sx - 2 * wt, 0.05) * 0.5 - 0.06,
    Math.max(sz - 2 * wt, 0.05) * 0.5 - 0.06,
  );
  const widthM = THREE.MathUtils.clamp(
    authored.widthM ?? primaryDoor.widthM,
    0.65,
    Math.max(0.65, maxDoorHalfW * 2),
  );
  const face = (authored.face ?? "s") as CardinalFace;
  const tangentOffsetAlongWallM = clampStairDoorTangentAlongInnerWall(
    face,
    authored.tangentOffsetAlongWallM ?? 0,
    widthM * 0.5,
    sx,
    sz,
    wt,
  );
  // Secondary stair openings connect stacked landings, so they must clear the full wall band.
  const { y0, y1 } = normalizeStairDoorVerticalSpan(
    yWallBottom,
    yWallBottom + innerWallH,
    yWallBottom,
    yWallBottom + innerWallH,
  );

  return [
    {
      groundDoor: {
        face,
        bandHeightM: innerWallH,
        tangentOffsetAlongWall: tangentOffsetAlongWallM,
        doorWidthM: widthM,
        doorHoleY0Local: y0,
        doorHoleY1Local: y1,
      },
      doorHalfW: widthM * 0.5,
      y0Local: y0,
      y1Local: y1,
      face,
      tangentOffsetAlongWallM,
      widthM,
      heightM: y1 - y0,
      centerYM: (y0 + y1) * 0.5,
    },
  ];
}

export function addStairWellPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  opts?: StairWellPlaceholderOpts,
): void {
  const { omitGroundStoreyCornerLandings, def: _def, ...layoutOpts } = opts ?? {};
  const authoringScope = opts?.authoringScope ?? "typical";
  const L = computeSwitchbackStairLayout(sx, sy, sz, {
    ...layoutOpts,
    extraBottomTreads:
      opts?.extraBottomTreads ??
      (authoringScope === "ground" ? GROUND_STOREY_EXTRA_BOTTOM_TREADS : 0),
  });
  const mats = createStairWellMaterials(opts?.def);
  const resolvedGroundDoor =
    opts?.groundDoor != null
      ? (() => {
          const widthM = opts.groundDoor?.doorWidthM ?? SHAFT_DOUBLE_DOOR_W;
          const y0Local = opts.groundDoor?.doorHoleY0Local ?? (-sy * 0.5 + 0.11);
          const y1Local =
            opts.groundDoor?.doorHoleY1Local ?? (y0Local + Math.min(SHAFT_DOUBLE_DOOR_H, sy - 0.4));
          return {
            groundDoor: opts.groundDoor,
            doorHalfW: widthM * 0.5,
            y0Local,
            y1Local,
            face: opts.groundDoor?.face ?? "e",
            tangentOffsetAlongWallM: opts.groundDoor?.tangentOffsetAlongWall ?? 0,
            widthM,
            heightM: y1Local - y0Local,
            centerYM: (y0Local + y1Local) * 0.5,
          } satisfies ResolvedStairWellGroundDoor;
        })()
      : resolveStairWellGroundDoor({
          layout: L,
          sx,
          sy,
          sz,
          context: opts?.previewGroundDoorContext,
          def: opts?.def,
          authoringScope,
        });
  const stairGroundDoor = resolvedGroundDoor?.groundDoor ?? null;
  const supplementalDoors =
    opts?.supplementalDoors ??
    resolveStairWellSupplementalDoors({
      layout: L,
      sx,
      sy,
      sz,
      context: opts?.previewGroundDoorContext,
      def: opts?.def,
      authoringScope,
      primaryDoor: resolvedGroundDoor,
    });
  if (stairGroundDoor) {
    group.userData.editorStairPreviewGroundDoor = {
      face: stairGroundDoor.face,
      tangentOffsetAlongWall: stairGroundDoor.tangentOffsetAlongWall,
    };
  } else {
    delete group.userData.editorStairPreviewGroundDoor;
  }
  const stairFlights = new THREE.Group();
  stairFlights.name = "stair_flights";
  setStairWellEditorPartId(stairFlights, "stair_flights", authoringScope);
  setStairWellEditorPickId(stairFlights, "stair_flights");
  group.add(stairFlights);

  const lowerFlight = new THREE.Group();
  lowerFlight.name = "stair_flight_lower";
  setStairWellEditorPartId(lowerFlight, "stair_flight_lower", authoringScope);
  setStairWellEditorPickId(lowerFlight, "stair_flight_lower");
  stairFlights.add(lowerFlight);

  const upperFlight = new THREE.Group();
  upperFlight.name = "stair_flight_upper";
  setStairWellEditorPartId(upperFlight, "stair_flight_upper", authoringScope);
  setStairWellEditorPickId(upperFlight, "stair_flight_upper");
  stairFlights.add(upperFlight);

  addShaftShell(group, sx, sy, sz, mats.wall, shaftCeil, {
    includeFloor: stairWellHasFloorSlab(authoringScope),
    includeCeiling: opts?.includeCeiling === true,
    floorMat: mats.floor,
    groundDoor: stairGroundDoor,
    supplementalDoors: supplementalDoors.map((door) => door.groundDoor),
    exteriorShaftFaces: opts?.shaftExteriorFaces,
    exteriorWallMat: exteriorConcreteWallMaterial,
  });
  groupGeneratedStairWellWallParts(group);
  tagGeneratedStairWellShellParts(group, authoringScope, [
    ...(resolvedGroundDoor
      ? [{ proxyId: STAIR_WELL_OPENING_PROXY_ID, opening: resolvedGroundDoor }]
      : []),
    ...supplementalDoors.map((opening) => ({
      proxyId: STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
      opening,
    })),
  ]);

  const boundary = lowerFlightLegBoundary(L.legTreadCounts);

  let ti = 0;
  for (let lap = 0; lap < L.numLaps; lap++) {
    for (let legIndex = 0; legIndex < L.legTreadCounts.length; legIndex++) {
      const target = legIndex < boundary ? lowerFlight : upperFlight;
      const count = L.legTreadCounts[legIndex] ?? 0;
      for (let local = 0; local < count; local++) {
        const tr = L.treads[ti];
        if (!tr) break;
        if (opts?.omitTreads !== true) {
          /** Single material on full box so Patina / PBR wraps every face (riser, bottom, sides).
           * Multi-material arrays were avoided — they broke WebGPU draws in the editor.
           * Metric UVs ({@link createStairTreadBoxGeometry}) avoid default cube UV stretch on wide tops. */
          const mesh = new THREE.Mesh(
            createStairTreadBoxGeometry(tr.halfAlong, tr.riseHalf, tr.halfAcross),
            mats.tread,
          );
          mesh.name = `stair_tread_${ti}`;
          mesh.position.set(tr.x, tr.y, tr.z);
          mesh.rotation.y = tr.yaw;
          target.add(mesh);
        }
        ti += 1;
      }
    }
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
  if (opts?.omitTopLanding === true) {
    let highestDeck = -Infinity;
    for (const cl of L.cornerLandings) {
      if (omitOnlyLanding !== undefined && cl === omitOnlyLanding) continue;
      const deckTop = cl.y + cl.thicknessHalf;
      if (deckTop > highestDeck + 1e-6) {
        highestDeck = deckTop;
        omitOnlyLanding = cl;
      }
    }
  }

  const landingsPerLap =
    L.numLaps > 0 ? Math.max(1, Math.floor(L.cornerLandings.length / L.numLaps)) : 1;
  let li = 0;
  for (const [landingIndex, cl] of L.cornerLandings.entries()) {
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
    setStairWellEditorPartId(
      mesh,
      stairLandingPartIdForIndex(landingIndex % landingsPerLap, landingsPerLap),
      authoringScope,
    );
    li += 1;
    mesh.position.set(cl.x, cl.y, cl.z);
    /** Same world-metric tile scale as shaft walls and typical-storey landings (default m/tile). */
    applyWorldMetricUvsToAxisAlignedBoxMesh(mesh);
    mesh.userData.mammothAxisAlignedCollisionBox = true;
    /** Stable ref for {@link attachStairWellLandingProps} (same object as layout `cornerLandings`). */
    mesh.userData.mammothStairCornerLandingRef = cl;
    group.add(mesh);
  }

  recordStairWellBaseTransforms(group);
  applyStairWellPartTransforms(group, opts?.def);
  attachStairWellLandingProps({
    root: group,
    def: opts?.def,
    authoringScope,
    L,
    primaryDoor: resolvedGroundDoor ?? undefined,
    omitOnlyLanding,
  });
}
