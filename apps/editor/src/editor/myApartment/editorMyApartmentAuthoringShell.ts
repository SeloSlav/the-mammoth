import * as THREE from "three";
import { MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD, APARTMENT_INTERIOR_VISUAL_PROFILE } from "@the-mammoth/engine";
import type { BuildingDoc, FloorDoc, OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  floorPlaceholderMeshMaterials,
  maxBuildingLevelIndex,
  RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
  resolveFloor19CorridorAuthoringFootprint,
  resolveCorridorEditorShellForAuthoring,
  resolveOwnedApartmentAuthoringPreviewLayout,
  residentialUnitBalconyExteriorEdge,
  residentialUnitHasBalconyBay,
  TYPICAL_FLOOR_DOC_ID,
  type CorridorAuthoringFootprint,
  type OwnedApartmentAuthoringPreviewLayout,
} from "@the-mammoth/world";
import { buildOwnedApartmentDerivedReferenceRoom } from "./editorMyApartmentReferenceEnclosure.js";
import { buildCorridorDerivedReferenceRoom } from "./editorMyApartmentCorridorReferenceEnclosure.js";
import { EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y } from "./editorMyApartmentDecorClamp.js";
import type { MyApartmentAuthoringTarget } from "../../state/editorStoreTypes.js";
/**
 * Canonical preview rectangles for fractions in {@link OwnedApartmentBuiltinsDoc} when mamutica
 * content resolves; otherwise callers fall back to the saved square `previewSizeM`.
 */
export function resolveOwnedApartmentAuthoringLayoutForEditor(opts: {
  floorDoc: FloorDoc | undefined;
  building: BuildingDoc;
  previewUnitId?: string;
}): OwnedApartmentAuthoringPreviewLayout | null {
  if (!opts.floorDoc || opts.floorDoc.id !== TYPICAL_FLOOR_DOC_ID) return null;
  const homeBandStoryLevelIndex = Math.max(
    1,
    maxBuildingLevelIndex(opts.building),
  );
  return resolveOwnedApartmentAuthoringPreviewLayout({
    floorDoc: opts.floorDoc,
    homeBandStoryLevelIndex,
    canonicalUnitId: opts.previewUnitId,
  });
}

/**
 * Maps strict hull fractions (runtime `bound_min` + `fx * span`) into **preview XZ** where the slab
 * origin is the prefab **south-west exterior corner** (`unit_center − scale/2`), matching hollow-shell
 * wall coordinates.
 */
export type OwnedApartmentFractionToPreviewXZ = {
  unitId: string;
  strictMinX: number;
  strictMinZ: number;
  spanX: number;
  spanZ: number;
  /** World X of strict point 0 in preview (prefab min X on the plate). */
  prefabOriginX: number;
  /** World Z of strict point 0 in preview (prefab min Z on the plate). */
  prefabOriginZ: number;
  /** Exterior prefab slab size (grey floor box) — matches hollow shell bbox X/Z scale. */
  prefabFootprintSx: number;
  prefabFootprintSz: number;
  /** Authoring slab X extent when it includes a balcony bay (≥ `prefabFootprintSx`). */
  slabFootprintSx?: number;
};

export function ownedApartmentFractionMappingForEditor(args: {
  layout: OwnedApartmentAuthoringPreviewLayout | null;
  builtinsFallbackPreviewM: number;
}): OwnedApartmentFractionToPreviewXZ {
  if (!args.layout) {
    const w = Math.max(2, args.builtinsFallbackPreviewM);
    return {
      unitId: "",
      strictMinX: 0,
      strictMinZ: 0,
      spanX: w,
      spanZ: w,
      prefabOriginX: 0,
      prefabOriginZ: 0,
      prefabFootprintSx: w,
      prefabFootprintSz: w,
    };
  }
  const {
    shellPlan,
    strictMinX,
    strictMinZ,
    spanX,
    spanZ,
    unitCenterX,
    unitCenterZ,
    canonicalUnitId,
  } = args.layout;
  const sx = 2 * shellPlan.hx;
  const sz = 2 * shellPlan.hz;
  const balconyM = residentialUnitHasBalconyBay(canonicalUnitId)
    ? RESIDENTIAL_UNIT_BALCONY_OVERHANG_M
    : 0;
  return {
    unitId: canonicalUnitId,
    strictMinX,
    strictMinZ,
    spanX,
    spanZ,
    prefabOriginX: unitCenterX - sx * 0.5,
    prefabOriginZ: unitCenterZ - sz * 0.5,
    prefabFootprintSx: sx,
    prefabFootprintSz: sz,
    slabFootprintSx: sx + balconyM,
  };
}

export function floor19CorridorFractionMappingForEditor(args: {
  footprint: CorridorAuthoringFootprint | null;
  builtinsFallbackPreviewM: number;
}): OwnedApartmentFractionToPreviewXZ {
  if (!args.footprint) {
    const w = Math.max(2, args.builtinsFallbackPreviewM);
    return {
      unitId: "",
      strictMinX: 0,
      strictMinZ: 0,
      spanX: w,
      spanZ: w,
      prefabOriginX: 0,
      prefabOriginZ: 0,
      prefabFootprintSx: w,
      prefabFootprintSz: w,
    };
  }
  const { footprint } = args;
  return {
    unitId: footprint.corridorObjectId,
    strictMinX: footprint.strictMinX,
    strictMinZ: footprint.strictMinZ,
    spanX: footprint.spanX,
    spanZ: footprint.spanZ,
    prefabOriginX: footprint.prefabOriginX,
    prefabOriginZ: footprint.prefabOriginZ,
    prefabFootprintSx: footprint.prefabFootprintSx,
    prefabFootprintSz: footprint.prefabFootprintSz,
  };
}

/** Grey authoring slab X extent in preview space (origin = prefab south-west corner). */
export function authoringPreviewSlabBoundsX(
  spans: Pick<OwnedApartmentFractionToPreviewXZ, "unitId" | "prefabFootprintSx" | "slabFootprintSx">,
): { minX: number; maxX: number; spanX: number } {
  const prefabSx = spans.prefabFootprintSx;
  const spanX =
    typeof spans.slabFootprintSx === "number" && spans.slabFootprintSx > prefabSx
      ? spans.slabFootprintSx
      : prefabSx;
  const balconyM = spanX - prefabSx;
  if (balconyM > 0 && residentialUnitBalconyExteriorEdge(spans.unitId) === "minX") {
    return { minX: -balconyM, maxX: prefabSx, spanX };
  }
  return { minX: 0, maxX: spanX, spanX };
}

export function authoringPreviewSlabFloorCenterX(
  spans: Pick<OwnedApartmentFractionToPreviewXZ, "unitId" | "prefabFootprintSx" | "slabFootprintSx">,
): number {
  const { minX, maxX } = authoringPreviewSlabBoundsX(spans);
  return (minX + maxX) * 0.5;
}

function buildAuthoringShellFloorSlab(args: {
  spanSlabX: number;
  spanSlabZ: number;
  mapping: OwnedApartmentFractionToPreviewXZ;
  interiorCeilingInnerY?: number;
}): THREE.Group {
  const root = new THREE.Group();
  root.name = "editor_owned_apartment_authoring_shell";

  root.userData.editorMyApartmentSlabSx = args.spanSlabX;
  root.userData.editorMyApartmentSlabSz = args.spanSlabZ;
  root.userData.editorMyApartmentUnitId = args.mapping.unitId;
  root.userData.editorMyApartmentStrictMinX = args.mapping.strictMinX;
  root.userData.editorMyApartmentStrictMinZ = args.mapping.strictMinZ;
  root.userData.editorMyApartmentStrictSpanX = args.mapping.spanX;
  root.userData.editorMyApartmentStrictSpanZ = args.mapping.spanZ;
  root.userData.editorMyApartmentPrefabOriginX = args.mapping.prefabOriginX;
  root.userData.editorMyApartmentPrefabOriginZ = args.mapping.prefabOriginZ;
  if (typeof args.interiorCeilingInnerY === "number") {
    root.userData.editorMyApartmentInteriorCeilingInnerY = args.interiorCeilingInnerY;
  }

  const floorGeom = new THREE.BoxGeometry(args.spanSlabX, 0.04, args.spanSlabZ);
  const floor = new THREE.Mesh(floorGeom, floorPlaceholderMeshMaterials.unitFloor);
  floor.name = "editor_owned_apartment_floor";
  floor.position.set(
    authoringPreviewSlabFloorCenterX(args.mapping),
    EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - 0.02,
    args.spanSlabZ * 0.5,
  );
  floor.receiveShadow = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.enabled;
  floor.castShadow = false;
  floor.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] = true;
  root.add(floor);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(floorGeom),
    new THREE.LineBasicMaterial({ color: 0x8893a5 }),
  );
  edge.position.copy(floor.position);
  root.add(edge);

  return root;
}

export function buildFloor19CorridorAuthoringShell(args: {
  ownedApartmentBuiltins: OwnedApartmentBuiltinsDoc;
  typicalFloorDoc: FloorDoc | undefined;
  corridorLevelIndex: number;
}): THREE.Group {
  const footprint = resolveFloor19CorridorAuthoringFootprint(args.typicalFloorDoc);
  const mapping = floor19CorridorFractionMappingForEditor({
    footprint,
    builtinsFallbackPreviewM: args.ownedApartmentBuiltins.previewSizeM,
  });
  const spanSlabX = footprint
    ? Math.max(2, footprint.prefabFootprintSx)
    : Math.max(2, mapping.spanX);
  const spanSlabZ = footprint
    ? Math.max(2, footprint.prefabFootprintSz)
    : Math.max(2, mapping.spanZ);
  const interiorCeilingInnerY =
    footprint != null
      ? EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y +
        (footprint.ceilingInnerY - footprint.floorY)
      : undefined;

  const root = buildAuthoringShellFloorSlab({
    spanSlabX,
    spanSlabZ,
    mapping,
    interiorCeilingInnerY,
  });

  if (args.typicalFloorDoc) {
    const resolved = resolveCorridorEditorShellForAuthoring({
      floor: args.typicalFloorDoc,
      corridorObjectId: footprint?.corridorObjectId,
      storyLevelIndex: args.corridorLevelIndex,
    });
    if (resolved) {
      root.add(buildCorridorDerivedReferenceRoom({ shellPlan: resolved.plan }));
    }
  }

  return root;
}

export function buildMyApartmentAuthoringShell(args: {
  authoringTarget: MyApartmentAuthoringTarget;
  ownedApartmentBuiltins: OwnedApartmentBuiltinsDoc;
  typicalFloorDoc: FloorDoc | undefined;
  building: BuildingDoc;
  previewUnitId?: string;
  corridorLevelIndex: number;
}): THREE.Group {
  if (args.authoringTarget === "floor_19_corridor") {
    return buildFloor19CorridorAuthoringShell({
      ownedApartmentBuiltins: args.ownedApartmentBuiltins,
      typicalFloorDoc: args.typicalFloorDoc,
      corridorLevelIndex: args.corridorLevelIndex,
    });
  }
  return buildOwnedApartmentAuthoringShell(args);
}

/**
 * Preview floor + game-derived reference perimeter for owned‑apartment builtin authoring.
 *
 * The **slab** matches the floor-doc **prefab footprint** (`scale.x` × `scale.z`); **`fx` / `fz`**
 * still denote fractions of the **strict gameplay hull** (server `derive_bounds`), remapped here so
 * props line up with the client.
 */
export function buildOwnedApartmentAuthoringShell(args: {
  ownedApartmentBuiltins: OwnedApartmentBuiltinsDoc;
  typicalFloorDoc: FloorDoc | undefined;
  building: BuildingDoc;
  previewUnitId?: string;
}): THREE.Group {
  const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
    floorDoc: args.typicalFloorDoc,
    building: args.building,
    previewUnitId: args.previewUnitId,
  });

  const mapping = ownedApartmentFractionMappingForEditor({
    layout,
    builtinsFallbackPreviewM: args.ownedApartmentBuiltins.previewSizeM,
  });

  const balconyM =
    layout && residentialUnitHasBalconyBay(layout.canonicalUnitId)
      ? RESIDENTIAL_UNIT_BALCONY_OVERHANG_M
      : 0;
  const spanSlabX = layout
    ? Math.max(2, 2 * layout.shellPlan.hx + balconyM)
    : Math.max(2, mapping.spanX);
  const spanSlabZ = layout
    ? Math.max(2, 2 * layout.shellPlan.hz)
    : Math.max(2, mapping.spanZ);

  const root = buildAuthoringShellFloorSlab({
    spanSlabX,
    spanSlabZ,
    mapping,
    interiorCeilingInnerY:
      layout?.shellPlan != null
        ? EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + layout.shellPlan.vh
        : undefined,
  });

  if (layout && args.typicalFloorDoc && layout.shellPlan) {
    const placed = args.typicalFloorDoc.objects.find(
      (o) => o.id === layout.canonicalUnitId,
    );
    if (placed) {
      const homeBandStoryLevelIndex = Math.max(
        1,
        maxBuildingLevelIndex(args.building),
      );
      root.add(
        buildOwnedApartmentDerivedReferenceRoom({
          unitId: layout.canonicalUnitId,
          shellPlan: layout.shellPlan,
          slabHalfExtentsXZ: [layout.shellPlan.hx, layout.shellPlan.hz],
          placedScaleY: placed.scale?.[1] ?? 3.05,
          placedScaleZ: placed.scale?.[2] ?? 7.1,
          floorDocId: args.typicalFloorDoc.id,
          storyLevelIndex: homeBandStoryLevelIndex,
        }),
      );
    }
  }

  return root;
}
