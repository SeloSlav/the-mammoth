import * as THREE from "three";
import type { ElevatorCabDef, LandingKitDef } from "@the-mammoth/schemas";
import type { ElevatorShaftLayout, FloorShortLabelMap } from "@the-mammoth/world";
import {
  applyLandingFrameSlot,
  applyLandingGlassSlot,
  buildApartmentSwingLeafGeometries,
  buildElevatorCabCarVisual,
  buildSolidSwingLeafMergedGeometry,
  elevatorHoistwayInnerHalfExtents,
  FP_LOCOMOTION_SKIN,
  elevatorSupportFeetWorldY,
  isSolidLeafKit,
  MAMMOTH_MERGED_CAB_FLOOR_PICK_UD,
  resolveLandingDims,
  shortFloorLabelForLevel,
  type MergedCabFloorPickLayout,
} from "@the-mammoth/world";
import {
  CAB_INTERP_SEC,
  CAB_SLIDING_DOOR_CLOSED_OVERLAP_SLIDE_M,
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
/** Must match `buildElevatorCabCarVisual` local cab-floor top (`floorT`). */
const CAB_FLOOR_TOP_LOCAL_Y = 0.08;

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
  /** Cab floor buttons merged to two meshes — highlight uses vertex colors, not per-mesh materials. */
  private mergedCabFloorButtons = false;
  private readonly atlas: THREE.CanvasTexture;
  private readonly matNormal: THREE.MeshBasicMaterial;
  private readonly matHighlight: THREE.MeshBasicMaterial;
  private readonly matPickFlash: THREE.MeshBasicMaterial;
  private lastMatSig = "";
  readonly landingRoot: THREE.Group;
  readonly landingDoorPickRoot: THREE.Group;
  readonly landingHailPickRoot: THREE.Group;
  private readonly landingHailPickByLevel = new Map<number, THREE.Object3D>();
  private readonly landingDoorPickByLevel = new Map<number, THREE.Object3D>();
  /** Per-storey `swing.matrixWorld` at open01=0 — multiplied each tick by landing swing. */
  private readonly landingDoorSwingBase: THREE.Matrix4[] = [];
  private landingDoorSwingSign = 1;
  private landingDoorFrameInst: THREE.InstancedMesh | null = null;
  private landingDoorGlassInst: THREE.InstancedMesh | null = null;
  private readonly _landingDoorRy = new THREE.Matrix4();
  private readonly _landingDoorInstWorld = new THREE.Matrix4();
  private readonly extRedMat: THREE.MeshStandardMaterial;
  private readonly extGlassMat: THREE.MeshPhysicalMaterial;
  private readonly hailBtnMatTemplate: THREE.MeshStandardMaterial;
  /** Shared hover/flash materials — avoids per-level `clone()` + hundreds of hail draw batches. */
  private readonly hailBtnMatHover: THREE.MeshStandardMaterial;
  private readonly hailBtnMatFlash: THREE.MeshStandardMaterial;
  private readonly hailBtnBodies = new Map<number, THREE.Mesh>();
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
    /**
     * Transmission must default to **0** — any positive transmission on `MeshPhysicalMaterial`
     * flips three.js into the backbuffer-sampling refraction path (per-pixel PBR + IOR + envmap
     * blur on a copy of the framebuffer), which is a documented multi-10ms/frame regression in
     * this scene (see {@link ../../../packages/world/src/unitExteriorWindows.ts} for the same
     * rationale on unit-facade glass). An instanced landing-door glass covers dozens of storeys
     * and is `frustumCulled = false`, so the expensive path multiplies with every covered pixel.
     * A low-opacity tint with `depthWrite: false` reads as glass at arm's-length from inside the
     * corridor without the GPU cost. Kit authors can still opt into transmission via the glass
     * slot's `transmission` field if they accept the perf trade.
     */
    this.extGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf1f5,
      metalness: 0,
      roughness: 0.06,
      transmission: 0,
      thickness: 0.09,
      ior: 1.45,
      transparent: true,
      opacity: 0.32,
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
    this.hailBtnMatHover = this.hailBtnMatTemplate.clone();
    this.hailBtnMatHover.name = "elev_hail_btn_hover";
    this.hailBtnMatHover.emissive.setHex(0x55aaff);
    this.hailBtnMatHover.emissiveIntensity = 0.62;
    this.hailBtnMatFlash = this.hailBtnMatTemplate.clone();
    this.hailBtnMatFlash.name = "elev_hail_btn_flash";
    this.hailBtnMatFlash.emissive.setHex(0x66ffff);
    this.hailBtnMatFlash.emissiveIntensity = 1.05;
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

    const cabDoorClearW = resolveLandingDims(visualDefs?.landingKitDef).panelW;
    const cabVisual = buildElevatorCabCarVisual({
      layout,
      def: visualDefs?.cabDef,
      maxLevel: pick.maxLevel,
      floorLabelByLevel: pick.floorLabelByLevel,
      doorOpen01: 0,
      includeDoors: true,
      floorButtonLabelMaterial: this.matNormal,
      rootName: "elevator_car",
      mergeCabFloorButtons: true,
      doorClearWidthM: cabDoorClearW,
    });
    this.mergedCabFloorButtons = cabVisual.mergedFloorButtons === true;
    this.carRoot = cabVisual.root;
    this.doorL = cabVisual.doorL ?? new THREE.Group();
    this.doorR = cabVisual.doorR ?? new THREE.Group();
    this.floorPickRoot = cabVisual.panelRoot;
    this.floorPickRoot.name = "elev_floor_pick";
    for (const button of cabVisual.floorButtons) {
      if (this.mergedCabFloorButtons) {
        if (button.level === 1) {
          const layout = button.bodyMesh.userData[
            MAMMOTH_MERGED_CAB_FLOOR_PICK_UD
          ] as MergedCabFloorPickLayout;
          layout.shaftKey = pick.shaftKey;
        }
        const sharedBodyMat = button.bodyMesh.material as THREE.Material;
        this.floorPickButtons.push({
          level: button.level,
          bodyMesh: button.bodyMesh,
          labelMesh: button.labelMesh,
          bodyNormalMat: sharedBodyMat,
          bodyHighlightMat: sharedBodyMat,
          bodyFlashMat: sharedBodyMat,
        });
        continue;
      }
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
    const kit = visualDefs?.landingKitDef;

    // --- Instanced exterior landing doors (one draw for all frame parts × all levels; same for glass) ---
    const wrapProbe = new THREE.Group();
    const pivotProbe = createExteriorLandingDoorPivot(
      face,
      hx,
      hz,
      this.extRedMat,
      this.extGlassMat,
      kit,
    );
    const structureProbe = pivotProbe.structure;
    const swingProbe = pivotProbe.swing;
    this.landingDoorSwingSign = pivotProbe.swingSign;
    wrapProbe.add(structureProbe);
    for (let level = 1; level <= pick.maxLevel; level++) {
      const feetY = elevatorSupportFeetWorldY({
        buildingWorldOriginY: pick.buildingWorldOriginY,
        levelIndex: level,
        floorSpacingM: pick.floorSpacingM,
        shaftPlateLocalY: layout.plateLocalY,
        shaftSy: layout.sy,
      });
      wrapProbe.position.set(0, feetY, 0);
      swingProbe.rotation.y = 0;
      wrapProbe.updateMatrixWorld(true);
      this.landingDoorSwingBase.push(new THREE.Matrix4().copy(swingProbe.matrixWorld));
    }
    wrapProbe.remove(structureProbe);

    // Discard probe leaf meshes (materials are shared with InstancedMesh — only drop geometry).
    while (swingProbe.children.length > 0) {
      const ch = swingProbe.children[0]!;
      swingProbe.remove(ch);
      ch.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry?.dispose();
      });
    }

    // Procedural merged frame + glass: one clean rectangular ring aligned to `glassOpening`, never
    // baked from per-part `partTransforms` (those are editor-only tweaks to preview meshes).
    const dims = resolveLandingDims(kit);
    let frameMerged: THREE.BufferGeometry;
    let glassGeomSingle: THREE.BufferGeometry | null = null;
    if (!isSolidLeafKit(kit)) {
      const built = buildApartmentSwingLeafGeometries(dims, kit);
      frameMerged = built.frame;
      glassGeomSingle = built.glass ?? null;
    } else {
      frameMerged = buildSolidSwingLeafMergedGeometry(dims);
    }
    frameMerged.computeBoundingSphere();
    frameMerged.computeBoundingBox();

    this.landingDoorFrameInst = new THREE.InstancedMesh(
      frameMerged,
      this.extRedMat,
      pick.maxLevel,
    );
    this.landingDoorFrameInst.name = "elev_landing_doors_frame_inst";
    this.landingDoorFrameInst.frustumCulled = false;
    this.landingDoorFrameInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.landingRoot.add(this.landingDoorFrameInst);

    if (glassGeomSingle) {
      glassGeomSingle.computeBoundingSphere();
      glassGeomSingle.computeBoundingBox();
      this.landingDoorGlassInst = new THREE.InstancedMesh(
        glassGeomSingle,
        this.extGlassMat,
        pick.maxLevel,
      );
      this.landingDoorGlassInst.name = "elev_landing_doors_glass_inst";
      this.landingDoorGlassInst.frustumCulled = false;
      this.landingDoorGlassInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.landingRoot.add(this.landingDoorGlassInst);
    } else {
      this.landingDoorGlassInst = null;
    }

    this.updateLandingExteriorDoorSwings(new Map());

    for (let level = 1; level <= pick.maxLevel; level++) {
      const feetY = elevatorSupportFeetWorldY({
        buildingWorldOriginY: pick.buildingWorldOriginY,
        levelIndex: level,
        floorSpacingM: pick.floorSpacingM,
        shaftPlateLocalY: layout.plateLocalY,
        shaftSy: layout.sy,
      });

      const doorPickWrap = new THREE.Group();
      doorPickWrap.position.set(0, feetY, 0);
      const doorPick = this.createLandingDoorPickMesh(face, hx, hz, level, pick.shaftKey);
      /** Opacity-0 pick slab must stay `visible` so crosshair raycasts can hit it. */
      doorPickWrap.add(doorPick);
      this.landingDoorPickRoot.add(doorPickWrap);
      this.landingDoorPickByLevel.set(level, doorPick);

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

    /**
     * Two traversal passes, split by whether frustum culling is safe:
     *
     *  - `carRoot` + `landingRoot`: **must** keep `frustumCulled = false`.
     *    `carRoot` hosts the cab interior — the eye routinely sits inside the shell, and three.js
     *    will cull on a bounding sphere without an occlusion test, popping the walls away. The
     *    landing `InstancedMesh`es span every storey as one draw each; instance matrices move
     *    with swing and the static geometry bounding sphere does not track them, so auto-culling
     *    would misfire when a single landing is on-screen but the shared bounding sphere is off.
     *
     *  - `landingHailPickRoot` + `landingDoorPickRoot`: per-storey discrete meshes with tight,
     *    static world bounding spheres. Frustum culling works correctly here and is the only
     *    thing that keeps 2·`maxLevel` hail meshes off the draw list when the camera is looking
     *    along a single hallway. Previously the blanket `frustumCulled = false` traverse forced
     *    every storey's hail button + icon through the pipeline every frame.
     *
     * Both passes still tag meshes as `mammothUnitInterior` so the session-level exterior-view
     * hide (see `mountFpSession` → `unitInteriorMeshes` / `FP_INTERIOR_SHELL_NEAR_MARGIN_M`) can
     * flip the whole set off from the street.
     */
    const tagInterior = (root: THREE.Object3D, disableFrustum: boolean) => {
      root.traverse((node) => {
        if (
          node instanceof THREE.Mesh ||
          node instanceof THREE.Line ||
          node instanceof THREE.LineSegments ||
          node instanceof THREE.Points ||
          node instanceof THREE.InstancedMesh
        ) {
          if (disableFrustum) node.frustumCulled = false;
          node.userData.mammothUnitInterior = true;
        }
      });
    };
    /**
     * Keep the cab interior out of the generic `mammothUnitInterior` hide set. The footprint-based
     * exterior heuristic in `mountFpSession` is good for apartment/corridor shells but too coarse
     * for the moving cab: at ground floor the camera can sit near/outside the raw building AABB
     * while still being physically inside the car, which made the cab floor disappear. We still
     * disable frustum culling on the cab root, but leave visibility ownership to elevator-specific
     * logic instead of the generic exterior shell toggle.
     */
    this.carRoot.traverse((node) => {
      if (
        node instanceof THREE.Mesh ||
        node instanceof THREE.Line ||
        node instanceof THREE.LineSegments ||
        node instanceof THREE.Points ||
        node instanceof THREE.InstancedMesh
      ) {
        node.frustumCulled = false;
      }
    });
    tagInterior(this.landingRoot, true);
    tagInterior(this.landingHailPickRoot, true);
    tagInterior(this.landingDoorPickRoot, true);

    if (this.mergedCabFloorButtons) {
      this.lastMatSig = "";
      this.updateFloorPickMaterials(0, 0, -1, 0);
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
      new THREE.BoxGeometry(0.22, DOOR_H, DOOR_W + 0.12),
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

  private createLandingHailButtonMesh(
    face: DoorFace,
    hx: number,
    hz: number,
    level: number,
    shaftKey: string,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `elev_landing_hail_panel_${level}`;
    const btnR = 0.175;
    const btnDepth = 0.065;
    const btnHalf = btnDepth * 0.5;
    const iconPlane = 0.248;
    /** Outer circular face sits at `btnDepth + btnHalf` from the panel origin (matches prior hail layout). */
    const iconOff = btnDepth + btnHalf + 0.0015;
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(btnR, btnR, btnDepth, 32),
      this.hailBtnMatTemplate,
    );
    button.name = `elev_landing_hail_btn_${level}`;
    const hailPickUserData: FpElevLandingHailPickUserData[typeof FP_ELEV_LANDING_HAIL_PICK_UD] = {
      shaftKey,
      level,
    };
    (button.userData as FpElevLandingHailPickUserData)[FP_ELEV_LANDING_HAIL_PICK_UD] =
      hailPickUserData;
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(iconPlane, iconPlane),
      this.hailBtnIconMat,
    );
    (icon.userData as FpElevLandingHailPickUserData)[FP_ELEV_LANDING_HAIL_PICK_UD] =
      hailPickUserData;
    const y = 1.34;
    const faceOut = level === 1 ? LANDING_HAIL_FACE_OUT_GROUND_M : LANDING_HAIL_FACE_OUT_M;
    const doorSideOffset = DOOR_W * 0.5 + 0.32;
    group.add(button);
    group.add(icon);
    this.hailBtnBodies.set(level, button);
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

  /**
   * Toggle auxiliary landing UI / pick helpers for this shaft while leaving the actual landing door
   * render mesh visible. The red corridor door on the stopped floor must remain visible from inside
   * the cab even when the camera is not aimed through the opening; hiding only hail panels + pick
   * roots preserves that cue without bringing back the full building-stack cost.
   */
  setLandingsVisible(visible: boolean): void {
    if (
      this.landingHailPickRoot.visible === visible &&
      this.landingDoorPickRoot.visible === visible
    ) {
      return;
    }
    this.landingHailPickRoot.visible = visible;
    this.landingDoorPickRoot.visible = visible;
  }

  getLandingHailPickForLevel(level: number): THREE.Object3D | undefined {
    return this.landingHailPickByLevel.get(level);
  }

  getLandingExteriorDoorPickForLevel(level: number): THREE.Object3D | undefined {
    return this.landingDoorPickByLevel.get(level);
  }

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
    for (const [lv, btn] of this.hailBtnBodies) {
      const hover = opts.hoverLevel > 0 && lv === opts.hoverLevel;
      const flash = flashOn && lv === opts.flashLevel;
      if (flash) btn.material = this.hailBtnMatFlash;
      else if (hover) btn.material = this.hailBtnMatHover;
      else btn.material = this.hailBtnMatTemplate;
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
    if (this.mergedCabFloorButtons) {
      this.applyMergedFloorPickVertexColors(currentLevel, flashLevel, flashUntilMs, nowMs);
      return;
    }
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

  private applyMergedFloorPickVertexColors(
    currentLevel: number,
    flashLevel: number,
    flashUntilMs: number,
    nowMs: number,
  ): void {
    const fb = this.floorPickButtons[0];
    if (!fb) return;
    const layout = fb.bodyMesh.userData[MAMMOTH_MERGED_CAB_FLOOR_PICK_UD] as
      | MergedCabFloorPickLayout
      | undefined;
    if (!layout) return;
    const flashOn = flashLevel > 0 && nowMs < flashUntilMs;
    const bodyAttr = fb.bodyMesh.geometry.attributes.color as THREE.BufferAttribute | undefined;
    const labelAttr = fb.labelMesh.geometry.attributes.color as THREE.BufferAttribute | undefined;
    if (!bodyAttr || !labelAttr) return;
    const nb = layout.vertsPerBodyLevel;
    const nl = layout.vertsPerLabelLevel;
    const dimB = { r: 0.82, g: 0.86, b: 0.9 };
    const hiB = { r: 0.48, g: 0.92, b: 0.8 };
    const flB = { r: 0.58, g: 0.98, b: 0.98 };
    const dimL = { r: 0.62, g: 0.65, b: 0.68 };
    const hiL = { r: 0.88, g: 1, b: 0.96 };
    const flL = { r: 0.96, g: 1, b: 1 };
    for (let i = 0; i < layout.maxLevel; i++) {
      const level = i + 1;
      let bc = dimB;
      let lc = dimL;
      if (flashOn && level === flashLevel) {
        bc = flB;
        lc = flL;
      } else if (level === currentLevel) {
        bc = hiB;
        lc = hiL;
      }
      const vb = i * nb;
      for (let v = 0; v < nb; v++) {
        bodyAttr.setXYZ(vb + v, bc.r, bc.g, bc.b);
      }
      const vl = i * nl;
      for (let v = 0; v < nl; v++) {
        labelAttr.setXYZ(vl + v, lc.r, lc.g, lc.b);
      }
    }
    bodyAttr.needsUpdate = true;
    labelAttr.needsUpdate = true;
  }

  updateFromServer(cabFeetY: number, doorOpen01: number): void {
    /**
     * `cabFeetY` is the gameplay support height for the player's feet, i.e. the walkable cab-floor
     * top plus {@link FP_LOCOMOTION_SKIN}. The rendered cab root, however, is authored with local
     * Y=0 at the **bottom** of the car and the visible floor top at `CAB_FLOOR_TOP_LOCAL_Y`.
     * Align the visual floor top to the same support plane the collision / rider code uses; the
     * previous direct assignment (`carRoot.y = cabFeetY`) floated the whole car upward by
     * `FP_LOCOMOTION_SKIN + CAB_FLOOR_TOP_LOCAL_Y`, which is why the concrete underlay showed
     * through where the cab floor should have been.
     */
    this.carRoot.position.y = cabFeetY - FP_LOCOMOTION_SKIN - CAB_FLOOR_TOP_LOCAL_Y;
    const o = doorOpen01;
    const slide = THREE.MathUtils.lerp(-CAB_SLIDING_DOOR_CLOSED_OVERLAP_SLIDE_M, DOOR_SLIDE_M, o);
    const t = doorSlideAxis(this.layout.doorFace);
    this.doorL.children[0]!.position.set(-t.x * slide, 0, -t.z * slide);
    this.doorR.children[0]!.position.set(t.x * slide, 0, t.z * slide);
  }

  updateLandingExteriorDoorSwings(swingByLevel: ReadonlyMap<number, number>): void {
    const frameInst = this.landingDoorFrameInst;
    if (!frameInst) return;
    const n = this.landingDoorSwingBase.length;
    for (let i = 0; i < n; i++) {
      const level = i + 1;
      const u = swingByLevel.get(level) ?? 0;
      this._landingDoorRy.makeRotationY(
        this.landingDoorSwingSign * u * this.exteriorSwingMaxRad,
      );
      this._landingDoorInstWorld.copy(this.landingDoorSwingBase[i]!).multiply(this._landingDoorRy);
      frameInst.setMatrixAt(i, this._landingDoorInstWorld);
      if (this.landingDoorGlassInst) {
        this.landingDoorGlassInst.setMatrixAt(i, this._landingDoorInstWorld);
      }
    }
    frameInst.instanceMatrix.needsUpdate = true;
    if (this.landingDoorGlassInst) {
      this.landingDoorGlassInst.instanceMatrix.needsUpdate = true;
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
    this.landingDoorFrameInst?.dispose();
    this.landingDoorGlassInst?.dispose();
    this.landingDoorFrameInst = null;
    this.landingDoorGlassInst = null;
    this.landingDoorSwingBase.length = 0;
    this.landingDoorPickRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.landingHailPickRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.hailBtnBodies.clear();
    this.hailBtnMatHover.dispose();
    this.hailBtnMatFlash.dispose();
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
    this.landingDoorPickByLevel.clear();
    this.root.clear();
  }
}
