import * as THREE from "three";
import type { BuildingDoc, FloorDoc, OwnedApartmentPlacedItem } from "@the-mammoth/schemas";
import {
  apartmentUnitQualifiesForStandardWindowShutters,
  isOwnedApartmentWindowShutterModelRelPath,
  mergeStandardApartmentWindowShuttersIntoPlacedItems,
  resolveOwnedApartmentDecorRootScale,
  unitExteriorGlassMeshesEnabledForStoryLevel,
} from "@the-mammoth/schemas";
import {
  buildProceduralApartmentDecorVisual,
  tagProceduralApartmentDecorMeshesSkipMerge,
} from "./apartmentProceduralDecorCatalog.js";
import { tagApartmentWindowShutterFacadeMeshes } from "./apartmentWindowShutterVisual.js";
import { finalizeStandardWindowShutterPlacedItemsForUnit } from "./apartmentStandardWindowShutterPlacement.js";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "./buildingFloorStack.js";
import { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
import { apartmentDoorTemplateForUnit } from "./ownedApartmentEditorShell.js";
import { mapOwnedApartmentLayoutFractionToWorldX } from "./residentialUnitBalcony.js";
import { residentialUnitStrictBoundsXZ } from "./residentialUnitStrictBoundsXZ.js";
import { resolveFloorDocForLevel } from "./resolvedFloorDoc.js";

/** Matches `derive_bounds` feet slack in `apps/server/src/apartments.rs`. */
const RESIDENTIAL_BOUND_MIN_Y_BELOW_FEET_M = 0.06;

export const MAMMOTH_AUTH_STANDARD_WINDOW_SHUTTERS_ROOT_NAME =
  "mammoth_auth_standard_window_shutters" as const;

export function mountStandardApartmentWindowShuttersForBuilding(opts: {
  building: BuildingDoc;
  getFloorDoc: (floorDocId: string) => FloorDoc;
  referencePlacedItems?: readonly OwnedApartmentPlacedItem[];
  buildingOriginY?: number;
  floorSpacingM?: number;
  /** When set, only mount shutters for this storey (auth backdrop progressive attach). */
  storyLevelIndex?: number;
}): THREE.Group {
  const root = new THREE.Group();
  root.name = MAMMOTH_AUTH_STANDARD_WINDOW_SHUTTERS_ROOT_NAME;

  const shutterTemplate = buildProceduralApartmentDecorVisual(
    "static/models/objects/window-shutter.glb",
  );
  if (!shutterTemplate) return root;
  tagProceduralApartmentDecorMeshesSkipMerge(shutterTemplate);
  tagApartmentWindowShutterFacadeMeshes(shutterTemplate);

  const spacing = opts.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const originY = opts.buildingOriginY ?? opts.building.worldOrigin?.[1] ?? 0;
  const sorted = [...opts.building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);

  for (const ref of sorted) {
    if (opts.storyLevelIndex !== undefined && ref.levelIndex !== opts.storyLevelIndex) {
      continue;
    }
    if (!unitExteriorGlassMeshesEnabledForStoryLevel(ref.levelIndex)) continue;
    const floorDoc = resolveFloorDocForLevel({
      building: opts.building,
      ref,
      getFloorDoc: opts.getFloorDoc,
    });
    const plateWorldY = originY + (ref.levelIndex - 1) * spacing;

    for (const obj of floorDoc.objects) {
      if (classifyPrefab(obj.prefabId) !== "unit") continue;
      const unitId = obj.id;
      if (!unitId.startsWith("unit_e_") && !unitId.startsWith("unit_w_")) continue;

      const unitKey = `${ref.floorDocId}|${ref.levelIndex}|${unitId}`;
      if (!apartmentUnitQualifiesForStandardWindowShutters(unitKey)) continue;

      const doorTemplate = apartmentDoorTemplateForUnit({
        floorDocId: floorDoc.id,
        unitId,
      });
      if (!doorTemplate) continue;

      const xz = residentialUnitStrictBoundsXZ(doorTemplate);
      const boundMinY = plateWorldY + doorTemplate.feetYOffset - RESIDENTIAL_BOUND_MIN_Y_BELOW_FEET_M;
      const spanZ = xz.maxZ - xz.minZ;

      const placedItems = finalizeStandardWindowShutterPlacedItemsForUnit(
        unitId,
        mergeStandardApartmentWindowShuttersIntoPlacedItems(
          unitKey,
          unitId,
          opts.referencePlacedItems ?? [],
        ),
        xz.minX,
        xz.maxX,
      );

      for (const item of placedItems) {
        if (!isOwnedApartmentWindowShutterModelRelPath(item.modelRelPath)) continue;

        const g = new THREE.Group();
        g.name = `auth_window_shutter:${unitKey}:${item.id}`;
        g.position.set(
          mapOwnedApartmentLayoutFractionToWorldX(xz.minX, xz.maxX, unitId, item.fx),
          boundMinY + item.dy,
          xz.minZ + item.fz * spanZ,
        );
        g.rotation.order = "YXZ";
        g.rotation.y = item.yawRad;
        g.rotation.x = item.pitchRad;
        g.rotation.z = item.rollRad ?? 0;
        const s = resolveOwnedApartmentDecorRootScale(item);
        g.scale.set(s.x, s.y, s.z);

        g.add(shutterTemplate.clone(true));
        tagApartmentWindowShutterFacadeMeshes(g);
        root.add(g);
      }
    }
  }

  return root;
}

export function disposeStandardApartmentWindowShuttersRoot(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    }
  });
  root.removeFromParent();
}
