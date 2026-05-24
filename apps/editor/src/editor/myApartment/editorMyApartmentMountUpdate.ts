import * as THREE from "three";
import type { OwnedApartmentBuiltinsDoc, OwnedApartmentPlacedItem } from "@the-mammoth/schemas";
import {
  applyApartmentDecorCastShadowFlags,
  applyApartmentInteriorFloorReceiveShadowUnder,
  prepareMammothApartmentInteriorContentRoots,
  type ApartmentUnitWorldBounds,
} from "@the-mammoth/engine";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";
import type { ApartmentMountSyncChange } from "./editorMyApartmentMountSync.js";
import { teardownApartmentSavedObjectGroupManipulator } from "./editorMyApartmentSavedGroupManip.js";
import {
  syncEditorMyApartmentDecorOnMount,
  syncEditorMyApartmentMirrorsOnMount,
  syncEditorMyApartmentWallsOnMount,
  type EditorMyApartmentDecorTemplateMap,
  type EditorMyApartmentFurnitureMount,
} from "./editorMyApartmentMeshes.js";

/** Patch mount geometry in place — avoids tearing down practical-light / shadow rig closures. */
export function updateEditorMyApartmentMountFromDoc(
  mount: EditorMyApartmentFurnitureMount,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  authoringFractionMapping: OwnedApartmentFractionToPreviewXZ,
  syncKind: ApartmentMountSyncChange,
  prevPlacedItems?: readonly OwnedApartmentPlacedItem[],
  previewUnitKey?: string,
): { structuralDecorRebuild: boolean } {
  if (syncKind === "none") return { structuralDecorRebuild: false };

  teardownApartmentSavedObjectGroupManipulator();

  let structuralDecorRebuild = false;
  if (syncKind === "full" || syncKind === "decor-only") {
    const decorResult = syncEditorMyApartmentDecorOnMount(
      mount,
      decorTemplates,
      doc,
      authoringFractionMapping,
      prevPlacedItems,
      previewUnitKey,
    );
    structuralDecorRebuild = decorResult.structuralRebuild;
  }
  if (syncKind === "full" || syncKind === "walls-only") {
    syncEditorMyApartmentWallsOnMount(mount, doc, authoringFractionMapping);
  }
  if (syncKind === "full" || syncKind === "mirrors-only") {
    syncEditorMyApartmentMirrorsOnMount(mount, doc, authoringFractionMapping);
  }
  return { structuralDecorRebuild };
}

export type ResyncEditorMyApartmentMountPresentationArgs = {
  mount: EditorMyApartmentFurnitureMount;
  shellRoot: THREE.Object3D;
  unitBounds?: ApartmentUnitWorldBounds;
  structuralDecorRebuild: boolean;
  resyncPracticalLights: (windowScanRoot: THREE.Object3D) => void;
  resyncDecorShadows: (unitBounds?: ApartmentUnitWorldBounds) => void;
  requestDecorShadowMapBake: () => void;
  /** Re-bind PMREM env on meshes after a full décor rebuild (matches in-game look). */
  syncMetallicEnv: () => void;
};

/** Post-edit presentation hooks keyed by what actually changed. */
export function resyncEditorMyApartmentMountPresentationAfterEdit(
  kind: "decor-only" | "walls-only" | "mirrors-only",
  args: ResyncEditorMyApartmentMountPresentationArgs,
): void {
  const {
    mount,
    shellRoot,
    unitBounds,
    structuralDecorRebuild,
    resyncPracticalLights,
    resyncDecorShadows,
    requestDecorShadowMapBake,
    syncMetallicEnv,
  } = args;

  if (kind === "decor-only") {
    if (structuralDecorRebuild) {
      prepareMammothApartmentInteriorContentRoots({
        shellRoot,
        decorRoot: mount.root,
      });
      applyApartmentInteriorFloorReceiveShadowUnder(shellRoot);
      for (const group of Object.values(mount.selectionGroups)) {
        const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
        if (typeof modelRelPath !== "string") continue;
        applyApartmentDecorCastShadowFlags(group, modelRelPath);
      }
      syncMetallicEnv();
    }
    resyncPracticalLights(shellRoot);
    resyncDecorShadows(unitBounds);
    requestDecorShadowMapBake();
    return;
  }

  if (kind === "mirrors-only") {
    prepareMammothApartmentInteriorContentRoots({
      shellRoot,
      decorRoot: mount.root,
    });
    syncMetallicEnv();
    return;
  }

  applyApartmentInteriorFloorReceiveShadowUnder(shellRoot);
}
