import * as THREE from "three";
import { estimateStoreyFromFeetY } from "@the-mammoth/world";
import {
  fpBuildingExteriorViewShouldRevealFullStack,
  fpCameraInsideBuildingFootprintXZ,
  fpCameraOrFeetInsideBuildingFootprintXZ,
  fpCameraOrFeetNearBuildingFootprintXZ,
  fpStairShaftLocalVisibilityBand,
  fpStairColumnPlateVisibilityBand,
} from "../fpFloor/fpBuildingFloorPlateVisibilityBand.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorld.js";

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
const FP_INTERIOR_SHELL_NEAR_MARGIN_M = 6;

/**
 * Cached applied floor-band (after smoothing). Raw target can jump from full-stack → interior in
 * one frame when leaving the hoistway; stepping the band spreads `.visible` toggles across frames.
 *
 * Narrowing hides plates — keep slow to avoid shader/GC spikes when dropping full-stack reveals.
 */
const VIS_BAND_NARROW_STOREYS_PER_FRAME = 1;
/** Widening shows plates — slightly faster so shaft views fill in promptly. */
const VIS_BAND_EXPAND_STOREYS_PER_FRAME = 3;

/** Keep heavy stairwell detail close; architecture still uses the wider stair column band. */
const STAIR_SHAFT_DETAIL_STOREYS_BELOW_PLAYER = 1;
const STAIR_SHAFT_DETAIL_STOREYS_ABOVE_PLAYER = 2;
const STAIR_SHAFT_BOUNDS_MARGIN_M = 0.2;

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
  unitInteriorMeshes: readonly THREE.Mesh[];
  apartmentFurnitureInteriorMeshes: readonly THREE.Mesh[];
  fpElevators: Pick<
    MountFpElevatorWorldResult,
    "getCabOccludedViewStorey" | "getFloorVisibilityBand" | "isInsideAnyCabHud"
  >;
  stairShaftInteriorLightBounds: readonly FpStairShaftVisibilityBounds[];
  /** Predicted feet position — same reference as session `pos`. */
  feetPos: THREE.Vector3;
  /** Writable scratch filled each visibility pass; shared with downstream frame logic. */
  floorVisCamWorld: THREE.Vector3;
  floorVisCamDir: THREE.Vector3;
};

export function createFpSessionFloorPlateVisibility(opts: FpSessionFloorPlateVisibilityOpts): {
  syncBuildingFloorPlateVisibility: (nowMs: number) => void;
  isInsideElevatorCabHudForJump: () => boolean;
  isApartmentFurnitureInteriorVisible: () => boolean;
} {
  const {
    camera,
    buildingRoot,
    buildingWorldBounds,
    maxBuildingLevel,
    storeyOpts,
    unitInteriorMeshes,
    apartmentFurnitureInteriorMeshes,
    fpElevators,
    stairShaftInteriorLightBounds,
    feetPos,
    floorVisCamWorld,
    floorVisCamDir,
  } = opts;

  let _lastBandLo = -999;
  let _lastBandHi = -999;
  let _lastStairBandLo = -999;
  let _lastStairBandHi = -999;
  let _lastStairDetailLo = -999;
  let _lastStairDetailHi = -999;
  let _visBandSmoothLo = -999;
  let _visBandSmoothHi = -999;
  /** Gate writes on `unitInteriorMeshes[*].visible` to state transitions only. */
  let _lastUnitInteriorVisible = true;
  let _lastApartmentFurnitureInteriorVisible = true;
  let _lastUnitInteriorMeshCount = -1;
  let _lastApartmentFurnitureInteriorMeshCount = -1;

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

  const setStairSegmentDetailVisible = (segment: THREE.Object3D, visible: boolean): void => {
    segment.traverse((obj) => {
      if (
        obj.name.startsWith("stairwell_prop_") ||
        obj.name === "stairwell_cigarette_litter"
      ) {
        obj.visible = visible;
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
    let band = fpElevators.getFloorVisibilityBand(
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
    const cameraOutsideBuilding = fpBuildingExteriorViewShouldRevealFullStack({
      cameraX: floorVisCamWorld.x,
      cameraZ: floorVisCamWorld.z,
      boundsMinX: buildingWorldBounds.min.x,
      boundsMaxX: buildingWorldBounds.max.x,
      boundsMinZ: buildingWorldBounds.min.z,
      boundsMaxZ: buildingWorldBounds.max.z,
    });
    if (cameraOutsideBuilding && (!feetOnBuildingSlab || playerStorey <= 1)) {
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
      pointInsideStairShaft(floorVisCamWorld.x, floorVisCamWorld.y, floorVisCamWorld.z);
    if (insideStairShaft) {
      const stairLocalBand = fpStairShaftLocalVisibilityBand({
        globalLo: band.lo,
        globalHi: band.hi,
        maxLevel: maxBuildingLevel,
        playerStorey,
      });
      band = stairLocalBand;
    }

    const targetBandLo = band.lo;
    const targetBandHi = band.hi;
    if (_visBandSmoothLo < 0) {
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
    const unitInteriorVisibilityChanged =
      unitInteriorVisible !== _lastUnitInteriorVisible ||
      unitInteriorMeshes.length !== _lastUnitInteriorMeshCount;
    if (unitInteriorVisibilityChanged) {
      _lastUnitInteriorVisible = unitInteriorVisible;
      _lastUnitInteriorMeshCount = unitInteriorMeshes.length;
      for (let i = 0; i < unitInteriorMeshes.length; i++) {
        unitInteriorMeshes[i]!.visible = unitInteriorVisible;
      }
    }

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
    const apartmentFurnitureInteriorVisibilityChanged =
      apartmentFurnitureInteriorVisible !== _lastApartmentFurnitureInteriorVisible ||
      apartmentFurnitureInteriorMeshes.length !== _lastApartmentFurnitureInteriorMeshCount;
    if (apartmentFurnitureInteriorVisibilityChanged) {
      _lastApartmentFurnitureInteriorVisible = apartmentFurnitureInteriorVisible;
      _lastApartmentFurnitureInteriorMeshCount = apartmentFurnitureInteriorMeshes.length;
      for (let i = 0; i < apartmentFurnitureInteriorMeshes.length; i++) {
        apartmentFurnitureInteriorMeshes[i]!.visible = apartmentFurnitureInteriorVisible;
      }
    }

    const lo = _visBandSmoothLo;
    const hi = _visBandSmoothHi;
    const stairBand = fpStairColumnPlateVisibilityBand({
      globalLo: lo,
      globalHi: hi,
      maxLevel: maxBuildingLevel,
      playerStorey,
    });
    const stairDetailBand = {
      lo: Math.max(1, playerStorey - STAIR_SHAFT_DETAIL_STOREYS_BELOW_PLAYER),
      hi: Math.min(maxBuildingLevel, playerStorey + STAIR_SHAFT_DETAIL_STOREYS_ABOVE_PLAYER),
    };
    if (
      lo === _lastBandLo &&
      hi === _lastBandHi &&
      lo === targetBandLo &&
      hi === targetBandHi &&
      stairBand.lo === _lastStairBandLo &&
      stairBand.hi === _lastStairBandHi &&
      stairDetailBand.lo === _lastStairDetailLo &&
      stairDetailBand.hi === _lastStairDetailHi &&
      !unitInteriorVisibilityChanged &&
      !apartmentFurnitureInteriorVisibilityChanged
    ) {
      return;
    }
    _lastBandLo = lo;
    _lastBandHi = hi;
    _lastStairBandLo = stairBand.lo;
    _lastStairBandHi = stairBand.hi;
    _lastStairDetailLo = stairDetailBand.lo;
    _lastStairDetailHi = stairDetailBand.hi;
    for (const ch of buildingRoot.children) {
      if (ch.userData.mammothStairColumnRoot === true) {
        ch.visible = true;
        for (const sub of (ch as THREE.Group).children) {
          const li = sub.userData.mammothPlateLevelIndex;
          if (typeof li === "number") {
            sub.visible = li >= stairBand.lo && li <= stairBand.hi;
            setStairSegmentDetailVisible(
              sub,
              li >= stairDetailBand.lo && li <= stairDetailBand.hi,
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
    isApartmentFurnitureInteriorVisible: () => _lastApartmentFurnitureInteriorVisible,
  };
}
