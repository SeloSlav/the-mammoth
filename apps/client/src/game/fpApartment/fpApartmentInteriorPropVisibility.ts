import * as THREE from "three";

/** Matches decor/furniture group bounds expansion for hallway / exterior peeks. */
export const APARTMENT_PROP_FRUSTUM_MARGIN_M = 1.5;

/**
 * When the viewer is inside their apartment, hide props clearly behind the camera. Spinning in a
 * small unit otherwise keeps every high-poly decor GLB in the frustum pass (~500k+ triangles).
 */
export const APARTMENT_INTERIOR_PROP_BEHIND_CAMERA_DOT_MAX = 0;

/**
 * Legacy forward-cone hysteresis (show / hide band). Steady-state in-unit culling no longer uses
 * this — only behind-camera + frustum after entry warm-up. Kept for explicit opt-in via
 * {@link resolveApartmentInteriorPropGroupVisible} `wasVisible`.
 */
export const APARTMENT_INTERIOR_PROP_AHEAD_SHOW_DOT = 0.1;
export const APARTMENT_INTERIOR_PROP_BEHIND_HIDE_DOT = -0.15;

/**
 * @deprecated Steady state applies visibility immediately. Used only for entry warm-up bursts.
 */
export const APARTMENT_INTERIOR_PROP_MAX_SHOWS_PER_FRAME = 6;

/**
 * How many decor groups may transition hidden→visible per frame during entry warm-up. Pays
 * WebGPU pipeline compilation cost up front on unit entry instead of spreading it across turns.
 */
export const APARTMENT_INTERIOR_PROP_WARMUP_MAX_SHOWS_PER_FRAME = 32;

/**
 * After warm-up, behind-camera cull hides props while turning away. When the viewer turns back,
 * spreading hidden→visible transitions avoids compiling dozens of WebGPU pipelines in one frame
 * (multi‑hundred‑ms hitches at ~300k submitted tris).
 */
export const APARTMENT_INTERIOR_PROP_STEADY_MAX_SHOWS_PER_FRAME = 8;

/** Frustum / forward-cone culling bounds for a decor group (expanded by {@link APARTMENT_PROP_FRUSTUM_MARGIN_M}). */
export function tagApartmentDecorGroupVisibilityMetadata(group: THREE.Object3D): void {
  group.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(group);
  bbox.expandByScalar(APARTMENT_PROP_FRUSTUM_MARGIN_M);
  group.userData.mammothApartmentDecorWorldBounds = bbox;
}

const _boundsCenterScratch = new THREE.Vector3();
const _toPropScratch = new THREE.Vector3();

export type ApartmentInteriorPropVisibilityState = {
  visibleKeys: Set<string>;
  /** Decor keys that completed entry warm-up in the current containing unit. */
  warmedKeys: Set<string>;
  activeUnitKey: string | null;
  /** Warm-up completion per unit — survives brief exits so re-entry does not replay bursts. */
  warmedKeysByUnit: Map<string, Set<string>>;
};

/** @deprecated Use {@link ApartmentInteriorPropVisibilityState}. */
export type ApartmentInteriorPropVisibilityBudgetState = ApartmentInteriorPropVisibilityState;

export function createApartmentInteriorPropVisibilityState(): ApartmentInteriorPropVisibilityState {
  return {
    visibleKeys: new Set(),
    warmedKeys: new Set(),
    activeUnitKey: null,
    warmedKeysByUnit: new Map(),
  };
}

/** @deprecated Use {@link createApartmentInteriorPropVisibilityState}. */
export function createApartmentInteriorPropVisibilityBudgetState(): ApartmentInteriorPropVisibilityState {
  return createApartmentInteriorPropVisibilityState();
}

export function clearApartmentInteriorPropVisibilityState(
  state: ApartmentInteriorPropVisibilityState,
): void {
  state.visibleKeys.clear();
  state.warmedKeys.clear();
  state.activeUnitKey = null;
  state.warmedKeysByUnit.clear();
}

function persistWarmedKeysForUnit(
  state: ApartmentInteriorPropVisibilityState,
  unitKey: string,
): void {
  state.warmedKeysByUnit.set(unitKey, new Set(state.warmedKeys));
}

function restoreWarmedKeysForUnit(
  state: ApartmentInteriorPropVisibilityState,
  unitKey: string,
): void {
  const cached = state.warmedKeysByUnit.get(unitKey);
  state.warmedKeys = cached ? new Set(cached) : new Set();
}

/** @deprecated Use {@link clearApartmentInteriorPropVisibilityState}. */
export function clearApartmentInteriorPropVisibilityBudgetState(
  state: ApartmentInteriorPropVisibilityState,
): void {
  clearApartmentInteriorPropVisibilityState(state);
}

/**
 * Resets warm-up tracking when the containing unit changes or the viewer leaves all units.
 */
export function syncApartmentInteriorPropVisibilityUnit(
  state: ApartmentInteriorPropVisibilityState,
  containingUnitKey: string | null,
): void {
  if (containingUnitKey === state.activeUnitKey) {
    if (containingUnitKey === null) {
      state.visibleKeys.clear();
    }
    return;
  }

  if (state.activeUnitKey !== null) {
    persistWarmedKeysForUnit(state, state.activeUnitKey);
  }

  state.activeUnitKey = containingUnitKey;
  state.visibleKeys.clear();

  if (containingUnitKey === null) {
    state.warmedKeys.clear();
    return;
  }

  restoreWarmedKeysForUnit(state, containingUnitKey);
}

/**
 * Marks every decor GLB in the unit as warmed (walls/mirrors excluded). Used during the loading
 * screen so entry warm-up and punctual-light mounts do not hitch the first gameplay frames.
 */
export function markAllApartmentInteriorPropsWarmedForUnit(
  state: ApartmentInteriorPropVisibilityState,
  unitKey: string,
  groupByRenderKey: ReadonlyMap<string, THREE.Object3D>,
): void {
  syncApartmentInteriorPropVisibilityUnit(state, unitKey);
  for (const [renderKey, group] of groupByRenderKey.entries()) {
    if (group.userData.mammothApartmentUnitKey !== unitKey) continue;
    if (group.userData.mammothApartmentWallAuthoring === true) continue;
    if (group.userData.mammothApartmentMirrorAuthoring === true) continue;
    state.warmedKeys.add(renderKey);
  }
  persistWarmedKeysForUnit(state, unitKey);
}

/** True while any decor GLB for the unit has not finished entry warm-up (excludes walls/mirrors). */
export function apartmentInteriorPropWarmupPendingForUnit(
  state: ApartmentInteriorPropVisibilityState,
  unitKey: string,
  groupByRenderKey: ReadonlyMap<string, THREE.Object3D>,
): boolean {
  for (const [renderKey, group] of groupByRenderKey.entries()) {
    if (group.userData.mammothApartmentUnitKey !== unitKey) continue;
    if (group.userData.mammothApartmentWallAuthoring === true) continue;
    if (group.userData.mammothApartmentMirrorAuthoring === true) continue;
    if (!state.warmedKeys.has(renderKey)) return true;
  }
  return false;
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
  /** Active unit keys eligible for decor (containing + corridor PVS). */
  visibleUnitKeys: ReadonlySet<string> | null;
  groupUnitKey: string | undefined;
  propWorldBounds: THREE.Box3 | undefined;
  viewFrustum: THREE.Frustum;
  cameraWorldPos: THREE.Vector3;
  cameraWorldDir: THREE.Vector3;
  /** When set, applies in-unit forward hysteresis (legacy; not used in steady-state decor sync). */
  wasVisible?: boolean;
  /**
   * Partition walls / mirrors stay visible while in-unit (no behind-camera cull). They are low-poly
   * vs decor GLBs and do not participate in decor entry warm-up.
   */
  skipInteriorForwardCone?: boolean;
}): boolean {
  if (!input.allowDemand) return false;
  if (input.visibleUnitKeys === null || input.visibleUnitKeys.size === 0) return false;
  const isEligibleUnit =
    input.groupUnitKey !== undefined && input.visibleUnitKeys.has(input.groupUnitKey);
  if (!isEligibleUnit) return false;

  const bounds = input.propWorldBounds;
  if (!(bounds instanceof THREE.Box3)) return true;

  if (isEligibleUnit && input.skipInteriorForwardCone === true) {
    return input.viewFrustum.intersectsBox(bounds);
  }

  if (isEligibleUnit) {
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

/** In-unit decor warm-up: eligible groups become visible regardless of camera cone. */
export function resolveApartmentInteriorPropWarmUpVisible(input: {
  allowDemand: boolean;
  visibleUnitKeys: ReadonlySet<string> | null;
  groupUnitKey: string | undefined;
}): boolean {
  if (!input.allowDemand) return false;
  if (input.visibleUnitKeys === null || input.visibleUnitKeys.size === 0) return false;
  return (
    input.groupUnitKey !== undefined && input.visibleUnitKeys.has(input.groupUnitKey)
  );
}

export type ApartmentInteriorPropVisibilityApplyItem = {
  key: string;
  object: THREE.Object3D;
  desiredVisible: boolean;
  forwardDot: number;
};

/**
 * Applies desired visibility: immediate hides, entry warm-up burst for unwarmed keys, then a
 * smaller steady-state show budget when warmed props transition hidden→visible after turns.
 */
export function applyApartmentInteriorPropVisibility(
  items: readonly ApartmentInteriorPropVisibilityApplyItem[],
  state: ApartmentInteriorPropVisibilityState,
  warmUpMaxShowsPerFrame = APARTMENT_INTERIOR_PROP_WARMUP_MAX_SHOWS_PER_FRAME,
  steadyMaxShowsPerFrame = APARTMENT_INTERIOR_PROP_STEADY_MAX_SHOWS_PER_FRAME,
): void {
  const pendingWarmUp: ApartmentInteriorPropVisibilityApplyItem[] = [];
  const pendingSteadyShow: ApartmentInteriorPropVisibilityApplyItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    if (!item.desiredVisible) {
      item.object.visible = false;
      state.visibleKeys.delete(item.key);
      continue;
    }

    if (!state.warmedKeys.has(item.key)) {
      pendingWarmUp.push(item);
      continue;
    }

    if (state.visibleKeys.has(item.key)) {
      item.object.visible = true;
      continue;
    }

    pendingSteadyShow.push(item);
  }

  pendingWarmUp.sort((a, b) => b.forwardDot - a.forwardDot);

  const warmUpBudget = Math.max(0, warmUpMaxShowsPerFrame);
  for (let i = 0; i < pendingWarmUp.length; i++) {
    const item = pendingWarmUp[i]!;
    if (i < warmUpBudget) {
      item.object.visible = true;
      state.visibleKeys.add(item.key);
      state.warmedKeys.add(item.key);
    } else {
      item.object.visible = false;
    }
  }

  pendingSteadyShow.sort((a, b) => b.forwardDot - a.forwardDot);

  const steadyBudget = Math.max(0, steadyMaxShowsPerFrame);
  for (let i = 0; i < pendingSteadyShow.length; i++) {
    const item = pendingSteadyShow[i]!;
    if (i < steadyBudget) {
      item.object.visible = true;
      state.visibleKeys.add(item.key);
    } else {
      item.object.visible = false;
    }
  }

  if (state.activeUnitKey !== null && state.warmedKeys.size > 0) {
    persistWarmedKeysForUnit(state, state.activeUnitKey);
  }
}

/**
 * @deprecated Use {@link applyApartmentInteriorPropVisibility}. Kept for tests of legacy budget.
 */
export function applyApartmentInteriorPropVisibilityBudget(
  items: readonly ApartmentInteriorPropVisibilityApplyItem[],
  state: ApartmentInteriorPropVisibilityState,
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
