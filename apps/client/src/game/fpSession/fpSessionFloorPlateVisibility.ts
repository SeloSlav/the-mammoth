import * as THREE from "three";
import { estimateStoreyFromFeetY, type BuildingStairShaftSpec } from "@the-mammoth/world";
import {
  fpBuildingExteriorViewShouldRevealFullStack,
  fpCameraInsideBuildingFootprintXZ,
  fpCameraOrFeetInsideBuildingFootprintXZ,
  fpCameraOrFeetNearBuildingFootprintXZ,
  fpStairShaftLocalVisibilityBand,
  fpStairColumnPlateVisibilityBand,
} from "../fpFloor/fpBuildingFloorPlateVisibilityBand.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorld.js";
import type { FpElevatorFloorVisibilityBand } from "../fpElevator/fpElevatorWorldTypes.js";
import type { FpResidentialUnitShellMesh } from "./fpSessionUnitInteriorShellMeshes.js";
import type { FpSessionUnitInteriorMeshEntry } from "./fpSessionUnitInteriorShellMeshes.js";
import { expandObjectFrustumBoundsOnce } from "./fpMeshFrustumBounds.js";

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
  apartmentFurnitureInteriorMeshes: readonly THREE.Mesh[];
  fpElevators: Pick<
    MountFpElevatorWorldResult,
    "getCabOccludedViewStorey" | "getFloorVisibilityBand" | "isInsideAnyCabHud"
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
  /** Writable scratch filled each visibility pass; shared with downstream frame logic. */
  floorVisCamWorld: THREE.Vector3;
  floorVisCamDir: THREE.Vector3;
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

export function fpResolveUnitInteriorMeshVisible(input: {
  entry: Pick<
    FpSessionUnitInteriorMeshEntry,
    | "apartmentUnitKey"
    | "residentialUnitId"
    | "residentialExteriorGlass"
    | "genericInteriorVisibleInResidentialUnit"
  >;
  unitInteriorVisible: boolean;
  apartmentFurnitureInteriorVisible: boolean;
  insideResidentialUnit: boolean;
  containingResidentialUnitId: string | null;
  containingResidentialUnitKey: string | null;
}): boolean {
  const { entry } = input;
  if (entry.apartmentUnitKey !== null) {
    return (
      input.apartmentFurnitureInteriorVisible &&
      (!input.insideResidentialUnit ||
        entry.apartmentUnitKey === input.containingResidentialUnitKey)
    );
  }
  if (entry.residentialUnitId !== null) {
    if (input.insideResidentialUnit) {
      return entry.residentialUnitId === input.containingResidentialUnitId;
    }
    /**
     * Exterior unit glass is part of the facade, so keep it available for outside/perimeter views.
     * Once inside a unit, the branch above hides every other unit's transparent glass.
     */
    if (entry.residentialExteriorGlass) return true;
  }
  if (input.insideResidentialUnit) {
    /**
     * Once the player is inside a specific apartment, anonymous `mammothUnitInterior` meshes must not
     * stay visible just because they are "generic residential interior". That broad allowance leaks
     * neighboring unit/corridor shells into the active apartment render set. In-unit views only keep
     * meshes with explicit ownership tags (`apartmentUnitKey` / `residentialUnitId`).
     */
    return false;
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

export function createFpSessionFloorPlateVisibility(opts: FpSessionFloorPlateVisibilityOpts): {
  syncBuildingFloorPlateVisibility: (nowMs: number) => void;
  isInsideElevatorCabHudForJump: () => boolean;
  isInsideResidentialUnit: () => boolean;
  getContainingResidentialUnitKey: () => string | null;
  isApartmentFurnitureInteriorVisible: () => boolean;
} {
  const {
    camera,
    buildingRoot,
    buildingWorldBounds,
    maxBuildingLevel,
    storeyOpts,
    unitInteriorMeshEntries,
    topFloorResidentialUnitShellMeshes,
    apartmentFurnitureInteriorMeshes,
    fpElevators,
    stairShaftInteriorLightBounds,
    stairShaftSpecs,
    feetPos,
    getContainingResidentialUnit,
    floorVisCamWorld,
    floorVisCamDir,
  } = opts;

  let _lastBandLo = -999;
  let _lastBandHi = -999;
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
  let _lastApartmentFurnitureInteriorVisible = true;
  let _lastUnitInteriorMeshCount = -1;
  let _lastApartmentFurnitureInteriorMeshCount = -1;
  let _lastTopFloorResidentialShellOnlyUnitId: string | null = null;
  let _lastTopFloorResidentialShellMeshCount = -1;
  let _lastContainingResidentialUnitId: string | null = null;
  let _lastContainingResidentialUnitKey: string | null = null;
  let _lastInsideResidentialUnit = false;

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
  ): void => {
    segment.traverse((obj) => {
      if (
        obj.name.startsWith("stairwell_litter:") ||
        obj.userData?.mammothStairwellLitter === true
      ) {
        obj.visible = litterVisible;
        return;
      }
      if (obj.name.startsWith("stairwell_prop_")) {
        obj.visible = segmentInDetailBand;
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
    const insideResidentialUnit = containingResidentialUnit !== null;
    _lastInsideResidentialUnit = insideResidentialUnit;
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
     * Merged ez-tree meshes are fill-rate heavy. Keep them available for true exterior/perimeter
     * views, but force them off once feet are inside a residential hull; unit walls fully occlude
     * them even if the camera sits near an exterior footprint inset.
     */
    for (const ch of buildingRoot.children) {
      if (ch.userData.mammothExteriorProceduralTrees === true) {
        ch.visible = cameraOutsideBuilding && !insideResidentialUnit;
      }
    }
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
    if (_visBandSmoothLo < 0 || teleportSnap || insideResidentialUnit) {
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
    /**
     * Furniture GLBs are heavy and visibly wrong through exterior glass. Keep plaster on for nearby
     * sidewalk/doorway peeks, but only build/render apartment props once the camera is inside.
     */
    const apartmentFurnitureInteriorVisible =
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
    const unitInteriorVisibilityChanged =
      unitInteriorVisible !== _lastUnitInteriorVisible ||
      unitInteriorMeshEntries.length !== _lastUnitInteriorMeshCount ||
      apartmentFurnitureInteriorVisible !== _lastApartmentFurnitureInteriorVisible ||
      containingResidentialUnitId !== _lastContainingResidentialUnitId ||
      containingResidentialUnitKey !== _lastContainingResidentialUnitKey;
    if (unitInteriorVisibilityChanged) {
      _lastUnitInteriorVisible = unitInteriorVisible;
      _lastApartmentFurnitureInteriorVisible = apartmentFurnitureInteriorVisible;
      _lastUnitInteriorMeshCount = unitInteriorMeshEntries.length;
      _lastContainingResidentialUnitId = containingResidentialUnitId;
      _lastContainingResidentialUnitKey = containingResidentialUnitKey;
      for (let i = 0; i < unitInteriorMeshEntries.length; i++) {
        const entry = unitInteriorMeshEntries[i]!;
        entry.mesh.visible = fpResolveUnitInteriorMeshVisible({
          entry,
          unitInteriorVisible,
          apartmentFurnitureInteriorVisible,
          insideResidentialUnit,
          containingResidentialUnitId,
          containingResidentialUnitKey,
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
    const apartmentFurnitureInteriorVisibilityChanged =
      apartmentFurnitureInteriorVisible !== _lastApartmentFurnitureInteriorVisible ||
      apartmentFurnitureInteriorMeshes.length !== _lastApartmentFurnitureInteriorMeshCount;
    if (apartmentFurnitureInteriorVisibilityChanged) {
      _lastApartmentFurnitureInteriorMeshCount = apartmentFurnitureInteriorMeshes.length;
    }

    /**
     * Disabled for now: restricting the top-floor residential shell set to only the containing unit
     * can punch visible holes at apartment corners because some boundary/roof pieces are owned by the
     * neighboring unit shell. Keep the full top-floor shell set until we can tag only the truly
     * redundant roof/ceiling subset.
     */
    const topFloorResidentialShellOnlyUnitId = null;
    const topFloorResidentialShellVisibilityChanged =
      topFloorResidentialShellOnlyUnitId !== _lastTopFloorResidentialShellOnlyUnitId ||
      topFloorResidentialUnitShellMeshes.length !== _lastTopFloorResidentialShellMeshCount;
    if (topFloorResidentialShellVisibilityChanged) {
      _lastTopFloorResidentialShellOnlyUnitId = topFloorResidentialShellOnlyUnitId;
      _lastTopFloorResidentialShellMeshCount = topFloorResidentialUnitShellMeshes.length;
      for (let i = 0; i < topFloorResidentialUnitShellMeshes.length; i++) {
        const entry = topFloorResidentialUnitShellMeshes[i]!;
        entry.mesh.visible =
          topFloorResidentialShellOnlyUnitId === null ||
          entry.unitId === topFloorResidentialShellOnlyUnitId;
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
      !apartmentFurnitureInteriorVisibilityChanged &&
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
        ch.visible = li >= lo && li <= hi;
      }
    }
  };

  return {
    syncBuildingFloorPlateVisibility,
    isInsideElevatorCabHudForJump,
    isInsideResidentialUnit: () => _lastInsideResidentialUnit,
    getContainingResidentialUnitKey: () => _lastContainingResidentialUnitKey,
    isApartmentFurnitureInteriorVisible: () => _lastApartmentFurnitureInteriorVisible,
  };
}
