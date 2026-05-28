import * as THREE from "three";
import { estimateStoreyFromFeetY, type BuildingStairShaftSpec } from "@the-mammoth/world";
import {
  fpBuildingExteriorViewShouldRevealFullStack,
  fpCameraInsideBuildingFootprintXZ,
  fpCameraOrFeetInsideBuildingFootprintXZ,
  fpCameraOrFeetNearBuildingFootprintXZ,
  fpStairShaftLocalVisibilityBand,
  fpStairColumnPlateVisibilityBand,
  fpHoistwayColumnPlateBand,
} from "../fpFloor/fpBuildingFloorPlateVisibilityBand.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorld.js";
import type { FpElevatorFloorVisibilityBand } from "../fpElevator/fpElevatorWorldTypes.js";
import type { FpResidentialUnitShellMesh } from "./fpSessionUnitInteriorShellMeshes.js";
import type { FpSessionUnitInteriorMeshEntry } from "./fpSessionUnitInteriorShellMeshes.js";
import { fpObjectUnderFpElevatorShaftVisual } from "./fpSessionUnitInteriorShellMeshes.js";
import { expandObjectFrustumBoundsOnce } from "./fpMeshFrustumBounds.js";
import { fpResolveApartmentInteriorLightingZone } from "./fpApartmentInteriorLightingZone.js";
import { fpResolveInsideElevatorHoistwayVoid } from "./fpElevatorHoistwayVoidView.js";
import { isFpDebugRenderIsolationEnabled } from "../fpDebugRenderIsolation.js";

/**
 * Pad for the active residential shell while indoors — keeps frustum culling on but avoids wall/ceiling
 * pops when the camera hugs the hull (previously `frustumCulled = false`, which submitted the full shell every frame).
 */
export const FP_CONTAINING_RESIDENTIAL_SHELL_FRUSTUM_PAD_M = 2.75;

type FpStairShaftVisibilityBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/**
 * Expanded-footprint margin for {@link fpCameraOrFeetNearBuildingFootprintXZ}: interiors rasterise only
 * when camera or feet could plausibly see through entries/glass. Keep this tight so distant sidewalk
 * views do not pay for unit plaster / shaft fill; doorway peek still has raw AABB + this pad.
 */
const FP_INTERIOR_SHELL_NEAR_MARGIN_M = 4;

/**
 * Plaster hollow shells stay visible farther out than decor props so exterior brick/concrete cladding
 * does not read through window lines when tagged interiors are culled for fill-rate.
 */
const FP_RESIDENTIAL_SHELL_PLASTER_EXTERIOR_MARGIN_M = 36;

/**
 * Cached applied floor-band (after smoothing). Raw target can jump from full-stack → interior in
 * one frame when leaving the hoistway; stepping the band spreads `.visible` toggles across frames.
 *
 * Narrowing hides plates — keep slow to avoid shader/GC spikes when dropping full-stack reveals.
 */
const VIS_BAND_NARROW_STOREYS_PER_FRAME = 1;
/** Widening shows plates — slightly faster so shaft views fill in promptly. */
const VIS_BAND_EXPAND_STOREYS_PER_FRAME = 3;

/**
 * Hard snap the smoothed storey band when feet jump (respawn, long vertical move) so we do not keep
 * submitting dozens of stale plates while easing 1–3 storeys/frame from the old span.
 */
const FP_FLOOR_VIS_TELEPORT_SNAP_DY_M = 12;
const FP_FLOOR_VIS_TELEPORT_SNAP_DXZ_M = 48;

/** Keep heavy stairwell detail close; architecture still uses the wider stair column band. */
const STAIR_SHAFT_DETAIL_STOREYS_BELOW_PLAYER = 1;
const STAIR_SHAFT_DETAIL_STOREYS_ABOVE_PLAYER = 2;
const STAIR_SHAFT_BOUNDS_MARGIN_M = 0.2;

/**
 * {@link stairShaftInteriorLightBoundsFromSpec} insets XZ inward for mood lights; corridor door
 * thresholds sit **outside** that hull while still needing stair segments above for occlusion.
 */
const STAIR_SHAFT_PLATE_PROBE_XZ_PAD_M = 3.75;
/** Match `fpSessionWorldMount` stair light vertical padding — same shaft span probe. */
const STAIR_SHAFT_PLATE_PROBE_Y_PAD_BOTTOM_M = 0.55;
const STAIR_SHAFT_PLATE_PROBE_Y_PAD_TOP_M = 3.5;

/**
 * True when `(x,y,z)` is inside stair shaft hull expanded for plate visibility (not lighting).
 */
export function fpPointNearStairShaftForPlateBand(
  x: number,
  y: number,
  z: number,
  specs: readonly BuildingStairShaftSpec[],
): boolean {
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    const hw = Math.max(0.05, s.sx * 0.5 + STAIR_SHAFT_PLATE_PROBE_XZ_PAD_M);
    const hd = Math.max(0.05, s.sz * 0.5 + STAIR_SHAFT_PLATE_PROBE_XZ_PAD_M);
    const minY = s.bottomY - STAIR_SHAFT_PLATE_PROBE_Y_PAD_BOTTOM_M;
    const maxY =
      s.bottomY + s.storeyCount * s.storeySpacing + STAIR_SHAFT_PLATE_PROBE_Y_PAD_TOP_M;
    if (
      x >= s.px - hw &&
      x <= s.px + hw &&
      y >= minY &&
      y <= maxY &&
      z >= s.pz - hd &&
      z <= s.pz + hd
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Stair-core plate caps must not shrink an elevator hoistway band — cores often share XZ adjacency and
 * `fpStairShaftLocalVisibilityBand` ignores the incoming global range.
 */
export function fpMergeStairShaftPlateBandWithElevator(
  elevatorBand: FpElevatorFloorVisibilityBand,
  insideStairShaft: boolean,
  maxLevel: number,
  playerStorey: number,
): { lo: number; hi: number } {
  if (!insideStairShaft || elevatorBand.hoistwayPlateBoost) {
    return { lo: elevatorBand.lo, hi: elevatorBand.hi };
  }
  return fpStairShaftLocalVisibilityBand({
    globalLo: elevatorBand.lo,
    globalHi: elevatorBand.hi,
    maxLevel,
    playerStorey,
  });
}

export type FpSessionFloorPlateVisibilityOpts = {
  camera: THREE.PerspectiveCamera;
  buildingRoot: THREE.Group;
  buildingWorldBounds: THREE.Box3;
  maxBuildingLevel: number;
  /** Vertical storey indexing — matches elevator / {@link estimateStoreyFromFeetY} conventions. */
  storeyOpts: {
    buildingWorldOriginY: number;
    floorSpacingM: number;
    maxLevel: number;
  };
  unitInteriorMeshEntries: readonly FpSessionUnitInteriorMeshEntry[];
  topFloorResidentialUnitShellMeshes: readonly FpResidentialUnitShellMesh[];
  apartmentDecorInteriorMeshes: readonly THREE.Mesh[];
  fpElevators: Pick<
    MountFpElevatorWorldResult,
    | "getCabOccludedViewStorey"
    | "getFloorVisibilityBand"
    | "isInsideAnyCabHud"
    | "isInsideAnyElevatorCabChamber"
  >;
  stairShaftInteriorLightBounds: readonly FpStairShaftVisibilityBounds[];
  stairShaftSpecs: readonly BuildingStairShaftSpec[];
  /** Predicted feet position — same reference as session `pos`. */
  feetPos: THREE.Vector3;
  /**
   * Unit id/key and replicated apartment `level` when feet are inside a residential hull.
   * That `level` matches `userData.mammothPlateLevelIndex` on plates (authoritative for storey clamps).
   */
  getContainingResidentialUnit: () => { unitId: string; unitKey: string; level: number } | null;
  /** Owned/active apartment shell to keep visible from hallway doorway peeks. */
  getRetainedResidentialUnitId?: () => string | null;
  /** Writable scratch filled each visibility pass; shared with downstream frame logic. */
  floorVisCamWorld: THREE.Vector3;
  floorVisCamDir: THREE.Vector3;
  /** Door-aware corridor PVS — resolved each visibility pass when mounted. */
  resolveCorridorPvsSnapshot?: (input: {
    feetY: number;
    cameraX: number;
    cameraZ: number;
    viewDirX: number;
    viewDirZ: number;
    insideResidentialUnit: boolean;
    insideApartmentInteriorLightingZone: boolean;
    containingUnitKey: string | null;
    retainedUnitKey: string | null;
  }) => {
    unitKeys: ReadonlySet<string>;
    unitIds: ReadonlySet<string>;
  };
  getRetainedResidentialUnitKey?: () => string | null;
};

export function fpApplyResidentialInteriorPlateBandOverride(input: {
  band: { lo: number; hi: number };
  playerStorey: number;
  maxBuildingLevel: number;
  insideResidentialUnit: boolean;
  trueExteriorView: boolean;
  cabOccludesWorld: boolean;
}): { lo: number; hi: number } {
  if (!input.insideResidentialUnit || input.trueExteriorView) {
    return input.band;
  }
  const clampedStorey = Math.max(1, Math.min(input.maxBuildingLevel, input.playerStorey));
  return { lo: clampedStorey, hi: clampedStorey };
}

/**
 * Floor plates use {@link fpBuildingFloorPlateVisibilityBand}; unit interior meshes must share that
 * band or every `mammothUnitInterior` child stays `.visible` while plates are off (see band comment
 * in `fpBuildingFloorPlateVisibilityBand.ts`).
 */
export function fpUnitInteriorMeshInActivePlateBand(input: {
  plateLevelIndex: number | null;
  activePlateBandLo: number;
  activePlateBandHi: number;
}): boolean {
  const { plateLevelIndex, activePlateBandLo, activePlateBandHi } = input;
  if (plateLevelIndex == null) return true;
  return (
    plateLevelIndex >= activePlateBandLo && plateLevelIndex <= activePlateBandHi
  );
}

/** Same-storey corridor geo while inside a unit hull (doorway / window sightlines into the hall). */
export function fpKeepSameStoreyCorridorShellVisibleInsideUnit(input: {
  containingStoryLevelIndex: number | null;
  entry: {
    corridorHallwayShell?: boolean;
    plateLevelIndex?: number | null;
  };
}): boolean {
  const { containingStoryLevelIndex, entry } = input;
  if (containingStoryLevelIndex === null) return false;
  if (entry.corridorHallwayShell !== true) return false;
  if (entry.plateLevelIndex == null) return false;
  return entry.plateLevelIndex === containingStoryLevelIndex;
}

/** @deprecated Use {@link fpKeepSameStoreyCorridorShellVisibleInsideUnit}. */
export const fpKeepCorridorShellVisibleInsideExtractionBandUnit =
  fpKeepSameStoreyCorridorShellVisibleInsideUnit;

export function fpResolveUnitInteriorMeshVisible(input: {
  entry: Pick<
    FpSessionUnitInteriorMeshEntry,
    | "apartmentUnitKey"
    | "residentialUnitId"
    | "residentialExteriorGlass"
    | "genericInteriorVisibleInResidentialUnit"
    | "apartmentSwingDoor"
    | "isResidentialShellPlaster"
  > & {
    plateLevelIndex?: number | null;
    corridorHallwayShell?: boolean;
    underStairColumnRoot?: boolean;
    hoistwayShaftShell?: boolean;
  };
  unitInteriorVisible: boolean;
  apartmentDecorInteriorVisible: boolean;
  exteriorShellPlasterVisible: boolean;
  insideResidentialUnit: boolean;
  /** Corridor / lobby dark-lighting envelope — hide neighbor unit shells like in-unit culling. */
  insideApartmentInteriorLightingZone: boolean;
  retainedResidentialUnitId?: string | null;
  containingResidentialUnitId: string | null;
  containingResidentialUnitKey: string | null;
  /** Door-aware corridor PVS — unit ids eligible for interior peek from hallway. */
  corridorPvsVisibleUnitIds?: ReadonlySet<string>;
  /** Same pass as {@link corridorPvsVisibleUnitIds} — keys for `apartmentUnitKey` decor groups. */
  corridorPvsVisibleUnitKeys?: ReadonlySet<string>;
  retainedResidentialUnitKey?: string | null;
  /** Building `levelIndex` for the unit hull feet occupy (when indoors). */
  containingStoryLevelIndex?: number | null;
  /** Smoothed plate band — same as `buildingRoot` child `mammothPlateLevelIndex` toggles. */
  activePlateBandLo?: number;
  activePlateBandHi?: number;
  /** Feet/eye inside hoistway column — neighbor façades must not leak through the open shaft. */
  insideElevatorHoistwayColumn?: boolean;
  anchorStorey?: number;
}): boolean {
  const { entry } = input;
  if (entry.hoistwayShaftShell === true) {
    return false;
  }
  const inPlateBand = fpUnitInteriorMeshInActivePlateBand({
    plateLevelIndex: entry.plateLevelIndex ?? null,
    activePlateBandLo: input.activePlateBandLo ?? 1,
    activePlateBandHi: input.activePlateBandHi ?? 999,
  });
  if (!inPlateBand) {
    return false;
  }
  if (entry.underStairColumnRoot === true) {
    /**
     * Stair column segments toggle `.visible` on their storey groups; merged shaft interiors are
     * also tagged `mammothUnitInterior` and must not be forced off by the hallway filler rule.
     * Litter / props still use {@link setStairSegmentDetailVisible} on the segment subtree.
     */
    return input.unitInteriorVisible;
  }
  if (entry.apartmentSwingDoor) {
    /**
     * Instanced corridor doors are not tied to a single `residentialUnitId` mesh. They must stay
     * visible while the player is inside their apartment (exit) and in the hallway — only the
     * exterior fill-rate gate (`unitInteriorVisible`) applies.
     */
    return input.unitInteriorVisible;
  }
  if (entry.apartmentUnitKey !== null) {
    if (!input.apartmentDecorInteriorVisible) return false;
    if (input.insideResidentialUnit) {
      if (entry.apartmentUnitKey === input.containingResidentialUnitKey) {
        return true;
      }
      const peekKeys = input.corridorPvsVisibleUnitKeys;
      return peekKeys !== undefined && peekKeys.has(entry.apartmentUnitKey);
    }
    if (input.insideApartmentInteriorLightingZone) {
      const pvsKeys = input.corridorPvsVisibleUnitKeys;
      if (pvsKeys && pvsKeys.has(entry.apartmentUnitKey)) return true;
      return (
        input.retainedResidentialUnitKey != null &&
        entry.apartmentUnitKey === input.retainedResidentialUnitKey
      );
    }
    return false;
  }
  if (entry.residentialUnitId !== null) {
    if (entry.residentialExteriorGlass && input.insideElevatorHoistwayColumn === true) {
      return (
        entry.plateLevelIndex !== null &&
        entry.plateLevelIndex === (input.anchorStorey ?? 1)
      );
    }
    if (input.insideResidentialUnit) {
      if (entry.residentialUnitId === input.containingResidentialUnitId) {
        return true;
      }
      const peekIds = input.corridorPvsVisibleUnitIds;
      if (
        peekIds &&
        entry.residentialUnitId !== null &&
        peekIds.has(entry.residentialUnitId)
      ) {
        return (
          entry.isResidentialShellPlaster === true || entry.residentialExteriorGlass === true
        );
      }
      return false;
    }
    /**
     * Hallway walks share the in-unit shell budget — only corridor anon geo stays live; neighbor
     * plaster/glass would otherwise pop hundreds of meshes on every doorway crossing.
     */
    if (input.insideApartmentInteriorLightingZone) {
      const pvsIds = input.corridorPvsVisibleUnitIds;
      if (
        pvsIds &&
        entry.residentialUnitId !== null &&
        pvsIds.has(entry.residentialUnitId) &&
        (entry.isResidentialShellPlaster || entry.residentialExteriorGlass)
      ) {
        return true;
      }
      return (
        input.retainedResidentialUnitId != null &&
        entry.residentialUnitId === input.retainedResidentialUnitId &&
        (entry.isResidentialShellPlaster || entry.residentialExteriorGlass)
      );
    }
    /**
     * Exterior glass outside the corridor lighting envelope — façade / perimeter views.
     */
    if (entry.residentialExteriorGlass) {
      if (input.insideApartmentInteriorLightingZone && !input.insideResidentialUnit) {
        return false;
      }
      if (!input.insideApartmentInteriorLightingZone) {
        return true;
      }
      return input.unitInteriorVisible || input.exteriorShellPlasterVisible;
    }
    if (
      entry.isResidentialShellPlaster &&
      (input.unitInteriorVisible || input.exteriorShellPlasterVisible)
    ) {
      return true;
    }
  }
  if (input.insideResidentialUnit) {
    if (
      fpKeepSameStoreyCorridorShellVisibleInsideUnit({
        containingStoryLevelIndex: input.containingStoryLevelIndex ?? null,
        entry,
      })
    ) {
      return input.unitInteriorVisible;
    }
    /**
     * Once the player is inside a specific apartment, anonymous `mammothUnitInterior` meshes must not
     * stay visible just because they are "generic residential interior". In-unit views keep meshes with
     * explicit ownership tags (`apartmentUnitKey` / `residentialUnitId`) plus same-storey corridor shells.
     */
    return false;
  }
  if (input.insideApartmentInteriorLightingZone && !input.insideResidentialUnit) {
    if (!input.unitInteriorVisible) return false;
    return entry.corridorHallwayShell === true;
  }
  return input.unitInteriorVisible;
}

/**
 * Stairwell litter is heavy (high-poly GLBs × instancing). Only rasterise it while feet are inside the
 * stair shaft hull — not corridor door thresholds, not closed apartment interiors, and not when the
 * camera merely sees stairs through glass. Segment detail may still enable props; this gate is
 * litter-only so {@link setStairSegmentDetailVisible} does not override interior hide passes.
 */
export function fpResolveStairwellLitterVisible(input: {
  segmentInDetailBand: boolean;
  feetInsideStairShaft: boolean;
}): boolean {
  return input.segmentInDetailBand && input.feetInsideStairShaft;
}

export function fpShouldExpandContainingResidentialShellFrustumBounds(input: {
  insideResidentialUnit: boolean;
  containingResidentialUnitId: string | null;
  entry: Pick<FpSessionUnitInteriorMeshEntry, "residentialUnitId" | "apartmentUnitKey">;
}): boolean {
  return (
    input.insideResidentialUnit &&
    input.entry.apartmentUnitKey === null &&
    input.containingResidentialUnitId !== null &&
    input.entry.residentialUnitId === input.containingResidentialUnitId
  );
}

/**
 * While inside a residential unit, only the containing unit's top-floor shell pieces should stay
 * visible. `null` keeps the full top-floor set for exterior / corridor silhouette correctness.
 */
export function fpResolveTopFloorResidentialShellUnitFilter(input: {
  insideResidentialUnit: boolean;
  containingResidentialUnitId: string | null;
}): string | null {
  if (input.insideResidentialUnit && input.containingResidentialUnitId !== null) {
    return input.containingResidentialUnitId;
  }
  return null;
}

export function fpResolveTopFloorResidentialShellVisible(input: {
  shellUnitId: string;
  onlyUnitId: string | null;
  unitInteriorVisible: boolean;
}): boolean {
  if (!input.unitInteriorVisible) return false;
  if (input.onlyUnitId === null) return true;
  return input.shellUnitId === input.onlyUnitId;
}

export function createFpSessionFloorPlateVisibility(opts: FpSessionFloorPlateVisibilityOpts): {
  syncBuildingFloorPlateVisibility: (nowMs: number) => void;
  isInsideElevatorCabHudForJump: () => boolean;
  isInsideResidentialUnit: () => boolean;
  /** Corridor / lobby / cab / stair — same dark interior rig as apartment units. */
  isInsideApartmentInteriorLightingZone: () => boolean;
  /** Feet inside a stair shaft AABB (for interior render layers + ceiling practicals). */
  isInsideStairwellShaft: () => boolean;
  /** Feet/eye in hoistway column (not cab) — stairwell-grade exterior light dimming. */
  isInsideElevatorHoistwayColumn: () => boolean;
  getContainingResidentialUnitKey: () => string | null;
  /** Last unit feet occupied — retained in corridor lighting zone for seamless practical-light remount. */
  getLastVisitedResidentialUnitKey: () => string | null;
  isApartmentDecorInteriorVisible: () => boolean;
  /** Sidewalk / orbit band for façade shutters (matches plaster exterior margin). */
  isExteriorFacadeDecorVisible: () => boolean;
  /** Door-aware corridor PVS unit ids for decor / NPC gates (updated each sync). */
  getCorridorPvsVisibleUnitKeys: () => ReadonlySet<string>;
  getCorridorPvsVisibleUnitIds: () => ReadonlySet<string>;
  getActiveFloorPlateBand: () => { lo: number; hi: number };
  /** Last plate-anchor storey used for visibility / lighting (feet or in-unit level). */
  getStoryLevelIndexForLighting: () => number;
} {
  const {
    camera,
    buildingRoot,
    buildingWorldBounds,
    maxBuildingLevel,
    storeyOpts,
    unitInteriorMeshEntries,
    topFloorResidentialUnitShellMeshes,
    apartmentDecorInteriorMeshes,
    fpElevators,
    stairShaftInteriorLightBounds,
    stairShaftSpecs,
    feetPos,
    getContainingResidentialUnit,
    getRetainedResidentialUnitId = () => null,
    floorVisCamWorld,
    floorVisCamDir,
    resolveCorridorPvsSnapshot,
    getRetainedResidentialUnitKey = () => null,
  } = opts;

  let _lastCorridorPvsUnitIds: ReadonlySet<string> = new Set();
  let _lastCorridorPvsUnitKeys: ReadonlySet<string> = new Set();

  let _lastBandLo = -999;
  let _lastBandHi = -999;
  let _lastUnitVisPlateBandLo = -999;
  let _lastUnitVisPlateBandHi = -999;
  let _lastStairBandLo = -999;
  let _lastStairBandHi = -999;
  let _lastStairDetailLo = -999;
  let _lastStairDetailHi = -999;
  let _lastStairLitterFeetInsideShaft = false;
  let _visBandSmoothLo = -999;
  let _visBandSmoothHi = -999;
  let _lastVisFeetSampleX = Number.NaN;
  let _lastVisFeetSampleY = Number.NaN;
  let _lastVisFeetSampleZ = Number.NaN;
  /** Gate writes on `unitInteriorMeshes[*].visible` to state transitions only. */
  let _lastUnitInteriorVisible = true;
  let _lastApartmentDecorInteriorVisible = true;
  let _lastUnitInteriorMeshCount = -1;
  let _lastApartmentDecorInteriorMeshCount = -1;
  let _lastTopFloorResidentialShellOnlyUnitId: string | null = null;
  let _lastTopFloorResidentialShellMeshCount = -1;
  let _lastContainingResidentialUnitId: string | null = null;
  let _lastContainingResidentialUnitKey: string | null = null;
  let _lastVisitedResidentialUnitKey: string | null = null;
  let _lastRetainedResidentialUnitId: string | null = null;
  let _lastInsideResidentialUnit = false;
  let _lastInsideStairwellShaft = false;
  let _lastHoistwayPlateBoost = false;
  let _lastInsideElevatorHoistwayColumn = false;
  let _lastInsideApartmentInteriorLightingZone = false;
  let _lastStoryLevelIndexForLighting = 1;
  let _lastExteriorShellPlasterVisible = false;
  let _lastTrueExteriorView = false;

  const pointInsideStairShaft = (x: number, y: number, z: number): boolean => {
    for (let i = 0; i < stairShaftInteriorLightBounds.length; i++) {
      const b = stairShaftInteriorLightBounds[i]!;
      if (
        x >= b.minX - STAIR_SHAFT_BOUNDS_MARGIN_M &&
        x <= b.maxX + STAIR_SHAFT_BOUNDS_MARGIN_M &&
        y >= b.minY - STAIR_SHAFT_BOUNDS_MARGIN_M &&
        y <= b.maxY + STAIR_SHAFT_BOUNDS_MARGIN_M &&
        z >= b.minZ - STAIR_SHAFT_BOUNDS_MARGIN_M &&
        z <= b.maxZ + STAIR_SHAFT_BOUNDS_MARGIN_M
      ) {
        return true;
      }
    }
    return false;
  };

  const setStairSegmentDetailVisible = (
    segment: THREE.Object3D,
    segmentInDetailBand: boolean,
    litterVisible: boolean,
    feetInsideStairShaft: boolean,
  ): void => {
    segment.traverse((obj) => {
      if (
        obj.name.startsWith("stairwell_litter:") ||
        obj.userData?.mammothStairwellLitter === true
      ) {
        obj.visible = litterVisible;
        return;
      }
      if (
        obj.name.startsWith("stairwell_prop_") ||
        obj.name.startsWith("stairwell_ceiling_light_") ||
        obj.userData?.mammothStairwellCeilingLight === true
      ) {
        obj.visible = segmentInDetailBand || feetInsideStairShaft;
      }
    });
  };

  const isInsideElevatorCabHudForJump = (): boolean => {
    camera.getWorldPosition(floorVisCamWorld);
    return fpElevators.isInsideAnyCabHud(
      feetPos.x,
      feetPos.y,
      feetPos.z,
      floorVisCamWorld.x,
      floorVisCamWorld.y,
      floorVisCamWorld.z,
    );
  };

  const syncBuildingFloorPlateVisibility = (nowMs: number): void => {
    camera.getWorldPosition(floorVisCamWorld);
    camera.getWorldDirection(floorVisCamDir);
    const occludedCabStorey = fpElevators.getCabOccludedViewStorey(
      feetPos.x,
      feetPos.y,
      feetPos.z,
      nowMs,
      floorVisCamWorld.x,
      floorVisCamWorld.y,
      floorVisCamWorld.z,
      floorVisCamDir.x,
      floorVisCamDir.z,
    );
    const cabOccludesWorld = typeof occludedCabStorey === "number";
    const elevVisBand = fpElevators.getFloorVisibilityBand(
      feetPos.x,
      feetPos.y,
      feetPos.z,
      nowMs,
      floorVisCamWorld.y,
      floorVisCamDir.y,
      floorVisCamWorld.x,
      floorVisCamWorld.z,
      floorVisCamDir.x,
      floorVisCamDir.z,
    );
    const hoistwayPlateBoost = elevVisBand.hoistwayPlateBoost;
    _lastHoistwayPlateBoost = hoistwayPlateBoost;
    let band = { lo: elevVisBand.lo, hi: elevVisBand.hi };
    /**
     * Inset-based "exterior" widens to the full stack so façades do not pop when the camera sits
     * just outside the footprint core — but perimeter corridors often sit **outside** that inset
     * while feet are still inside the raw world XZ AABB. Camera-only full stack then submits every
     * storey (~1000+ draw calls). Only apply the override when feet are clearly off the slab
     * (sidewalk / true exterior); hoistway / cab / doorway full-stack still comes from
     * `fpElevators.getFloorVisibilityBand`.
     */
    const feetOnBuildingSlab = fpCameraOrFeetInsideBuildingFootprintXZ({
      cameraX: feetPos.x,
      cameraZ: feetPos.z,
      feetX: feetPos.x,
      feetZ: feetPos.z,
      boundsMinX: buildingWorldBounds.min.x,
      boundsMaxX: buildingWorldBounds.max.x,
      boundsMinZ: buildingWorldBounds.min.z,
      boundsMaxZ: buildingWorldBounds.max.z,
    });
    const playerStorey = estimateStoreyFromFeetY(feetPos.y, storeyOpts);
    const containingResidentialUnit = getContainingResidentialUnit();
    const containingResidentialUnitId = containingResidentialUnit?.unitId ?? null;
    const containingResidentialUnitKey = containingResidentialUnit?.unitKey ?? null;
    const retainedResidentialUnitId = getRetainedResidentialUnitId();
    const insideResidentialUnit = containingResidentialUnit !== null;
    _lastInsideResidentialUnit = insideResidentialUnit;
    _lastInsideStairwellShaft = pointInsideStairShaft(feetPos.x, feetPos.y, feetPos.z);
    /** Plate / stair vertical anchor: replicated unit level in-hull, else feet-derived storey. */
    const storeyPlateAnchor =
      insideResidentialUnit && containingResidentialUnit !== null
        ? containingResidentialUnit.level
        : playerStorey;
    const cameraOutsideBuilding = fpBuildingExteriorViewShouldRevealFullStack({
      cameraX: floorVisCamWorld.x,
      cameraZ: floorVisCamWorld.z,
      boundsMinX: buildingWorldBounds.min.x,
      boundsMaxX: buildingWorldBounds.max.x,
      boundsMinZ: buildingWorldBounds.min.z,
      boundsMaxZ: buildingWorldBounds.max.z,
    });
    const trueExteriorView = cameraOutsideBuilding && !feetOnBuildingSlab;
    /**
     * Full-stack reveal only for true exteriors (feet off the raw slab): the old
     * `|| playerStorey <= 1` arm forced the entire merged tower for essentially every ground-floor
     * respawn whenever the camera sat just outside the 6 m footprint inset — thousands of draws.
     */
    if (cameraOutsideBuilding && !feetOnBuildingSlab) {
      band = { lo: 1, hi: maxBuildingLevel };
    }
    if (cabOccludesWorld) {
      /**
       * The previous "hide everything outside the cab" pass was too aggressive: when a stopped car
       * had its doors open, the current landing corridor disappeared and the sky showed through the
       * doorway. The cab walls only occlude **other storeys**; the stopped floor can still be seen
       * through the opening or in peripheral vision. A strict single-floor band (`lo=hi=current`)
       * turned out to be too narrow on the ground floor: some landing-adjacent slab / shell pieces
       * behave like they belong to the neighboring storey. Keep a tiny local band around the cab
       * instead. This still drops the tall-stack overdraw that made elevator turns expensive while
       * preserving the stopped-floor landing and its immediate shell context.
       */
      band = {
        lo: Math.max(1, occludedCabStorey - 1),
        hi: Math.min(maxBuildingLevel, occludedCabStorey + 1),
      };
    }

    const insideStairShaft =
      pointInsideStairShaft(feetPos.x, feetPos.y, feetPos.z) ||
      pointInsideStairShaft(floorVisCamWorld.x, floorVisCamWorld.y, floorVisCamWorld.z) ||
      fpPointNearStairShaftForPlateBand(feetPos.x, feetPos.y, feetPos.z, stairShaftSpecs) ||
      fpPointNearStairShaftForPlateBand(
        floorVisCamWorld.x,
        floorVisCamWorld.y,
        floorVisCamWorld.z,
        stairShaftSpecs,
      );
    if (insideStairShaft) {
      band = fpMergeStairShaftPlateBandWithElevator(
        { lo: band.lo, hi: band.hi, hoistwayPlateBoost },
        true,
        maxBuildingLevel,
        storeyPlateAnchor,
      );
    }
    const insideElevatorCab = fpElevators.isInsideAnyCabHud(
      feetPos.x,
      feetPos.y,
      feetPos.z,
      floorVisCamWorld.x,
      floorVisCamWorld.y,
      floorVisCamWorld.z,
    );
    const insideElevatorCabChamber = fpElevators.isInsideAnyElevatorCabChamber(
      feetPos.x,
      feetPos.y,
      feetPos.z,
      floorVisCamWorld.x,
      floorVisCamWorld.y,
      floorVisCamWorld.z,
    );
    const insideApartmentInteriorLightingZone = fpResolveApartmentInteriorLightingZone({
      insideResidentialUnit,
      trueExteriorView,
      feetOnBuildingSlab,
      insideElevatorCab,
      insideStairShaft,
    });
    _lastStoryLevelIndexForLighting = storeyPlateAnchor;
    if (containingResidentialUnitKey !== null) {
      _lastVisitedResidentialUnitKey = containingResidentialUnitKey;
    } else if (!insideApartmentInteriorLightingZone) {
      _lastVisitedResidentialUnitKey = null;
    }
    /**
     * Residential units should not inherit a tall-stack reveal from adjacent elevator/cab/shaft probes.
     * Once feet are inside a real apartment shell, ordinary views keep only the current storey's plate
     * band unless this is a true exterior view.
     * Stair-shaft *proximity* uses expanded hulls for doorway lines — it must not disable this clamp or
     * apartments near cores pay for a dozen+ extra storeys every frame.
     */
    band = fpApplyResidentialInteriorPlateBandOverride({
      band,
      playerStorey: storeyPlateAnchor,
      maxBuildingLevel,
      insideResidentialUnit,
      trueExteriorView,
      cabOccludesWorld,
    });
    const insideElevatorHoistwayColumn = fpResolveInsideElevatorHoistwayVoid({
      hoistwayPlateBoost,
      insideElevatorCabChamber,
      trueExteriorView,
      cabOccludesWorld,
    });
    _lastInsideElevatorHoistwayColumn = insideElevatorHoistwayColumn;
    if (insideElevatorHoistwayColumn) {
      band = fpHoistwayColumnPlateBand({
        playerStorey: storeyPlateAnchor,
        maxLevel: maxBuildingLevel,
      });
    }

    const targetBandLo = band.lo;
    const targetBandHi = band.hi;

    const hadFeetSample =
      Number.isFinite(_lastVisFeetSampleX) &&
      Number.isFinite(_lastVisFeetSampleY) &&
      Number.isFinite(_lastVisFeetSampleZ);
    const teleportSnap =
      hadFeetSample &&
      (Math.abs(feetPos.y - _lastVisFeetSampleY) > FP_FLOOR_VIS_TELEPORT_SNAP_DY_M ||
        Math.hypot(feetPos.x - _lastVisFeetSampleX, feetPos.z - _lastVisFeetSampleZ) >
          FP_FLOOR_VIS_TELEPORT_SNAP_DXZ_M);
    _lastVisFeetSampleX = feetPos.x;
    _lastVisFeetSampleY = feetPos.y;
    _lastVisFeetSampleZ = feetPos.z;

    /**
     * Once feet are inside an apartment, do not ease down from a previously broad hallway/shaft/exterior
     * band. The unit walls occlude the rest of the tower, so every transitional frame spent narrowing
     * still submits floors that cannot contribute pixels.
     */
    if (
      _visBandSmoothLo < 0 ||
      teleportSnap ||
      insideResidentialUnit ||
      insideElevatorHoistwayColumn
    ) {
      _visBandSmoothLo = targetBandLo;
      _visBandSmoothHi = targetBandHi;
    } else {
      if (_visBandSmoothLo < targetBandLo) {
        _visBandSmoothLo = Math.min(
          targetBandLo,
          _visBandSmoothLo + VIS_BAND_NARROW_STOREYS_PER_FRAME,
        );
      } else if (_visBandSmoothLo > targetBandLo) {
        _visBandSmoothLo = Math.max(
          targetBandLo,
          _visBandSmoothLo - VIS_BAND_EXPAND_STOREYS_PER_FRAME,
        );
      }
      if (_visBandSmoothHi > targetBandHi) {
        _visBandSmoothHi = Math.max(
          targetBandHi,
          _visBandSmoothHi - VIS_BAND_NARROW_STOREYS_PER_FRAME,
        );
      } else if (_visBandSmoothHi < targetBandHi) {
        _visBandSmoothHi = Math.min(
          targetBandHi,
          _visBandSmoothHi + VIS_BAND_EXPAND_STOREYS_PER_FRAME,
        );
      }
    }

/**
 * Hide tagged interior shells when camera **and** feet sit outside the footprint expanded by
 * {@link FP_INTERIOR_SHELL_NEAR_MARGIN_M}. Beyond that band, cladding/tint occludes interiors;
 * inside it we submit shells and let depth sort.
 *
 * Plaster hollow shells (`shell_wall_*`, floors/ceilings) use the wider
 * {@link FP_RESIDENTIAL_SHELL_PLASTER_EXTERIOR_MARGIN_M} (and true exterior views) so brick/concrete
 * cladding does not read through window lines when decor props stay culled.
 */
    const unitInteriorVisible =
      fpElevators.isInsideAnyCabHud(
        feetPos.x,
        feetPos.y,
        feetPos.z,
        floorVisCamWorld.x,
        floorVisCamWorld.y,
        floorVisCamWorld.z,
      ) ||
      fpCameraOrFeetNearBuildingFootprintXZ({
        cameraX: floorVisCamWorld.x,
        cameraZ: floorVisCamWorld.z,
        feetX: feetPos.x,
        feetZ: feetPos.z,
        boundsMinX: buildingWorldBounds.min.x,
        boundsMaxX: buildingWorldBounds.max.x,
        boundsMinZ: buildingWorldBounds.min.z,
        boundsMaxZ: buildingWorldBounds.max.z,
        nearMarginM: FP_INTERIOR_SHELL_NEAR_MARGIN_M,
      });
    const exteriorShellPlasterVisible =
      trueExteriorView ||
      fpCameraOrFeetNearBuildingFootprintXZ({
        cameraX: floorVisCamWorld.x,
        cameraZ: floorVisCamWorld.z,
        feetX: feetPos.x,
        feetZ: feetPos.z,
        boundsMinX: buildingWorldBounds.min.x,
        boundsMaxX: buildingWorldBounds.max.x,
        boundsMinZ: buildingWorldBounds.min.z,
        boundsMaxZ: buildingWorldBounds.max.z,
        nearMarginM: FP_RESIDENTIAL_SHELL_PLASTER_EXTERIOR_MARGIN_M,
      });
    /**
     * Decor GLBs are heavy and visibly wrong through exterior glass. Keep plaster on for nearby
     * sidewalk/doorway peeks; furnished props only mount once the camera is inside the building
     * footprint, and `fpApartmentDecorMeshes.syncVisibility` only shows them inside a unit hull.
     */
    const apartmentDecorInteriorVisible =
      fpElevators.isInsideAnyCabHud(
        feetPos.x,
        feetPos.y,
        feetPos.z,
        floorVisCamWorld.x,
        floorVisCamWorld.y,
        floorVisCamWorld.z,
      ) ||
        fpCameraInsideBuildingFootprintXZ({
          cameraX: floorVisCamWorld.x,
          cameraZ: floorVisCamWorld.z,
          boundsMinX: buildingWorldBounds.min.x,
          boundsMaxX: buildingWorldBounds.max.x,
          boundsMinZ: buildingWorldBounds.min.z,
          boundsMaxZ: buildingWorldBounds.max.z,
        });
    const corridorPvs = resolveCorridorPvsSnapshot?.({
      feetY: feetPos.y,
      cameraX: floorVisCamWorld.x,
      cameraZ: floorVisCamWorld.z,
      viewDirX: floorVisCamDir.x,
      viewDirZ: floorVisCamDir.z,
      insideResidentialUnit,
      insideApartmentInteriorLightingZone,
      containingUnitKey: containingResidentialUnitKey,
      retainedUnitKey: getRetainedResidentialUnitKey(),
    }) ?? {
      unitKeys: new Set<string>(),
      unitIds: new Set<string>(),
    };
    const corridorPvsChanged =
      corridorPvs.unitIds.size !== _lastCorridorPvsUnitIds.size ||
      [...corridorPvs.unitIds].some((id) => !_lastCorridorPvsUnitIds.has(id));
    _lastCorridorPvsUnitKeys = corridorPvs.unitKeys;
    _lastCorridorPvsUnitIds = corridorPvs.unitIds;
    const unitInteriorVisibilityChanged =
      unitInteriorVisible !== _lastUnitInteriorVisible ||
      exteriorShellPlasterVisible !== _lastExteriorShellPlasterVisible ||
      trueExteriorView !== _lastTrueExteriorView ||
      unitInteriorMeshEntries.length !== _lastUnitInteriorMeshCount ||
      apartmentDecorInteriorVisible !== _lastApartmentDecorInteriorVisible ||
      containingResidentialUnitId !== _lastContainingResidentialUnitId ||
      containingResidentialUnitKey !== _lastContainingResidentialUnitKey ||
      retainedResidentialUnitId !== _lastRetainedResidentialUnitId ||
      insideApartmentInteriorLightingZone !== _lastInsideApartmentInteriorLightingZone ||
      corridorPvsChanged ||
      _visBandSmoothLo !== _lastUnitVisPlateBandLo ||
      _visBandSmoothHi !== _lastUnitVisPlateBandHi;
    if (unitInteriorVisibilityChanged || insideResidentialUnit) {
      _lastUnitVisPlateBandLo = _visBandSmoothLo;
      _lastUnitVisPlateBandHi = _visBandSmoothHi;
      _lastUnitInteriorVisible = unitInteriorVisible;
      _lastExteriorShellPlasterVisible = exteriorShellPlasterVisible;
      _lastTrueExteriorView = trueExteriorView;
      _lastApartmentDecorInteriorVisible = apartmentDecorInteriorVisible;
      _lastUnitInteriorMeshCount = unitInteriorMeshEntries.length;
      _lastContainingResidentialUnitId = containingResidentialUnitId;
      _lastContainingResidentialUnitKey = containingResidentialUnitKey;
      _lastRetainedResidentialUnitId = retainedResidentialUnitId;
      _lastInsideApartmentInteriorLightingZone = insideApartmentInteriorLightingZone;
      const retainedResidentialUnitKey = getRetainedResidentialUnitKey();
      for (let i = 0; i < unitInteriorMeshEntries.length; i++) {
        const entry = unitInteriorMeshEntries[i]!;
        if (fpObjectUnderFpElevatorShaftVisual(entry.mesh)) {
          continue;
        }
        entry.mesh.visible =
          isFpDebugRenderIsolationEnabled("unitInteriorShells") &&
          fpResolveUnitInteriorMeshVisible({
            entry,
            unitInteriorVisible,
            apartmentDecorInteriorVisible,
            exteriorShellPlasterVisible,
            insideResidentialUnit,
            insideApartmentInteriorLightingZone,
            retainedResidentialUnitId,
            containingResidentialUnitId,
            containingResidentialUnitKey,
            corridorPvsVisibleUnitIds: corridorPvs.unitIds,
            corridorPvsVisibleUnitKeys: corridorPvs.unitKeys,
            retainedResidentialUnitKey,
            containingStoryLevelIndex: containingResidentialUnit?.level ?? null,
            activePlateBandLo: _visBandSmoothLo,
            activePlateBandHi: _visBandSmoothHi,
            insideElevatorHoistwayColumn:
              _lastHoistwayPlateBoost &&
              !insideElevatorCabChamber &&
              !trueExteriorView &&
              !cabOccludesWorld,
            anchorStorey: storeyPlateAnchor,
          });
        entry.mesh.frustumCulled = true;
        if (
          fpShouldExpandContainingResidentialShellFrustumBounds({
            insideResidentialUnit,
            containingResidentialUnitId,
            entry,
          })
        ) {
          expandObjectFrustumBoundsOnce(
            entry.mesh,
            FP_CONTAINING_RESIDENTIAL_SHELL_FRUSTUM_PAD_M,
          );
        }
      }
    }
    const apartmentDecorInteriorVisibilityChanged =
      apartmentDecorInteriorVisible !== _lastApartmentDecorInteriorVisible ||
      apartmentDecorInteriorMeshes.length !== _lastApartmentDecorInteriorMeshCount;
    if (apartmentDecorInteriorVisibilityChanged) {
      _lastApartmentDecorInteriorMeshCount = apartmentDecorInteriorMeshes.length;
    }

    const topFloorResidentialShellOnlyUnitId = fpResolveTopFloorResidentialShellUnitFilter({
      insideResidentialUnit,
      containingResidentialUnitId,
    });
    const topFloorResidentialShellVisibilityChanged =
      topFloorResidentialShellOnlyUnitId !== _lastTopFloorResidentialShellOnlyUnitId ||
      topFloorResidentialUnitShellMeshes.length !== _lastTopFloorResidentialShellMeshCount ||
      unitInteriorVisible !== _lastUnitInteriorVisible;
    if (topFloorResidentialShellVisibilityChanged || insideResidentialUnit) {
      _lastTopFloorResidentialShellOnlyUnitId = topFloorResidentialShellOnlyUnitId;
      _lastTopFloorResidentialShellMeshCount = topFloorResidentialUnitShellMeshes.length;
      for (let i = 0; i < topFloorResidentialUnitShellMeshes.length; i++) {
        const entry = topFloorResidentialUnitShellMeshes[i]!;
        entry.mesh.visible =
          isFpDebugRenderIsolationEnabled("unitInteriorShells") &&
          fpResolveTopFloorResidentialShellVisible({
            shellUnitId: entry.unitId,
            onlyUnitId: topFloorResidentialShellOnlyUnitId,
            unitInteriorVisible,
          });
      }
    }

    const lo = _visBandSmoothLo;
    const hi = _visBandSmoothHi;
    const stairBand = fpStairColumnPlateVisibilityBand({
      globalLo: lo,
      globalHi: hi,
      maxLevel: maxBuildingLevel,
      playerStorey: storeyPlateAnchor,
    });
    const stairDetailBand = {
      lo: Math.max(1, storeyPlateAnchor - STAIR_SHAFT_DETAIL_STOREYS_BELOW_PLAYER),
      hi: Math.min(maxBuildingLevel, storeyPlateAnchor + STAIR_SHAFT_DETAIL_STOREYS_ABOVE_PLAYER),
    };
    const feetInsideStairShaft = pointInsideStairShaft(
      feetPos.x,
      feetPos.y,
      feetPos.z,
    );
    if (
      lo === _lastBandLo &&
      hi === _lastBandHi &&
      lo === targetBandLo &&
      hi === targetBandHi &&
      stairBand.lo === _lastStairBandLo &&
      stairBand.hi === _lastStairBandHi &&
      stairDetailBand.lo === _lastStairDetailLo &&
      stairDetailBand.hi === _lastStairDetailHi &&
      feetInsideStairShaft === _lastStairLitterFeetInsideShaft &&
      !unitInteriorVisibilityChanged &&
      !apartmentDecorInteriorVisibilityChanged &&
      !topFloorResidentialShellVisibilityChanged
    ) {
      return;
    }
    _lastBandLo = lo;
    _lastBandHi = hi;
    _lastStairBandLo = stairBand.lo;
    _lastStairBandHi = stairBand.hi;
    _lastStairDetailLo = stairDetailBand.lo;
    _lastStairDetailHi = stairDetailBand.hi;
    _lastStairLitterFeetInsideShaft = feetInsideStairShaft;
    for (const ch of buildingRoot.children) {
      if (ch.userData.mammothStairColumnRoot === true) {
        ch.visible = true;
        for (const sub of (ch as THREE.Group).children) {
          const li = sub.userData.mammothPlateLevelIndex;
          if (typeof li === "number") {
            sub.visible = li >= stairBand.lo && li <= stairBand.hi;
            const segmentInDetailBand =
              li >= stairDetailBand.lo && li <= stairDetailBand.hi;
            setStairSegmentDetailVisible(
              sub,
              segmentInDetailBand,
              fpResolveStairwellLitterVisible({
                segmentInDetailBand,
                feetInsideStairShaft,
              }),
              feetInsideStairShaft,
            );
          } else {
            sub.visible = true;
          }
        }
        continue;
      }
      if (ch.userData.mammothAlwaysVisible === true) {
        ch.visible = true;
        continue;
      }
      const li = ch.userData.mammothPlateLevelIndex;
      if (typeof li === "number") {
        ch.visible =
          isFpDebugRenderIsolationEnabled("floorPlates") && li >= lo && li <= hi;
      }
    }
  };

  return {
    syncBuildingFloorPlateVisibility,
    isInsideElevatorCabHudForJump,
    isInsideResidentialUnit: () => _lastInsideResidentialUnit,
    isInsideApartmentInteriorLightingZone: () => _lastInsideApartmentInteriorLightingZone,
    isInsideStairwellShaft: () => _lastInsideStairwellShaft,
    isInsideElevatorHoistwayColumn: () => _lastInsideElevatorHoistwayColumn,
    getContainingResidentialUnitKey: () => _lastContainingResidentialUnitKey,
    getLastVisitedResidentialUnitKey: () => _lastVisitedResidentialUnitKey,
    isApartmentDecorInteriorVisible: () => _lastApartmentDecorInteriorVisible,
    isExteriorFacadeDecorVisible: () => _lastExteriorShellPlasterVisible,
    getCorridorPvsVisibleUnitKeys: () => _lastCorridorPvsUnitKeys,
    getCorridorPvsVisibleUnitIds: () => _lastCorridorPvsUnitIds,
    getActiveFloorPlateBand: () => ({ lo: _lastBandLo, hi: _lastBandHi }),
    getStoryLevelIndexForLighting: () => _lastStoryLevelIndexForLighting,
  };
}
