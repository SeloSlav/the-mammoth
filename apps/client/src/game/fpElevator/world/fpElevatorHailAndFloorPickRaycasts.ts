import * as THREE from "three";
import {
  MAMMOTH_MERGED_CAB_FLOOR_PICK_UD,
  resolveLandingHailLevel,
  resolveMergedCabFloorPickLevel,
  type ElevatorShaftLayout,
  type FloorShortLabelMap,
  type MergedCabFloorPickLayout,
} from "@the-mammoth/world";
import type { DbConnection } from "../../../module_bindings";
import type { ElevatorCar } from "../../../module_bindings/types";
import {
  CALL_RADIUS_XZ,
  CALL_Y_HALF_WINDOW,
  ELEVATOR_PHASE_MOVING,
  LANDING_HAIL_CROSSHAIR_AIM_MIN_DOT,
  LANDING_HAIL_PANEL_PAD_RADIUS_XZ_M,
  LANDING_HAIL_PANEL_PAD_Y_HALF_M,
  FLOOR_PICK_MAX_RAY_M,
  FP_ELEV_FLOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
  type FpElevFloorPickUserData,
  type FpElevLandingHailPickUserData,
} from "../fpElevatorConstants.js";
import { fpElevSuppressLandingHailBecauseCabAtLandingSupport } from "../fpElevatorLandingHailSuppress.js";
import { elevatorLandingFloorHudLabel } from "../fpElevatorLabels.js";
import {
  crosshairHitsLandingHailPanelDisk,
  landingHailPanelOutwardNormal,
  LANDING_HAIL_PANEL_PICK_DISK_RADIUS_M,
} from "../fpElevatorLandingHailPanelPick.js";
import {
  fpElevCarPanelDoorwayViewLocal,
  fpElevFloorPickRaycastShouldProceed,
  fpElevatorHudCarContainsLocalPoint,
} from "../fpElevatorVolumes.js";
import type { FpElevatorShaftVisual } from "../fpElevatorShaftVisual.js";

const LANDING_HAIL_PICK_MAX_RAY_M = 8.5;

export type FpElevLandingHailPick = {
  shaftKey: string;
  level: number;
};

export type FpElevLandingHailInteractPrompt = {
  floorLabel: string;
};

export type FpElevHailFloorPickRaycastCtx = {
  raycaster: THREE.Raycaster;
  screenCenterNdc: THREE.Vector2;
  conn: DbConnection;
  visuals: Map<string, FpElevatorShaftVisual>;
  latest: Map<string, ElevatorCar>;
  layoutByKey: Map<string, ElevatorShaftLayout>;
  floorLabelByLevel: FloorShortLabelMap;
  ox: number;
  oz: number;
  buildingWorldOriginY: number;
  floorSpacingM: number;
  maxLevel: number;
  collectNearbyLandingHailPickRoots: (playerPos: THREE.Vector3) => THREE.Object3D[];
  feetYForLayout: (layout: ElevatorShaftLayout, level: number) => number;
  getCabY: (key: string, evalWallClockMs?: number) => number;
  getDoor: (key: string, nowMs: number) => number;
  hailPickFlash: { shaftKey: string; level: number; untilMs: number };
  pickFlash: { shaftKey: string; level: number; untilMs: number };
};

export function createFpElevatorHailAndFloorPickRaycasts(
  ctx: FpElevHailFloorPickRaycastCtx,
): {
  tryRaycastLandingHail: (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ) => boolean;
  syncLandingHailUi: (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ) => void;
  tryRaycastFloorPick: (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ) => boolean;
  getLandingHailInteractPrompt: (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ) => FpElevLandingHailInteractPrompt | null;
  consumeLandingHailInteractKey: (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ) => boolean;
  isLandingHailTargetActive: (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ) => boolean;
} {
  let hailSyncFrameCounter = 0;
  const _cameraForward = new THREE.Vector3();
  const _cameraWorldPos = new THREE.Vector3();
  const _aimScratch = new THREE.Vector3();
  const _panelWorld = new THREE.Vector3();
  const _panelOutward = new THREE.Vector3();
  const _panelDiskScratch = {
    plane: new THREE.Plane(),
    hit: new THREE.Vector3(),
  };
  const {
    raycaster,
    screenCenterNdc,
    conn,
    visuals,
    latest,
    layoutByKey,
    floorLabelByLevel,
    ox,
    oz,
    buildingWorldOriginY,
    floorSpacingM,
    maxLevel,
    collectNearbyLandingHailPickRoots,
    feetYForLayout,
    getCabY,
    getDoor,
    hailPickFlash,
    pickFlash,
  } = ctx;

  const cameraAimedAtWorldPoint = (
    camera: THREE.PerspectiveCamera,
    tx: number,
    ty: number,
    tz: number,
    minDot: number = LANDING_HAIL_CROSSHAIR_AIM_MIN_DOT,
  ): boolean => {
    camera.getWorldDirection(_cameraForward);
    camera.getWorldPosition(_cameraWorldPos);
    _aimScratch.set(tx, ty, tz).sub(_cameraWorldPos);
    const dist = _aimScratch.length();
    if (dist < 1e-4) return true;
    _aimScratch.multiplyScalar(1 / dist);
    return _cameraForward.dot(_aimScratch) >= minDot;
  };

  const playerInLandingHailPanelPad = (
    playerPos: THREE.Vector3,
    panelWorldX: number,
    panelWorldY: number,
    panelWorldZ: number,
  ): boolean =>
    Math.hypot(playerPos.x - panelWorldX, playerPos.z - panelWorldZ) <=
      LANDING_HAIL_PANEL_PAD_RADIUS_XZ_M &&
    Math.abs(playerPos.y - panelWorldY) <= LANDING_HAIL_PANEL_PAD_Y_HALF_M;

  const candidateLandingLevelsForFeetY = (py: number): [number, number] => {
    const storey = Math.max(
      1,
      Math.min(
        maxLevel,
        Math.round((py - buildingWorldOriginY) / floorSpacingM) + 1,
      ),
    );
    return [Math.max(1, storey - 1), Math.min(maxLevel, storey + 1)];
  };

  const isLandingHailPickSuppressed = (pick: FpElevLandingHailPick): boolean => {
    const layout = layoutByKey.get(pick.shaftKey);
    if (!layout) return true;
    const row = latest.get(pick.shaftKey);
    if (!row) return false;
    const cabY = getCabY(pick.shaftKey);
    if (!Number.isFinite(cabY)) return false;
    const landingSupportY = feetYForLayout(layout, pick.level);
    return (
      row.phase !== ELEVATOR_PHASE_MOVING &&
      getDoor(pick.shaftKey, performance.now()) >= 0.92 &&
      fpElevSuppressLandingHailBecauseCabAtLandingSupport(cabY, landingSupportY)
    );
  };

  const resolveLandingHailPickFromPanelDisk = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ): FpElevLandingHailPick | null => {
    let best: (FpElevLandingHailPick & { d: number }) | null = null;
    const [levelLo, levelHi] = candidateLandingLevelsForFeetY(playerPos.y);
    for (const [shaftKey, layout] of layoutByKey) {
      if (!latest.has(shaftKey)) continue;
      const vis = visuals.get(shaftKey);
      if (!vis) continue;
      landingHailPanelOutwardNormal(layout.doorFace, _panelOutward);
      for (let level = levelLo; level <= levelHi; level++) {
        const pick: FpElevLandingHailPick = { shaftKey, level };
        if (isLandingHailPickSuppressed(pick)) continue;
        if (!vis.sampleLandingHailPickCenterWorld(level, _panelWorld)) continue;
        if (
          !crosshairHitsLandingHailPanelDisk(
            raycaster,
            screenCenterNdc,
            camera,
            _panelWorld,
            _panelOutward,
            LANDING_HAIL_PANEL_PICK_DISK_RADIUS_M,
            _panelDiskScratch,
          )
        ) {
          continue;
        }
        camera.getWorldPosition(_cameraWorldPos);
        const d = _panelWorld.distanceTo(_cameraWorldPos);
        if (best == null || d < best.d) {
          best = { shaftKey, level, d };
        }
      }
    }
    return best == null ? null : { shaftKey: best.shaftKey, level: best.level };
  };

  const resolveLandingHailPickFromRaycast = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ): FpElevLandingHailPick | null => {
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = LANDING_HAIL_PICK_MAX_RAY_M;
    const roots = collectNearbyLandingHailPickRoots(playerPos);
    if (roots.length === 0) return null;
    const hits = raycaster.intersectObjects(roots, true);
    let best: (FpElevLandingHailPick & { d: number }) | null = null;
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const pick = (mesh.userData as Partial<FpElevLandingHailPickUserData>)[
        FP_ELEV_LANDING_HAIL_PICK_UD
      ];
      if (!pick) continue;
      const d = h.distance;
      if (best == null || d < best.d) {
        best = { shaftKey: pick.shaftKey, level: pick.level, d };
      }
    }
    return best == null ? null : { shaftKey: best.shaftKey, level: best.level };
  };

  const resolveLandingHailPickFromPanelTarget = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ): FpElevLandingHailPick | null => {
    let best: (FpElevLandingHailPick & { score: number }) | null = null;
    const [levelLo, levelHi] = candidateLandingLevelsForFeetY(playerPos.y);
    for (const [shaftKey, layout] of layoutByKey) {
      const row = latest.get(shaftKey);
      if (!row) continue;
      const vis = visuals.get(shaftKey);
      if (!vis) continue;
      const plateWorldX = ox + row.plateX;
      const plateWorldZ = oz + row.plateZ;
      for (let level = levelLo; level <= levelHi; level++) {
        const pick: FpElevLandingHailPick = { shaftKey, level };
        if (isLandingHailPickSuppressed(pick)) continue;
        if (!vis.sampleLandingHailPickCenterWorld(level, _panelWorld)) continue;
        const inPad = playerInLandingHailPanelPad(
          playerPos,
          _panelWorld.x,
          _panelWorld.y,
          _panelWorld.z,
        );
        const aimed = cameraAimedAtWorldPoint(
          camera,
          _panelWorld.x,
          _panelWorld.y,
          _panelWorld.z,
        );
        if (!inPad && !aimed) continue;
        if (!inPad) {
          const serverLevel = resolveLandingHailLevel(
            playerPos.x,
            playerPos.y,
            playerPos.z,
            {
              buildingWorldOriginY,
              floorSpacingM,
              maxLevel,
              plateWorldX,
              plateWorldZ,
              shaft: layout,
              callRadiusXZ: CALL_RADIUS_XZ,
              callYHalfWindow: CALL_Y_HALF_WINDOW,
            },
          );
          if (serverLevel == null || serverLevel !== level) continue;
        }
        camera.getWorldDirection(_cameraForward);
        camera.getWorldPosition(_cameraWorldPos);
        _aimScratch
          .set(_panelWorld.x, _panelWorld.y, _panelWorld.z)
          .sub(_cameraWorldPos)
          .normalize();
        const aimDot = _cameraForward.dot(_aimScratch);
        const score =
          (inPad ? 2 : 0) +
          aimDot +
          -Math.hypot(playerPos.x - _panelWorld.x, playerPos.z - _panelWorld.z) * 0.05;
        if (best == null || score > best.score) {
          best = { shaftKey, level, score };
        }
      }
    }
    return best == null ? null : { shaftKey: best.shaftKey, level: best.level };
  };

  const resolveActiveLandingHailPick = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ): FpElevLandingHailPick | null => {
    const diskPick = resolveLandingHailPickFromPanelDisk(camera, playerPos);
    if (diskPick) return diskPick;
    const rayPick = resolveLandingHailPickFromRaycast(camera, playerPos);
    if (rayPick && !isLandingHailPickSuppressed(rayPick)) return rayPick;
    return resolveLandingHailPickFromPanelTarget(camera, playerPos);
  };

  const dispatchLandingHail = (pick: FpElevLandingHailPick, nowMs: number): boolean => {
    if (isLandingHailPickSuppressed(pick)) return false;
    try {
      void conn.reducers.elevatorHail({
        shaftKey: pick.shaftKey,
        level: pick.level >>> 0,
      });
    } catch (e) {
      console.warn("[fpElevatorWorld] elevatorHail", e);
      return false;
    }
    hailPickFlash.shaftKey = pick.shaftKey;
    hailPickFlash.level = pick.level;
    hailPickFlash.untilMs = nowMs + 520;
    return true;
  };

  const getLandingHailInteractPrompt = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ): FpElevLandingHailInteractPrompt | null => {
    const pick = resolveActiveLandingHailPick(camera, playerPos);
    if (!pick) return null;
    return {
      floorLabel: elevatorLandingFloorHudLabel(pick.level, floorLabelByLevel),
    };
  };

  const consumeLandingHailInteractKey = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
    const pick = resolveActiveLandingHailPick(camera, playerPos);
    if (!pick) return false;
    return dispatchLandingHail(pick, nowMs);
  };

  const isLandingHailTargetActive = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
  ): boolean => resolveActiveLandingHailPick(camera, playerPos) !== null;

  const tryRaycastLandingHail = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
    const pick = resolveActiveLandingHailPick(camera, playerPos);
    if (!pick) return false;
    return dispatchLandingHail(pick, nowMs);
  };

  const syncLandingHailUi = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ) => {
    // Skip 2 out of every 3 frames — hover-highlight update doesn't need 60 Hz resolution
    // and raycaster.intersectObjects() allocates internally every call.
    hailSyncFrameCounter = (hailSyncFrameCounter + 1) % 3;
    if (hailSyncFrameCounter !== 0) return;
    const pick = resolveActiveLandingHailPick(camera, playerPos);
    for (const [key, vis] of visuals) {
      vis.setLandingHailHighlight({
        hoverLevel: pick != null && pick.shaftKey === key ? pick.level : 0,
        flashLevel: hailPickFlash.shaftKey === key ? hailPickFlash.level : 0,
        flashUntilMs: hailPickFlash.untilMs,
        nowMs,
      });
    }
  };

  const tryRaycastFloorPick = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
    if (tryRaycastLandingHail(camera, playerPos, nowMs)) return true;
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = FLOOR_PICK_MAX_RAY_M;
    const roots: THREE.Object3D[] = [];
    for (const v of visuals.values()) {
      if (!v.floorPickRoot.visible) continue;
      roots.push(v.floorPickRoot);
    }
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const mergedLayout = mesh.userData[MAMMOTH_MERGED_CAB_FLOOR_PICK_UD] as
        | MergedCabFloorPickLayout
        | undefined;
      let pick: { shaftKey: string; level: number } | undefined;
      if (mergedLayout?.shaftKey) {
        const panelRoot = mesh.parent;
        if (!panelRoot) continue;
        pick = {
          shaftKey: mergedLayout.shaftKey,
          level: resolveMergedCabFloorPickLevel(
            h.point,
            panelRoot,
            mergedLayout,
          ),
        };
      } else {
        const ud = (mesh.userData as Partial<FpElevFloorPickUserData>)[
          FP_ELEV_FLOOR_PICK_UD
        ];
        if (!ud) continue;
        pick = { shaftKey: ud.shaftKey, level: ud.level };
      }
      const row = latest.get(pick.shaftKey);
      const layout = layoutByKey.get(pick.shaftKey);
      const vis = visuals.get(pick.shaftKey);
      if (!row || !layout || !vis) return false;
      const cabY = getCabY(pick.shaftKey);
      if (!Number.isFinite(cabY)) return false;
      const lx = playerPos.x - (ox + row.plateX);
      const lz = playerPos.z - (oz + row.plateZ);
      const py = playerPos.y;
      const inCab = fpElevatorHudCarContainsLocalPoint(
        lx,
        lz,
        py,
        cabY,
        vis.inner,
      );
      const inDoorway = fpElevCarPanelDoorwayViewLocal(
        layout.doorFace,
        lx,
        lz,
        py,
        cabY,
        vis.inner,
      );
      if (
        !fpElevFloorPickRaycastShouldProceed(
          inCab,
          inDoorway,
          getDoor(pick.shaftKey, nowMs),
        )
      ) {
        return false;
      }
      try {
        void conn.reducers.elevatorSelectFloor({
          shaftKey: pick.shaftKey,
          level: pick.level >>> 0,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorSelectFloor ray", e);
        return false;
      }
      pickFlash.shaftKey = pick.shaftKey;
      pickFlash.level = pick.level;
      pickFlash.untilMs = nowMs + 520;
      return true;
    }
    return false;
  };

  return {
    tryRaycastLandingHail,
    syncLandingHailUi,
    tryRaycastFloorPick,
    getLandingHailInteractPrompt,
    consumeLandingHailInteractKey,
    isLandingHailTargetActive,
  };
}
