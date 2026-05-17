import * as THREE from "three";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  getEditorMyApartmentFurnitureMountRoot,
  getEditorMyApartmentStaticSelectionGroupsMap,
  registerEditorMyApartmentPlacementGroupOverlay,
} from "./editorMyApartmentPieceGroupBridge.js";
import { parseMyApartmentLayoutSavedObjectGroupId } from "./editorMyApartmentSelection.js";

export const MY_APARTMENT_OBJECT_GROUP_MANIP_UD = "editorMyApartmentObjectGroupManip";
export const MY_APARTMENT_OBJECT_GROUP_UUID_UD = "editorMyApartmentObjectGroupUuid";
export const MY_APARTMENT_OBJECT_GROUP_OVERLAY_KEY_UD =
  "editorMyApartmentObjectGroupOverlayKey";

/** Detach members back under the apartment furniture root and discard the transient manip Group. */
export function teardownApartmentSavedObjectGroupManipulator(): void {
  const furnitureRoot = getEditorMyApartmentFurnitureMountRoot();
  if (!furnitureRoot) return;

  furnitureRoot.children
    .filter(
      (ch): ch is THREE.Group =>
        ch instanceof THREE.Group &&
        ch.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] === true,
    )
    .forEach((active) => {
      const overlayKey = active.userData[MY_APARTMENT_OBJECT_GROUP_OVERLAY_KEY_UD] as
        | string
        | undefined;
      if (overlayKey) {
        registerEditorMyApartmentPlacementGroupOverlay(overlayKey, null);
      }
      const kids = [...active.children];
      for (const c of kids) {
        furnitureRoot.attach(c);
      }
      furnitureRoot.remove(active);
    });
}

type SyncOpts = {
  selectedId: string | null;
  doc: OwnedApartmentBuiltinsDoc;
};

/** Builds / updates the transient centroid manipulator for saved object groups so TransformControls attaches once. */
export function syncApartmentSavedObjectGroupManipulator(
  opts: SyncOpts,
): THREE.Group | null {
  teardownApartmentSavedObjectGroupManipulator();

  const { selectedId, doc } = opts;
  const grpId = parseMyApartmentLayoutSavedObjectGroupId(selectedId);
  if (!grpId) return null;

  const def = doc.objectGroups.find((g) => g.id === grpId);
  const selectionMap = getEditorMyApartmentStaticSelectionGroupsMap();
  const furnitureRoot = getEditorMyApartmentFurnitureMountRoot();
  if (!def || !selectionMap || !furnitureRoot) return null;

  const members = def.memberSelectedIds
    .map((id) => selectionMap[id])
    .filter((g): g is THREE.Group => g instanceof THREE.Group);
  if (members.length < 2) return null;

  const box = new THREE.Box3();
  for (const m of members) {
    m.updateWorldMatrix(true, true);
    box.expandByObject(m);
  }
  if (box.isEmpty()) return null;
  const center = box.getCenter(new THREE.Vector3());

  const manip = new THREE.Group();
  manip.name = `editor_my_apartment_saved_group:${def.id}`;
  manip.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] = true;
  manip.userData[MY_APARTMENT_OBJECT_GROUP_UUID_UD] = def.id;
  if (selectedId) {
    manip.userData[MY_APARTMENT_OBJECT_GROUP_OVERLAY_KEY_UD] = selectedId;
  }
  manip.position.copy(center);
  manip.quaternion.identity();
  manip.scale.set(1, 1, 1);
  manip.updateMatrixWorld(true);
  furnitureRoot.add(manip);

  const memberSnapshot = [...members];
  for (const mRoot of memberSnapshot) {
    manip.attach(mRoot);
  }

  if (selectedId) {
    registerEditorMyApartmentPlacementGroupOverlay(selectedId, manip);
  }
  return manip;
}
