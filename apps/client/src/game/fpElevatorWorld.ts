import * as THREE from "three";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorHoistwayInnerHalfExtents,
  elevatorSupportFeetWorldY,
  estimateStoreyFromFeetY,
  FP_LOCOMOTION_SKIN,
  listElevatorShaftLayouts,
  maxBuildingLevelIndex,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { DbConnection } from "../module_bindings";
import type { ElevatorCar } from "../module_bindings/types";
import { getFpElevatorHudView, setFpElevatorHudView } from "./fpElevatorHud.js";
import { doorSlideAxis, floorButtonLabel, type ElevatorDoorFace } from "./fpElevatorLabels.js";

export { floorButtonLabel } from "./fpElevatorLabels.js";

const DOOR_W = 1.86;
const DOOR_H = 2.05;
const DOOR_TH = 0.07;
const DOOR_SLIDE_M = 0.82;
const CAR_INNER_MARGIN = 0.07;
const CAR_CEIL_BELOW_SHAFT_TOP = 0.14;
const CALL_RADIUS_XZ = 1.55;
const CALL_Y_HALF_WINDOW = 2.2;
const CAB_INTERP_SEC = 0.1;

/** Raycast / userData tag for in-car floor selector meshes. */
export const FP_ELEV_FLOOR_PICK_UD = "fpElevFloorPick" as const;

export type FpElevFloorPickUserData = {
  [FP_ELEV_FLOOR_PICK_UD]: { shaftKey: string; level: number };
};

const FLOOR_BTN_W = 0.12;
const FLOOR_BTN_H = 0.092;
const FLOOR_BTN_D = 0.014;
const FLOOR_GAP = 0.014;
const FLOOR_COLS = 3;
const FLOOR_PICK_MAX_RAY_M = 3.2;

const ATLAS_COLS = 5;
const ATLAS_ROWS = 4;
const ATLAS_CELL_W = 64;
const ATLAS_CELL_H = 48;

/** Plate-local feet test for HUD “inside car” (slightly looser than server clamp). Exported for unit tests. */
export function fpElevatorHudCarContainsLocalPoint(
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  inner: { halfX: number; halfZ: number; innerH: number },
): boolean {
  if (Math.abs(lx) > inner.halfX * 0.97 || Math.abs(lz) > inner.halfZ * 0.97) return false;
  if (py < cabFeetY - 0.22 || py > cabFeetY + inner.innerH + 0.38) return false;
  return true;
}

type DoorFace = ElevatorDoorFace;

function buildElevFloorAtlas(maxLevel: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = ATLAS_COLS * ATLAS_CELL_W;
  c.height = ATLAS_ROWS * ATLAS_CELL_H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2d");
  for (let level = 1; level <= maxLevel; level++) {
    const idx = level - 1;
    const col = idx % ATLAS_COLS;
    const row = Math.floor(idx / ATLAS_COLS);
    const x0 = col * ATLAS_CELL_W;
    const y0 = row * ATLAS_CELL_H;
    ctx.fillStyle = "#2a3138";
    ctx.fillRect(x0, y0, ATLAS_CELL_W, ATLAS_CELL_H);
    ctx.strokeStyle = "rgba(140, 200, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 2, y0 + 2, ATLAS_CELL_W - 4, ATLAS_CELL_H - 4);
    ctx.fillStyle = "#e4ecff";
    ctx.font = "700 19px system-ui,Segoe UI,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      floorButtonLabel(level),
      x0 + ATLAS_CELL_W * 0.5,
      y0 + ATLAS_CELL_H * 0.5,
    );
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyAtlasUvToPlaneGeometry(geom: THREE.PlaneGeometry, levelIndex1Based: number): void {
  const idx = levelIndex1Based - 1;
  const col = idx % ATLAS_COLS;
  const row = Math.floor(idx / ATLAS_COLS);
  const u0 = col / ATLAS_COLS;
  const u1 = (col + 1) / ATLAS_COLS;
  const v1 = 1 - row / ATLAS_ROWS;
  const v0 = 1 - (row + 1) / ATLAS_ROWS;
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const uOld = uv.getX(i);
    const vOld = uv.getY(i);
    /** Horizontal mirror so glyphs match in-world (plane winding + wall yaw otherwise reverses them). */
    uv.setX(i, u1 - uOld * (u1 - u0));
    uv.setY(i, v0 + vOld * (v1 - v0));
  }
  uv.needsUpdate = true;
}

/**
 * Plate-local XZ: player in the doorway / landing lip can see the in-car floor panel through the opening.
 * Exported for unit tests (must stay aligned with `tryRaycastFloorPick` / panel visibility).
 */
export function fpElevCarPanelDoorwayViewLocal(
  face: DoorFace,
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  inner: { halfX: number; halfZ: number; innerH: number },
): boolean {
  const { halfX: hx, halfZ: hz, innerH } = inner;
  if (py < cabFeetY - 0.22 || py > cabFeetY + innerH + 0.38) return false;
  const lipIn = 0.38;
  const lipOut = 1.42;
  const doorHalf = DOOR_W * 0.5 + 0.28;
  if (face === "e") {
    return lx > hx - lipIn && lx < hx + lipOut && Math.abs(lz) < doorHalf;
  }
  if (face === "w") {
    return lx < -hx + lipIn && lx > -hx - lipOut && Math.abs(lz) < doorHalf;
  }
  if (face === "n") {
    return lz > hz - lipIn && lz < hz + lipOut && Math.abs(lx) < doorHalf;
  }
  return lz < -hz + lipIn && lz > -hz - lipOut && Math.abs(lx) < doorHalf;
}

class SmoothScalar {
  private a = 0;
  private b = 0;
  private t0Ms = 0;
  private has = false;

  setTarget(v: number, nowMs: number): void {
    this.a = this.has ? this.eval(nowMs) : v;
    this.b = v;
    this.t0Ms = nowMs;
    this.has = true;
  }

  eval(nowMs: number): number {
    if (!this.has) return this.b;
    const u = Math.min(1, (nowMs - this.t0Ms) / (CAB_INTERP_SEC * 1000));
    const s = u * u * (3 - 2 * u);
    return this.a + (this.b - this.a) * s;
  }
}

class ShaftVisual {
  readonly layout: ElevatorShaftLayout;
  readonly root: THREE.Group;
  private readonly carRoot: THREE.Group;
  private readonly doorL: THREE.Group;
  private readonly doorR: THREE.Group;
  readonly inner: { halfX: number; halfZ: number; innerH: number };
  private readonly ox: number;
  private readonly oy: number;
  private readonly oz: number;
  readonly floorPickRoot: THREE.Group;
  private readonly floorPickMeshes: THREE.Mesh[] = [];
  private readonly atlas: THREE.CanvasTexture;
  private readonly matNormal: THREE.MeshStandardMaterial;
  private readonly matHighlight: THREE.MeshStandardMaterial;
  private readonly matPickFlash: THREE.MeshStandardMaterial;
  private lastMatSig = "";

  constructor(
    layout: ElevatorShaftLayout,
    buildingWorldOrigin: readonly [number, number, number],
    pick: { shaftKey: string; maxLevel: number },
  ) {
    this.layout = layout;
    this.ox = buildingWorldOrigin[0];
    this.oy = buildingWorldOrigin[1];
    this.oz = buildingWorldOrigin[2];
    const { halfX, halfZ } = elevatorHoistwayInnerHalfExtents(layout.sx, layout.sz);
    const innerH = layout.sy - 2 * 0.11 - CAR_CEIL_BELOW_SHAFT_TOP;
    this.inner = {
      halfX: Math.max(0.12, halfX - CAR_INNER_MARGIN),
      halfZ: Math.max(0.12, halfZ - CAR_INNER_MARGIN),
      innerH: Math.max(1.8, innerH),
    };

    this.root = new THREE.Group();
    this.root.name = `fp_elevator:${layout.planKey}`;
    this.carRoot = new THREE.Group();
    this.carRoot.name = "elevator_car";

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x6a6f78,
      roughness: 0.72,
      metalness: 0.08,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x4d5258,
      roughness: 0.85,
      metalness: 0.04,
    });
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x8a929e,
      roughness: 0.45,
      metalness: 0.35,
    });

    const cabinH = this.inner.innerH;
    const floorT = 0.08;
    const wallT = 0.06;
    const hx = this.inner.halfX;
    const hz = this.inner.halfZ;

    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2 - wallT * 2, floorT, hz * 2 - wallT * 2),
      floorMat,
    );
    floorMesh.position.set(0, floorT * 0.5, 0);
    this.carRoot.add(floorMesh);

    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2 - wallT * 2, 0.07, hz * 2 - wallT * 2),
      wallMat,
    );
    ceil.position.set(0, cabinH - 0.035, 0);
    this.carRoot.add(ceil);

    const addWall = (
      name: string,
      sx: number,
      sy: number,
      sz: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      m.name = name;
      m.position.set(x, y, z);
      this.carRoot.add(m);
    };

    const midY = cabinH * 0.5 + floorT;
    const wallH = cabinH - floorT - 0.08;
    const face = layout.doorFace;
    if (face === "e" || face === "w") {
      const xSign = face === "e" ? 1 : -1;
      addWall("w_back", wallT, wallH, hz * 2, -xSign * (hx - wallT * 0.5), midY, 0);
      addWall("w_side_n", hx * 2 - wallT * 2, wallH, wallT, 0, midY, hz - wallT * 0.5);
      addWall("w_side_s", hx * 2 - wallT * 2, wallH, wallT, 0, midY, -hz + wallT * 0.5);
    } else {
      const zSign = face === "n" ? 1 : -1;
      addWall("w_back", hx * 2, wallH, wallT, 0, midY, -zSign * (hz - wallT * 0.5));
      addWall("w_side_e", wallT, wallH, hz * 2 - wallT * 2, hx - wallT * 0.5, midY, 0);
      addWall("w_side_w", wallT, wallH, hz * 2 - wallT * 2, -hx + wallT * 0.5, midY, 0);
    }

    this.doorL = new THREE.Group();
    this.doorR = new THREE.Group();
    const leafW = DOOR_W * 0.5 - 0.02;
    const leafGeom = new THREE.BoxGeometry(
      face === "e" || face === "w" ? DOOR_TH : leafW,
      DOOR_H,
      face === "e" || face === "w" ? leafW : DOOR_TH,
    );
    this.doorL.add(new THREE.Mesh(leafGeom, doorMat));
    this.doorR.add(new THREE.Mesh(leafGeom.clone(), doorMat));

    const doorX =
      face === "e"
        ? hx - DOOR_TH * 0.5 - 0.02
        : face === "w"
          ? -hx + DOOR_TH * 0.5 + 0.02
          : 0;
    const doorZ =
      face === "n"
        ? hz - DOOR_TH * 0.5 - 0.02
        : face === "s"
          ? -hz + DOOR_TH * 0.5 + 0.02
          : 0;
    const doorY = floorT + DOOR_H * 0.5 + 0.06;
    const t = doorSlideAxis(face);
    const tL = t.clone().multiplyScalar(-DOOR_W * 0.25);
    const tR = t.clone().multiplyScalar(DOOR_W * 0.25);
    this.doorL.position.set(
      doorX + (face === "n" || face === "s" ? tL.x : 0),
      doorY,
      doorZ + (face === "e" || face === "w" ? tL.z : 0),
    );
    this.doorR.position.set(
      doorX + (face === "n" || face === "s" ? tR.x : 0),
      doorY,
      doorZ + (face === "e" || face === "w" ? tR.z : 0),
    );
    this.carRoot.add(this.doorL);
    this.carRoot.add(this.doorR);

    this.atlas = buildElevFloorAtlas(pick.maxLevel);
    this.matNormal = new THREE.MeshStandardMaterial({
      map: this.atlas,
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.12,
      emissive: 0x000000,
      side: THREE.DoubleSide,
    });
    this.matHighlight = new THREE.MeshStandardMaterial({
      map: this.atlas,
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.12,
      emissive: 0x1a5040,
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
    });
    this.matPickFlash = new THREE.MeshStandardMaterial({
      map: this.atlas,
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.18,
      emissive: 0x55ffc8,
      emissiveIntensity: 1.05,
      side: THREE.DoubleSide,
    });

    this.floorPickRoot = new THREE.Group();
    this.floorPickRoot.name = "elev_floor_pick";
    this.buildCarFloorPickPlanes(face, hx, hz, wallT, floorT, pick.shaftKey, pick.maxLevel);
    this.carRoot.add(this.floorPickRoot);

    this.root.add(this.carRoot);
    this.root.position.set(this.ox + layout.plateX, 0, this.oz + layout.plateZ);
  }

  private buildCarFloorPickPlanes(
    face: DoorFace,
    hx: number,
    hz: number,
    wallT: number,
    floorT: number,
    shaftKey: string,
    maxLevel: number,
  ): void {
    const zSpan = (FLOOR_COLS - 1) * (FLOOR_BTN_W + FLOOR_GAP);
    const z0 = -zSpan * 0.5;
    const y0 = floorT + 1.32;

    for (let level = 1; level <= maxLevel; level++) {
      const idx = level - 1;
      const col = idx % FLOOR_COLS;
      const row = Math.floor(idx / FLOOR_COLS);
      const ly = y0 + row * (FLOOR_BTN_H + FLOOR_GAP);
      const gridAlong = z0 + col * (FLOOR_BTN_W + FLOOR_GAP);

      const baseGeom = new THREE.PlaneGeometry(FLOOR_BTN_W, FLOOR_BTN_H);
      applyAtlasUvToPlaneGeometry(baseGeom, level);
      const mesh = new THREE.Mesh(baseGeom, this.matNormal);
      mesh.name = `elev_floor_btn_${level}`;
      (mesh.userData as FpElevFloorPickUserData)[FP_ELEV_FLOOR_PICK_UD] = { shaftKey, level };

      if (face === "e") {
        mesh.position.set(-hx + wallT + FLOOR_BTN_D * 0.5, ly, gridAlong);
        mesh.rotation.y = -Math.PI / 2;
      } else if (face === "w") {
        mesh.position.set(hx - wallT - FLOOR_BTN_D * 0.5, ly, gridAlong);
        mesh.rotation.y = Math.PI / 2;
      } else if (face === "n") {
        mesh.position.set(gridAlong, ly, -hz + wallT + FLOOR_BTN_D * 0.5);
      } else {
        mesh.position.set(gridAlong, ly, hz - wallT - FLOOR_BTN_D * 0.5);
        mesh.rotation.y = Math.PI;
      }

      this.floorPickRoot.add(mesh);
      this.floorPickMeshes.push(mesh);
    }
  }

  setFloorPickRootVisible(visible: boolean): void {
    this.floorPickRoot.visible = visible;
  }

  updateFloorPickMaterials(
    currentLevel: number,
    flashLevel: number,
    flashUntilMs: number,
    nowMs: number,
  ): void {
    const flashOn = flashLevel > 0 && nowMs < flashUntilMs;
    const sig = `${currentLevel}|${flashOn ? flashLevel : 0}|${flashOn ? Math.floor(flashUntilMs) : 0}`;
    if (sig === this.lastMatSig) return;
    this.lastMatSig = sig;
    for (const m of this.floorPickMeshes) {
      const pick = (m.userData as FpElevFloorPickUserData)[FP_ELEV_FLOOR_PICK_UD];
      if (!pick) continue;
      if (flashOn && pick.level === flashLevel) m.material = this.matPickFlash;
      else if (pick.level === currentLevel) m.material = this.matHighlight;
      else m.material = this.matNormal;
    }
  }

  updateFromServer(cabFeetY: number, doorOpen01: number): void {
    this.carRoot.position.y = cabFeetY;
    const o = doorOpen01;
    const slide = THREE.MathUtils.lerp(0, DOOR_SLIDE_M, o);
    const t = doorSlideAxis(this.layout.doorFace);
    this.doorL.children[0]!.position.set(-t.x * slide, 0, -t.z * slide);
    this.doorR.children[0]!.position.set(t.x * slide, 0, t.z * slide);
  }

  dispose(): void {
    for (const m of this.floorPickMeshes) {
      m.geometry.dispose();
    }
    this.floorPickMeshes.length = 0;
    this.matNormal.map = null;
    this.matHighlight.map = null;
    this.matPickFlash.map = null;
    this.matNormal.dispose();
    this.matHighlight.dispose();
    this.matPickFlash.dispose();
    this.atlas.dispose();
    this.carRoot.clear();
    this.root.clear();
  }
}

export type MountFpElevatorWorldOpts = {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  building: BuildingDoc;
  getFloorDoc: (floorDocId: string) => FloorDoc;
  floorSpacingM?: number;
};

export function mountFpElevatorWorld(opts: MountFpElevatorWorldOpts): {
  dispose(): void;
  tick(dt: number, nowMs: number, playerPos: THREE.Vector3): void;
  mergeWalkTop(
    worldX: number,
    worldZ: number,
    probeTopY: number,
    footRadiusXZ: number,
    stepUpMargin: number,
    baseTop: number,
  ): number;
  tryRaycastFloorPick(
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean;
  consumeInteractKey(playerPos: THREE.Vector3): boolean;
  shouldSuppressEpickup(): boolean;
  getFloorVisibilityBand(px: number, py: number, pz: number, nowMs: number): {
    lo: number;
    hi: number;
  };
} {
  const floorSpacingM = opts.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const ox = opts.building.worldOrigin?.[0] ?? 0;
  const oy = opts.building.worldOrigin?.[1] ?? 0;
  const oz = opts.building.worldOrigin?.[2] ?? 0;
  const maxLevel = maxBuildingLevelIndex(opts.building);
  const layouts = listElevatorShaftLayouts(opts.building, opts.getFloorDoc);
  const layoutByKey = new Map(layouts.map((l) => [l.planKey, l] as const));

  const storeyOpts = {
    buildingWorldOriginY: oy,
    floorSpacingM,
    maxLevel,
  };

  const visuals = new Map<string, ShaftVisual>();
  for (const layout of layouts) {
    const v = new ShaftVisual(layout, [ox, oy, oz], {
      shaftKey: layout.planKey,
      maxLevel,
    });
    visuals.set(layout.planKey, v);
    opts.buildingRoot.add(v.root);
  }

  const raycaster = new THREE.Raycaster();
  const screenCenterNdc = new THREE.Vector2(0, 0);

  /** Brief glow on the button that accepted a floor request (client-only). */
  const pickFlash = { shaftKey: "", level: 0, untilMs: 0 };

  const latest = new Map<string, ElevatorCar>();
  const cabInterp = new Map<string, SmoothScalar>();
  const doorInterp = new Map<string, SmoothScalar>();

  const ensureInterp = (key: string) => {
    if (!cabInterp.has(key)) cabInterp.set(key, new SmoothScalar());
    if (!doorInterp.has(key)) doorInterp.set(key, new SmoothScalar());
  };

  const ingest = (row: ElevatorCar) => {
    latest.set(row.shaftKey, row);
    ensureInterp(row.shaftKey);
    const now = performance.now();
    cabInterp.get(row.shaftKey)!.setTarget(row.cabFloorY, now);
    doorInterp.get(row.shaftKey)!.setTarget(row.doorOpen01, now);
  };

  for (const row of opts.conn.db.elevator_car) {
    ingest(row as ElevatorCar);
  }

  const onElevRow = (_ctx: unknown, row: ElevatorCar) => {
    ingest(row);
  };
  opts.conn.db.elevator_car.onInsert(onElevRow);
  opts.conn.db.elevator_car.onUpdate(onElevRow);

  const getCabY = (key: string, nowMs: number): number =>
    cabInterp.get(key)?.eval(nowMs) ?? latest.get(key)?.cabFloorY ?? 0;

  const getDoor = (key: string, nowMs: number): number =>
    doorInterp.get(key)?.eval(nowMs) ?? latest.get(key)?.doorOpen01 ?? 1;

  const mergeWalkTop = (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    footRadiusXZ: number,
    stepUpMargin: number,
    baseTop: number,
  ): number => {
    let best = baseTop;
    const fx0 = worldX - footRadiusXZ;
    const fx1 = worldX + footRadiusXZ;
    const fz0 = worldZ - footRadiusXZ;
    const fz1 = worldZ + footRadiusXZ;
    const nowMs = performance.now();
    for (const [key, row] of latest) {
      const layout = layoutByKey.get(key);
      if (!layout) continue;
      const vis = visuals.get(key);
      if (!vis) continue;
      const { halfX: ihx, halfZ: ihz } = vis.inner;
      const wx = ox + row.plateX;
      const wz = oz + row.plateZ;
      if (fx1 < wx - ihx || fx0 > wx + ihx || fz1 < wz - ihz || fz0 > wz + ihz) {
        continue;
      }
      const cabFeet = getCabY(key, nowMs);
      const geomTop = cabFeet - FP_LOCOMOTION_SKIN;
      if (geomTop > probeTopY + stepUpMargin + 0.02) {
        continue;
      }
      if (geomTop <= probeTopY + stepUpMargin) {
        if (!Number.isFinite(best)) best = geomTop;
        else best = Math.max(best, geomTop);
      }
    }
    return best;
  };

  const isInsideCarHud = (px: number, py: number, pz: number, key: string, nowMs: number): boolean => {
    const row = latest.get(key);
    const vis = visuals.get(key);
    if (!row || !vis) return false;
    const lx = px - (ox + row.plateX);
    const lz = pz - (oz + row.plateZ);
    const cabY = getCabY(key, nowMs);
    return fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabY, vis.inner);
  };

  const isNearCall = (px: number, py: number, pz: number, key: string, storey: number): boolean => {
    const layout = layoutByKey.get(key);
    const row = latest.get(key);
    if (!layout || !row) return false;
    const n =
      layout.doorFace === "e"
        ? ([1, 0] as const)
        : layout.doorFace === "w"
          ? ([-1, 0] as const)
          : layout.doorFace === "n"
            ? ([0, 1] as const)
            : ([0, -1] as const);
    const { halfX, halfZ } = elevatorHoistwayInnerHalfExtents(layout.sx, layout.sz);
    const outward = layout.doorFace === "e" || layout.doorFace === "w" ? halfX : halfZ;
    const pad = 0.52;
    const wx = ox + row.plateX;
    const wz = oz + row.plateZ;
    const cx = wx + n[0] * (outward + pad);
    const cz = wz + n[1] * (outward + pad);
    const st = Math.max(1, Math.min(maxLevel, storey));
    const cyy =
      elevatorSupportFeetWorldY({
        buildingWorldOriginY: oy,
        levelIndex: st,
        floorSpacingM,
        shaftPlateLocalY: layout.plateLocalY,
        shaftSy: layout.sy,
      }) + 1.1;
    if (Math.hypot(px - cx, pz - cz) > CALL_RADIUS_XZ) return false;
    if (Math.abs(py - cyy) > CALL_Y_HALF_WINDOW) return false;
    return true;
  };

  const tryRaycastFloorPick = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
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
      const pick = (mesh.userData as Partial<FpElevFloorPickUserData>)[FP_ELEV_FLOOR_PICK_UD];
      if (!pick) continue;
      const row = latest.get(pick.shaftKey);
      const layout = layoutByKey.get(pick.shaftKey);
      const vis = visuals.get(pick.shaftKey);
      if (!row || !layout || !vis) return false;
      const cabY = getCabY(pick.shaftKey, nowMs);
      const lx = playerPos.x - (ox + row.plateX);
      const lz = playerPos.z - (oz + row.plateZ);
      const py = playerPos.y;
      const inCab = fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabY, vis.inner);
      const inDoorway = fpElevCarPanelDoorwayViewLocal(layout.doorFace, lx, lz, py, cabY, vis.inner);
      if (!inCab && !inDoorway) return false;
      if (getDoor(pick.shaftKey, nowMs) < 0.32) return false;
      try {
        void opts.conn.reducers.elevatorSelectFloor({
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

  const getFloorVisibilityBand = (px: number, py: number, pz: number, nowMs: number) => {
    const sPlayer = estimateStoreyFromFeetY(py, storeyOpts);
    let lo = sPlayer - 1;
    let hi = sPlayer + 1;
    for (const key of visuals.keys()) {
      if (isInsideCarHud(px, py, pz, key, nowMs)) {
        const cabY = getCabY(key, nowMs);
        const sCab = estimateStoreyFromFeetY(cabY, storeyOpts);
        lo = Math.min(lo, sCab - 1);
        hi = Math.max(hi, sCab + 1);
      }
    }
    lo = Math.max(1, Math.min(maxLevel, lo));
    hi = Math.max(1, Math.min(maxLevel, hi));
    if (lo > hi) [lo, hi] = [hi, lo];
    return { lo, hi };
  };

  const tick = (_dt: number, nowMs: number, playerPos: THREE.Vector3) => {
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;

    for (const [key, vis] of visuals) {
      const cabY = getCabY(key, nowMs);
      const d = getDoor(key, nowMs);
      vis.updateFromServer(cabY, d);
      const row = latest.get(key);
      const flashActive = pickFlash.untilMs > nowMs && pickFlash.shaftKey === key;
      vis.updateFloorPickMaterials(
        Number(row?.currentLevel ?? 1),
        flashActive ? pickFlash.level : 0,
        pickFlash.untilMs,
        nowMs,
      );
      const insideThis = isInsideCarHud(px, py, pz, key, nowMs);
      const lx = px - (ox + row!.plateX);
      const lz = pz - (oz + row!.plateZ);
      const doorwayView = fpElevCarPanelDoorwayViewLocal(
        vis.layout.doorFace,
        lx,
        lz,
        py,
        cabY,
        vis.inner,
      );
      vis.setFloorPickRootVisible((insideThis || doorwayView) && d > 0.16);
    }

    let insideKey: string | null = null;
    for (const key of visuals.keys()) {
      if (isInsideCarHud(px, py, pz, key, nowMs)) {
        insideKey = key;
        break;
      }
    }

    if (insideKey) {
      setFpElevatorHudView({ kind: "hidden" });
    } else {
      const storey = estimateStoreyFromFeetY(py, storeyOpts);
      let callKey: string | null = null;
      for (const key of visuals.keys()) {
        if (isNearCall(px, py, pz, key, storey)) {
          callKey = key;
          break;
        }
      }
      if (callKey) {
        const label = storey <= 1 ? "Ground" : `Story ${storey}`;
        setFpElevatorHudView({
          kind: "call",
          shaftPlanKey: callKey,
          floorLabel: label,
        });
      } else {
        setFpElevatorHudView({ kind: "hidden" });
      }
    }
  };

  const consumeInteractKey = (playerPos: THREE.Vector3): boolean => {
    const v = getFpElevatorHudView();
    if (v.kind !== "call") return false;
    const storey = estimateStoreyFromFeetY(playerPos.y, storeyOpts);
    try {
      void opts.conn.reducers.elevatorHail({
        shaftKey: v.shaftPlanKey,
        level: storey >>> 0,
      });
    } catch (e) {
      console.warn("[fpElevatorWorld] elevatorHail", e);
    }
    return true;
  };

  const shouldSuppressEpickup = (): boolean => {
    const v = getFpElevatorHudView();
    return v.kind === "call";
  };

  return {
    dispose: () => {
      opts.conn.db.elevator_car.removeOnInsert(onElevRow);
      opts.conn.db.elevator_car.removeOnUpdate(onElevRow);
      for (const vis of visuals.values()) {
        opts.buildingRoot.remove(vis.root);
        vis.dispose();
      }
      latest.clear();
      setFpElevatorHudView({ kind: "hidden" });
    },
    tick,
    mergeWalkTop,
    tryRaycastFloorPick,
    consumeInteractKey,
    shouldSuppressEpickup,
    getFloorVisibilityBand,
  };
}
