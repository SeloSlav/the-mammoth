/**
 * Inert implementations of apartment-only FP subsystems.
 *
 * `mountFpSession({ combatSimMode: true })` uses the **same** RAF loop, locomotion, and combat reducers
 * as live gameplay. These stubs satisfy the same mount interfaces where the megablock building does
 * not exist (combat sim mounts `createCombatSimStaticWorld` instead).
 *
 * Stubbed when `combatSimMode`:
 * - `createInertFpElevatorWorld` — cab motion, shaft culling, floor picks
 * - `createInertFpApartmentDoors` — swing doors, firearm barriers, interact prompts
 * - `createInertFpApartmentDecorMeshes` — stash, sit, wardrobe, fish tank, grow tray picks
 * - `createInertFpBalconyGrowSession` — balcony planting UI / reducers
 *
 * Not stubbed (combat sim uses the real implementations): NPC session, firearm/melee presentation,
 * hotbar, vitals, dropped items, environment sky, move-intent snapshots.
 *
 * @see mountCombatSimSession.ts — client entry
 * @see apps/server/src/combat_sim.rs — server entry / session_key
 */
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

const INERT_FLOOR_BAND: FpElevatorFloorVisibilityBand = {
  lo: 0,
  hi: 0,
  hoistwayPlateBoost: false,
};

const inertKinematicSupport: FpKinematicSupportProvider = {
  sampleSupportSurface: () => null,
  resolveAttachment: () => null,
};

export function createInertFpElevatorWorld(): MountFpElevatorWorldResult {
  return {
    setFloorPlateBandGetter: noop,
    dispose: noop,
    syncCabEvalClock: noop,
    tick: noop,
    syncLandingHailUi: noop,
    kinematicSupport: inertKinematicSupport,
    tryRaycastFloorPick: () => false,
    consumeInteractKey: () => false,
    shouldSuppressEpickup: () => false,
    getLandingHailInteractPrompt: () => null,
    getExteriorDoorInteractPrompt: () => null,
    visitCollisionAabbsInXZ: noop,
    applyCabRoofFeetSnap: () => false,
    getFloorVisibilityBand: () => INERT_FLOOR_BAND,
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

export function createInertFpApartmentDoors(): MountFpApartmentDoorsResult {
  return {
    dispose: noop,
    setFloorPlateBandGetter: noop,
    tick: noop,
    visitCollisionAabbsInXZ: noop,
    visitFirearmBarrierAabbsInXZ: noop,
    consumeInteractKey: () => false,
    shouldSuppressEpickup: () => false,
    getInteractPrompt: () => null,
    debugSnapshot: () => [],
    collectCorridorPvsDoorEntries: () => [],
  };
}

export function createInertFpApartmentDecorMeshes(): MountFpApartmentDecorMeshesResult {
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
    waitForGameplayVisualReady: async () => {},
  };
}

export function createInertFpBalconyGrowSession(): FpBalconyGrowSession {
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
