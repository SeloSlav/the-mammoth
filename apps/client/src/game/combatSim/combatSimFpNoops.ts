import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import type { MountFpApartmentDecorMeshesResult } from "../fpApartment/fpApartmentDecorMeshes.js";
import type { MountFpApartmentDoorsResult } from "../fpApartment/fpApartmentDoors.js";
import type { FpApartmentStashRayOcclusion } from "../fpApartment/fpApartmentStashRayOcclusion.js";
import type {
  FpElevatorFloorVisibilityBand,
  MountFpElevatorWorldResult,
} from "../fpElevator/fpElevatorWorldTypes.js";
import type { FpBalconyGrowSession } from "../fpBalconyGrow/fpBalconyGrowSession.js";
import type { FpKinematicSupportProvider } from "../fpPhysics/fpKinematicSupport.js";

const noop = (): void => {};

const EMPTY_STASH_RAY_OCCLUSION: FpApartmentStashRayOcclusion = {
  rebuildFromBuildingRoot: noop,
  nearestOccluderDistanceAlongViewRay: () => null,
  targetOccludedFromCamera: () => false,
  hitOccluded: () => false,
};

const EMPTY_GROW_STATE: BalconyGrowOpUnitState = {
  trays: [],
  plants: [],
  light: null,
  patches: [],
  traysWithSubstrate: new Set(),
};

const COMBAT_SIM_FLOOR_BAND: FpElevatorFloorVisibilityBand = {
  lo: 0,
  hi: 0,
  hoistwayPlateBoost: false,
};

const noopKinematicSupport: FpKinematicSupportProvider = {
  sampleSupportSurface: () => null,
  resolveAttachment: () => null,
};

export function createCombatSimFpElevatorsNoop(): MountFpElevatorWorldResult {
  return {
    dispose: noop,
    syncCabEvalClock: noop,
    tick: noop,
    syncLandingHailUi: noop,
    kinematicSupport: noopKinematicSupport,
    tryRaycastFloorPick: () => false,
    consumeInteractKey: () => false,
    shouldSuppressEpickup: () => false,
    getExteriorDoorInteractPrompt: () => null,
    visitCollisionAabbsInXZ: noop,
    applyCabRoofFeetSnap: () => false,
    getFloorVisibilityBand: () => COMBAT_SIM_FLOOR_BAND,
    syncShaftVisualCulling: noop,
    isInsideCabOccludedView: () => false,
    isInsideAnyCabHud: () => false,
    getCabOccludedViewStorey: () => null,
    sampleRideDebug: () => null,
    getHudMovingCabVyMps: () => 0,
    ignoreSmallPoseReconcileWhileMovingElevatorRider: () => false,
    getCabMotionAudioEmitters: () => [],
  };
}

export function createCombatSimFpApartmentDoorsNoop(): MountFpApartmentDoorsResult {
  return {
    dispose: noop,
    tick: noop,
    visitCollisionAabbsInXZ: noop,
    visitFirearmBarrierAabbsInXZ: noop,
    consumeInteractKey: () => false,
    shouldSuppressEpickup: () => false,
    getInteractPrompt: () => null,
    debugSnapshot: () => [],
  };
}

export function createCombatSimFpApartmentDecorMeshesNoop(): MountFpApartmentDecorMeshesResult {
  return {
    dispose: noop,
    syncVisibility: noop,
    getDecorObject: () => undefined,
    getStashPrompt: () => null,
    getWardrobeClaimLookAtUnitKey: () => null,
    getSittablePickMeshes: () => [],
    getSittablePrompt: () => null,
    getNotebookPrompt: () => null,
    getSittableDecorRoots: () => [],
    getGrowTrayPickMeshes: () => [],
    getGrowSlotPickMeshes: () => [],
    raycastBalconyGrowTrayHits: () => [],
    getBalconyGrowTrayPrompt: () => null,
    syncBalconyGrowSlotVisuals: noop,
    syncBalconyGrowTrayDecorVisibility: noop,
    collectBalconyGrowPickMeshesForPlayer: noop,
    rebuildStashRayOcclusion: noop,
    getStashRayOcclusion: () => EMPTY_STASH_RAY_OCCLUSION,
    updateFishTankFish: noop,
  };
}

export function createCombatSimFpBalconyGrowNoop(): FpBalconyGrowSession {
  return {
    dispose: noop,
    updateFrame: noop,
    tryPrimaryPointerDown: () => false,
    trySecondaryPointerDown: () => false,
    getCachedPlacement: () => null,
    getCachedGrowTrayHits: () => [],
    getGrowState: () => EMPTY_GROW_STATE,
    getActiveGrowState: () => EMPTY_GROW_STATE,
    getCachedGrowTrayPrompt: () => null,
  };
}
