import * as THREE from "three";
import {
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutMirrorSelectedId,
  parseMyApartmentLayoutSavedObjectGroupId,
  parseMyApartmentLayoutWallOpeningSelectedId,
  parseMyApartmentLayoutWallSelectedId,
} from "../myApartment/editorMyApartmentSelection.js";

function titleCaseWords(raw: string): string {
  return raw
    .split(/[-_.\s]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function labelFromModelRelPath(modelRelPath: string): string {
  const leaf = modelRelPath.split("/").pop() ?? modelRelPath;
  const stem = leaf.replace(/\.[^.]+$/u, "");
  return titleCaseWords(stem) || leaf;
}

export type EditorSelectionDisplayNameContext = {
  placedItems?: readonly { id: string; modelRelPath: string }[];
  wallItems?: readonly { id: string }[];
  mirrorItems?: readonly { id: string }[];
  objectGroups?: readonly { id: string; name: string }[];
};

/** Resolve a human label from a synthetic editor selection id (no THREE object required). */
export function resolveEditorSelectionDisplayNameFromId(
  selectedId: string,
  context?: EditorSelectionDisplayNameContext,
): string {
  const decorId = parseMyApartmentLayoutDecorSelectedId(selectedId);
  if (decorId) {
    const decor = context?.placedItems?.find((item) => item.id === decorId);
    if (decor) return labelFromModelRelPath(decor.modelRelPath);
    return `Décor ${decorId}`;
  }

  const wallId = parseMyApartmentLayoutWallSelectedId(selectedId);
  if (wallId) return `Partition wall ${wallId.slice(0, 8)}`;

  const opening = parseMyApartmentLayoutWallOpeningSelectedId(selectedId);
  if (opening) return `Wall opening ${opening.openingId.slice(0, 8)}`;

  const mirrorId = parseMyApartmentLayoutMirrorSelectedId(selectedId);
  if (mirrorId) return `Mirror ${mirrorId.slice(0, 8)}`;

  const groupId = parseMyApartmentLayoutSavedObjectGroupId(selectedId);
  if (groupId) {
    const group = context?.objectGroups?.find((g) => g.id === groupId);
    if (group) return group.name;
    return `Object group ${groupId.slice(0, 8)}`;
  }

  return titleCaseWords(selectedId);
}

function readModelRelPathFromAncestors(root: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = root;
  while (cur) {
    const rel = cur.userData.mammothApartmentDecorModelRelPath;
    if (typeof rel === "string" && rel.length > 0) return rel;
    cur = cur.parent;
  }
  return null;
}

export function resolveEditorSelectionDisplayName(
  root: THREE.Object3D,
  selectedId: string | null,
): string {
  const modelRelPath = readModelRelPathFromAncestors(root);
  if (modelRelPath) return labelFromModelRelPath(modelRelPath);

  if (selectedId) {
    const decorId = parseMyApartmentLayoutDecorSelectedId(selectedId);
    if (decorId) return `Décor ${decorId}`;

    const wallId = parseMyApartmentLayoutWallSelectedId(selectedId);
    if (wallId) return `Partition wall ${wallId}`;

    const opening = parseMyApartmentLayoutWallOpeningSelectedId(selectedId);
    if (opening) return `Wall opening ${opening.openingId}`;

    const mirrorId = parseMyApartmentLayoutMirrorSelectedId(selectedId);
    if (mirrorId) return `Mirror ${mirrorId}`;

    const groupId = parseMyApartmentLayoutSavedObjectGroupId(selectedId);
    if (groupId) return `Object group ${groupId}`;
  }

  const partId =
    root.userData.editorCabPartId ??
    root.userData.editorLandingPartId ??
    root.userData.editorStairPartId ??
    root.userData.placedObjectId;
  if (typeof partId === "string" && partId.length > 0) {
    return titleCaseWords(partId);
  }

  if (typeof root.name === "string" && root.name.length > 0 && !root.name.startsWith("editor_")) {
    return titleCaseWords(root.name);
  }

  if (selectedId) return titleCaseWords(selectedId);
  return "Selection";
}
