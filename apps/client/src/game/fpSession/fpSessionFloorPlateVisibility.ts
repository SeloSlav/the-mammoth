import * as THREE from "three";
import {
  fpBuildingExteriorViewShouldRevealFullStack,
  fpCameraOrFeetInsideBuildingFootprintXZ,
  fpCameraOrFeetNearBuildingFootprintXZ,
} from "../fpFloor/fpBuildingFloorPlateVisibilityBand.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorld.js";

/**
 * Mirrors {@link mountFpSession}’s interior-shell hide margin: keep plaster visible for doorway
 * peeks and sidewalk leans; only hide when camera **and** feet are comfortably past the slab edge.
 */
const FP_INTERIOR_SHELL_NEAR_MARGIN_M = 20;

/**
 * Cached applied floor-band (after smoothing). Raw target can jump from full-stack → interior in
 * one frame when leaving the hoistway; stepping the band spreads `.visible` toggles across frames.
 *
 * Narrowing hides plates — keep slow to avoid shader/GC spikes when dropping full-stack reveals.
 */
const VIS_BAND_NARROW_STOREYS_PER_FRAME = 1;
/** Widening shows plates — slightly faster so shaft views fill in promptly. */
const VIS_BAND_EXPAND_STOREYS_PER_FRAME = 3;

export type FpSessionFloorPlateVisibilityOpts = {
  camera: THREE.PerspectiveCamera;
  buildingRoot: THREE.Group;
  buildingWorldBounds: THREE.Box3;
  maxBuildingLevel: number;
  unitInteriorMeshes: readonly THREE.Mesh[];
  fpElevators: Pick<
    MountFpElevatorWorldResult,
    "getCabOccludedViewStorey" | "getFloorVisibilityBand" | "isInsideAnyCabHud"
  >;
  /** Predicted feet position — same reference as session `pos`. */
  feetPos: THREE.Vector3;
  /** Writable scratch filled each visibility pass; shared with downstream frame logic. */
  floorVisCamWorld: THREE.Vector3;
  floorVisCamDir: THREE.Vector3;
};

export function createFpSessionFloorPlateVisibility(opts: FpSessionFloorPlateVisibilityOpts): {
  syncBuildingFloorPlateVisibility: (nowMs: number) => void;
  isInsideElevatorCabHudForJump: () => boolean;
} {
  const {
    camera,
    buildingRoot,
    buildingWorldBounds,
    maxBuildingLevel,
    unitInteriorMeshes,
    fpElevators,
    feetPos,
    floorVisCamWorld,
    floorVisCamDir,
  } = opts;

  let _lastBandLo = -999;
  let _lastBandHi = -999;
  let _visBandSmoothLo = -999;
  let _visBandSmoothHi = -999;
  /** Gate writes on `unitInteriorMeshes[*].visible` to state transitions only. */
  let _lastUnitInteriorVisible = true;

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
    if (!feetOnBuildingSlab) {
      const cameraOutsideBuilding = fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: floorVisCamWorld.x,
        cameraZ: floorVisCamWorld.z,
        boundsMinX: buildingWorldBounds.min.x,
        boundsMaxX: buildingWorldBounds.max.x,
        boundsMinZ: buildingWorldBounds.min.z,
        boundsMaxZ: buildingWorldBounds.max.z,
      });
      if (cameraOutsideBuilding) {
        band = { lo: 1, hi: maxBuildingLevel };
      }
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
     * Hide tagged interior shells whenever camera **and** feet are clearly outside the footprint
     * (both farther than {@link FP_INTERIOR_SHELL_NEAR_MARGIN_M} past the raw edge). From there,
     * opaque cladding + window tint occlude every interior fragment, so rendering ~1M interior
     * triangles every frame is pure fill-rate waste. Inside the margin (doorways, sidewalk peek,
     * rooftop lean) we submit everything and let the depth test sort it out.
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
    if (unitInteriorVisible !== _lastUnitInteriorVisible) {
      _lastUnitInteriorVisible = unitInteriorVisible;
      for (let i = 0; i < unitInteriorMeshes.length; i++) {
        unitInteriorMeshes[i]!.visible = unitInteriorVisible;
      }
    }

    if (
      _visBandSmoothLo === _lastBandLo &&
      _visBandSmoothHi === _lastBandHi &&
      _visBandSmoothLo === targetBandLo &&
      _visBandSmoothHi === targetBandHi
    ) {
      return;
    }
    _lastBandLo = _visBandSmoothLo;
    _lastBandHi = _visBandSmoothHi;
    const lo = _visBandSmoothLo;
    const hi = _visBandSmoothHi;
    for (const ch of buildingRoot.children) {
      if (ch.userData.mammothStairColumnRoot === true) {
        ch.visible = true;
        for (const sub of (ch as THREE.Group).children) {
          const li = sub.userData.mammothPlateLevelIndex;
          if (typeof li === "number") {
            sub.visible = li >= lo && li <= hi;
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

  return { syncBuildingFloorPlateVisibility, isInsideElevatorCabHudForJump };
}
