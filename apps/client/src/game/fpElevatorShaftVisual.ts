import * as THREE from "three";
import type { ElevatorCabDef, LandingKitDef } from "@the-mammoth/schemas";
import type { ElevatorShaftLayout } from "@the-mammoth/world";
import {
  applyCabMaterialSlot,
  applyLandingFrameSlot,
  applyLandingGlassSlot,
  applyLandingKitPartTransforms,
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
  FP_ELEV_EXTERIOR_DOOR_PICK_UD,
  FP_ELEV_FLOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
  type FpElevExteriorDoorPickUserData,
  type FpElevFloorPickUserData,
  type FpElevLandingHailPickUserData,
} from "./fpElevatorConstants.js";
import { applyAtlasUvToPlaneGeometry, buildElevFloorAtlas } from "./fpElevFloorButtonAtlas.js";
import { doorSlideAxis, type ElevatorDoorFace } from "./fpElevatorLabels.js";
import type { FpElevatorInnerExtents } from "./fpElevatorVolumes.js";
import {
  createExteriorLandingDoorPivot,
  EXTERIOR_DOOR_SWING_MAX_RAD,
} from "./fpElevatorLandingDoorVisual.js";

type DoorFace = ElevatorDoorFace;

function buildLandingHailIconTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 44px sans-serif";
  ctx.fillText("⬆", size * 0.5, 42);
  ctx.fillText("⬇", size * 0.5, 86);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

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
  readonly landingRoot: THREE.Group;
  readonly landingDoorPickRoot: THREE.Group;
  readonly landingHailPickRoot: THREE.Group;
  private readonly landingDoorSwings: {
    level: number;
    swing: THREE.Group;
    swingSign: number;
  }[] = [];
  private readonly extRedMat: THREE.MeshStandardMaterial;
  private readonly extGlassMat: THREE.MeshPhysicalMaterial;
  private readonly hailBtnMat: THREE.MeshStandardMaterial;
  private readonly hailBtnIconMat: THREE.MeshBasicMaterial;
  private readonly hailBtnIconTex: THREE.CanvasTexture;
  private readonly exteriorSwingMaxRad: number;
  private readonly ceilMat: THREE.MeshStandardMaterial;

  constructor(
    layout: ElevatorShaftLayout,
    buildingWorldOrigin: readonly [number, number, number],
    pick: {
      shaftKey: string;
      maxLevel: number;
      floorSpacingM: number;
      buildingWorldOriginY: number;
    },
    visualDefs?: { cabDef?: ElevatorCabDef; landingKitDef?: LandingKitDef },
  ) {
    this.layout = layout;
    this.exteriorSwingMaxRad =
      visualDefs?.landingKitDef?.exteriorSwingMaxRad ?? EXTERIOR_DOOR_SWING_MAX_RAD;
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
    this.extGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.06,
      transmission: 0.92,
      thickness: 0.09,
      ior: 1.45,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    if (visualDefs?.landingKitDef?.materials) {
      applyLandingFrameSlot(this.extRedMat, visualDefs.landingKitDef.materials.frame);
      applyLandingGlassSlot(this.extGlassMat, visualDefs.landingKitDef.materials.glass);
    }
    this.landingRoot = new THREE.Group();
    this.landingRoot.name = "elev_landing_exterior_doors";
    this.landingDoorPickRoot = new THREE.Group();
    this.landingDoorPickRoot.name = "elev_exterior_door_pick";
    this.landingHailPickRoot = new THREE.Group();
    this.landingHailPickRoot.name = "elev_landing_hail_pick";
    this.hailBtnMat = new THREE.MeshStandardMaterial({
      color: 0x101010,
      roughness: 0.36,
      metalness: 0.08,
    });
    this.hailBtnIconTex = buildLandingHailIconTexture();
    this.hailBtnIconMat = new THREE.MeshBasicMaterial({
      map: this.hailBtnIconTex,
      transparent: true,
      depthWrite: false,
    });
    this.root.add(this.landingRoot);
    this.root.add(this.landingDoorPickRoot);
    this.root.add(this.landingHailPickRoot);

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
    this.ceilMat = new THREE.MeshStandardMaterial({
      color: 0x6a6f78,
      roughness: 0.72,
      metalness: 0.08,
    });
    if (visualDefs?.cabDef?.materials) {
      applyCabMaterialSlot(wallMat, visualDefs.cabDef.materials.wall);
      applyCabMaterialSlot(floorMat, visualDefs.cabDef.materials.floor);
      applyCabMaterialSlot(doorMat, visualDefs.cabDef.materials.door);
      applyCabMaterialSlot(
        this.ceilMat,
        visualDefs.cabDef.materials.ceiling ?? visualDefs.cabDef.materials.wall,
      );
    }

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
      this.ceilMat,
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
        visualDefs?.landingKitDef,
      );
      this.tagLandingDoorInteractMeshes(structure, pick.shaftKey, level);
      wrap.add(structure);
      if (visualDefs?.landingKitDef) {
        applyLandingKitPartTransforms(structure, visualDefs.landingKitDef);
      }
      this.landingRoot.add(wrap);
      this.landingDoorSwings.push({ level, swing, swingSign });

      const doorPickWrap = new THREE.Group();
      doorPickWrap.position.set(0, feetY, 0);
      const doorPick = this.createLandingDoorPickMesh(face, hx, hz, level, pick.shaftKey);
      doorPickWrap.add(doorPick);
      this.landingDoorPickRoot.add(doorPickWrap);

      const hailWrap = new THREE.Group();
      hailWrap.position.set(0, feetY, 0);
      const hailBtn = this.createLandingHailButtonMesh(face, hx, hz, level, pick.shaftKey);
      hailWrap.add(hailBtn);
      this.landingHailPickRoot.add(hailWrap);
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

  private createLandingDoorPickMesh(
    face: DoorFace,
    hx: number,
    hz: number,
    level: number,
    shaftKey: string,
  ): THREE.Mesh {
    const pick = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, DOOR_H, DOOR_W),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    );
    pick.name = `elev_exterior_door_pick_${level}`;
    (pick.userData as FpElevExteriorDoorPickUserData)[FP_ELEV_EXTERIOR_DOOR_PICK_UD] = {
      shaftKey,
      level,
    };
    if (face === "e") pick.position.set(hx + 0.06, DOOR_H * 0.5 + 0.1, 0);
    else if (face === "w") pick.position.set(-hx - 0.06, DOOR_H * 0.5 + 0.1, 0);
    else if (face === "n") {
      pick.position.set(0, DOOR_H * 0.5 + 0.1, hz + 0.06);
      pick.rotation.y = Math.PI * 0.5;
    } else {
      pick.position.set(0, DOOR_H * 0.5 + 0.1, -hz - 0.06);
      pick.rotation.y = Math.PI * 0.5;
    }
    return pick;
  }

  private tagLandingDoorInteractMeshes(
    root: THREE.Object3D,
    shaftKey: string,
    level: number,
  ): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      (obj.userData as FpElevExteriorDoorPickUserData)[FP_ELEV_EXTERIOR_DOOR_PICK_UD] = {
        shaftKey,
        level,
      };
    });
  }

  private createLandingHailButtonMesh(
    face: DoorFace,
    hx: number,
    hz: number,
    level: number,
    shaftKey: string,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `elev_landing_hail_panel_${level}`;
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.045, 32),
      this.hailBtnMat,
    );
    button.name = `elev_landing_hail_btn_${level}`;
    (button.userData as FpElevLandingHailPickUserData)[FP_ELEV_LANDING_HAIL_PICK_UD] = {
      shaftKey,
      level,
    };
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.17),
      this.hailBtnIconMat,
    );
    const y = 1.34;
    const outerHx = this.layout.sx * 0.5;
    const outerHz = this.layout.sz * 0.5;
    const wallSurfaceOffset = 0.034;
    const doorSideOffset = DOOR_W * 0.5 + 0.32;
    group.add(button);
    group.add(icon);
    if (face === "e") {
      group.position.set(outerHx + wallSurfaceOffset, y, -doorSideOffset);
      button.rotation.z = Math.PI * 0.5;
      button.position.set(0.045, 0, 0);
      icon.position.set(0.069, 0, 0);
      icon.rotation.y = Math.PI * 0.5;
    } else if (face === "w") {
      group.position.set(-outerHx - wallSurfaceOffset, y, doorSideOffset);
      button.rotation.z = Math.PI * 0.5;
      button.position.set(-0.045, 0, 0);
      icon.position.set(-0.069, 0, 0);
      icon.rotation.y = -Math.PI * 0.5;
    } else if (face === "n") {
      group.position.set(doorSideOffset, y, outerHz + wallSurfaceOffset);
      button.rotation.x = Math.PI * 0.5;
      button.position.set(0, 0, 0.045);
      icon.position.set(0, 0, 0.069);
    } else {
      group.position.set(-doorSideOffset, y, -outerHz - wallSurfaceOffset);
      button.rotation.x = Math.PI * 0.5;
      button.position.set(0, 0, -0.045);
      icon.position.set(0, 0, -0.069);
      icon.rotation.y = Math.PI;
    }
    return group;
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
      e.swing.rotation.y = e.swingSign * u * this.exteriorSwingMaxRad;
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
    this.landingDoorPickRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.landingHailPickRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.ceilMat.dispose();
    this.extRedMat.dispose();
    this.extGlassMat.dispose();
    this.hailBtnMat.dispose();
    this.hailBtnIconMat.dispose();
    this.hailBtnIconTex.dispose();
    this.matNormal.map = null;
    this.matHighlight.map = null;
    this.matPickFlash.map = null;
    this.matNormal.dispose();
    this.matHighlight.dispose();
    this.matPickFlash.dispose();
    this.atlas.dispose();
    this.carRoot.clear();
    this.landingRoot.clear();
    this.landingDoorPickRoot.clear();
    this.landingHailPickRoot.clear();
    this.root.clear();
  }
}
