import * as THREE from "three";
import {
  elevatorCabGameplayHalfExtentsM,
  estimateStoreyFromFeetY,
  type ElevatorShaftLayout,
  type FloorShortLabelMap,
} from "@the-mammoth/world";
import type {
  ElevatorCar,
  ElevatorLandingDoor,
} from "../../../module_bindings/types";
import {
  fpElevLandingExteriorDoorInCabDockedInteract,
  fpElevLandingExteriorDoorInteractPlateLocal,
  fpElevLandingExteriorDoorNearWhileShaftAuthorized,
  EXTERIOR_DOOR_COLLISION_OPEN_THRESH,
  EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
  fpElevLandingExteriorDoorNearWorldPose,
  landingExteriorDoorRowKey,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
} from "../fpElevatorLandingExteriorDoor.js";
import { ELEVATOR_PHASE_MOVING } from "../fpElevatorConstants.js";
import { elevatorLandingFloorHudLabel } from "../fpElevatorLabels.js";
import {
  fpElevatorHudCarContainsLocalPoint,
  fpElevPlayerInsideCabAuthoritativePlateLocal,
} from "../fpElevatorVolumes.js";
import type { FpElevatorShaftVisual } from "../fpElevatorShaftVisual.js";
import type { DbConnection } from "../../../module_bindings";

export type CreateFpElevatorExteriorDoorInteractOpts = {
  conn: DbConnection;
  buildingWorldOriginX: number;
  buildingWorldOriginZ: number;
  maxLevel: number;
  storeyOpts: {
    buildingWorldOriginY: number;
    floorSpacingM: number;
    maxLevel: number;
  };
  floorLabelByLevel: FloorShortLabelMap;
  visuals: ReadonlyMap<string, FpElevatorShaftVisual>;
  latest: ReadonlyMap<string, ElevatorCar>;
  layoutByKey: ReadonlyMap<string, ElevatorShaftLayout>;
  shaftSpatialByKey: ReadonlyMap<
    string,
    { exteriorInteractMaxCenterDistSq: number; hailPickMaxCenterDistSq: number }
  >;
  landingByRowKey: ReadonlyMap<string, ElevatorLandingDoor>;
  /** Client-smoothed swing; read for pending-door checks. */
  landingSwingVisual: ReadonlyMap<string, number>;
  getCabY: (shaftKey: string, evalWallClockMs?: number) => number;
  feetYForLayout: (layout: ElevatorShaftLayout, level: number) => number;
};

export function createFpElevatorExteriorDoorInteract(
  opts: CreateFpElevatorExteriorDoorInteractOpts,
) {
  const {
    conn,
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
  } = opts;

  const _cameraWorldPos = new THREE.Vector3();
  const _hailPickRoots: THREE.Object3D[] = [];
  const pendingExteriorDoorToggle = {
    shaftKey: "",
    level: 0,
    interactHintY: 0,
    expectedDesiredOpen: 0 as 0 | 1,
    retryCount: 0,
    nextRetryAtMs: 0,
    expireAtMs: 0,
  };

  const candidateLandingLevelRangeForFeetY = (py: number): [number, number] => {
    const storey = estimateStoreyFromFeetY(py, storeyOpts);
    return [Math.max(1, storey - 1), Math.min(maxLevel, storey + 1)];
  };

  const collectNearbyLandingHailPickRoots = (
    playerPos: THREE.Vector3,
  ): THREE.Object3D[] => {
    _hailPickRoots.length = 0;
    const [levelLo, levelHi] = candidateLandingLevelRangeForFeetY(playerPos.y);
    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      const spatial = shaftSpatialByKey.get(key);
      if (!row || !spatial) continue;
      const dx = playerPos.x - (ox + row.plateX);
      const dz = playerPos.z - (oz + row.plateZ);
      if (dx * dx + dz * dz > spatial.hailPickMaxCenterDistSq) continue;
      for (let level = levelLo; level <= levelHi; level++) {
        const pick = vis.getLandingHailPickForLevel(level);
        if (pick) _hailPickRoots.push(pick);
      }
    }
    return _hailPickRoots;
  };

  const resolveExteriorDoorInteractByPose = (
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null => {
    let best: {
      shaftKey: string;
      level: number;
      score: number;
    } | null = null;
    const [levelLo, levelHi] = candidateLandingLevelRangeForFeetY(py);
    for (const [shaftKey, rowCar] of latest) {
      const layout = layoutByKey.get(shaftKey);
      const vis = visuals.get(shaftKey);
      const spatial = shaftSpatialByKey.get(shaftKey);
      if (!layout || !vis || !spatial) continue;
      const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(
        layout.sx,
        layout.sz,
      );
      const plateX = ox + rowCar.plateX;
      const plateZ = oz + rowCar.plateZ;
      const lx = px - plateX;
      const lz = pz - plateZ;
      if (lx * lx + lz * lz > spatial.exteriorInteractMaxCenterDistSq) continue;
      const cabY = getCabY(shaftKey);
      const phaseMoving = rowCar.phase === ELEVATOR_PHASE_MOVING;
      for (let level = levelLo; level <= levelHi; level++) {
        const fy = feetYForLayout(layout, level);
        const rawNearDoor =
          fpElevLandingExteriorDoorNearWorldPose(
            layout.doorFace,
            plateX,
            plateZ,
            hx,
            hz,
            px,
            py,
            pz,
            fy,
          ) ||
          fpElevLandingExteriorDoorInteractPlateLocal(
            layout.doorFace,
            hx,
            hz,
            lx,
            lz,
            py,
            fy,
          );
        const inAuthoritativeCab =
          Number.isFinite(cabY) &&
          fpElevPlayerInsideCabAuthoritativePlateLocal(
            lx,
            lz,
            py,
            cabY,
            vis.inner,
          );
        const inHudCab =
          Number.isFinite(cabY) &&
          fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabY, vis.inner);
        const nearDoor = fpElevLandingExteriorDoorNearWhileShaftAuthorized({
          rawNear: rawNearDoor,
          phaseMoving,
          inAuthoritativeCab,
          inHudCab,
        });
        const inCabDocked =
          Number.isFinite(cabY) &&
          fpElevLandingExteriorDoorInCabDockedInteract({
            plateWorldX: plateX,
            plateWorldZ: plateZ,
            px,
            py,
            pz,
            landingFeetWorldY: fy,
            cabFeetWorldY: cabY,
            inner: vis.inner,
            phaseMoving,
            dockYTolM: LANDING_PASSAGE_DOCK_Y_TOL_M,
          });
        if (!nearDoor && !inCabDocked) {
          continue;
        }
        const aimY = fy + 1.1;
        let aimX = plateX;
        let aimZ = plateZ;
        if (layout.doorFace === "e") aimX += hx;
        else if (layout.doorFace === "w") aimX -= hx;
        else if (layout.doorFace === "n") aimZ += hz;
        else aimZ -= hz;
        const dist = Math.hypot(px - aimX, py - aimY, pz - aimZ);
        const score = inCabDocked ? 1_000_000 - dist : -dist;
        if (best == null || score > best.score) {
          best = { shaftKey, level, score };
        }
      }
    }
    return best == null ? null : { shaftKey: best.shaftKey, level: best.level };
  };

  const exteriorDoorInteractHintY = (
    playerPos: Pick<THREE.Vector3, "y">,
    camera: THREE.PerspectiveCamera,
  ): number => {
    camera.getWorldPosition(_cameraWorldPos);
    return Number.isFinite(_cameraWorldPos.y) ? _cameraWorldPos.y : playerPos.y;
  };

  const resolveExteriorDoorInteract = (
    camera: THREE.PerspectiveCamera,
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null =>
    resolveExteriorDoorInteractByPose(
      px,
      exteriorDoorInteractHintY({ y: py }, camera),
      pz,
    );

  const landingDoorPendingSatisfied = (
    row: ElevatorLandingDoor | undefined,
    expectedDesiredOpen: 0 | 1,
    rowKey?: string,
  ): boolean => {
    if (!row) return false;
    const desired = (row.desiredOpen ?? 0) !== 0 ? 1 : 0;
    if (desired === expectedDesiredOpen) return true;
    const client = rowKey != null ? landingSwingVisual.get(rowKey) : undefined;
    const swing =
      client !== undefined && Number.isFinite(client)
        ? client
        : row.swingOpen01;
    if (
      expectedDesiredOpen === 1 &&
      swing >= EXTERIOR_DOOR_COLLISION_OPEN_THRESH - 0.05
    ) {
      return true;
    }
    if (
      expectedDesiredOpen === 0 &&
      swing <= EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING + 0.08
    ) {
      return true;
    }
    return false;
  };

  const queueExteriorDoorToggleAttempt = (
    shaftKey: string,
    level: number,
    nowMs: number,
    interactHintY: number,
  ) => {
    const rowKey = landingExteriorDoorRowKey(shaftKey, level);
    const currentDesired =
      (landingByRowKey.get(rowKey)?.desiredOpen ?? 0) !== 0 ? 1 : 0;
    pendingExteriorDoorToggle.shaftKey = shaftKey;
    pendingExteriorDoorToggle.level = level;
    pendingExteriorDoorToggle.interactHintY = interactHintY;
    pendingExteriorDoorToggle.expectedDesiredOpen =
      currentDesired === 0 ? 1 : 0;
    pendingExteriorDoorToggle.retryCount = 0;
    pendingExteriorDoorToggle.nextRetryAtMs = nowMs;
    pendingExteriorDoorToggle.expireAtMs = nowMs + 1200;
  };

  const flushPendingExteriorDoorToggle = (
    nowMs: number,
    px: number,
    py: number,
    pz: number,
  ) => {
    if (!pendingExteriorDoorToggle.shaftKey) return;
    const pendingHit = resolveExteriorDoorInteractByPose(
      px,
      pendingExteriorDoorToggle.interactHintY || py,
      pz,
    );
    const stillSameTarget =
      pendingHit != null &&
      pendingHit.shaftKey === pendingExteriorDoorToggle.shaftKey &&
      pendingHit.level === pendingExteriorDoorToggle.level;
    if (!stillSameTarget) {
      pendingExteriorDoorToggle.shaftKey = "";
      pendingExteriorDoorToggle.interactHintY = 0;
      return;
    }
    const rowKey = landingExteriorDoorRowKey(
      pendingExteriorDoorToggle.shaftKey,
      pendingExteriorDoorToggle.level,
    );
    const landingRow = landingByRowKey.get(rowKey);
    if (
      landingDoorPendingSatisfied(
        landingRow,
        pendingExteriorDoorToggle.expectedDesiredOpen,
        rowKey,
      )
    ) {
      pendingExteriorDoorToggle.shaftKey = "";
      pendingExteriorDoorToggle.interactHintY = 0;
      return;
    }
    if (nowMs >= pendingExteriorDoorToggle.expireAtMs) {
      const sk = pendingExteriorDoorToggle.shaftKey;
      const lv = pendingExteriorDoorToggle.level;
      const want = pendingExteriorDoorToggle.expectedDesiredOpen;
      if (
        !landingDoorPendingSatisfied(landingByRowKey.get(rowKey), want, rowKey)
      ) {
        const hit = resolveExteriorDoorInteractByPose(
          px,
          pendingExteriorDoorToggle.interactHintY || py,
          pz,
        );
        const stillEligible =
          hit != null && hit.shaftKey === sk && hit.level === lv;
        if (stillEligible) {
          const got =
            (landingByRowKey.get(landingExteriorDoorRowKey(sk, lv))
              ?.desiredOpen ?? 0) !== 0
              ? 1
              : 0;
          const swing =
            landingByRowKey.get(landingExteriorDoorRowKey(sk, lv))
              ?.swingOpen01 ?? Number.NaN;
          console.warn(
            "[fpElevatorWorld] exterior door toggle not confirmed on replica (server may have rejected; see elevator_landing_exterior_door* module logs)",
            {
              shaftKey: sk,
              level: lv,
              expectedDesiredOpen: want,
              replicatedDesiredOpen: got,
              swingOpen01: swing,
              player: { x: px, y: py, z: pz },
            },
          );
        }
      }
      pendingExteriorDoorToggle.shaftKey = "";
      pendingExteriorDoorToggle.interactHintY = 0;
      return;
    }
    if (nowMs < pendingExteriorDoorToggle.nextRetryAtMs) return;
    try {
      void conn.reducers.elevatorLandingExteriorDoorSet({
        shaftKey: pendingExteriorDoorToggle.shaftKey,
        level: pendingExteriorDoorToggle.level >>> 0,
        desiredOpen: pendingExteriorDoorToggle.expectedDesiredOpen,
        clientFeetX: px,
        clientFeetY: pendingExteriorDoorToggle.interactHintY || py,
        clientFeetZ: pz,
      });
      pendingExteriorDoorToggle.retryCount += 1;
      pendingExteriorDoorToggle.nextRetryAtMs = nowMs + 90;
    } catch (e) {
      console.warn("[fpElevatorWorld] elevatorLandingExteriorDoorSet retry", e);
      pendingExteriorDoorToggle.shaftKey = "";
    }
  };

  const consumeInteractKey = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): boolean => {
    const nowMs = performance.now();
    const exterior = resolveExteriorDoorInteract(
      camera,
      playerPos.x,
      playerPos.y,
      playerPos.z,
    );
    if (exterior) {
      const hintY = exteriorDoorInteractHintY(playerPos, camera);
      queueExteriorDoorToggleAttempt(
        exterior.shaftKey,
        exterior.level,
        nowMs,
        hintY,
      );
      try {
        void conn.reducers.elevatorLandingExteriorDoorSet({
          shaftKey: exterior.shaftKey,
          level: exterior.level >>> 0,
          desiredOpen: pendingExteriorDoorToggle.expectedDesiredOpen,
          clientFeetX: playerPos.x,
          clientFeetY: hintY,
          clientFeetZ: playerPos.z,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorLandingExteriorDoorSet", e);
      }
      return true;
    }
    return false;
  };

  const shouldSuppressEpickup = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): boolean =>
    resolveExteriorDoorInteract(
      camera,
      playerPos.x,
      playerPos.y,
      playerPos.z,
    ) !== null;

  const getExteriorDoorInteractPrompt = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => {
    const ext = resolveExteriorDoorInteract(
      camera,
      playerPos.x,
      playerPos.y,
      playerPos.z,
    );
    if (!ext) return null;
    const rk = landingExteriorDoorRowKey(ext.shaftKey, ext.level);
    const ld = landingByRowKey.get(rk);
    const willClose = (ld?.desiredOpen ?? 0) !== 0;
    const floorLabel = elevatorLandingFloorHudLabel(ext.level, floorLabelByLevel);
    return { willClose, floorLabel };
  };

  return {
    collectNearbyLandingHailPickRoots,
    flushPendingExteriorDoorToggle,
    consumeInteractKey,
    shouldSuppressEpickup,
    getExteriorDoorInteractPrompt,
  };
}
