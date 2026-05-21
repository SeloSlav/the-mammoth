import * as THREE from "three";

/** Selection groups keyed by {@link editorMyApartmentSelectedIdForDecor} etc.; set by lifecycle. */
let groupsRef: Record<string, THREE.Group> | null = null;

let wallsMountSyncRequest: (() => void) | null = null;
let layoutPersistFromSceneRequest: (() => void) | null = null;
let fillWallOpeningRequest: ((wallId: string) => void) | null = null;

/** Registered by apartment lifecycle — rebuilds wall meshes from store (openings included). */
export function registerEditorMyApartmentWallsMountSyncRequest(fn: (() => void) | null): void {
  wallsMountSyncRequest = fn;
}

export function requestEditorMyApartmentWallsMountSync(): void {
  wallsMountSyncRequest?.();
}

/** Registered by editor scene — copies live wall (and attached gizmo) poses into the store before save. */
export function registerEditorMyApartmentLayoutPersistFromSceneRequest(
  fn: (() => void) | null,
): void {
  layoutPersistFromSceneRequest = fn;
}

export function requestEditorMyApartmentLayoutPersistFromScene(): void {
  layoutPersistFromSceneRequest?.();
}

/** Stretch the selected wall's length to span between neighboring slabs (editor scene registers). */
export function registerEditorFillWallOpeningRequest(
  fn: ((wallId: string) => void) | null,
): void {
  fillWallOpeningRequest = fn;
}

export function requestEditorFillWallOpening(wallId: string): void {
  fillWallOpeningRequest?.(wallId);
}

/** Immediate parent (`editor_my_apartment_furniture` root) of all décor/walls/builtins. */
let apartmentFurnitureMountRoot: THREE.Group | null = null;
let apartmentFurnitureMountResyncDecorShadows: ((unitBounds?: import("@the-mammoth/engine").ApartmentUnitWorldBounds) => void) | null = null;
let apartmentDecorShadowRenderer: THREE.WebGPURenderer | null = null;

export function registerEditorMyApartmentDecorShadowRenderer(
  renderer: THREE.WebGPURenderer | null,
): void {
  apartmentDecorShadowRenderer = renderer;
}

export function getEditorMyApartmentDecorShadowRenderer(): THREE.WebGPURenderer | null {
  return apartmentDecorShadowRenderer;
}

/** Extra roots (saved-group manipulator overlay) keyed by synthetic selection ids. */
const dynamicSelectionGroupOverlay: Partial<Record<string, THREE.Group>> = {};

export function clearEditorMyApartmentDynamicPlacementOverlays(): void {
  for (const k of Object.keys(dynamicSelectionGroupOverlay)) {
    delete dynamicSelectionGroupOverlay[k];
  }
}

export function setEditorMyApartmentPieceGroups(
  next: Record<string, THREE.Group> | null,
): void {
  clearEditorMyApartmentDynamicPlacementOverlays();
  groupsRef = next;

  apartmentFurnitureMountRoot = null;
  apartmentFurnitureMountResyncDecorShadows = null;
  if (!groupsRef || Object.keys(groupsRef).length === 0) return;
  const firstGroup = Object.values(groupsRef)[0];
  const p = firstGroup?.parent;
  apartmentFurnitureMountRoot =
    firstGroup && p instanceof THREE.Group ? p : null;
}

export function getEditorMyApartmentFurnitureMountRoot(): THREE.Group | null {
  return apartmentFurnitureMountRoot;
}

export function registerEditorMyApartmentDecorShadowResync(
  fn: ((unitBounds?: import("@the-mammoth/engine").ApartmentUnitWorldBounds) => void) | null,
): void {
  apartmentFurnitureMountResyncDecorShadows = fn;
}

export function resyncEditorMyApartmentDecorShadows(
  unitBounds?: import("@the-mammoth/engine").ApartmentUnitWorldBounds,
): void {
  apartmentFurnitureMountResyncDecorShadows?.(unitBounds);
}

/** @internal Overlay entry for transient saved-group THREE.Group manipulation root. */
export function registerEditorMyApartmentPlacementGroupOverlay(
  selectionKey: string,
  group: THREE.Group | null,
): void {
  if (!group) {
    delete dynamicSelectionGroupOverlay[selectionKey];
    return;
  }
  dynamicSelectionGroupOverlay[selectionKey] = group;
}

export function getEditorMyApartmentSelectionGroup(
  selectedId: string | null,
): THREE.Group | null {
  if (!selectedId) return null;
  return (
    dynamicSelectionGroupOverlay[selectedId] ?? groupsRef?.[selectedId] ?? null
  );
}

export function getEditorMyApartmentStaticSelectionGroupsMap(): Record<
  string,
  THREE.Group
> | null {
  return groupsRef;
}
