import * as THREE from "three";
import { MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD } from "@the-mammoth/engine";
import type { BuildingDoc, FloorDoc, OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  floorPlaceholderMeshMaterials,
  maxBuildingLevelIndex,
  resolveOwnedApartmentAuthoringPreviewLayout,
  TYPICAL_FLOOR_DOC_ID,
  type OwnedApartmentAuthoringPreviewLayout,
} from "@the-mammoth/world";
import { buildOwnedApartmentDerivedReferenceRoom } from "./editorMyApartmentReferenceEnclosure.js";
import { EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y } from "./editorMyApartmentMeshes.js";
/**
 * Canonical preview rectangles for fractions in {@link OwnedApartmentBuiltinsDoc} when mamutica
 * content resolves; otherwise callers fall back to the saved square `previewSizeM`.
 */
export function resolveOwnedApartmentAuthoringLayoutForEditor(opts: {
  floorDoc: FloorDoc | undefined;
  building: BuildingDoc;
}): OwnedApartmentAuthoringPreviewLayout | null {
  if (!opts.floorDoc || opts.floorDoc.id !== TYPICAL_FLOOR_DOC_ID) return null;
  const homeBandStoryLevelIndex = Math.max(
    1,
    maxBuildingLevelIndex(opts.building),
  );
  return resolveOwnedApartmentAuthoringPreviewLayout({
    floorDoc: opts.floorDoc,
    homeBandStoryLevelIndex,
  });
}

/**
 * Maps strict hull fractions (runtime `bound_min` + `fx * span`) into **preview XZ** where the slab
 * origin is the prefab **south-west exterior corner** (`unit_center − scale/2`), matching hollow-shell
 * wall coordinates.
 */
export type OwnedApartmentFractionToPreviewXZ = {
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
};

export function ownedApartmentFractionMappingForEditor(args: {
  layout: OwnedApartmentAuthoringPreviewLayout | null;
  builtinsFallbackPreviewM: number;
}): OwnedApartmentFractionToPreviewXZ {
  if (!args.layout) {
    const w = Math.max(2, args.builtinsFallbackPreviewM);
    return {
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
  const { shellPlan, strictMinX, strictMinZ, spanX, spanZ, unitCenterX, unitCenterZ } =
    args.layout;
  const sx = 2 * shellPlan.hx;
  const sz = 2 * shellPlan.hz;
  return {
    strictMinX,
    strictMinZ,
    spanX,
    spanZ,
    prefabOriginX: unitCenterX - sx * 0.5,
    prefabOriginZ: unitCenterZ - sz * 0.5,
    prefabFootprintSx: sx,
    prefabFootprintSz: sz,
  };
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
}): THREE.Group {
  const root = new THREE.Group();
  root.name = "editor_owned_apartment_authoring_shell";

  const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
    floorDoc: args.typicalFloorDoc,
    building: args.building,
  });

  const mapping = ownedApartmentFractionMappingForEditor({
    layout,
    builtinsFallbackPreviewM: args.ownedApartmentBuiltins.previewSizeM,
  });

  const spanSlabX = layout
    ? Math.max(2, 2 * layout.shellPlan.hx)
    : Math.max(2, mapping.spanX);
  const spanSlabZ = layout
    ? Math.max(2, 2 * layout.shellPlan.hz)
    : Math.max(2, mapping.spanZ);

  root.userData.editorMyApartmentSlabSx = spanSlabX;
  root.userData.editorMyApartmentSlabSz = spanSlabZ;
  /** Lets pose clamps match fraction encoding (0..1 along strict hull); see `clampPreviewXZToAuthoringInterior`. */
  root.userData.editorMyApartmentStrictMinX = mapping.strictMinX;
  root.userData.editorMyApartmentStrictMinZ = mapping.strictMinZ;
  root.userData.editorMyApartmentStrictSpanX = mapping.spanX;
  root.userData.editorMyApartmentStrictSpanZ = mapping.spanZ;
  root.userData.editorMyApartmentPrefabOriginX = mapping.prefabOriginX;
  root.userData.editorMyApartmentPrefabOriginZ = mapping.prefabOriginZ;

  /** Inner ceiling Y in authoring-shell space (`slabTop + shellPlan.vh`); decor AABB max Y clamps below this minus slack. */
  if (layout?.shellPlan) {
    root.userData.editorMyApartmentInteriorCeilingInnerY =
      EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + layout.shellPlan.vh;
  }

  const floorGeom = new THREE.BoxGeometry(spanSlabX, 0.04, spanSlabZ);
  const floor = new THREE.Mesh(floorGeom, floorPlaceholderMeshMaterials.unitFloor);
  floor.name = "editor_owned_apartment_floor";
  floor.position.set(
    spanSlabX * 0.5,
    EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - 0.02,
    spanSlabZ * 0.5,
  );
  floor.receiveShadow = false;
  floor.castShadow = false;
  floor.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] = true;
  root.add(floor);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(floorGeom),
    new THREE.LineBasicMaterial({ color: 0x8893a5 }),
  );
  edge.position.copy(floor.position);
  root.add(edge);

  if (layout && args.typicalFloorDoc && layout.shellPlan) {
    const placed = args.typicalFloorDoc.objects.find(
      (o) => o.id === layout.canonicalUnitId,
    );
    if (placed) {
      root.add(
        buildOwnedApartmentDerivedReferenceRoom({
          shellPlan: layout.shellPlan,
          slabHalfExtentsXZ: [layout.shellPlan.hx, layout.shellPlan.hz],
        }),
      );
    }
  }

  return root;
}
