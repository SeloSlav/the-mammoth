import * as THREE from "three";
import {
  MAMMOTH_MERGED_CAB_FLOOR_PICK_UD,
  resolveMergedCabFloorPickLevel,
  type ElevatorShaftLayout,
  type MergedCabFloorPickLayout,
} from "@the-mammoth/world";
import type { DbConnection } from "../../../module_bindings";
import type { ElevatorCar } from "../../../module_bindings/types";
import {
  FLOOR_PICK_MAX_RAY_M,
  FP_ELEV_FLOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
  type FpElevFloorPickUserData,
  type FpElevLandingHailPickUserData,
} from "../fpElevatorConstants.js";
import {
  fpElevCarPanelDoorwayViewLocal,
  fpElevFloorPickRaycastShouldProceed,
  fpElevatorHudCarContainsLocalPoint,
} from "../fpElevatorVolumes.js";
import type { FpElevatorShaftVisual } from "../fpElevatorShaftVisual.js";

export type FpElevHailFloorPickRaycastCtx = {
  raycaster: THREE.Raycaster;
  screenCenterNdc: THREE.Vector2;
  conn: DbConnection;
  visuals: Map<string, FpElevatorShaftVisual>;
  latest: Map<string, ElevatorCar>;
  layoutByKey: Map<string, ElevatorShaftLayout>;
  ox: number;
  oz: number;
  collectNearbyLandingHailPickRoots: (playerPos: THREE.Vector3) => THREE.Object3D[];
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
} {
  let hailSyncFrameCounter = 0;
  const {
    raycaster,
    screenCenterNdc,
    conn,
    visuals,
    latest,
    layoutByKey,
    ox,
    oz,
    collectNearbyLandingHailPickRoots,
    getCabY,
    getDoor,
    hailPickFlash,
    pickFlash,
  } = ctx;

  const tryRaycastLandingHail = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = 8.5;
    const roots = collectNearbyLandingHailPickRoots(playerPos);
    if (roots.length === 0) return false;
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const pick = (mesh.userData as Partial<FpElevLandingHailPickUserData>)[
        FP_ELEV_LANDING_HAIL_PICK_UD
      ];
      if (!pick) continue;
      try {
        void conn.reducers.elevatorHail({
          shaftKey: pick.shaftKey,
          level: pick.level >>> 0,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorHail ray", e);
        return false;
      }
      hailPickFlash.shaftKey = pick.shaftKey;
      hailPickFlash.level = pick.level;
      hailPickFlash.untilMs = nowMs + 520;
      return true;
    }
    return false;
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
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = 8.5;
    const roots = collectNearbyLandingHailPickRoots(playerPos);
    if (roots.length === 0) {
      for (const [key, vis] of visuals) {
        vis.setLandingHailHighlight({
          hoverLevel: 0,
          flashLevel: hailPickFlash.shaftKey === key ? hailPickFlash.level : 0,
          flashUntilMs: hailPickFlash.untilMs,
          nowMs,
        });
      }
      return;
    }
    const hits = raycaster.intersectObjects(roots, true);
    let best: { shaftKey: string; level: number; d: number } | null = null;
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
    for (const [key, vis] of visuals) {
      vis.setLandingHailHighlight({
        hoverLevel: best != null && best.shaftKey === key ? best.level : 0,
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

  return { tryRaycastLandingHail, syncLandingHailUi, tryRaycastFloorPick };
}
