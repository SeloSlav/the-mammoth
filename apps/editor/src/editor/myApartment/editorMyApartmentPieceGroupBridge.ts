import * as THREE from "three";
import { shouldHideMyApartmentLayoutSelectionGroup } from "./editorMyApartmentLayoutVisibility.js";

export const EDITOR_MY_APARTMENT_FURNITURE_ROOT_NAME = "editor_my_apartment_furniture";

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

let decorModelReloadRequest: ((modelRelPath: string) => Promise<void>) | null = null;

/** Reload a decor GLB from disk after optimize/revert (registered by apartment lifecycle). */
export function registerEditorMyApartmentDecorModelReloadRequest(
  fn: ((modelRelPath: string) => Promise<void>) | null,
): void {
  decorModelReloadRequest = fn;
}

export async function requestEditorMyApartmentDecorModelReload(
  modelRelPath: string,
): Promise<void> {
  await decorModelReloadRequest?.(modelRelPath);
}

/** `editor_my_apartment_furniture` root — not the transient saved-group manipulator. */
let apartmentFurnitureMountRoot: THREE.Group | null = null;

/** Full preview unit root (shell + mounted décor/walls/mirrors) for viewport stats. */
let apartmentUnitStatsRoot: THREE.Object3D | null = null;

/** Walk ancestors until the named furniture mount root (ignores saved-group manip parents). */
export function resolveEditorMyApartmentFurnitureMountRootFromObject(
  from: THREE.Object3D | null | undefined,
): THREE.Group | null {
  let o: THREE.Object3D | null = from ?? null;
  while (o) {
    if (o instanceof THREE.Group && o.name === EDITOR_MY_APARTMENT_FURNITURE_ROOT_NAME) {
      return o;
    }
    o = o.parent;
  }
  return null;
}

function refreshApartmentFurnitureMountRootFromGroups(): void {
  if (!groupsRef || Object.keys(groupsRef).length === 0) {
    apartmentFurnitureMountRoot = null;
    return;
  }
  for (const group of Object.values(groupsRef)) {
    const root = resolveEditorMyApartmentFurnitureMountRootFromObject(group);
    if (root) {
      apartmentFurnitureMountRoot = root;
      return;
    }
  }
  apartmentFurnitureMountRoot = null;
}

let apartmentFurnitureMountResyncDecorShadows: ((unitBounds?: import("@the-mammoth/engine").ApartmentUnitWorldBounds) => void) | null = null;
let apartmentFurnitureMountResyncPracticalLights: ((windowScanRoot: THREE.Object3D) => void) | null = null;
let apartmentDecorShadowRenderer: THREE.WebGPURenderer | null = null;
let apartmentFishTankBridge: import("./editorApartmentFishTankBridge.js").EditorApartmentFishTankBridge | null = null;

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

  apartmentFurnitureMountResyncDecorShadows = null;
  apartmentFurnitureMountResyncPracticalLights = null;
  refreshApartmentFurnitureMountRootFromGroups();
}

export function getEditorMyApartmentFurnitureMountRoot(): THREE.Group | null {
  if (
    apartmentFurnitureMountRoot?.name === EDITOR_MY_APARTMENT_FURNITURE_ROOT_NAME
  ) {
    return apartmentFurnitureMountRoot;
  }
  refreshApartmentFurnitureMountRootFromGroups();
  return apartmentFurnitureMountRoot;
}

export function registerEditorMyApartmentUnitStatsRoot(root: THREE.Object3D | null): void {
  apartmentUnitStatsRoot = root;
}

export function getEditorMyApartmentUnitStatsRoot(): THREE.Object3D | null {
  return apartmentUnitStatsRoot;
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

export function registerEditorMyApartmentPracticalLightsResync(
  fn: ((windowScanRoot: THREE.Object3D) => void) | null,
): void {
  apartmentFurnitureMountResyncPracticalLights = fn;
}

export function resyncEditorMyApartmentPracticalLights(
  windowScanRoot: THREE.Object3D,
): void {
  apartmentFurnitureMountResyncPracticalLights?.(windowScanRoot);
}

export function registerEditorFishTankBridge(
  bridge: import("./editorApartmentFishTankBridge.js").EditorApartmentFishTankBridge | null,
): void {
  apartmentFishTankBridge = bridge;
}

export function getEditorFishTankBridge(): import("./editorApartmentFishTankBridge.js").EditorApartmentFishTankBridge | null {
  return apartmentFishTankBridge;
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

/** Session-only viewport hide — does not mutate persisted apartment JSON. */
export function applyEditorMyApartmentLayoutHiddenPlacements(
  hiddenPlacementIds: ReadonlySet<string>,
): void {
  if (!groupsRef) return;
  for (const [selectionId, group] of Object.entries(groupsRef)) {
    group.visible = !shouldHideMyApartmentLayoutSelectionGroup(
      selectionId,
      hiddenPlacementIds,
    );
  }
}
