import * as THREE from "three";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import type { CorridorShellWallHoles } from "./floorPlaceholderMeshTypes.js";
import { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
import type { ApartmentDoorTemplate } from "./unitEntryAdjacency.js";

import { APARTMENT_DOOR_TEMPLATES } from "./generatedApartmentDoors.js";
import { unitEntryWallHolesFromFloorAdjacency } from "./floorCorridorPlateSignage.js";
import { exteriorFacesForPlacedObjectInFloor } from "./exteriorFaceExposure.js";
import {
  DEFAULT_EXTERIOR_FACADE_SALT,
  addUnitExteriorWindowGlassMeshes,
  planUnitExteriorWindowsForFace,
  unitShellFacesForExteriorWindows,
  UNIT_SHELL_WALL_THICKNESS_M,
} from "./unitExteriorWindows.js";
import {
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  type CardinalFace,
} from "./wallWithDoorCutout.js";
import { HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID } from "./ownedApartmentHomeBand.js";
import { residentialUnitStrictBoundsXZ } from "./residentialUnitStrictBoundsXZ.js";

export function apartmentDoorTemplateForUnit(opts: {
  floorDocId: string;
  unitId: string;
}): ApartmentDoorTemplate | undefined {
  for (const set of APARTMENT_DOOR_TEMPLATES) {
    if (set.floorDocId !== opts.floorDocId) continue;
    return set.templates.find((t) => t.unitId === opts.unitId);
  }
  return undefined;
}

export type OwnedApartmentEditorShellPlan = {
  wt: number;
  hx: number;
  hz: number;
  vlenX: number;
  vlenZ: number;
  vh: number;
  yLo: number;
  yHi: number;
  corridorWallHoles: CorridorShellWallHoles | undefined;
  exteriorWindowHoles: CorridorShellWallHoles | undefined;
  exteriorFaces: readonly CardinalFace[];
  windowFacesForGlass: readonly CardinalFace[];
  tintByExteriorFace: Partial<Record<CardinalFace, number>>;
};

/**
 * Mirrors the unit-branch path in {@link ../floorPlaceholderMeshes} before
 * {@link ../hollowRoomShell.addHollowRoomShell}: corridor entry punches + seeded façade panels.
 *
 * Returned coordinates are **room-local** centered on the prefab bounding box midpoint (floor JSON
 * `position`), matching placeholder shells.
 */
export function planOwnedApartmentEditorShellForUnit(opts: {
  floor: FloorDoc;
  placedObject: PlacedObject;
  storyLevelIndex: number;
  facadeSalt?: number;
}): OwnedApartmentEditorShellPlan | null {
  const o = opts.placedObject;
  if (o.rotation?.some((x) => Math.abs(x) > 1e-12)) return null;

  const sx = o.scale?.[0];
  const sy = o.scale?.[1];
  const sz = o.scale?.[2];
  if (!(sx !== undefined && sy !== undefined && sz !== undefined))
    return null;

  if (classifyPrefab(o.prefabId) !== "unit") return null;
  const corridorWallHoles = unitEntryWallHolesFromFloorAdjacency(
    o,
    sx,
    sy,
    sz,
    "unit",
    opts.floor,
  );

  const exteriorFaces = exteriorFacesForPlacedObjectInFloor(
    opts.floor,
    o,
  );

  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const vh = Math.max(sy - 2 * wt, 0.05);
  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;

  const facadeSalt = opts.facadeSalt ?? DEFAULT_EXTERIOR_FACADE_SALT;
  const tintByExteriorFace: Partial<Record<CardinalFace, number>> = {};
  const gathered: CorridorShellWallHoles = {
    e: [],
    w: [],
    n: [],
    s: [],
  };

  let exteriorWindowHoles: CorridorShellWallHoles | undefined;
  let windowFacesForGlass: CardinalFace[] = [];

  if (exteriorFaces.length > 0) {
    windowFacesForGlass = unitShellFacesForExteriorWindows(exteriorFaces, {
      floor: opts.floor,
      placedObject: o,
    });
    for (const face of windowFacesForGlass) {
      const planFace = planUnitExteriorWindowsForFace({
        face,
        vlenX,
        vlenZ,
        yLo,
        yHi,
        facadeSalt,
        storyLevelIndex: opts.storyLevelIndex,
        floorDocId: opts.floor.id,
        placedObjectId: o.id,
      });
      tintByExteriorFace[face] = planFace.tintId;
      if (face === "e") {
        gathered.e.push(...planFace.holesEw);
      } else if (face === "w") {
        gathered.w.push(...planFace.holesEw);
      } else if (face === "n") {
        gathered.n.push(...planFace.holesNs);
      } else if (face === "s") {
        gathered.s.push(...planFace.holesNs);
      }
    }
    const anyHole =
      gathered.e.length +
        gathered.w.length +
        gathered.n.length +
        gathered.s.length >
      0;
    exteriorWindowHoles = anyHole ? gathered : undefined;
    if (!anyHole) {
      windowFacesForGlass = [];
    }
  }

  return {
    wt,
    hx,
    hz,
    vlenX,
    vlenZ,
    vh,
    yLo,
    yHi,
    corridorWallHoles,
    exteriorWindowHoles,
    exteriorFaces,
    windowFacesForGlass,
    tintByExteriorFace,
  };
}

export type OwnedApartmentAuthoringPreviewLayout = {
  canonicalUnitId: string;
  /** Matches `derive_bounds` X/Z span merged with `OwnedApartmentBuiltinsDoc` runtime fraction mapping. */
  spanX: number;
  spanZ: number;
  /** World-plane minima (`bound_min_x/z`) for fractional placement (game row). */
  strictMinX: number;
  strictMinZ: number;
  /** Floor JSON prefab midpoint XZ — hollow shell meshes are authored in coords centered here. */
  unitCenterX: number;
  unitCenterZ: number;
  shellPlan: OwnedApartmentEditorShellPlan;
};

/**
 * Canonical owned-apartment editor preview: mamutica typical plate + server's first roof-home unit id + door
 * template + façade seed at the storey that matches authored roof slabs.
 *
 * Fail-open callers should revert to deprecated square `OwnedApartmentBuiltinsDoc.previewSizeM` space.
 */
export function resolveOwnedApartmentAuthoringPreviewLayout(opts: {
  floorDoc: FloorDoc;
  homeBandStoryLevelIndex: number;
  facadeSalt?: number;
  /** Override for tests (`unit_e_014`, …); production should omit. */
  canonicalUnitId?: string;
}): OwnedApartmentAuthoringPreviewLayout | null {
  const uid = opts.canonicalUnitId ?? HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID;
  const placed = opts.floorDoc.objects.find((po) => po.id === uid);
  if (!placed || classifyPrefab(placed.prefabId) !== "unit") return null;

  const template = apartmentDoorTemplateForUnit({
    floorDocId: opts.floorDoc.id,
    unitId: uid,
  });
  if (!template) return null;

  const shellPlan = planOwnedApartmentEditorShellForUnit({
    floor: opts.floorDoc,
    placedObject: placed,
    storyLevelIndex: opts.homeBandStoryLevelIndex,
    facadeSalt: opts.facadeSalt,
  });
  if (!shellPlan) return null;

  const xz = residentialUnitStrictBoundsXZ(template);
  const px = placed.position[0];
  const pz = placed.position[2];

  return {
    canonicalUnitId: uid,
    spanX: xz.maxX - xz.minX,
    spanZ: xz.maxZ - xz.minZ,
    strictMinX: xz.minX,
    strictMinZ: xz.minZ,
    unitCenterX: px,
    unitCenterZ: pz,
    shellPlan,
  };
}

/**
 * Holed plaster shell + tinted glass slabs — **`addHollowRoomShell` wall branches** trimmed to editor
 * needs (no floor slab, ceiling, or exterior cladding).
 */
export function appendOwnedApartmentEditorShellWalls(
  group: THREE.Group,
  plan: OwnedApartmentEditorShellPlan,
  wallMat: THREE.MeshStandardMaterial,
): void {
  const wt = plan.wt;
  const hx = plan.hx;
  const hz = plan.hz;
  const vlenX = plan.vlenX;
  const vlenZ = plan.vlenZ;
  const yLo = plan.yLo;
  const yHi = plan.yHi;
  const cw = plan.corridorWallHoles;
  const win = plan.exteriorWindowHoles;
  const innerE = [...(cw?.e ?? []), ...(win?.e ?? [])];
  const innerW = [...(cw?.w ?? []), ...(win?.w ?? [])];
  const innerN = [...(cw?.n ?? []), ...(win?.n ?? [])];
  const innerS = [...(cw?.s ?? []), ...(win?.s ?? [])];

  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;
  const xE = hx - wt * 0.5;
  const xW = -hx + wt * 0.5;
  const zN = hz - wt * 0.5;
  const zS = -hz + wt * 0.5;

  const stairHoleCount =
    innerE.length + innerW.length + innerN.length + innerS.length;

  const vh = yHi - yLo;
  if (stairHoleCount === 0) {
    const east = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallMat);
    east.name = "editor_ref_shell_wall_e";
    east.position.set(hx - wt * 0.5, 0, 0);
    group.add(east);
    const west = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallMat);
    west.name = "editor_ref_shell_wall_w";
    west.position.set(-hx + wt * 0.5, 0, 0);
    group.add(west);
    const north = new THREE.Mesh(new THREE.BoxGeometry(vlenX, vh, wt), wallMat);
    north.name = "editor_ref_shell_wall_n";
    north.position.set(0, 0, hz - wt * 0.5);
    group.add(north);
    const south = new THREE.Mesh(new THREE.BoxGeometry(vlenX, vh, wt), wallMat);
    south.name = "editor_ref_shell_wall_s";
    south.position.set(0, 0, -hz + wt * 0.5);
    group.add(south);
  } else {
    addWallConstantXWithHoles(
      group,
      wallMat,
      xE,
      wt,
      zMin,
      zMax,
      yLo,
      yHi,
      innerE,
      "editor_ref_shell_wall_e",
    );
    addWallConstantXWithHoles(
      group,
      wallMat,
      xW,
      wt,
      zMin,
      zMax,
      yLo,
      yHi,
      innerW,
      "editor_ref_shell_wall_w",
    );
    addWallConstantZWithHoles(
      group,
      wallMat,
      zN,
      wt,
      xMin,
      xMax,
      yLo,
      yHi,
      innerN,
      "editor_ref_shell_wall_n",
    );
    addWallConstantZWithHoles(
      group,
      wallMat,
      zS,
      wt,
      xMin,
      xMax,
      yLo,
      yHi,
      innerS,
      "editor_ref_shell_wall_s",
    );
  }

  if (plan.exteriorWindowHoles && plan.windowFacesForGlass.length > 0) {
    addUnitExteriorWindowGlassMeshes(group, {
      faces: plan.windowFacesForGlass,
      hx,
      hz,
      tintByFace: plan.tintByExteriorFace,
      holesEw: {
        e: plan.exteriorWindowHoles.e,
        w: plan.exteriorWindowHoles.w,
      },
      holesNs: {
        n: plan.exteriorWindowHoles.n,
        s: plan.exteriorWindowHoles.s,
      },
    });
  }
}
