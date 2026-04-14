import * as THREE from "three";
import type { ElevatorShaftLayout } from "@the-mammoth/world";
import {
  elevatorHoistwayInnerHalfExtents,
  elevatorSupportFeetWorldY,
} from "@the-mammoth/world";
import {
  CAB_INTERP_SEC,
  CAR_CEIL_BELOW_SHAFT_TOP,
  CAR_INNER_MARGIN,
  DOOR_H,
  DOOR_SLIDE_M,
  DOOR_TH,
  DOOR_W,
  FLOOR_BTN_D,
  FLOOR_BTN_H,
  FLOOR_BTN_W,
  FLOOR_COLS,
  FLOOR_GAP,
  FP_ELEV_FLOOR_PICK_UD,
  type FpElevFloorPickUserData,
} from "./fpElevatorConstants.js";
import { applyAtlasUvToPlaneGeometry, buildElevFloorAtlas } from "./fpElevFloorButtonAtlas.js";
import { doorSlideAxis, type ElevatorDoorFace } from "./fpElevatorLabels.js";
import type { FpElevatorInnerExtents } from "./fpElevatorVolumes.js";
import {
  createExteriorLandingDoorPivot,
  EXTERIOR_DOOR_SWING_MAX_RAD,
} from "./fpElevatorLandingDoorVisual.js";

type DoorFace = ElevatorDoorFace;

export class FpElevatorCabInterpScalar {
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

export class FpElevatorShaftVisual {
  readonly layout: ElevatorShaftLayout;
  readonly root: THREE.Group;
  private readonly carRoot: THREE.Group;
  private readonly doorL: THREE.Group;
  private readonly doorR: THREE.Group;
  readonly inner: FpElevatorInnerExtents;
  private readonly ox: number;
  private readonly oz: number;
  readonly floorPickRoot: THREE.Group;
  private readonly floorPickMeshes: THREE.Mesh[] = [];
  private readonly atlas: THREE.CanvasTexture;
  private readonly matNormal: THREE.MeshStandardMaterial;
  private readonly matHighlight: THREE.MeshStandardMaterial;
  private readonly matPickFlash: THREE.MeshStandardMaterial;
  private lastMatSig = "";
  private readonly landingRoot: THREE.Group;
  private readonly landingDoorSwings: {
    level: number;
    swing: THREE.Group;
    swingSign: number;
  }[] = [];
  private readonly extRedMat: THREE.MeshStandardMaterial;
  private readonly extGlassMat: THREE.MeshStandardMaterial;

  constructor(
    layout: ElevatorShaftLayout,
    buildingWorldOrigin: readonly [number, number, number],
    pick: {
      shaftKey: string;
      maxLevel: number;
      floorSpacingM: number;
      buildingWorldOriginY: number;
    },
  ) {
    this.layout = layout;
    this.ox = buildingWorldOrigin[0];
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
    this.extRedMat = new THREE.MeshStandardMaterial({
      color: 0xc42b2b,
      roughness: 0.52,
      metalness: 0.12,
    });
    this.extGlassMat = new THREE.MeshStandardMaterial({
      color: 0xb5d4ea,
      metalness: 0.22,
      roughness: 0.14,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.landingRoot = new THREE.Group();
    this.landingRoot.name = "elev_landing_exterior_doors";
    this.root.add(this.landingRoot);

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

    for (let level = 1; level <= pick.maxLevel; level++) {
      const feetY = elevatorSupportFeetWorldY({
        buildingWorldOriginY: pick.buildingWorldOriginY,
        levelIndex: level,
        floorSpacingM: pick.floorSpacingM,
        shaftPlateLocalY: layout.plateLocalY,
        shaftSy: layout.sy,
      });
      const wrap = new THREE.Group();
      wrap.position.set(0, feetY, 0);
      const { structure, swing, swingSign } = createExteriorLandingDoorPivot(
        face,
        hx,
        hz,
        this.extRedMat,
        this.extGlassMat,
      );
      wrap.add(structure);
      this.landingRoot.add(wrap);
      this.landingDoorSwings.push({ level, swing, swingSign });
    }

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
    const y0 = floorT + 1.12;

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

  updateLandingExteriorDoorSwings(swingByLevel: ReadonlyMap<number, number>): void {
    for (const e of this.landingDoorSwings) {
      const u = swingByLevel.get(e.level) ?? 0;
      e.swing.rotation.y = e.swingSign * u * EXTERIOR_DOOR_SWING_MAX_RAD;
    }
  }

  dispose(): void {
    for (const m of this.floorPickMeshes) {
      m.geometry.dispose();
    }
    this.floorPickMeshes.length = 0;
    this.landingRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.extRedMat.dispose();
    this.extGlassMat.dispose();
    this.matNormal.map = null;
    this.matHighlight.map = null;
    this.matPickFlash.map = null;
    this.matNormal.dispose();
    this.matHighlight.dispose();
    this.matPickFlash.dispose();
    this.atlas.dispose();
    this.carRoot.clear();
    this.landingRoot.clear();
    this.root.clear();
  }
}
