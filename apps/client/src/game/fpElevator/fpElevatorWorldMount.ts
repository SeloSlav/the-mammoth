import * as THREE from "three";
import {
  buildFloorShortLabelMap,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  EXTERIOR_DOOR_ANIM_SPEED,
  listElevatorShaftLayouts,
  maxBuildingLevelIndex,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type {
  ElevatorCar,
  ElevatorLandingDoor,
} from "../../module_bindings/types";
import {
  DOOR_SWING_OPEN01_VIS_SMOOTH_PER_S,
  ELEVATOR_MOVE_SPEED_MPS,
  ELEVATOR_PHASE_MOVING,
} from "./fpElevatorConstants.js";
import type { FpElevCabMotionAudioEmitter } from "../audio/elevatorCabMotionAudio.js";
import {
  predictMovingCabFeetWorldY,
  predictMovingCabFeetWorldYVelocityMps,
} from "./fpElevatorCabPredict.js";
import {
  nextElevatorCarReplicaSample,
  pruneElevatorCarReplicaHistory,
  selectElevatorCarReplicaSample,
  type FpElevatorCarReplicaSample,
} from "./fpElevatorReplicaHistory.js";
import { createFpElevatorServerClock } from "./fpElevatorServerClock.js";
import { FpElevatorShaftVisual } from "./fpElevatorShaftVisual.js";
import {
  fpElevCarPanelDoorwayViewLocal,
  fpElevFloorPickMeshesShouldShow,
  fpElevatorHudCarContainsLocalPoint,
} from "./fpElevatorVolumes.js";
import type {
  MountFpElevatorWorldOpts,
  MountFpElevatorWorldResult,
} from "./fpElevatorWorldTypes.js";
import {
  elevatorVisualAuthoring,
  EXTERIOR_INTERACT_SHAFT_CENTER_PAD_M,
  LANDING_HAIL_PICK_SHAFT_CENTER_PAD_M,
} from "./world/fpElevatorMountVisualAuthoring.js";
import { createFpElevatorHailAndFloorPickRaycasts } from "./world/fpElevatorHailAndFloorPickRaycasts.js";
import { createFpElevatorFloorVisAndCabContext } from "./world/fpElevatorFloorVisAndCabContext.js";
import { createFpElevatorExteriorDoorInteract } from "./world/fpElevatorExteriorDoorInteract.js";
import { createFpElevatorKinematicCollision } from "./world/fpElevatorKinematicCollision.js";
import {
  shouldRunElevatorShaftHeavyTick,
  type FpActiveFloorPlateBand,
} from "../fpSession/fpSessionActiveFloorVisBand.js";

const _noopFloorBand = (): FpActiveFloorPlateBand => ({ lo: 1, hi: 99 });

export function mountFpElevatorWorld(
  opts: MountFpElevatorWorldOpts,
): MountFpElevatorWorldResult {
  const floorSpacingM = opts.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const floorVisPitchLookaheadWorldBoundsXz =
    opts.floorVisPitchLookaheadWorldBoundsXz;
  const ox = opts.building.worldOrigin?.[0] ?? 0;
  const oy = opts.building.worldOrigin?.[1] ?? 0;
  const oz = opts.building.worldOrigin?.[2] ?? 0;
  const maxLevel = maxBuildingLevelIndex(opts.building);
  const floorLabelByLevel = buildFloorShortLabelMap(opts.building);
  const layouts = listElevatorShaftLayouts(opts.building, opts.getFloorDoc);
  const layoutByKey = new Map(layouts.map((l) => [l.planKey, l] as const));
  const shaftSpatialByKey = new Map(
    layouts.map((layout) => {
      const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(
        layout.sx,
        layout.sz,
      );
      const halfSpan = Math.max(hx, hz);
      return [
        layout.planKey,
        {
          exteriorInteractMaxCenterDistSq:
            (halfSpan + EXTERIOR_INTERACT_SHAFT_CENTER_PAD_M) ** 2,
          hailPickMaxCenterDistSq:
            (halfSpan + LANDING_HAIL_PICK_SHAFT_CENTER_PAD_M) ** 2,
        },
      ] as const;
    }),
  );
  const storeyOpts = {
    buildingWorldOriginY: oy,
    floorSpacingM,
    maxLevel,
  };
  const visuals = new Map<string, FpElevatorShaftVisual>();
  for (const layout of layouts) {
    const v = new FpElevatorShaftVisual(
      layout,
      [ox, oy, oz],
      {
        shaftKey: layout.planKey,
        maxLevel,
        floorLabelByLevel,
        floorSpacingM,
        buildingWorldOriginY: oy,
      },
      elevatorVisualAuthoring,
    );
    visuals.set(layout.planKey, v);
    opts.buildingRoot.add(v.root);
  }
  const raycaster = new THREE.Raycaster();
  const screenCenterNdc = new THREE.Vector2(0, 0);
  /** Brief glow on the button that accepted a floor request (client-only). */
  const pickFlash = { shaftKey: "", level: 0, untilMs: 0 };
  /** Brief glow on the landing hail mesh that accepted a hail (client-only). */
  const hailPickFlash = { shaftKey: "", level: 0, untilMs: 0 };
  const latest = new Map<string, ElevatorCar>();
  const landingByRowKey = new Map<string, ElevatorLandingDoor>();
  /** Short local history so reconcile can replay against the cab state that existed for each input. */
  const replicaHistoryByKey = new Map<string, FpElevatorCarReplicaSample[]>();
  /** Cab `doorOpen01` smooth chase toward replica (cab motion is server state-machine driven). */
  const cabDoorOpenSmoothed = new Map<string, number>();
  /**
   * Landing corridor swing: client-integrated toward `desiredOpen` at {@link EXTERIOR_DOOR_ANIM_SPEED}
   * (same rate as server physics) so the leaf is smooth at frame rate instead of 20 Hz replica steps.
   */
  const landingSwingVisual = new Map<string, number>();
  /** Evaluation time for cab Y this frame (set in {@link syncCabEvalClock} before locomotion). */
  let cabEvalNowMs = performance.now();
  /**
   * When true, MOVING cabs use smoothed move-u toward the replica-predicted target (reduces 20 Hz row hitches).
   * False during reconcile replay (`syncCabEvalClock` without `frameDtSec`).
   */
  let cabEvalUseSmoothedMoveU = false;
  const performanceEpochOriginMs =
    typeof performance.timeOrigin === "number"
      ? performance.timeOrigin
      : Date.now() - performance.now();
  /**
   * Tracks the apparent client↔server wall-clock offset so cab prediction elapsed-time is
   * measured on the server's timeline instead of the client's.  A fixed 100–500 ms clock skew
   * (NTP drift, `performance.timeOrigin` quantisation, OS clock adjustments) would otherwise bake
   * a constant prediction offset into every frame — which the reconcile pass then paints over as
   * per-tick corrections, i.e. the residual hitch during rides.
   */
  const serverClock = createFpElevatorServerClock();
  /** Pre-allocated map reused each tick to pass swing values to per-shaft visuals — no allocation per shaft per frame. */
  const _swingByLevel = new Map<number, number>();
  /**
   * MOVING cab: store combined `move_u` = `row.move_u + elapsed/need` (same timeline as authority).
   * Per-frame integration + a tight `(TICK_DT/need)` lead cap fought long legs (tiny cap → sawtooth,
   * cab vs `cab_floor_y` mismatch → camera hitch).
   */
  const cabIntegrateUByKey = new Map<string, number>();
  const cabMoveLegByKey = new Map<string, string>();
  /**
   * Per moving leg, hold the smallest client-server clock offset seen so far (still used for
   * reconcile replay + non-smoothed paths that advance from raw `move_u` + elapsed).
   */
  const cabRideClockOffsetFloorMsByKey = new Map<string, number>();
  const advanceCabDoorOpenVisual = (dtSec: number) => {
    if (!(dtSec > 0)) return;
    const k = DOOR_SWING_OPEN01_VIS_SMOOTH_PER_S;
    const alpha = 1 - Math.exp(-k * dtSec);
    for (const [key, row] of latest) {
      const t = row.doorOpen01;
      const p = cabDoorOpenSmoothed.get(key) ?? t;
      cabDoorOpenSmoothed.set(key, p + (t - p) * alpha);
    }
  };
  const advanceLandingSwingClientVisual = (dtSec: number) => {
    if (!(dtSec > 0)) return;
    const maxStep = EXTERIOR_DOOR_ANIM_SPEED * dtSec;
    for (const [rk, row] of landingByRowKey) {
      const goal = (row.desiredOpen ?? 0) !== 0 ? 1 : 0;
      let v = landingSwingVisual.get(rk) ?? row.swingOpen01;
      if (v < goal - 1e-5) v = Math.min(goal, v + maxStep);
      else if (v > goal + 1e-5) v = Math.max(goal, v - maxStep);
      else v = goal;
      landingSwingVisual.set(rk, v);
    }
  };
  const feetYForLayout = (layout: ElevatorShaftLayout, level: number): number =>
    elevatorSupportFeetWorldY({
      buildingWorldOriginY: oy,
      levelIndex: Math.max(1, Math.min(maxLevel, level)),
      floorSpacingM,
      shaftPlateLocalY: layout.plateLocalY,
      shaftSy: layout.sy,
    });
  /** Which floor button to light in the cab from world cab feet Y (smooth while traveling). */
  const cabFloorButtonDisplayLevel = (
    layout: ElevatorShaftLayout,
    cabFeetWorldY: number,
  ): number => {
    const y1 = feetYForLayout(layout, 1);
    const y2 = feetYForLayout(layout, 2);
    const delta = y2 - y1;
    if (!(delta > 1e-6)) return 1;
    const frac = 1 + (cabFeetWorldY - y1) / delta;
    return Math.max(1, Math.min(maxLevel, Math.round(frac)));
  };
  const ingest = (row: ElevatorCar) => {
    const history = replicaHistoryByKey.get(row.shaftKey) ?? [];
    const prev = history[history.length - 1];
    const now = performance.now();
    const nowEpochMs = performanceEpochOriginMs + now;
    const sampleServerEpochMs = Number(row.sampleServerMicros) / 1000;
    if (sampleServerEpochMs > 0) {
      serverClock.observe(nowEpochMs, sampleServerEpochMs);
    }
    history.push(nextElevatorCarReplicaSample(prev, row, now));
    pruneElevatorCarReplicaHistory(history, now);
    replicaHistoryByKey.set(row.shaftKey, history);
    latest.set(row.shaftKey, row);
    if (!cabDoorOpenSmoothed.has(row.shaftKey)) {
      cabDoorOpenSmoothed.set(row.shaftKey, row.doorOpen01);
    }
  };
  for (const row of opts.conn.db.elevator_car) {
    ingest(row as ElevatorCar);
  }
  const ingestLanding = (row: ElevatorLandingDoor) => {
    landingByRowKey.set(row.rowKey, row);
    if (!landingSwingVisual.has(row.rowKey)) {
      landingSwingVisual.set(row.rowKey, row.swingOpen01);
    }
  };
  for (const row of opts.conn.db.elevator_landing_door) {
    ingestLanding(row as ElevatorLandingDoor);
  }
  const onElevRow = (_ctx: unknown, row: ElevatorCar) => {
    ingest(row);
  };
  opts.conn.db.elevator_car.onInsert(onElevRow);
  opts.conn.db.elevator_car.onUpdate(onElevRow);
  const onLandingInsert = (_ctx: unknown, row: ElevatorLandingDoor) => {
    ingestLanding(row);
  };
  const onLandingUpdate = (
    _ctx: unknown,
    _old: ElevatorLandingDoor,
    row: ElevatorLandingDoor,
  ) => {
    ingestLanding(row);
  };
  const onLandingDelete = (_ctx: unknown, row: ElevatorLandingDoor) => {
    landingByRowKey.delete(row.rowKey);
    landingSwingVisual.delete(row.rowKey);
  };
  opts.conn.db.elevator_landing_door.onInsert(onLandingInsert);
  opts.conn.db.elevator_landing_door.onUpdate(onLandingUpdate);
  opts.conn.db.elevator_landing_door.onDelete(onLandingDelete);
  const getReplicaSample = (
    key: string,
    evalWallClockMs?: number,
  ): FpElevatorCarReplicaSample | null => {
    const history = replicaHistoryByKey.get(key);
    if (!history || history.length === 0) return null;
    if (evalWallClockMs === undefined)
      return history[history.length - 1] ?? null;
    return selectElevatorCarReplicaSample(history, evalWallClockMs);
  };
  const evalEpochMs = (wallClockMs: number): number =>
    performanceEpochOriginMs + wallClockMs;
  const getRideClockOffsetMs = (row: ElevatorCar): number => {
    const estimatedOffsetMs = serverClock.estimatedOffsetMs();
    if (row.phase !== ELEVATOR_PHASE_MOVING) return estimatedOffsetMs;
    const floorOffsetMs = cabRideClockOffsetFloorMsByKey.get(row.shaftKey);
    if (floorOffsetMs === undefined) return estimatedOffsetMs;
    return Math.min(estimatedOffsetMs, floorOffsetMs);
  };
  /**
   * Elapsed seconds from the server-stamp time of `row` to the server-side moment corresponding
   * to `evalWallClockMs` on the client — using the estimated clock offset so prediction tracks
   * the server's physics clock rather than the raw browser wall clock.
   */
  const elapsedSecSinceServerSample = (
    row: ElevatorCar,
    evalWallClockMs: number,
  ): number => {
    if (row.sampleServerMicros === 0n) return 0;
    const serverNowEpochMs =
      evalEpochMs(evalWallClockMs) - getRideClockOffsetMs(row);
    const sampleServerEpochMs = Number(row.sampleServerMicros) / 1000;
    return Math.max(0, (serverNowEpochMs - sampleServerEpochMs) * 0.001);
  };
  const advanceCabSmoothU = (nowMs: number) => {
    const speed = ELEVATOR_MOVE_SPEED_MPS;
    for (const key of latest.keys()) {
      const sample = getReplicaSample(key, nowMs);
      const row = sample?.row ?? latest.get(key);
      const layout = layoutByKey.get(key);
      if (!row || !layout) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) {
        cabIntegrateUByKey.delete(key);
        cabMoveLegByKey.delete(key);
        cabRideClockOffsetFloorMsByKey.delete(key);
        continue;
      }
      const leg = `${row.moveFromLevel}:${row.moveToLevel}`;
      const legChanged = cabMoveLegByKey.get(key) !== leg;
      if (legChanged) {
        cabMoveLegByKey.set(key, leg);
        cabRideClockOffsetFloorMsByKey.set(
          key,
          serverClock.estimatedOffsetMs(),
        );
      }
      const y0 = feetYForLayout(layout, row.moveFromLevel);
      const y1 = feetYForLayout(layout, row.moveToLevel);
      const dist = Math.abs(y1 - y0);
      const need = Math.max(1e-4, dist / Math.max(0.08, speed));
      const elapsed = elapsedSecSinceServerSample(row, nowMs);
      const uComb = Math.min(1, row.moveU + elapsed / need);
      cabIntegrateUByKey.set(key, uComb);
    }
    for (const key of cabIntegrateUByKey.keys()) {
      if (!latest.has(key)) {
        cabIntegrateUByKey.delete(key);
        cabMoveLegByKey.delete(key);
        cabRideClockOffsetFloorMsByKey.delete(key);
      }
    }
  };
  const getCabY = (key: string, evalWallClockMs?: number): number => {
    const sample = getReplicaSample(key, evalWallClockMs ?? cabEvalNowMs);
    const row = sample?.row;
    if (!row) return Number.NaN;
    if (row.phase !== ELEVATOR_PHASE_MOVING) {
      return row.cabFloorY;
    }
    const layout = layoutByKey.get(key);
    if (!layout) return row.cabFloorY;
    const tEval = evalWallClockMs ?? cabEvalNowMs;
    const uLive = cabIntegrateUByKey.get(key);
    if (cabEvalUseSmoothedMoveU && uLive !== undefined) {
      return predictMovingCabFeetWorldY({
        moveFromLevel: row.moveFromLevel,
        moveToLevel: row.moveToLevel,
        moveUAtReplica: uLive,
        elapsedSecSinceReplica: 0,
        feetYForLevel: (lv) => feetYForLayout(layout, lv),
      });
    }
    return predictMovingCabFeetWorldY({
      moveFromLevel: row.moveFromLevel,
      moveToLevel: row.moveToLevel,
      moveUAtReplica: row.moveU,
      elapsedSecSinceReplica: elapsedSecSinceServerSample(row, tEval),
      feetYForLevel: (lv) => feetYForLayout(layout, lv),
    });
  };
  const getCabVerticalVelocityMps = (
    key: string,
    evalWallClockMs?: number,
  ): number => {
    const sample = getReplicaSample(key, evalWallClockMs ?? cabEvalNowMs);
    const row = sample?.row;
    if (!row || row.phase !== ELEVATOR_PHASE_MOVING) return 0;
    const layout = layoutByKey.get(key);
    if (!layout) return 0;
    const tEval = evalWallClockMs ?? cabEvalNowMs;
    const uLive = cabIntegrateUByKey.get(key);
    if (cabEvalUseSmoothedMoveU && uLive !== undefined) {
      return predictMovingCabFeetWorldYVelocityMps({
        moveFromLevel: row.moveFromLevel,
        moveToLevel: row.moveToLevel,
        moveUAtReplica: uLive,
        elapsedSecSinceReplica: 0,
        feetYForLevel: (lv) => feetYForLayout(layout, lv),
      });
    }
    return predictMovingCabFeetWorldYVelocityMps({
      moveFromLevel: row.moveFromLevel,
      moveToLevel: row.moveToLevel,
      moveUAtReplica: row.moveU,
      elapsedSecSinceReplica: elapsedSecSinceServerSample(row, tEval),
      feetYForLevel: (lv) => feetYForLayout(layout, lv),
    });
  };
  const getDoor = (key: string, nowMs: number): number => {
    const latestSample = getReplicaSample(key);
    const evalSample = getReplicaSample(key, nowMs);
    if (!evalSample) return 1;
    if (!latestSample || evalSample !== latestSample) {
      return evalSample.row.doorOpen01;
    }
    return THREE.MathUtils.clamp(
      cabDoorOpenSmoothed.get(key) ?? evalSample.row.doorOpen01,
      0,
      1,
    );
  };
  const landingHailBlocksCorridorDoorRef: {
    fn: (camera: THREE.PerspectiveCamera, playerPos: THREE.Vector3) => boolean;
  } = {
    fn: () => false,
  };
  const {
    collectNearbyLandingHailPickRoots,
    flushPendingExteriorDoorToggle,
    consumeInteractKey: consumeExteriorDoorInteractKey,
    getExteriorDoorInteractPrompt,
  } = createFpElevatorExteriorDoorInteract({
    conn: opts.conn,
    landingHailBlocksCorridorDoor: (camera, playerPos) =>
      landingHailBlocksCorridorDoorRef.fn(camera, playerPos),
    buildingWorldOriginX: ox,
    buildingWorldOriginZ: oz,
    maxLevel,
    storeyOpts,
    floorLabelByLevel,
    visuals,
    latest,
    layoutByKey,
    shaftSpatialByKey,
    landingByRowKey,
    landingSwingVisual,
    getCabY,
    feetYForLayout,
  });

  const { visitCollisionAabbsInXZ, applyCabRoofFeetSnap, kinematicSupport } =
    createFpElevatorKinematicCollision({
      buildingWorldOriginX: ox,
      buildingWorldOriginZ: oz,
      maxLevel,
      latest,
      visuals,
      layoutByKey,
      landingByRowKey,
      landingSwingVisual,
      feetYForLayout,
      getCabY,
      getDoor,
      getCabVerticalVelocityMps,
      getCabEvalNowMs: () => cabEvalNowMs,
    });

  let getFloorPlateBand: () => FpActiveFloorPlateBand = _noopFloorBand;
  const elevVisCab = createFpElevatorFloorVisAndCabContext({
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
    getSmoothedFloorPlateBand: () => getFloorPlateBand(),
  });
  const {
    isInsideCarHud,
    getFloorVisibilityBand,
    isInsideCabOccludedView,
    isInsideAnyCabHud,
    isInsideAnyElevatorCabChamber,
    getCabOccludedViewStorey,
    syncShaftVisualCulling,
    sampleRideDebug,
    getHudMovingCabVyMps,
    ignoreSmallPoseReconcileWhileMovingElevatorRider,
  } = elevVisCab;
  const {
    syncLandingHailUi,
    tryRaycastFloorPick,
    getLandingHailInteractPrompt,
    consumeLandingHailInteractKey,
    isLandingHailTargetActive,
  } =
    createFpElevatorHailAndFloorPickRaycasts({
      raycaster,
      screenCenterNdc,
      conn: opts.conn,
      visuals,
      latest,
      layoutByKey,
      floorLabelByLevel,
      ox,
      oz,
      buildingWorldOriginY: oy,
      floorSpacingM,
      maxLevel,
      collectNearbyLandingHailPickRoots,
      feetYForLayout,
      getCabY,
      getDoor,
      hailPickFlash,
      pickFlash,
    });
  landingHailBlocksCorridorDoorRef.fn = isLandingHailTargetActive;

  const getCabMotionAudioEmitters = (
    nowMs: number,
  ): readonly FpElevCabMotionAudioEmitter[] => {
    const out: FpElevCabMotionAudioEmitter[] = [];
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) continue;
      const cabFeet = getCabY(key, nowMs);
      if (!Number.isFinite(cabFeet)) continue;
      const vy = getCabVerticalVelocityMps(key, nowMs);
      const innerH = vis.inner.innerH;
      out.push({
        shaftKey: key,
        worldX: ox + row.plateX,
        worldY: cabFeet + innerH * 0.42,
        worldZ: oz + row.plateZ,
        vyMps: vy,
      });
    }
    return out;
  };
  const tick = (_dtSec: number, nowMs: number, playerPos: THREE.Vector3) => {
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;
    flushPendingExteriorDoorToggle(nowMs, px, py, pz);
    advanceCabDoorOpenVisual(_dtSec);
    advanceLandingSwingClientVisual(_dtSec);
    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      const rawCabY = row != null ? getCabY(key, nowMs) : Number.NaN;
      const d = getDoor(key, nowMs);
      const insideThis = row != null && isInsideCarHud(px, py, pz, key);
      const lx = row != null ? px - (ox + row.plateX) : 0;
      const lz = row != null ? pz - (oz + row.plateZ) : 0;
      const distXZ = row != null ? Math.hypot(lx, lz) : Infinity;
      const heavyTick = shouldRunElevatorShaftHeavyTick({ distXZ, insideCab: insideThis });
      if (Number.isFinite(rawCabY)) {
        vis.updateFromServer(rawCabY, d);
      }
      if (!heavyTick) {
        vis.setFloorPickRootVisible(false);
        continue;
      }
      _swingByLevel.clear();
      for (const row of landingByRowKey.values()) {
        if (row.shaftKey === key) {
          const u = THREE.MathUtils.clamp(
            landingSwingVisual.get(row.rowKey) ?? row.swingOpen01,
            0,
            1,
          );
          _swingByLevel.set(row.level, u);
        }
      }
      vis.updateLandingExteriorDoorSwings(_swingByLevel, getFloorPlateBand());
      const flashActive =
        pickFlash.untilMs > nowMs && pickFlash.shaftKey === key;
      const floorPickLevel = Number.isFinite(rawCabY)
        ? cabFloorButtonDisplayLevel(vis.layout, rawCabY)
        : Number(row?.currentLevel ?? 1);
      vis.updateFloorPickMaterials(
        floorPickLevel,
        flashActive ? pickFlash.level : 0,
        pickFlash.untilMs,
        nowMs,
      );
      vis.updateLandingHailCabFloorDisplay(floorPickLevel);
      if (!row || !Number.isFinite(rawCabY)) {
        vis.setFloorPickRootVisible(false);
        continue;
      }
      const doorwayView = fpElevCarPanelDoorwayViewLocal(
        vis.layout.doorFace,
        lx,
        lz,
        py,
        rawCabY,
        vis.inner,
      );
      vis.setFloorPickRootVisible(
        fpElevFloorPickMeshesShouldShow(insideThis, doorwayView, d),
      );
    }
  };
  const syncCabEvalClock = (nowMs: number, frameDtSec?: number) => {
    cabEvalNowMs = nowMs;
    if (frameDtSec !== undefined) {
      cabEvalUseSmoothedMoveU = true;
      advanceCabSmoothU(nowMs);
    } else {
      cabEvalUseSmoothedMoveU = false;
    }
  };
  return {
    setFloorPlateBandGetter(getter: () => FpActiveFloorPlateBand) {
      getFloorPlateBand = getter;
    },
    dispose: () => {
      opts.conn.db.elevator_car.removeOnInsert(onElevRow);
      opts.conn.db.elevator_car.removeOnUpdate(onElevRow);
      opts.conn.db.elevator_landing_door.removeOnInsert(onLandingInsert);
      opts.conn.db.elevator_landing_door.removeOnUpdate(onLandingUpdate);
      opts.conn.db.elevator_landing_door.removeOnDelete(onLandingDelete);
      for (const vis of visuals.values()) {
        opts.buildingRoot.remove(vis.root);
        vis.dispose();
      }
      latest.clear();
      cabIntegrateUByKey.clear();
      cabMoveLegByKey.clear();
      cabRideClockOffsetFloorMsByKey.clear();
      landingByRowKey.clear();
      replicaHistoryByKey.clear();
      cabDoorOpenSmoothed.clear();
      landingSwingVisual.clear();
    },
    syncCabEvalClock,
    tick,
    syncLandingHailUi,
    kinematicSupport,
    tryRaycastFloorPick,
    consumeInteractKey: (playerPos, camera) =>
      consumeLandingHailInteractKey(camera, playerPos, performance.now()) ||
      consumeExteriorDoorInteractKey(playerPos, camera),
    shouldSuppressEpickup: (playerPos, camera) =>
      getLandingHailInteractPrompt(camera, playerPos) !== null ||
      getExteriorDoorInteractPrompt(playerPos, camera) !== null,
    getLandingHailInteractPrompt: (playerPos, camera) =>
      getLandingHailInteractPrompt(camera, playerPos),
    getExteriorDoorInteractPrompt,
    visitCollisionAabbsInXZ,
    applyCabRoofFeetSnap,
    getFloorVisibilityBand,
    syncShaftVisualCulling,
    isInsideCabOccludedView,
    isInsideAnyCabHud,
    isInsideAnyElevatorCabChamber,
    getCabOccludedViewStorey,
    sampleRideDebug,
    getHudMovingCabVyMps,
    ignoreSmallPoseReconcileWhileMovingElevatorRider,
    getCabMotionAudioEmitters,
  };
}
