import * as THREE from "three";
import type { PlacedObject } from "@the-mammoth/schemas";
import type { CollisionAabb } from "./collisionScene.js";
import type { HollowShellOpts } from "./floorPlaceholderMeshTypes.js";
import { matsFor } from "./floorPlaceholderPrefabKind.js";
import {
  addShellFloorCeilingPieces,
  HOLLOW_SHELL_WT_M,
} from "./hollowRoomShell.js";
import type { RectXZ } from "./shaftPlanformClip.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { addWallConstantXWithHoles } from "./wallWithDoorCutout.js";
import {
  RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
  residentialBalconyPartitionFace,
  residentialUnitBalconyExteriorEdge,
} from "./residentialUnitBalcony.js";
import {
  addUnitExteriorWindowGlassMeshes,
  planUnitExteriorWindowsForFace,
} from "./unitExteriorWindows.js";

/** @deprecated Use {@link HOLLOW_SHELL_WT_M}. */
export const SHELL_WT_M = HOLLOW_SHELL_WT_M;

const BALCONY_BAY_ID_SUFFIX = "__balcony_bay";

export type ResidentialBalconyBayFrame = {
  baySx: number;
  exteriorFace: CardinalFace;
  /** Bay X extent in room-local coords (flush with widened `shell_floor`). */
  x0: number;
  x1: number;
};

export function residentialBalconyBayFrame(
  unitId: string,
  interiorSx: number,
  sz: number,
): ResidentialBalconyBayFrame | null {
  const rect = residentialBalconyExtensionRectXZ(unitId, interiorSx, sz);
  if (!rect) return null;
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (!edge) return null;
  return {
    baySx: RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
    exteriorFace: edge === "maxX" ? "e" : "w",
    x0: rect.x0,
    x1: rect.x1,
  };
}

/** Floor/ceiling extension in room-local XZ (flush with the 9 m `shell_floor` edge at ±hx). */
export function residentialBalconyExtensionRectXZ(
  unitId: string,
  interiorSx: number,
  sz: number,
): RectXZ | null {
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (!edge) return null;
  const hz = sz * 0.5;
  const hx = interiorSx * 0.5;
  if (edge === "maxX") {
    return { x0: hx, x1: hx + RESIDENTIAL_UNIT_BALCONY_OVERHANG_M, z0: -hz, z1: hz };
  }
  return {
    x0: -hx - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
    x1: -hx,
    z0: -hz,
    z1: hz,
  };
}

/** Hollow-shell options: one slab + N/S walls across living + bay (no partition wall). */
export function residentialBalconyHollowShellExtras(
  unitId: string,
  interiorSx: number,
): Pick<
  HollowShellOpts,
  "openInteriorFaces" | "balconyExtendMaxX" | "balconyExtendMinX" | "wallSpanX"
> | null {
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (!edge) return null;
  const hx = interiorSx * 0.5;
  const bay = RESIDENTIAL_UNIT_BALCONY_OVERHANG_M;
  const partition = residentialBalconyPartitionFace(unitId);
  const openInteriorFaces = partition ? [partition] : undefined;
  if (edge === "maxX") {
    return {
      openInteriorFaces,
      balconyExtendMaxX: hx + bay,
      wallSpanX: { min: -hx, max: hx + bay },
    };
  }
  return {
    openInteriorFaces,
    balconyExtendMinX: -hx - bay,
    wallSpanX: { min: -hx - bay, max: hx },
  };
}

export function isResidentialBalconyBayPlacedObjectId(id: string): boolean {
  return id.endsWith(BALCONY_BAY_ID_SUFFIX);
}

export function balconyBayPlacedObjectId(unitId: string): string {
  return `${unitId}${BALCONY_BAY_ID_SUFFIX}`;
}

function tagBalconyMesh(mesh: THREE.Mesh, unitId: string): void {
  mesh.userData.mammothSkipFloorGeometryMerge = true;
  mesh.userData.mammothPlacedObjectId = unitId;
  mesh.userData.mammothUnitInterior = true;
  mesh.frustumCulled = false;
}

/**
 * Editor preview only — game slabs come from widened {@link addHollowRoomShell}.
 */
export function addResidentialBalconyShellSlabExtensions(
  unitGroup: THREE.Group,
  interiorSx: number,
  sy: number,
  sz: number,
  unitId: string,
  storyLevelIndex: number,
  opts?: { floor?: boolean; ceiling?: boolean },
): void {
  const rect = residentialBalconyExtensionRectXZ(unitId, interiorSx, sz);
  if (!rect) return;

  const wantFloor = opts?.floor !== false;
  const wantCeil = opts?.ceiling !== false;
  if (!wantFloor && !wantCeil) return;

  const wt = HOLLOW_SHELL_WT_M;
  const hy = sy * 0.5;
  const hx = interiorSx * 0.5;
  const hz = sz * 0.5;
  const { floor: floorM, ceil: ceilM } = matsFor("unit", storyLevelIndex);

  if (wantFloor && wantCeil) {
    addShellFloorCeilingPieces(
      unitGroup,
      [rect],
      wt,
      hy,
      floorM,
      ceilM,
      hx + RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
      hz,
      "balcony_shell",
    );
  } else if (wantCeil) {
    const w = rect.x1 - rect.x0;
    const d = rect.z1 - rect.z0;
    const cx = (rect.x0 + rect.x1) * 0.5;
    const cz = (rect.z0 + rect.z1) * 0.5;
    const ceilGeom = new THREE.BoxGeometry(w, wt, d);
    const ceiling = new THREE.Mesh(ceilGeom, ceilM);
    ceiling.name = "balcony_shell_ceiling";
    ceiling.position.set(cx, hy - wt * 0.5, cz);
    tagBalconyMesh(ceiling, unitId);
    unitGroup.add(ceiling);
  }

  unitGroup.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.name.startsWith("balcony_shell_")) return;
    tagBalconyMesh(o, unitId);
  });
}

/**
 * Glazed exterior façade at the bay outer face (room-local coords; no child-group offset).
 */
export function addResidentialBalconyBayShell(
  unitGroup: THREE.Group,
  interiorSx: number,
  sy: number,
  sz: number,
  unitId: string,
  opts: {
    storyLevelIndex: number;
    floorDocId: string;
    facadeSalt: number;
  },
): void {
  const frame = residentialBalconyBayFrame(unitId, interiorSx, sz);
  if (!frame) return;

  const wt = HOLLOW_SHELL_WT_M;
  const hz = sz * 0.5;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;
  const bayLenX = frame.x1 - frame.x0;
  const hxBay = bayLenX * 0.5;
  const cx = (frame.x0 + frame.x1) * 0.5;

  const plan = planUnitExteriorWindowsForFace({
    face: frame.exteriorFace,
    vlenX: Math.max(bayLenX - 2 * wt, 0.05),
    vlenZ: Math.max(sz - 2 * wt, 0.05),
    yLo,
    yHi,
    facadeSalt: opts.facadeSalt,
    storyLevelIndex: opts.storyLevelIndex,
    floorDocId: opts.floorDocId,
    placedObjectId: balconyBayPlacedObjectId(unitId),
  });

  const { wall: wallM, exteriorWall: exteriorWallM } = matsFor(
    "unit",
    opts.storyLevelIndex,
  );

  const holesEw = plan.holesEw;
  const xFacade =
    frame.exteriorFace === "e" ? frame.x1 - wt * 0.5 : frame.x0 + wt * 0.5;

  addWallConstantXWithHoles(
    unitGroup,
    wallM,
    xFacade,
    wt,
    -hz + wt,
    hz - wt,
    yLo,
    yHi,
    holesEw,
    frame.exteriorFace === "e" ? "balcony_wall_e" : "balcony_wall_w",
  );

  const facadeMesh = unitGroup.children[unitGroup.children.length - 1];
  if (facadeMesh instanceof THREE.Mesh) {
    tagBalconyMesh(facadeMesh, unitId);
  }

  const cladT = 0.035;
  const cladBias = 0.05;
  const xClad =
    frame.exteriorFace === "e"
      ? frame.x1 + cladT * 0.5 + cladBias
      : frame.x0 - cladT * 0.5 - cladBias;
  addWallConstantXWithHoles(
    unitGroup,
    exteriorWallM,
    xClad,
    cladT,
    -hz + wt,
    hz - wt,
    yLo,
    yHi,
    holesEw,
    frame.exteriorFace === "e"
      ? "shell_exterior_cladding_e"
      : "shell_exterior_cladding_w",
  );

  if (holesEw.length > 0) {
    const glassGroup = new THREE.Group();
    glassGroup.name = "balcony_bay";
    glassGroup.position.set(cx, 0, 0);
    addUnitExteriorWindowGlassMeshes(glassGroup, {
      faces: [frame.exteriorFace],
      hx: hxBay,
      hz,
      tintByFace: { [frame.exteriorFace]: plan.tintId },
      holesEw: {
        e: frame.exteriorFace === "e" ? holesEw : [],
        w: frame.exteriorFace === "w" ? holesEw : [],
      },
      holesNs: { n: [], s: [] },
    });
    glassGroup.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.name.startsWith("unit_exterior_glass_")) return;
      tagBalconyMesh(obj, unitId);
      obj.userData.mammothResidentialUnitExteriorGlass = true;
    });
    unitGroup.add(glassGroup);
  }

  unitGroup.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.name.startsWith("shell_exterior_cladding")) {
      obj.userData.mammothNoCollision = true;
    }
  });
}

/**
 * @deprecated Walk uses {@link appendHollowShellFloorWalkAABBs} with the same `balconyExtend*`
 * fields as {@link addHollowRoomShell}. Kept for callers that still pass a bay-only rect.
 */
export function appendResidentialBalconyBayFloorWalkAABBs(
  out: CollisionAabb[],
  obj: PlacedObject,
  floorWorldY: number,
): void {
  const interiorSx = obj.scale?.[0] ?? 9;
  const sz = obj.scale?.[2] ?? 7.1;
  const rect = residentialBalconyExtensionRectXZ(obj.id, interiorSx, sz);
  if (!rect) return;

  const sy = obj.scale?.[1] ?? 3.05;
  const wt = HOLLOW_SHELL_WT_M;
  const [px, py, pz] = obj.position;
  const wy = py + floorWorldY;
  const hy = sy * 0.5;
  const top = -hy + wt;
  const thin = 0.06;
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  const cx = (rect.x0 + rect.x1) * 0.5;
  const cz = (rect.z0 + rect.z1) * 0.5;
  out.push({
    min: [px + cx - w * 0.5, wy + top - thin, pz + cz - d * 0.5],
    max: [px + cx + w * 0.5, wy + top, pz + cz + d * 0.5],
  });
}
