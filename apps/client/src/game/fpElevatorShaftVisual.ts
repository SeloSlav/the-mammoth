import * as THREE from "three";
import type { ElevatorCabDef, LandingKitDef } from "@the-mammoth/schemas";
import type { ElevatorShaftLayout, FloorShortLabelMap } from "@the-mammoth/world";
import {
  applyLandingFrameSlot,
  applyLandingGlassSlot,
  applyLandingKitPartTransforms,
  buildElevatorCabCarVisual,
  elevatorHoistwayInnerHalfExtents,
  elevatorSupportFeetWorldY,
  shortFloorLabelForLevel,
} from "@the-mammoth/world";
import {
  CAB_INTERP_SEC,
  CAR_CEIL_BELOW_SHAFT_TOP,
  CAR_INNER_MARGIN,
  DOOR_H,
  DOOR_SLIDE_M,
  DOOR_W,
  FP_ELEV_EXTERIOR_DOOR_PICK_UD,
  FP_ELEV_FLOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
  type FpElevExteriorDoorPickUserData,
  type FpElevFloorPickUserData,
  type FpElevLandingHailPickUserData,
} from "./fpElevatorConstants.js";
import { buildElevFloorAtlas } from "./fpElevFloorButtonAtlas.js";
import { doorSlideAxis, type ElevatorDoorFace } from "./fpElevatorLabels.js";
import type { FpElevatorInnerExtents } from "./fpElevatorVolumes.js";
import {
  createExteriorLandingDoorPivot,
  EXTERIOR_DOOR_SWING_MAX_RAD,
} from "./fpElevatorLandingDoorVisual.js";

type DoorFace = ElevatorDoorFace;

/** Hail panel origin offset along the door normal from hoistway outer half-extent (`sx/sz`). */
const LANDING_HAIL_FACE_OUT_M = 0.14;
/** Level 1 (PR): exterior trim sits slightly inset vs `sx/sz`; smaller offset matches upper-landing flush. */
const LANDING_HAIL_FACE_OUT_GROUND_M = -0.025;

const LANDING_HAIL_ICON_TEX_SIZE = 160;

/** Arrows hug top/bottom so the storey label has clear vertical padding in the middle. */
const HAIL_ICON_ARROW_TOP_Y = 0.17;
const HAIL_ICON_ARROW_BOTTOM_Y = 0.83;
const HAIL_ICON_LABEL_Y = 0.5;
/** Readable on the dark hail disc; distinct from white arrows. */
const HAIL_ICON_LABEL_HEX = "#5eb0ff";

function paintLandingHailIconCanvas(
  ctx: CanvasRenderingContext2D,
  size: number,
  cabFloorLevel: number,
  floorLabelByLevel?: FloorShortLabelMap,
): void {
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const level = Math.max(1, Math.floor(cabFloorLevel));
  const label = shortFloorLabelForLevel(level, floorLabelByLevel);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 42px system-ui, sans-serif";
  ctx.fillText("⬆", size * 0.5, size * HAIL_ICON_ARROW_TOP_Y);
  ctx.fillText("⬇", size * 0.5, size * HAIL_ICON_ARROW_BOTTOM_Y);

  ctx.fillStyle = HAIL_ICON_LABEL_HEX;
  const len = label.length;
  const labelFont =
    len >= 3 ? "900 30px system-ui, sans-serif" : len === 2 ? "900 36px system-ui, sans-serif" : "900 40px system-ui, sans-serif";
  ctx.font = labelFont;
  ctx.fillText(label, size * 0.5, size * HAIL_ICON_LABEL_Y);
}

function buildLandingHailIconTexture(
  initialCabFloorLevel: number,
  floorLabelByLevel?: FloorShortLabelMap,
): THREE.CanvasTexture {
  const size = LANDING_HAIL_ICON_TEX_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  paintLandingHailIconCanvas(ctx, size, initialCabFloorLevel, floorLabelByLevel);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class FpElevatorCabInterpScalar {
  private readonly interpSec: number;
  private a = 0;
  private b = 0;
  private t0Ms = 0;
  private has = false;

  constructor(interpSec: number = CAB_INTERP_SEC) {
    this.interpSec = interpSec;
  }

  setTarget(v: number, nowMs: number): void {
    this.a = this.has ? this.eval(nowMs) : v;
    this.b = v;
    this.t0Ms = nowMs;
    this.has = true;
  }

  eval(nowMs: number): number {
    if (!this.has) return this.b;
    const u = Math.min(1, (nowMs - this.t0Ms) / (this.interpSec * 1000));
    const s = u * u * (3 - 2 * u);
    return this.a + (this.b - this.a) * s;
  }
}

type FloorPickButtonVisual = {
  level: number;
  bodyMesh: THREE.Mesh;
  labelMesh: THREE.Mesh;
  bodyNormalMat: THREE.Material;
  bodyHighlightMat: THREE.Material;
  bodyFlashMat: THREE.Material;
};

function cloneFloorPickBodyMaterial(
  base: THREE.Material,
  opts: { emissiveHex: number; emissiveIntensity: number; brighten: number },
): THREE.Material {
  const mat = base.clone();
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.color.multiplyScalar(opts.brighten);
    mat.emissive.setHex(opts.emissiveHex);
    mat.emissiveIntensity = opts.emissiveIntensity;
  } else if (mat instanceof THREE.MeshBasicMaterial) {
    mat.color.multiplyScalar(opts.brighten);
  }
  return mat;
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
  private readonly floorPickButtons: FloorPickButtonVisual[] = [];
  private readonly floorPickBodyMaterials = new Set<THREE.Material>();
  private readonly atlas: THREE.CanvasTexture;
  private readonly matNormal: THREE.MeshBasicMaterial;
  private readonly matHighlight: THREE.MeshBasicMaterial;
  private readonly matPickFlash: THREE.MeshBasicMaterial;
  private lastMatSig = "";
  readonly landingRoot: THREE.Group;
  readonly landingDoorPickRoot: THREE.Group;
  readonly landingHailPickRoot: THREE.Group;
  private readonly landingHailPickByLevel = new Map<number, THREE.Object3D>();
  private readonly landingDoorSwings: {
    level: number;
    swing: THREE.Group;
    swingSign: number;
  }[] = [];
  private readonly extRedMat: THREE.MeshStandardMaterial;
  private readonly extGlassMat: THREE.MeshPhysicalMaterial;
  private readonly hailBtnMatTemplate: THREE.MeshStandardMaterial;
  private readonly hailBtnMaterials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly hailBtnIconMat: THREE.MeshBasicMaterial;
  private readonly hailBtnIconTex: THREE.CanvasTexture;
  /** Avoid repainting the shared hail icon every frame when the displayed storey is unchanged. */
  private lastHailCabFloorPainted = Number.NaN;
  private readonly floorLabelByLevel?: FloorShortLabelMap;
  private readonly exteriorSwingMaxRad: number;

  constructor(
    layout: ElevatorShaftLayout,
    buildingWorldOrigin: readonly [number, number, number],
    pick: {
      shaftKey: string;
      maxLevel: number;
      floorLabelByLevel?: FloorShortLabelMap;
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
    this.floorLabelByLevel = pick.floorLabelByLevel;
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
    this.hailBtnMatTemplate = new THREE.MeshStandardMaterial({
      color: 0x2a4a5c,
      roughness: 0.36,
      metalness: 0.16,
      emissive: new THREE.Color(0x143040),
      emissiveIntensity: 0.28,
    });
    this.hailBtnIconTex = buildLandingHailIconTexture(1, pick.floorLabelByLevel);
    this.hailBtnIconMat = new THREE.MeshBasicMaterial({
      map: this.hailBtnIconTex,
      transparent: true,
      depthWrite: false,
    });
    this.root.add(this.landingRoot);
    this.root.add(this.landingDoorPickRoot);
    this.root.add(this.landingHailPickRoot);

    this.atlas = buildElevFloorAtlas(pick.maxLevel, pick.floorLabelByLevel);
    // Unlit labels: PBR on a circular plane + dark atlas reads as a false "chrome oval" from
    // specular / env highlights. The atlas already carries rim chrome; BasicMaterial matches that.
    this.matNormal = new THREE.MeshBasicMaterial({
      map: this.atlas,
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    this.matHighlight = new THREE.MeshBasicMaterial({
      map: this.atlas,
      color: 0xc5f8ea,
      side: THREE.DoubleSide,
    });
    this.matPickFlash = new THREE.MeshBasicMaterial({
      map: this.atlas,
      color: 0xe8ffff,
      side: THREE.DoubleSide,
    });

    const cabVisual = buildElevatorCabCarVisual({
      layout,
      def: visualDefs?.cabDef,
      maxLevel: pick.maxLevel,
      floorLabelByLevel: pick.floorLabelByLevel,
      doorOpen01: 0,
      includeDoors: true,
      floorButtonLabelMaterial: this.matNormal,
      rootName: "elevator_car",
    });
    this.carRoot = cabVisual.root;
    this.doorL = cabVisual.doorL ?? new THREE.Group();
    this.doorR = cabVisual.doorR ?? new THREE.Group();
    this.floorPickRoot = cabVisual.panelRoot;
    this.floorPickRoot.name = "elev_floor_pick";
    for (const button of cabVisual.floorButtons) {
      (button.labelMesh.userData as FpElevFloorPickUserData)[FP_ELEV_FLOOR_PICK_UD] = {
        shaftKey: pick.shaftKey,
        level: button.level,
      };
      const bodyNormalMat = button.bodyMesh.material as THREE.Material;
      const bodyHighlightMat = cloneFloorPickBodyMaterial(bodyNormalMat, {
        emissiveHex: 0x1f8a6f,
        emissiveIntensity: 0.7,
        brighten: 1.14,
      });
      const bodyFlashMat = cloneFloorPickBodyMaterial(bodyNormalMat, {
        emissiveHex: 0x7ffff4,
        emissiveIntensity: 1.15,
        brighten: 1.25,
      });
      this.floorPickBodyMaterials.add(bodyNormalMat);
      this.floorPickBodyMaterials.add(bodyHighlightMat);
      this.floorPickBodyMaterials.add(bodyFlashMat);
      this.floorPickButtons.push({
        level: button.level,
        bodyMesh: button.bodyMesh,
        labelMesh: button.labelMesh,
        bodyNormalMat,
        bodyHighlightMat,
        bodyFlashMat,
      });
    }
    const face = layout.doorFace;
    const hx = this.inner.halfX;
    const hz = this.inner.halfZ;

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
      const outerHx = this.layout.sx * 0.5;
      const outerHz = this.layout.sz * 0.5;
      const hailBtn = this.createLandingHailButtonMesh(face, outerHx, outerHz, level, pick.shaftKey);
      hailWrap.add(hailBtn);
      this.landingHailPickRoot.add(hailWrap);
      this.landingHailPickByLevel.set(level, hailWrap);
    }

    this.root.add(this.carRoot);
    this.root.position.set(this.ox + layout.plateX, 0, this.oz + layout.plateZ);
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
    const btnMat = this.hailBtnMatTemplate.clone();
    btnMat.name = `elev_hail_btn_mat_${level}`;
    this.hailBtnMaterials.set(level, btnMat);
    const btnR = 0.175;
    const btnDepth = 0.065;
    const btnHalf = btnDepth * 0.5;
    const iconPlane = 0.248;
    /** Outer circular face sits at `btnDepth + btnHalf` from the panel origin (matches prior hail layout). */
    const iconOff = btnDepth + btnHalf + 0.0015;
    const button = new THREE.Mesh(new THREE.CylinderGeometry(btnR, btnR, btnDepth, 32), btnMat);
    button.name = `elev_landing_hail_btn_${level}`;
    (button.userData as FpElevLandingHailPickUserData)[FP_ELEV_LANDING_HAIL_PICK_UD] = {
      shaftKey,
      level,
    };
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(iconPlane, iconPlane),
      this.hailBtnIconMat,
    );
    const y = 1.34;
    const faceOut = level === 1 ? LANDING_HAIL_FACE_OUT_GROUND_M : LANDING_HAIL_FACE_OUT_M;
    const doorSideOffset = DOOR_W * 0.5 + 0.32;
    group.add(button);
    group.add(icon);
    if (face === "e") {
      group.position.set(hx + faceOut, y, -doorSideOffset);
      button.rotation.z = Math.PI * 0.5;
      button.position.set(btnDepth, 0, 0);
      icon.position.set(iconOff, 0, 0);
      icon.rotation.y = Math.PI * 0.5;
    } else if (face === "w") {
      group.position.set(-hx - faceOut, y, doorSideOffset);
      button.rotation.z = Math.PI * 0.5;
      button.position.set(-btnDepth, 0, 0);
      icon.position.set(-iconOff, 0, 0);
      icon.rotation.y = -Math.PI * 0.5;
    } else if (face === "n") {
      group.position.set(doorSideOffset, y, hz + faceOut);
      button.rotation.x = Math.PI * 0.5;
      button.position.set(0, 0, btnDepth);
      icon.position.set(0, 0, iconOff);
    } else {
      group.position.set(-doorSideOffset, y, -hz - faceOut);
      button.rotation.x = Math.PI * 0.5;
      button.position.set(0, 0, -btnDepth);
      icon.position.set(0, 0, -iconOff);
      icon.rotation.y = Math.PI;
    }
    return group;
  }

  setFloorPickRootVisible(visible: boolean): void {
    this.floorPickRoot.visible = visible;
  }

  getLandingHailPickForLevel(level: number): THREE.Object3D | undefined {
    return this.landingHailPickByLevel.get(level);
  }

  /**
   * Hover / click feedback for landing hail buttons (per-level materials).
   */
  /**
   * Landing hail buttons share one icon texture per shaft; redraw when the cab’s nearest storey
   * (same rounding as in-cab floor buttons) changes.
   */
  updateLandingHailCabFloorDisplay(cabFloorLevel: number): void {
    if (cabFloorLevel === this.lastHailCabFloorPainted) return;
    this.lastHailCabFloorPainted = cabFloorLevel;
    const img = this.hailBtnIconTex.image;
    if (!(img instanceof HTMLCanvasElement)) return;
    const ctx = img.getContext("2d");
    if (!ctx) return;
    paintLandingHailIconCanvas(ctx, LANDING_HAIL_ICON_TEX_SIZE, cabFloorLevel, this.floorLabelByLevel);
    this.hailBtnIconTex.needsUpdate = true;
  }

  setLandingHailHighlight(opts: {
    hoverLevel: number;
    flashLevel: number;
    flashUntilMs: number;
    nowMs: number;
  }): void {
    const flashOn =
      opts.flashLevel > 0 && opts.nowMs < opts.flashUntilMs && opts.flashUntilMs > 0;
    for (const [lv, mat] of this.hailBtnMaterials) {
      const hover = opts.hoverLevel > 0 && lv === opts.hoverLevel;
      const flash = flashOn && lv === opts.flashLevel;
      if (flash) {
        mat.emissive.setHex(0x66ffff);
        mat.emissiveIntensity = 1.05;
      } else if (hover) {
        mat.emissive.setHex(0x55aaff);
        mat.emissiveIntensity = 0.62;
      } else {
        mat.emissive.setHex(0x143040);
        mat.emissiveIntensity = 0.28;
      }
    }
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
    for (const button of this.floorPickButtons) {
      const pick = (button.labelMesh.userData as FpElevFloorPickUserData)[FP_ELEV_FLOOR_PICK_UD];
      if (!pick) continue;
      if (flashOn && pick.level === flashLevel) {
        button.labelMesh.material = this.matPickFlash;
        button.bodyMesh.material = button.bodyFlashMat;
      } else if (pick.level === currentLevel) {
        button.labelMesh.material = this.matHighlight;
        button.bodyMesh.material = button.bodyHighlightMat;
      } else {
        button.labelMesh.material = this.matNormal;
        button.bodyMesh.material = button.bodyNormalMat;
      }
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
    this.floorPickButtons.length = 0;
    const carGeometries = new Set<THREE.BufferGeometry>();
    const carMaterials = new Set<THREE.Material>();
    this.carRoot.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      carGeometries.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (!mat) continue;
        carMaterials.add(mat);
      }
    });
    for (const mat of this.floorPickBodyMaterials) {
      carMaterials.add(mat);
    }
    this.floorPickBodyMaterials.clear();
    for (const geom of carGeometries) {
      geom.dispose();
    }
    for (const mat of carMaterials) {
      mat.dispose();
    }
    this.landingRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.landingDoorPickRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.landingHailPickRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const mat of this.hailBtnMaterials.values()) {
      mat.dispose();
    }
    this.hailBtnMaterials.clear();
    this.extRedMat.dispose();
    this.extGlassMat.dispose();
    this.hailBtnMatTemplate.dispose();
    this.hailBtnIconMat.dispose();
    this.hailBtnIconTex.dispose();
    this.atlas.dispose();
    this.carRoot.clear();
    this.landingRoot.clear();
    this.landingDoorPickRoot.clear();
    this.landingHailPickRoot.clear();
    this.landingHailPickByLevel.clear();
    this.root.clear();
  }
}
