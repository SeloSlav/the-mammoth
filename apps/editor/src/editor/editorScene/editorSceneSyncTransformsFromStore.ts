import * as THREE from "three";
import {
  applyElevatorCabPartTransforms,
  rebuildLandingDoorPreviewSwing,
  applyStairWellPartTransforms,
} from "@the-mammoth/world";
import {
  syncCellTransforms,
  syncFloorTransforms,
  syncInteriorTransforms,
  syncPrefabTransforms,
} from "../placement/editorFloorTransformSync.js";
import type { EditorStoreSnapshot } from "./editorStoreModeGuards.js";

export function syncEditorTransformsFromStore(
  buildingRoot: THREE.Group,
  s: EditorStoreSnapshot,
): void {
  if (s.mode === "floor") {
    syncFloorTransforms(buildingRoot, s.floorDocs);
    if (s.workspace === "world") {
      const cellDoc = s.cellDocs[s.activeCellDocId];
      if (cellDoc) {
        const cellRoot = buildingRoot.getObjectByName(`cell:${cellDoc.id}`);
        if (cellRoot) syncCellTransforms(cellRoot, cellDoc);
      }
    }
  } else if (s.mode === "interior") {
    const doc = s.interiorDocs[s.activeInteriorDocId];
    if (doc) syncInteriorTransforms(buildingRoot, doc);
  } else if (s.mode === "cell") {
    const doc = s.cellDocs[s.activeCellDocId];
    if (doc) syncCellTransforms(buildingRoot, doc);
  } else if (s.mode === "prefab") {
    const doc = s.activePrefabDefId
      ? s.prefabDefs[s.activePrefabDefId]
      : undefined;
    if (doc) syncPrefabTransforms(buildingRoot, doc);
  } else if (s.mode === "floor_override") {
    syncFloorTransforms(buildingRoot, s.floorDocs);
    if (s.workspace === "world") {
      const cellDoc = s.cellDocs[s.activeCellDocId];
      if (cellDoc) {
        const cellRoot = buildingRoot.getObjectByName(`cell:${cellDoc.id}`);
        if (cellRoot) syncCellTransforms(cellRoot, cellDoc);
      }
    }
  } else if (s.mode === "cab") {
    const cabPreview = buildingRoot.getObjectByName(
      "editor_elevator_cab_preview",
    );
    if (cabPreview) applyElevatorCabPartTransforms(cabPreview, s.elevatorCabDef);
  } else if (s.mode === "landing_preview") {
    const door = buildingRoot.getObjectByName("editor_landing_door");
    if (door instanceof THREE.Group) {
      rebuildLandingDoorPreviewSwing(door, s.landingKitDef);
    }
  } else if (s.mode === "stairwell_preview") {
    applyStairWellPartTransforms(buildingRoot, s.stairWellDef);
  }
}
