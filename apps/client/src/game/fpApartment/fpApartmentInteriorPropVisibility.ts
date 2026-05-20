import * as THREE from "three";

/** Matches decor/furniture group bounds expansion for hallway / exterior peeks. */
export const APARTMENT_PROP_FRUSTUM_MARGIN_M = 1.5;

/**
 * When the viewer is inside their apartment, hide props clearly behind the camera. Spinning in a
 * small unit otherwise keeps every high-poly decor GLB in the frustum pass (~500k+ triangles).
 */
export const APARTMENT_INTERIOR_PROP_BEHIND_CAMERA_DOT_MAX = 0;

/**
 * Hysteresis band for in-unit prop forward culling. Props must be clearly in front before they
 * newly appear; props stay visible until clearly behind — avoids a single fast 180° turn from
 * flipping every decor group in one frame.
 */
export const APARTMENT_INTERIOR_PROP_AHEAD_SHOW_DOT = 0.1;
export const APARTMENT_INTERIOR_PROP_BEHIND_HIDE_DOT = -0.15;

/**
 * Cap how many heavy decor/furniture groups may transition hidden→visible per frame while inside
 * a unit. Spreads WebGPU pipeline warm-up across frames instead of one 100ms+ hitch.
 */
export const APARTMENT_INTERIOR_PROP_MAX_SHOWS_PER_FRAME = 6;

/** Frustum / forward-cone culling bounds for a decor group (expanded by {@link APARTMENT_PROP_FRUSTUM_MARGIN_M}). */
export function tagApartmentDecorGroupVisibilityMetadata(group: THREE.Object3D): void {
  group.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(group);
  bbox.expandByScalar(APARTMENT_PROP_FRUSTUM_MARGIN_M);
  group.userData.mammothApartmentDecorWorldBounds = bbox;
}

const _boundsCenterScratch = new THREE.Vector3();
const _toPropScratch = new THREE.Vector3();

export type ApartmentInteriorPropVisibilityBudgetState = {
  visibleKeys: Set<string>;
};

export function createApartmentInteriorPropVisibilityBudgetState(): ApartmentInteriorPropVisibilityBudgetState {
  return { visibleKeys: new Set() };
}

export function clearApartmentInteriorPropVisibilityBudgetState(
  state: ApartmentInteriorPropVisibilityBudgetState,
): void {
  state.visibleKeys.clear();
}

export function apartmentPropBoundsForwardDot(
  propWorldBounds: THREE.Box3,
  cameraWorldPos: THREE.Vector3,
  cameraWorldDir: THREE.Vector3,
): number {
  propWorldBounds.getCenter(_boundsCenterScratch);
  _toPropScratch.subVectors(_boundsCenterScratch, cameraWorldPos);
  const distSq = _toPropScratch.lengthSq();
  if (distSq < 1e-8) return 1;
  _toPropScratch.multiplyScalar(1 / Math.sqrt(distSq));
  return _toPropScratch.dot(cameraWorldDir);
}

export function apartmentPropBehindCameraWhenInterior(
  propWorldBounds: THREE.Box3,
  cameraWorldPos: THREE.Vector3,
  cameraWorldDir: THREE.Vector3,
  behindCameraDotMax = APARTMENT_INTERIOR_PROP_BEHIND_CAMERA_DOT_MAX,
): boolean {
  return (
    apartmentPropBoundsForwardDot(propWorldBounds, cameraWorldPos, cameraWorldDir) <
    behindCameraDotMax
  );
}

function apartmentPropPassesInteriorForwardGate(
  propWorldBounds: THREE.Box3,
  cameraWorldPos: THREE.Vector3,
  cameraWorldDir: THREE.Vector3,
  wasVisible: boolean,
): boolean {
  const dot = apartmentPropBoundsForwardDot(
    propWorldBounds,
    cameraWorldPos,
    cameraWorldDir,
  );
  if (wasVisible) return dot > APARTMENT_INTERIOR_PROP_BEHIND_HIDE_DOT;
  return dot > APARTMENT_INTERIOR_PROP_AHEAD_SHOW_DOT;
}

export function resolveApartmentInteriorPropGroupVisible(input: {
  allowDemand: boolean;
  containingUnitKey: string | null;
  groupUnitKey: string | undefined;
  propWorldBounds: THREE.Box3 | undefined;
  viewFrustum: THREE.Frustum;
  cameraWorldPos: THREE.Vector3;
  cameraWorldDir: THREE.Vector3;
  /** When set, applies in-unit forward hysteresis (used while inside the containing unit). */
  wasVisible?: boolean;
  /**
   * Partition walls / mirrors stay visible while in-unit (no behind-camera cull). They are low-poly
   * vs decor GLBs and must not compete for the per-frame decor show budget.
   */
  skipInteriorForwardCone?: boolean;
}): boolean {
  if (!input.allowDemand) return false;
  /**
   * Furnished decor GLBs only while inside a residential unit hull (authoring / living in your
   * claimed unit). Corridor views keep shells only. In-unit fast turns still ramp via forward cone +
   * per-frame show budget below — dense units can hit ~500k tris when many props enter view at once.
   */
  if (input.containingUnitKey === null) return false;
  const isContainingUnit = input.groupUnitKey === input.containingUnitKey;
  if (!isContainingUnit) return false;

  const bounds = input.propWorldBounds;
  if (!(bounds instanceof THREE.Box3)) return true;

  if (isContainingUnit && input.skipInteriorForwardCone === true) {
    return input.viewFrustum.intersectsBox(bounds);
  }

  if (isContainingUnit) {
    const useHysteresis = input.wasVisible !== undefined;
    const behindCamera = useHysteresis
      ? !apartmentPropPassesInteriorForwardGate(
          bounds,
          input.cameraWorldPos,
          input.cameraWorldDir,
          input.wasVisible === true,
        )
      : apartmentPropBehindCameraWhenInterior(
          bounds,
          input.cameraWorldPos,
          input.cameraWorldDir,
        );
    if (behindCamera) return false;
  }

  return input.viewFrustum.intersectsBox(bounds);
}

export type ApartmentInteriorPropVisibilityApplyItem = {
  key: string;
  object: THREE.Object3D;
  desiredVisible: boolean;
  forwardDot: number;
};

/**
 * Applies desired visibility with immediate hides and a per-frame budget on newly shown groups.
 */
export function applyApartmentInteriorPropVisibilityBudget(
  items: readonly ApartmentInteriorPropVisibilityApplyItem[],
  state: ApartmentInteriorPropVisibilityBudgetState,
  maxShowsPerFrame = APARTMENT_INTERIOR_PROP_MAX_SHOWS_PER_FRAME,
): void {
  const pendingShow: ApartmentInteriorPropVisibilityApplyItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const wasVisible = state.visibleKeys.has(item.key);

    if (!item.desiredVisible) {
      item.object.visible = false;
      state.visibleKeys.delete(item.key);
      continue;
    }

    if (wasVisible) {
      item.object.visible = true;
      continue;
    }

    pendingShow.push(item);
  }

  pendingShow.sort((a, b) => b.forwardDot - a.forwardDot);

  const budget = Math.max(0, maxShowsPerFrame);
  for (let i = 0; i < pendingShow.length; i++) {
    const item = pendingShow[i]!;
    if (i < budget) {
      item.object.visible = true;
      state.visibleKeys.add(item.key);
    } else {
      item.object.visible = false;
    }
  }
}
