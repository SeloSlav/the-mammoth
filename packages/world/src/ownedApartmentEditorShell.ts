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
  type WallHoleXY,
  type WallHoleYZ,
} from "./wallWithDoorCutout.js";
import { addExteriorWallCladding } from "./hollowRoomShell.js";
import { floorPlaceholderMeshMaterials as mat } from "./floorPlaceholderMeshMaterials.js";
import { HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID } from "./ownedApartmentHomeBand.js";
import { residentialBalconyPartitionFace } from "./residentialUnitBalcony.js";
import { residentialBalconyHollowShellExtras } from "./residentialUnitBalconyShell.js";
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
  /** N/S plaster + cladding span when the unit is lengthened for a balcony bay. */
  wallSpanX?: { min: number; max: number };
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

  const partitionFace = residentialBalconyPartitionFace(o.id);

  if (exteriorFaces.length > 0) {
    windowFacesForGlass = unitShellFacesForExteriorWindows(exteriorFaces).filter(
      (face) => face !== partitionFace,
    );
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
    if (partitionFace === "e") gathered.e = [];
    if (partitionFace === "w") gathered.w = [];
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

  const balconyShell = residentialBalconyHollowShellExtras(o.id, sx);

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
    wallSpanX: balconyShell?.wallSpanX,
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
export type OwnedApartmentAuthoringPreviewUnitOption = {
  unitId: string;
  label: string;
  /** Matches {@link HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID} — first auto-granted player home. */
  isPlayerSpawnHome: boolean;
};

export function formatOwnedApartmentPreviewUnitLabel(unitId: string): string {
  if (unitId.startsWith("unit_e_")) {
    const n = unitId.slice("unit_e_".length);
    return `East ${Number.parseInt(n, 10) || n}`;
  }
  if (unitId.startsWith("unit_w_")) {
    const n = unitId.slice("unit_w_".length);
    return `West ${Number.parseInt(n, 10) || n}`;
  }
  return unitId;
}

/**
 * Heading for `{@link FloorDoc}.id`|`storyLevelIndex`|`unitId` keys (owned-apartment authoring).
 * Residential floor number uses `Math.max(1, storyLevelIndex - 1)` so it matches gameplay floor labels.
 */
export function formatOwnedApartmentPreviewUnitKeyHeading(
  unitKey: string,
  unitIdFallback?: string,
): string {
  const segments = unitKey.trim().split("|");
  if (segments.length === 3) {
    const levelStr = segments[1]!;
    const unitId = segments[2]!.trim();
    const storyLevelIndex = Number.parseInt(levelStr, 10);
    if (Number.isFinite(storyLevelIndex) && unitId) {
      const residentialFloor = Math.max(1, storyLevelIndex - 1);
      return `Floor ${residentialFloor}, ${formatOwnedApartmentPreviewUnitLabel(unitId)}`;
    }
  }
  const raw = unitIdFallback?.trim() ?? "";
  if (!raw) return "Apartment unit";
  const wing = formatOwnedApartmentPreviewUnitLabel(raw);
  if (wing !== raw) return wing;
  return raw.replace(/_/gu, " ").toUpperCase();
}

function isOwnedApartmentPreviewUnitId(unitId: string): boolean {
  return unitId.startsWith("unit_e_") || unitId.startsWith("unit_w_");
}

/** Residential slabs on the typical floor plate that have corridor door templates. */
export function listOwnedApartmentAuthoringPreviewUnits(
  floorDoc: FloorDoc,
): OwnedApartmentAuthoringPreviewUnitOption[] {
  const out: OwnedApartmentAuthoringPreviewUnitOption[] = [];
  for (const obj of floorDoc.objects) {
    if (classifyPrefab(obj.prefabId) !== "unit") continue;
    if (!isOwnedApartmentPreviewUnitId(obj.id)) continue;
    if (!apartmentDoorTemplateForUnit({ floorDocId: floorDoc.id, unitId: obj.id })) {
      continue;
    }
    out.push({
      unitId: obj.id,
      label: formatOwnedApartmentPreviewUnitLabel(obj.id),
      isPlayerSpawnHome: obj.id === HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID,
    });
  }
  out.sort((a, b) =>
    a.unitId.localeCompare(b.unitId, undefined, { numeric: true }),
  );
  return out;
}

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
 * Holed plaster shell + exterior concrete cladding + tinted glass slabs — mirrors
 * {@link addHollowRoomShell} unit wall branches (no floor slab or ceiling).
 */
export type OwnedApartmentEditorShellWallOpts = {
  /** Omit plaster / cladding / glass on these faces (editor cutaway into balcony bay). */
  openFaces?: readonly CardinalFace[];
};

export function appendOwnedApartmentEditorShellWalls(
  group: THREE.Group,
  plan: OwnedApartmentEditorShellPlan,
  wallMat: THREE.MeshStandardMaterial,
  exteriorWallMat?: THREE.MeshStandardMaterial,
  opts?: OwnedApartmentEditorShellWallOpts,
): void {
  const openFaces = new Set(opts?.openFaces ?? []);
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
  const xMinWall = plan.wallSpanX?.min ?? -vlenX * 0.5;
  const xMaxWall = plan.wallSpanX?.max ?? vlenX * 0.5;
  const xE = hx - wt * 0.5;
  const xW = -hx + wt * 0.5;
  const zN = hz - wt * 0.5;
  const zS = -hz + wt * 0.5;

  const stairHoleCount =
    innerE.length + innerW.length + innerN.length + innerS.length;

  const vh = yHi - yLo;
  if (stairHoleCount === 0) {
    if (!openFaces.has("e")) {
      const east = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallMat);
      east.name = "editor_ref_shell_wall_e";
      east.position.set(hx - wt * 0.5, 0, 0);
      group.add(east);
    }
    if (!openFaces.has("w")) {
      const west = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallMat);
      west.name = "editor_ref_shell_wall_w";
      west.position.set(-hx + wt * 0.5, 0, 0);
      group.add(west);
    }
    const spanX = xMaxWall - xMinWall;
    const north = new THREE.Mesh(new THREE.BoxGeometry(spanX, vh, wt), wallMat);
    north.name = "editor_ref_shell_wall_n";
    north.position.set((xMinWall + xMaxWall) * 0.5, 0, hz - wt * 0.5);
    group.add(north);
    const south = new THREE.Mesh(new THREE.BoxGeometry(spanX, vh, wt), wallMat);
    south.name = "editor_ref_shell_wall_s";
    south.position.set((xMinWall + xMaxWall) * 0.5, 0, -hz + wt * 0.5);
    group.add(south);
  } else {
    if (!openFaces.has("e")) {
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
    }
    if (!openFaces.has("w")) {
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
    }
    addWallConstantZWithHoles(
      group,
      wallMat,
      zN,
      wt,
      xMinWall,
      xMaxWall,
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
      xMinWall,
      xMaxWall,
      yLo,
      yHi,
      innerS,
      "editor_ref_shell_wall_s",
    );
  }

  const glassFaces = plan.windowFacesForGlass.filter((face) => !openFaces.has(face));
  if (plan.exteriorWindowHoles && glassFaces.length > 0) {
    addUnitExteriorWindowGlassMeshes(group, {
      faces: glassFaces,
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

  const claddingFaces = plan.exteriorFaces.filter((face) => !openFaces.has(face));
  if (exteriorWallMat && claddingFaces.length > 0) {
    const claddingE: WallHoleYZ[] = claddingFaces.includes("e")
      ? [...(win?.e ?? [])]
      : [...(cw?.e ?? [])];
    const claddingW: WallHoleYZ[] = claddingFaces.includes("w")
      ? [...(win?.w ?? [])]
      : [...(cw?.w ?? [])];
    const claddingN: WallHoleXY[] = claddingFaces.includes("n")
      ? [...(win?.n ?? [])]
      : [...(cw?.n ?? [])];
    const claddingS: WallHoleXY[] = claddingFaces.includes("s")
      ? [...(win?.s ?? [])]
      : [...(cw?.s ?? [])];
    addExteriorWallCladding(
      group,
      hx,
      hz,
      vlenX,
      vlenZ,
      yLo,
      yHi,
      claddingFaces,
      exteriorWallMat,
      {
        e: claddingE,
        w: claddingW,
        n: claddingN,
        s: claddingS,
      },
      0.05,
      plan.wallSpanX ? { spanX: plan.wallSpanX } : undefined,
      { n: mat.unitExteriorBrickWall, s: mat.unitExteriorBrickWall },
    );
  }
}
