import * as THREE from "three";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  applyApartmentDecorCastShadowFlags,
  applyApartmentInteriorFloorReceiveShadowUnder,
  disposeLeakedApartmentDecorContactShadows,
  syncApartmentDecorShadowRig,
  syncApartmentDecorBakedFloorShadowOverlay,
  syncApartmentInteriorPracticalLighting,
  prepareMammothApartmentInteriorContentRoots,
  type ApartmentDecorBakedFloorShadowMount,
  type ApartmentDecorShadowRigMount,
  type ApartmentPracticalLightsMount,
  type ApartmentUnitWorldBounds,
} from "@the-mammoth/engine";
import { useEditorStore } from "../../state/editorStore.js";
import {
  APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
  ENABLE_RUNTIME_APARTMENT_STATIC_FIXTURE_LIGHTS,
  ENABLE_RUNTIME_DYNAMIC_DECOR_LIGHTS,
  ENABLE_RUNTIME_WINDOW_FILL_LIGHTS,
  finalizeStandardWindowShutterPlacedItemsForUnit,
} from "@the-mammoth/world";
import {
  mergeStandardApartmentWindowShuttersIntoPlacedItems,
  type OwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import type { EditorApartmentFishTankBridge } from "./editorApartmentFishTankBridge.js";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";
import {
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
} from "./editorMyApartmentDecorClamp.js";
import {
  disposeGroupSubtreeGeometry,
  editorMyApartmentDecorGroups,
  mountIdSet,
  placeDecorGroup,
  type EditorMyApartmentDecorTemplateMap,
} from "./editorMyApartmentDecorPlacement.js";
import {
  placeMirrorGroup,
  placeWallGroup,
  syncWallOpeningSelectionGroups,
} from "./editorMyApartmentWallMirrorPlacement.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";
import { teardownApartmentSavedObjectGroupManipulator } from "./editorMyApartmentSavedGroupManip.js";
import { getEditorMyApartmentDecorShadowRenderer } from "./editorMyApartmentPieceGroupBridge.js";

export type EditorMyApartmentFurnitureMount = {
  root: THREE.Group;
  selectionGroups: Record<string, THREE.Group>;
  fishTankBridge: EditorApartmentFishTankBridge;
  practicalLights: ApartmentPracticalLightsMount | null;
  decorShadowRig: ApartmentDecorShadowRigMount | null;
  bakedFloorShadowMount: ApartmentDecorBakedFloorShadowMount | null;
  resyncPracticalLights: (
    windowScanRoot: THREE.Object3D,
    unitBounds?: ApartmentUnitWorldBounds,
  ) => void;
  resyncDecorShadows: (unitBounds?: ApartmentUnitWorldBounds) => void;
  dispose: () => void;
  /** Wall ids currently represented in `selectionGroups` (incremental sync). */
  mountedWallIds: Set<string>;
  mountedMirrorIds: Set<string>;
  mountedDecorIds: Set<string>;
};

export function mountEditorMyApartmentFurnitureUnder(
  parent: THREE.Object3D,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  authoringFractionMapping: OwnedApartmentFractionToPreviewXZ,
  windowScanRoot: THREE.Object3D,
  fishTankBridge: EditorApartmentFishTankBridge,
  unitBounds?: ApartmentUnitWorldBounds,
  previewUnitKey?: string,
): EditorMyApartmentFurnitureMount {
  disposeLeakedApartmentDecorContactShadows(parent);

  const root = new THREE.Group();
  root.name = "editor_my_apartment_furniture";
  parent.add(root);

  const selectionGroups: Record<string, THREE.Group> = {};
  const fishSwimmerTemplate =
    decorTemplates.get(APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH) ?? undefined;

  const placedItems = finalizeStandardWindowShutterPlacedItemsForUnit(
    authoringFractionMapping.unitId,
    mergeStandardApartmentWindowShuttersIntoPlacedItems(
      previewUnitKey ?? "",
      authoringFractionMapping.unitId,
      doc.placedItems,
    ),
    authoringFractionMapping.strictMinX,
    authoringFractionMapping.strictMinX + authoringFractionMapping.spanX,
  );

  for (const decor of placedItems) {
    const template = decorTemplates.get(decor.modelRelPath);
    if (!template) continue;
    const group = new THREE.Group();
    group.name = `editor_my_apartment_placed:${decor.id}`;
    root.add(group);
    placeDecorGroup({
      group,
      template,
      decor,
      spans: authoringFractionMapping,
      fishTankBridge,
      fishSwimmerTemplate,
    });
    selectionGroups[editorMyApartmentSelectedIdForDecor(decor.id)] = group;
  }

  for (const wall of doc.wallItems) {
    const group = new THREE.Group();
    group.name = `editor_my_apartment_wall:${wall.id}`;
    root.add(group);
    placeWallGroup({
      group,
      wall,
      spans: authoringFractionMapping,
    });
    selectionGroups[editorMyApartmentSelectedIdForWall(wall.id)] = group;
    syncWallOpeningSelectionGroups(
      selectionGroups,
      wall.id,
      group,
      wall.openings ?? [],
    );
  }

  for (const mirror of doc.mirrorItems) {
    const group = new THREE.Group();
    group.name = `editor_my_apartment_mirror:${mirror.id}`;
    root.add(group);
    placeMirrorGroup({
      group,
      mirror,
      spans: authoringFractionMapping,
    });
    selectionGroups[editorMyApartmentSelectedIdForMirror(mirror.id)] = group;
  }

  let practicalLights: ApartmentPracticalLightsMount | null = null;
  let decorShadowRig: ApartmentDecorShadowRigMount | null = null;
  let bakedFloorShadowMount: ApartmentDecorBakedFloorShadowMount | null = null;
  const resyncDecorShadows = (bounds?: ApartmentUnitWorldBounds): void => {
    const decorGroups = editorMyApartmentDecorGroups(selectionGroups);
    const resolvedBounds = bounds ?? unitBounds;
    decorShadowRig = syncApartmentDecorShadowRig({
      lightParent: parent,
      decorGroups,
      unitBounds: resolvedBounds,
      previous: decorShadowRig,
    });
    const showBakedFloorShadows =
      useEditorStore.getState().apartmentBakedFloorShadowsEnabled;
    if (!showBakedFloorShadows) {
      bakedFloorShadowMount?.dispose();
      bakedFloorShadowMount = null;
      return;
    }
    const renderer = getEditorMyApartmentDecorShadowRenderer();
    if (!renderer) {
      bakedFloorShadowMount?.dispose();
      bakedFloorShadowMount = null;
      return;
    }
    try {
      bakedFloorShadowMount = syncApartmentDecorBakedFloorShadowOverlay({
        renderer,
        parent,
        decorGroups,
        unitBounds: resolvedBounds,
        floorWorldY:
          EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y +
          APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.bakedFloorOffsetM,
        previous: bakedFloorShadowMount,
      });
    } catch (err: unknown) {
      bakedFloorShadowMount?.dispose();
      bakedFloorShadowMount = null;
      console.warn("[editor] apartment baked floor shadow failed:", err);
    }
  };
  const resyncPracticalLights = (
    scanRoot: THREE.Object3D,
    _bounds?: ApartmentUnitWorldBounds,
  ): void => {
    const runtimeEnabled =
      ENABLE_RUNTIME_DYNAMIC_DECOR_LIGHTS ||
      ENABLE_RUNTIME_APARTMENT_STATIC_FIXTURE_LIGHTS ||
      ENABLE_RUNTIME_WINDOW_FILL_LIGHTS;
    if (
      !runtimeEnabled ||
      !useEditorStore.getState().apartmentPracticalLightsEnabled
    ) {
      practicalLights?.dispose();
      practicalLights = null;
      return;
    }
    practicalLights = syncApartmentInteriorPracticalLighting({
      lightParent: root,
      windowScanRoot: scanRoot,
      maxWindowLights: ENABLE_RUNTIME_WINDOW_FILL_LIGHTS
        ? APARTMENT_INTERIOR_VISUAL_PROFILE.maxWindowPracticalLightsPerUnit
        : 0,
      /** Authoring shell is already one preview unit — skip megablock bounds cull from FP client. */
      unitBounds: undefined,
      decorGroups: editorMyApartmentDecorGroups(selectionGroups),
      includeDynamicDecorPracticalLights: ENABLE_RUNTIME_DYNAMIC_DECOR_LIGHTS,
      includeStaticFixturePracticalLights: ENABLE_RUNTIME_APARTMENT_STATIC_FIXTURE_LIGHTS,
      previous: practicalLights,
    });
  };
  resyncPracticalLights(windowScanRoot);
  prepareMammothApartmentInteriorContentRoots({ shellRoot: parent, decorRoot: root });
  applyApartmentInteriorFloorReceiveShadowUnder(parent);
  for (const group of editorMyApartmentDecorGroups(selectionGroups)) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath === "string") {
      applyApartmentDecorCastShadowFlags(group, modelRelPath);
    }
  }
  resyncDecorShadows(unitBounds);

  const dispose = (): void => {
    teardownApartmentSavedObjectGroupManipulator();
    practicalLights?.dispose();
    decorShadowRig?.dispose();
    bakedFloorShadowMount?.dispose();
    fishTankBridge.clear();
    for (const g of Object.values(selectionGroups)) {
      disposeGroupSubtreeGeometry(g);
    }
    parent.remove(root);
    root.clear();
  };

  return {
    root,
    selectionGroups,
    fishTankBridge,
    practicalLights,
    decorShadowRig,
    bakedFloorShadowMount,
    resyncPracticalLights,
    resyncDecorShadows,
    dispose,
    mountedWallIds: mountIdSet(doc.wallItems),
    mountedMirrorIds: mountIdSet(doc.mirrorItems),
    mountedDecorIds: mountIdSet(placedItems),
  };
}

export * from "./editorMyApartmentDecorClamp.js";
export * from "./editorMyApartmentDecorPlacement.js";
export * from "./editorMyApartmentWallMirrorPlacement.js";
