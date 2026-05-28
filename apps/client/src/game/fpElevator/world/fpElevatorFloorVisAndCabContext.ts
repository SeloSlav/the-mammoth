import { estimateStoreyFromFeetY, type ElevatorShaftLayout } from "@the-mammoth/world";
import type { ElevatorCar } from "../../../module_bindings/types";
import {
  fpBuildingExteriorViewShouldRevealFullStack,
  fpBuildingFloorPlateVisibilityBand,
} from "../../fpFloor/fpBuildingFloorPlateVisibilityBand.js";
import { ELEVATOR_PHASE_MOVING } from "../fpElevatorConstants.js";
import {
  fpElevBlocksHoistwayFullStackRevealPlateLocal,
  fpElevCarPanelDoorwayViewLocal,
  fpElevFeetInHoistwayColumnForFloorStack,
  fpElevatorHudCarContainsLocalPoint,
  fpElevatorRiderSnapContainsLocalPoint,
} from "../fpElevatorVolumes.js";
import type { FpElevatorShaftVisual } from "../fpElevatorShaftVisual.js";
import {
  DOOR_OPEN_REVEAL_THRESHOLD,
  fpElevDoorwayViewFacingDoor,
} from "./fpElevatorMountVisualAuthoring.js";
import type {
  FpElevatorFloorVisibilityBand,
  FpElevatorRideDebugSnapshot,
} from "../fpElevatorWorldTypes.js";
import type { FpActiveFloorPlateBand } from "../../fpSession/fpSessionActiveFloorVisBand.js";

export type FpElevatorFloorVisCabClock = {
  estimatedOffsetMs(): number;
  hasEstimate(): boolean;
};

export type CreateFpElevatorFloorVisCabContextOpts = {
  buildingWorldOriginX: number;
  buildingWorldOriginY: number;
  buildingWorldOriginZ: number;
  maxLevel: number;
  floorSpacingM: number;
  storeyOpts: {
    buildingWorldOriginY: number;
    floorSpacingM: number;
    maxLevel: number;
  };
  floorVisPitchLookaheadWorldBoundsXz?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  visuals: ReadonlyMap<string, FpElevatorShaftVisual>;
  latest: ReadonlyMap<string, ElevatorCar>;
  getCabY: (key: string, evalWallClockMs?: number) => number;
  getDoor: (key: string, nowMs: number) => number;
  getCabVerticalVelocityMps: (key: string, nowMs: number) => number;
  serverClock: FpElevatorFloorVisCabClock;
  elapsedSecSinceServerSample: (row: ElevatorCar, evalWallClockMs: number) => number;
  getRideClockOffsetMs: (row: ElevatorCar) => number;
  cabFloorButtonDisplayLevel: (
    layout: ElevatorShaftLayout,
    cabFeetWorldY: number,
  ) => number;
  /** Smoothed band from {@link createFpSessionFloorPlateVisibility} — landing hail + door instances. */
  getSmoothedFloorPlateBand?: () => FpActiveFloorPlateBand;
};

export type FpElevatorFloorVisCabContext = ReturnType<
  typeof createFpElevatorFloorVisAndCabContext
>;

export function createFpElevatorFloorVisAndCabContext(
  opts: CreateFpElevatorFloorVisCabContextOpts,
) {
  const {
    buildingWorldOriginX: ox,
    buildingWorldOriginY: oy,
    buildingWorldOriginZ: oz,
    maxLevel,
    floorSpacingM,
    storeyOpts,
    floorVisPitchLookaheadWorldBoundsXz,
    visuals,
    latest,
    getCabY,
    getDoor,
    getCabVerticalVelocityMps,
    serverClock,
    elapsedSecSinceServerSample,
    getRideClockOffsetMs,
    cabFloorButtonDisplayLevel,
  } = opts;

  const isInsideCarHud = (
    px: number,
    py: number,
    pz: number,
    key: string,
  ): boolean => {
    const row = latest.get(key);
    const vis = visuals.get(key);
    if (!row || !vis) return false;
    const lx = px - (ox + row.plateX);
    const lz = pz - (oz + row.plateZ);
    const cabY = getCabY(key);
    if (!Number.isFinite(cabY)) return false;
    return fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabY, vis.inner);
  };

  const hasCabDoorwaySightline = (
    key: string,
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): boolean => {
    const row = latest.get(key);
    const vis = visuals.get(key);
    if (!row || !vis) return false;
    const cabY = getCabY(key);
    if (!Number.isFinite(cabY)) return false;
    const doorOpen = getDoor(key, nowMs);
    if (doorOpen <= DOOR_OPEN_REVEAL_THRESHOLD) return false;
    const sightX = eyeWorldX ?? px;
    const sightY = eyeWorldY ?? py;
    const sightZ = eyeWorldZ ?? pz;
    const lx = sightX - (ox + row.plateX);
    const lz = sightZ - (oz + row.plateZ);
    if (
      !fpElevCarPanelDoorwayViewLocal(
        vis.layout.doorFace,
        lx,
        lz,
        sightY,
        cabY,
        vis.inner,
      )
    ) {
      return false;
    }
    if (viewDirX === undefined || viewDirZ === undefined) return true;
    return fpElevDoorwayViewFacingDoor(vis.layout.doorFace, viewDirX, viewDirZ);
  };

  const getFloorVisibilityBand = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    bandEyeWorldY?: number,
    bandViewDirY?: number,
    bandEyeWorldX?: number,
    bandEyeWorldZ?: number,
    bandViewDirX?: number,
    bandViewDirZ?: number,
  ): FpElevatorFloorVisibilityBand => {
    const sFeet = estimateStoreyFromFeetY(py, storeyOpts);
    const sEye =
      bandEyeWorldY === undefined
        ? sFeet
        : estimateStoreyFromFeetY(bandEyeWorldY, storeyOpts);
    const playerStorey = Math.max(sFeet, sEye);
    const gatingCamX = bandEyeWorldX ?? px;
    const gatingCamZ = bandEyeWorldZ ?? pz;
    const b = floorVisPitchLookaheadWorldBoundsXz;
    const suppressPitchLookahead =
      b != null &&
      !fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: gatingCamX,
        cameraZ: gatingCamZ,
        boundsMinX: b.minX,
        boundsMaxX: b.maxX,
        boundsMinZ: b.minZ,
        boundsMaxZ: b.maxZ,
      });
    const upperLookAheadStorey =
      bandEyeWorldY === undefined || suppressPitchLookahead
        ? undefined
        : estimateStoreyFromFeetY(
            bandEyeWorldY + Math.max(0, bandViewDirY ?? 0) * floorSpacingM * 20,
            storeyOpts,
          );
    const lowerLookAheadStorey =
      bandEyeWorldY === undefined || suppressPitchLookahead
        ? undefined
        : estimateStoreyFromFeetY(
            bandEyeWorldY + Math.min(0, bandViewDirY ?? 0) * floorSpacingM * 20,
            storeyOpts,
          );
    let elevatorHoistwayPlateBoost = false;
    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      if (!row) continue;
      const cabY = getCabY(key);
      if (!Number.isFinite(cabY)) continue;
      const hoistwayProbe = (wx: number, wy: number, wz: number) =>
        fpElevFeetInHoistwayColumnForFloorStack(wx, wy, wz, {
          buildingWorldOriginX: ox,
          buildingWorldOriginY: oy,
          buildingWorldOriginZ: oz,
          floorSpacingM,
          maxLevel,
          layout: vis.layout,
        });
      const feetInColumn = hoistwayProbe(px, py, pz);
      const eyeInColumn =
        bandEyeWorldY !== undefined &&
        bandEyeWorldX !== undefined &&
        bandEyeWorldZ !== undefined &&
        hoistwayProbe(bandEyeWorldX, bandEyeWorldY, bandEyeWorldZ);
      /** HUD “inside cab” includes roof deck; exclude roof so hoistway stacks stay visible there. */
      const lxFeet = px - (ox + row.plateX);
      const lzFeet = pz - (oz + row.plateZ);
      const feetBlockHoistReveal = fpElevBlocksHoistwayFullStackRevealPlateLocal(
        lxFeet,
        lzFeet,
        py,
        cabY,
        vis.inner,
      );
      const eyeBlockHoistReveal =
        bandEyeWorldY !== undefined &&
        bandEyeWorldX !== undefined &&
        bandEyeWorldZ !== undefined &&
        fpElevBlocksHoistwayFullStackRevealPlateLocal(
          bandEyeWorldX - (ox + row.plateX),
          bandEyeWorldZ - (oz + row.plateZ),
          bandEyeWorldY,
          cabY,
          vis.inner,
        );
      /**
       * Full vertical plate stack whenever feet or eye are inside the hoistway column but not in the
       * cab chamber. Door openness is irrelevant here — closed landing doors still leave the player
       * inside the physical shaft (pit, counterweight zone, roof access). Corridor positions fail
       * the narrow column test.
       */
      if (
        (feetInColumn || eyeInColumn) &&
        !feetBlockHoistReveal &&
        !eyeBlockHoistReveal
      ) {
        elevatorHoistwayPlateBoost = true;
        break;
      }
    }
    const { lo, hi } = fpBuildingFloorPlateVisibilityBand({
      maxLevel,
      playerStorey,
      revealFullStack: false,
      elevatorHoistwayPlateBoost,
      upperTargetStorey: upperLookAheadStorey,
      lowerTargetStorey: lowerLookAheadStorey,
    });
    return { lo, hi, hoistwayPlateBoost: elevatorHoistwayPlateBoost };
  };

  /**
   * True when the player is inside the HUD volume of any cab and the current view is fully occluded
   * by cab walls. This covers both a literally sealed cab and the common "door is open but the
   * camera is turned toward a side/back wall" case that was still submitting the whole building.
   */
  const isInsideCabOccludedView = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): boolean => {
    for (const key of visuals.keys()) {
      const insideFeet = isInsideCarHud(px, py, pz, key);
      const insideEye =
        eyeWorldX !== undefined &&
        eyeWorldY !== undefined &&
        eyeWorldZ !== undefined &&
        isInsideCarHud(eyeWorldX, eyeWorldY, eyeWorldZ, key);
      if (!insideFeet && !insideEye) continue;
      if (
        !hasCabDoorwaySightline(
          key,
          px,
          py,
          pz,
          nowMs,
          eyeWorldX,
          eyeWorldY,
          eyeWorldZ,
          viewDirX,
          viewDirZ,
        )
      ) {
        return true;
      }
    }
    return false;
  };

  const isInsideAnyCabHud = (
    px: number,
    py: number,
    pz: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
  ): boolean => {
    for (const key of visuals.keys()) {
      if (isInsideCarHud(px, py, pz, key)) return true;
      if (
        eyeWorldX !== undefined &&
        eyeWorldY !== undefined &&
        eyeWorldZ !== undefined &&
        isInsideCarHud(eyeWorldX, eyeWorldY, eyeWorldZ, key)
      ) {
        return true;
      }
    }
    return false;
  };

  const getCabOccludedViewStorey = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): number | null => {
    for (const [key, vis] of visuals) {
      const insideFeet = isInsideCarHud(px, py, pz, key);
      const insideEye =
        eyeWorldX !== undefined &&
        eyeWorldY !== undefined &&
        eyeWorldZ !== undefined &&
        isInsideCarHud(eyeWorldX, eyeWorldY, eyeWorldZ, key);
      if (!insideFeet && !insideEye) continue;
      if (
        hasCabDoorwaySightline(
          key,
          px,
          py,
          pz,
          nowMs,
          eyeWorldX,
          eyeWorldY,
          eyeWorldZ,
          viewDirX,
          viewDirZ,
        )
      ) {
        continue;
      }
      const row = latest.get(key);
      if (row) {
        if (row.phase === ELEVATOR_PHASE_MOVING) {
          /**
           * While the cab fully occludes the world, the rider cannot see intermediate landings. Pin
           * the hidden world band to the trip target instead of the continuously changing predicted
           * cab Y; otherwise every storey crossing churns `visible` flags across the building root.
           */
          return Math.max(
            1,
            Math.min(
              maxLevel,
              Number(row.moveToLevel ?? row.currentLevel ?? 1),
            ),
          );
        }
        return Math.max(1, Math.min(maxLevel, Number(row.currentLevel ?? 1)));
      }
      const cabFeetWorldY = getCabY(key, nowMs);
      if (Number.isFinite(cabFeetWorldY)) {
        return cabFloorButtonDisplayLevel(vis.layout, cabFeetWorldY);
      }
      return 1;
    }
    return null;
  };

  /**
   * Per-frame visibility hook for shaft visuals. While the current cab view is occluded by cab
   * walls, auxiliary landing UI / helper meshes on every shaft — hail panels and invisible pick
   * boxes — cannot contribute pixels, so skip them until the camera regains a real doorway
   * sightline. The visible corridor / landing door mesh is intentionally left on.
   */
  const syncShaftVisualCulling = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    insideResidentialUnit: boolean,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): void => {
    const landingsVisible =
      !insideResidentialUnit &&
      !isInsideCabOccludedView(
        px,
        py,
        pz,
        nowMs,
        eyeWorldX,
        eyeWorldY,
        eyeWorldZ,
        viewDirX,
        viewDirZ,
      );
    const band = opts.getSmoothedFloorPlateBand?.();
    for (const vis of visuals.values()) {
      // Apartment walls fully occlude corridor landing doors; keep them live only for exterior/cab views.
      vis.landingRoot.visible = !insideResidentialUnit;
      vis.setLandingsVisible(landingsVisible);
      if (band) {
        vis.syncLandingPlateBand(band, landingsVisible);
      }
    }
  };

  const sampleRideDebug = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    bandEyeWorldY?: number,
    bandViewDirY?: number,
  ): FpElevatorRideDebugSnapshot | null => {
    const eyeY = bandEyeWorldY ?? py;
    const vdy = bandViewDirY ?? 0;
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) continue;
      if (!isInsideCarHud(px, py, pz, key)) continue;
      const cabFeet = getCabY(key, nowMs);
      const cabVy = getCabVerticalVelocityMps(key, nowMs);
      const doorOpen = getDoor(key, nowMs);
      const elapsed =
        row.sampleServerMicros !== 0n
          ? elapsedSecSinceServerSample(row, nowMs)
          : 0;
      const band = getFloorVisibilityBand(px, py, pz, nowMs, eyeY, vdy);
      return {
        shaftKey: key,
        phase: row.phase,
        currentLevel: row.currentLevel,
        moveFromLevel: row.moveFromLevel,
        moveToLevel: row.moveToLevel,
        moveU: row.moveU,
        replicaCabFloorY: row.cabFloorY,
        cabFeetY: cabFeet,
        cabVyMps: cabVy,
        doorOpen01: doorOpen,
        elapsedSecSinceServerSample: elapsed,
        serverClockOffsetMs: serverClock.estimatedOffsetMs(),
        serverClockRideOffsetMs: getRideClockOffsetMs(row),
        clockHasEstimate: serverClock.hasEstimate(),
        floorVisBand: band,
      };
    }
    return null;
  };

  const getHudMovingCabVyMps = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
  ): number => {
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) continue;
      if (!isInsideCarHud(px, py, pz, key)) continue;
      return getCabVerticalVelocityMps(key, nowMs);
    }
    return 0;
  };

  const ignoreSmallPoseReconcileWhileMovingElevatorRider = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
  ): boolean => {
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) continue;
      const cabFeet = getCabY(key, nowMs);
      if (!Number.isFinite(cabFeet)) continue;
      const lx = px - (ox + row.plateX);
      const lz = pz - (oz + row.plateZ);
      const doorOpen = getDoor(key, nowMs);
      const insideRiderSnap = fpElevatorRiderSnapContainsLocalPoint(
        lx,
        lz,
        py,
        cabFeet,
        vis.inner,
        vis.layout.doorFace,
        doorOpen,
      );
      const insideClosedMovingCabHud =
        doorOpen <= DOOR_OPEN_REVEAL_THRESHOLD &&
        fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabFeet, vis.inner);
      if (insideRiderSnap || insideClosedMovingCabHud) {
        return true;
      }
    }
    return false;
  };

  return {
    isInsideCarHud,
    getFloorVisibilityBand,
    isInsideCabOccludedView,
    isInsideAnyCabHud,
    getCabOccludedViewStorey,
    syncShaftVisualCulling,
    sampleRideDebug,
    getHudMovingCabVyMps,
    ignoreSmallPoseReconcileWhileMovingElevatorRider,
  };
}
