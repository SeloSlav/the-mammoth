import * as THREE from "three";
import type { LocalPlayerGameplayState } from "@the-mammoth/game";
import type { IModelLoadRegistry, ModelRef } from "@the-mammoth/assets";
import type { IAnimationDriver } from "../../animation/animationDriverTypes.js";
import { PrimitiveAnimationDriver } from "../../animation/PrimitiveAnimationDriver.js";
import type { WeaponDefinition } from "../../weapons/weaponTypes.js";
import {
  clampFpRigRootPositionInPlace,
  isFpRigRootPositionAuthorable,
  samplePrimitiveMeleeSwing,
  type PrimitiveSwingKeyframe,
  type WeaponAuthorVec3,
} from "../../weapons/weaponPrimitiveAuthoring.js";
import { WeaponPresenter } from "../../weapons/WeaponPresenter.js";
import { crowbarWeaponDefinition } from "../../weapons/sampleDefinitions.js";
import type { MeleeCombatVisualSink } from "../combatVisuals.js";
import { FP_MELEE_HAND_RIGHT } from "../fpViewmodelRefs.js";
import {
  FP_CROWBAR_GLTF_MAX_EDGE_M,
  forceDoubleSidedMeshes,
} from "../viewModelNormalize.js";
import { detachRegistryCloneSubtree } from "../../loaders/deepDisposeObject3D.js";
import { resolveAuthoringOrbitTargetWorld } from "./localFirstPersonAuthoringOrbit.js";
import { largestValidAuthoringRigRestStep } from "./localFirstPersonRigAuthoringClamp.js";
import { computeWeaponGripMountFromDefinition } from "./localFirstPersonWeaponGripLayout.js";
import {
  fpFirearmShotVisualConfigForHeldItem,
  sampleFpFirearmShotVisual,
  type FpFirearmShotVisualConfig,
} from "./fpFirearmShotVisuals.js";
import { sampleFpFirearmReloadVisual } from "./fpFirearmReloadVisual.js";
import {
  deriveFpFirearmAimRigRootFromHip,
  smoothStep01,
} from "./fpFirearmAimRigPose.js";

export type LocalFirstPersonPresenterOptions = {
  /** Where `fpRoot` attaches — use `headPitch` from {@link createFPRig}, not the camera. */
  viewModelParent: THREE.Object3D;
  modelRegistry: IModelLoadRegistry;
  /** Active weapon, or `null` for hands-only (no weapon mesh). */
  weaponDefinition: WeaponDefinition | null;
  /** Optional injection for tests / GLTF path later. */
  animationDriver?: IAnimationDriver;
  onMeleeVisual?: MeleeCombatVisualSink;
};

/**
 * Rest offset of the right-hand rig under `fpRoot` (local meters). `fpRoot` stays at identity;
 * look pitch comes from the parent (`headPitch` from {@link createFPRig}) so the weapon tilts with the view.
 * Tuned vs the **gameplay** frustum (not head origin): higher and farther into the lens than a pure
 * “shoulder from ear” guess so hand + crowbar stay clearly in view at level pitch.
 */
const FP_SHOULDER_REST = { px: 0.34, py: -0.22, pz: 0.08 } as const;
const FP_RIGHT_RIG_PY_LIFT = 0.12 as const;

const _AUTHOR_ORBIT_FALLBACK_OFFSET = new THREE.Vector3(0.25, -0.2, 0.35);

/** Default `rigRoot.positionM` when `fpViewmodel.rigRoot` is omitted (meters, head-pitch space). */
const FP_RIG_DEFAULT_POSITION = new THREE.Vector3(
  FP_SHOULDER_REST.px,
  FP_SHOULDER_REST.py + FP_RIGHT_RIG_PY_LIFT,
  FP_SHOULDER_REST.pz,
);

/**
 * Where to put the crowbar mount center vs the gameplay camera (world space, meters).
 * Uses the camera’s real +X/+Y/−Z axes (same as Three.js gameplay). Steps stay inside the
 * asymmetric FP rig authoring box (see `weaponPrimitiveAuthoring` rig limits).
 */
/** World-space target for crowbar mount center vs gameplay camera (see `frameWeaponMountIntoGameplayCamera`). */
const FP_AUTHOR_GAMEPLAY_MOUNT_AHEAD_M = 0.48;
const FP_AUTHOR_GAMEPLAY_MOUNT_RIGHT_M = 0.14;
const FP_AUTHOR_GAMEPLAY_MOUNT_LOWER_M = 0.14;

/** Canonical rig rest for JSON / editor “reset to default view offset”. */
export const FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED = {
  positionM: {
    x: FP_RIG_DEFAULT_POSITION.x,
    y: FP_RIG_DEFAULT_POSITION.y,
    z: FP_RIG_DEFAULT_POSITION.z,
  },
  eulerRad: { x: 0, y: 0, z: 0 },
  scaleM: { x: 1, y: 1, z: 1 },
} as const;

/** Defaults when presentation JSON omits `firstPerson.fpViewmodel` (or sub-keys). */
const DEFAULT_FP_GRIP = new THREE.Vector3(0.02, 0.06, 0.03);
const DEFAULT_FP_HAND_POS = new THREE.Vector3(0, 0, 0);
const DEFAULT_FP_HAND_EULER = new THREE.Euler(1.5708, 0, 3.1416, "XYZ");
const DEFAULT_FP_HAND_SCALE = new THREE.Vector3(-0.1679, 0.1679, 0.1679);
const DEFAULT_FP_WEAPON_VISUAL_SCALE = new THREE.Vector3(0.2762, 0.2762, 0.2762);
const FIREARM_FLASH_COLOR = 0xffc46b;
/** Exponential ease (1/s) for hip ↔ ADS viewmodel blend. */
const FP_FIREARM_AIM_BLEND_DAMP_PER_S = 14;

function vec3FromAuthorOr(
  v: WeaponAuthorVec3 | undefined,
  fallback: THREE.Vector3,
): THREE.Vector3 {
  return v ? new THREE.Vector3(v.x, v.y, v.z) : fallback.clone();
}

function eulerFromAuthorOr(
  v: WeaponAuthorVec3 | undefined,
  fallback: THREE.Euler,
): THREE.Euler {
  return v ? new THREE.Euler(v.x, v.y, v.z, "XYZ") : fallback.clone();
}

type GltfRef = Extract<ModelRef, { kind: "gltf" }>;

function asGltf(ref: ModelRef): GltfRef {
  if (ref.kind !== "gltf") throw new Error(`Expected gltf ModelRef, got ${ref.kind}`);
  return ref;
}

const FP_DRAWABLE_TYPES = new Set([
  "Mesh",
  "SkinnedMesh",
  "InstancedMesh",
  "Line",
  "LineSegments",
  "LineLoop",
  "Points",
]);

function isDescendantOfGrip(ancestor: THREE.Object3D, o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}

export type FpAuthoringPick = { id: string; label: string; object: THREE.Object3D };

/** Dev layout: hip/hand rest vs full ADS rig pose (`fpViewmodel.aimRigRoot`). */
export type FpAuthoringPoseMode = "rest" | "aim";

/**
 * First-person-only presentation (never reuse remote body meshes).
 * GLB right hand + GLB weapon; swing keyframes drive {@link rightHandRig}.
 */
export class LocalFirstPersonPresenter {
  private weaponDefinition: WeaponDefinition | null;
  private readonly viewModelParent: THREE.Object3D;
  private readonly modelRegistry: IModelLoadRegistry;
  private readonly fpRoot = new THREE.Group();
  private readonly driver: IAnimationDriver;
  private readonly onMeleeVisual?: MeleeCombatVisualSink;
  private weapon?: WeaponPresenter;
  private lastMeleeSeq = 0;
  private lastFirearmShotSeq = 0;
  private firearmShotElapsedS = Number.POSITIVE_INFINITY;
  private firearmShotConfig: FpFirearmShotVisualConfig | null = null;
  private viewmodelReady = false;
  private readonly rightHandRig = new THREE.Group();
  private readonly firearmFlashRoot = new THREE.Group();
  private readonly firearmFlashGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly firearmFlashMaterial = new THREE.MeshBasicMaterial({
    color: FIREARM_FLASH_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  /** Rest pose for {@link rightHandRig} under `fpRoot` (before walk sway / melee offset). */
  private readonly rigRestPos = new THREE.Vector3();
  private readonly rigRestEuler = new THREE.Euler(0, 0, 0, "XYZ");
  private readonly rigRestScale = new THREE.Vector3(1, 1, 1);
  /** ADS target pose for `rigRoot` (authored or derived from hip rest). */
  private readonly rigAimPos = new THREE.Vector3();
  private readonly rigAimEuler = new THREE.Euler(0, 0, 0, "XYZ");
  /** Smoothed 0..1 blend toward {@link rigAimPos} while aiming. */
  private aimBlend01 = 0;
  private readonly _rigHipEuler = new THREE.Euler(0, 0, 0, "XYZ");
  private readonly _rigHipQuat = new THREE.Quaternion();
  private readonly _rigAimQuat = new THREE.Quaternion();
  private readonly _rigBlendedQuat = new THREE.Quaternion();
  private readonly _rigHipPos = new THREE.Vector3();
  private handScene?: THREE.Object3D;
  private weaponGripAnchor?: THREE.Group;
  private authoringFrozen = false;
  private authoringPoseMode: FpAuthoringPoseMode = "rest";
  /** When false and no weapon GLB is equipped, stock hand meshes are hidden (empty hotbar / non-weapon slot). */
  private fpGameplayStockHandVisible = false;
  /**
   * Editor / tools: preview normalized swing phase on the frozen viewmodel (same space as
   * `firstPerson.meleeSwing` — additive on {@link rigRestPos} under `fpRoot` / head pitch).
   */
  private swingAuthoringPreviewPhase: number | null = null;
  /** When set, sampled instead of `weaponDefinition` track for swing preview + capture. */
  private swingAuthoringKeyframes: PrimitiveSwingKeyframe[] | null = null;
  private readonly _mtxGripOffset = new THREE.Matrix4();
  private readonly _mtxGripWorld = new THREE.Matrix4();
  private readonly _mtxInvRigWorld = new THREE.Matrix4();
  private readonly _mtxGripInRig = new THREE.Matrix4();
  /**
   * When true (gameplay default), grip position/orientation tracks `hand × gripOffset` each frame.
   * When false, grip stays rig-local so manipulating {@link handScene} does not drag the mounted
   * weapon until the grip is reconciled. FP authoring keeps this true so hand + weapon move together.
   */
  private fpAuthorGripAnchoredToLiveHandPose = true;
  private readonly _vmMountBox = new THREE.Box3();
  private readonly _vmMountCur = new THREE.Vector3();
  private readonly _vmMountTgt = new THREE.Vector3();
  private readonly _vmMountFwd = new THREE.Vector3();
  private readonly _vmMountRight = new THREE.Vector3();
  private readonly _vmMountUp = new THREE.Vector3();
  private readonly _vmMountDw = new THREE.Vector3();
  private readonly _vmMountDl = new THREE.Vector3();
  private readonly _vmMountQ = new THREE.Quaternion();

  constructor(opts: LocalFirstPersonPresenterOptions) {
    this.weaponDefinition = opts.weaponDefinition;
    this.viewModelParent = opts.viewModelParent;
    this.modelRegistry = opts.modelRegistry;
    this.driver = opts.animationDriver ?? new PrimitiveAnimationDriver();
    this.onMeleeVisual = opts.onMeleeVisual;
    this.fpRoot.name = "local_fp_viewmodel_root";
    this.fpRoot.frustumCulled = false;
    this.viewModelParent.add(this.fpRoot);
    this.initFirearmFlash();

    this.rightHandRig.name = "local_fp_right_hand_rig";
    this.rightHandRig.frustumCulled = false;
    this.fpRoot.add(this.rightHandRig);
    this.refreshRigRestFromDefinition();
    this.applyRigRestToRightHandRig();
  }

  private initFirearmFlash(): void {
    this.firearmFlashRoot.name = "local_fp_firearm_muzzle_flash";
    this.firearmFlashRoot.visible = false;
    this.firearmFlashRoot.frustumCulled = false;

    const vertical = new THREE.Mesh(this.firearmFlashGeometry, this.firearmFlashMaterial);
    vertical.name = "local_fp_firearm_muzzle_flash_vertical";
    vertical.frustumCulled = false;
    const diagonal = new THREE.Mesh(this.firearmFlashGeometry, this.firearmFlashMaterial);
    diagonal.name = "local_fp_firearm_muzzle_flash_diagonal";
    diagonal.rotation.z = Math.PI * 0.25;
    diagonal.scale.setScalar(0.72);
    diagonal.frustumCulled = false;

    this.firearmFlashRoot.add(vertical, diagonal);
    this.fpRoot.add(this.firearmFlashRoot);
  }

/**
 * Keep the hidden hand rig / grip anchor in a sane camera volume even when no weapon is equipped,
 * so non-weapon attachments can still mount without drifting back to legacy shoulder defaults.
 */
  private fpLayoutDefinition(): WeaponDefinition {
    return this.weaponDefinition ?? crowbarWeaponDefinition;
  }

  /**
   * First-person melee swing keyframes for the active weapon only. Unarmed state has no attack
   * animation because empty hands cannot melee.
   */
  private resolveFpMeleeSwingTrack(): PrimitiveSwingKeyframe[] | undefined {
    if (this.swingAuthoringKeyframes && this.swingAuthoringKeyframes.length > 0) {
      return this.swingAuthoringKeyframes;
    }
    const fromEquipped = this.weaponDefinition?.primitivePresentation?.firstPerson?.meleeSwing;
    if (fromEquipped && fromEquipped.length > 0) return fromEquipped;
    return undefined;
  }

  private resolveFpViewmodelLayout(): {
    gripPosition: THREE.Vector3;
    handPosition: THREE.Vector3;
    handEuler: THREE.Euler;
    handScale: THREE.Vector3;
    weaponVisualScale: THREE.Vector3;
  } {
    const fp = this.fpLayoutDefinition().primitivePresentation?.firstPerson?.fpViewmodel;
    return {
      gripPosition: vec3FromAuthorOr(fp?.gripAnchorPositionM, DEFAULT_FP_GRIP),
      handPosition: vec3FromAuthorOr(fp?.hand?.positionM, DEFAULT_FP_HAND_POS),
      handEuler: eulerFromAuthorOr(fp?.hand?.eulerRad, DEFAULT_FP_HAND_EULER),
      handScale: vec3FromAuthorOr(fp?.hand?.scale, DEFAULT_FP_HAND_SCALE),
      weaponVisualScale: vec3FromAuthorOr(fp?.weaponVisualScale, DEFAULT_FP_WEAPON_VISUAL_SCALE),
    };
  }

  /** Runtime / editor: swap weapon mesh + authoring data (caller preloads `modelRef`). */
  setWeaponDefinition(def: WeaponDefinition | null): void {
    this.weaponDefinition = def;
    this.swingAuthoringPreviewPhase = null;
    this.swingAuthoringKeyframes = null;
    if (this.viewmodelReady && this.handScene && this.weaponGripAnchor) {
      this.reloadWeaponPresentationLayout();
    }
  }

  /**
   * Editor: drive first-person swing preview while {@link setAuthoringFrozen} is true.
   * `keyframes: null` uses the weapon definition’s track; a non-empty array overrides in-memory only.
   */
  setFpSwingAuthoringOverlay(opts: {
    previewPhase01: number | null;
    keyframes: PrimitiveSwingKeyframe[] | null;
  }): void {
    this.swingAuthoringPreviewPhase = opts.previewPhase01;
    this.swingAuthoringKeyframes = opts.keyframes;
  }

  /** Same object as the `rigRoot` authoring pick — hand + weapon move together (additive swing in JSON). */
  getFpSwingRigObject(): THREE.Object3D {
    return this.rightHandRig;
  }

  /** Shared FP socket on the hand used by weapon roots; editor consumables attach here too. */
  getFpGripAnchorObject(): THREE.Object3D | undefined {
    return this.weaponGripAnchor;
  }

  /** Weapon mesh scale from presentation — child of grip. */
  getFpWeaponVisualObject(): THREE.Object3D | undefined {
    return this.weapon?.getVisual();
  }

  /** Dev/editor FP: when false, the grip does not weld to live hand edits every frame. */
  setFpAuthorGripAnchoredToLiveHandPose(v: boolean): void {
    this.fpAuthorGripAnchoredToLiveHandPose = v;
  }

  /** Re-weld grip to `presentation hand × grip offset` rig-local pose (layout/save/target change). */
  reconcileFpWeaponGripAnchorToPresentationHand(): void {
    this.syncGripAnchorFromLiveHandHierarchy();
  }

  /** Rest pose used before swing offsets (`fpViewmodel.rigRoot` + clamps). */
  getFpRigRestLocal(): {
    position: THREE.Vector3;
    euler: THREE.Euler;
    scale: THREE.Vector3;
  } {
    return {
      position: this.rigRestPos.clone(),
      euler: this.rigRestEuler.clone(),
      scale: this.rigRestScale.clone(),
    };
  }

  getWeaponDefinition(): WeaponDefinition | null {
    return this.weaponDefinition;
  }

  private refreshRigRestFromDefinition(): void {
    const rr = this.fpLayoutDefinition().primitivePresentation?.firstPerson?.fpViewmodel?.rigRoot;
    if (rr?.positionM && isFpRigRootPositionAuthorable(rr.positionM)) {
      this.rigRestPos.set(rr.positionM.x, rr.positionM.y, rr.positionM.z);
    } else {
      this.rigRestPos.copy(FP_RIG_DEFAULT_POSITION);
    }
    clampFpRigRootPositionInPlace(this.rigRestPos);
    if (rr?.eulerRad) {
      this.rigRestEuler.set(rr.eulerRad.x, rr.eulerRad.y, rr.eulerRad.z, "XYZ");
    } else {
      this.rigRestEuler.set(0, 0, 0, "XYZ");
    }
    if (rr?.scaleM) {
      this.rigRestScale.set(rr.scaleM.x, rr.scaleM.y, rr.scaleM.z);
    } else {
      this.rigRestScale.set(1, 1, 1);
    }
    this.refreshRigAimFromDefinition();
  }

  private refreshRigAimFromDefinition(): void {
    const fp = this.fpLayoutDefinition().primitivePresentation?.firstPerson?.fpViewmodel;
    const authored = fp?.aimRigRoot;
    if (authored?.positionM && authored.eulerRad) {
      this.rigAimPos.set(authored.positionM.x, authored.positionM.y, authored.positionM.z);
      clampFpRigRootPositionInPlace(this.rigAimPos);
      this.rigAimEuler.set(authored.eulerRad.x, authored.eulerRad.y, authored.eulerRad.z, "XYZ");
      return;
    }

    const derived = deriveFpFirearmAimRigRootFromHip(
      { x: this.rigRestPos.x, y: this.rigRestPos.y, z: this.rigRestPos.z },
      { x: this.rigRestEuler.x, y: this.rigRestEuler.y, z: this.rigRestEuler.z },
    );
    this.rigAimPos.set(derived.positionM.x, derived.positionM.y, derived.positionM.z);
    clampFpRigRootPositionInPlace(this.rigAimPos);
    this.rigAimEuler.set(derived.eulerRad.x, derived.eulerRad.y, derived.eulerRad.z, "XYZ");
  }

  private applyRightHandRigPoseWithAimBlend(
    hipPos: THREE.Vector3,
    hipEuler: THREE.Euler,
    state: LocalPlayerGameplayState,
    dt: number,
  ): void {
    const firearm = fpFirearmShotVisualConfigForHeldItem(state.equippedPrimary);
    const aimTarget = firearm ? state.animation.aimWeight01 : 0;
    this.aimBlend01 = THREE.MathUtils.damp(
      this.aimBlend01,
      aimTarget,
      FP_FIREARM_AIM_BLEND_DAMP_PER_S,
      dt,
    );
    const blend = smoothStep01(this.aimBlend01);
    if (blend <= 1e-5) {
      this.rightHandRig.position.copy(hipPos);
      this.rightHandRig.rotation.copy(hipEuler);
      this.rightHandRig.scale.copy(this.rigRestScale);
      return;
    }
    this._rigHipQuat.setFromEuler(hipEuler);
    this._rigAimQuat.setFromEuler(this.rigAimEuler);
    this._rigBlendedQuat.copy(this._rigHipQuat).slerp(this._rigAimQuat, blend);
    this.rightHandRig.position.copy(hipPos).lerp(this.rigAimPos, blend);
    this.rightHandRig.rotation.setFromQuaternion(this._rigBlendedQuat);
    this.rightHandRig.scale.copy(this.rigRestScale);
  }

  private applyRigRestToRightHandRig(): void {
    this.rightHandRig.position.copy(this.rigRestPos);
    this.rightHandRig.rotation.copy(this.rigRestEuler);
    this.rightHandRig.scale.copy(this.rigRestScale);
  }

  private applyRigAimToRightHandRig(): void {
    this.rightHandRig.position.copy(this.rigAimPos);
    this.rightHandRig.rotation.copy(this.rigAimEuler);
    this.rightHandRig.scale.copy(this.rigRestScale);
  }

  /**
   * Places {@link weaponGripAnchor} under `rightHandRig` at the same world pose as `hand × grip`,
   * so the grip may be sibling to the hand (weapon not parented under the hand Scene).
   */
  private syncGripAnchorFromLiveHandHierarchy(): void {
    if (!this.handScene || !this.weaponGripAnchor) return;
    const gripPos = this.resolveFpViewmodelLayout().gripPosition;
    this.rightHandRig.updateMatrixWorld(true);
    this.handScene.updateMatrixWorld(true);
    this._mtxGripOffset.identity();
    this._mtxGripOffset.makeTranslation(gripPos.x, gripPos.y, gripPos.z);
    this._mtxGripWorld.multiplyMatrices(this.handScene.matrixWorld, this._mtxGripOffset);
    this._mtxInvRigWorld.copy(this.rightHandRig.matrixWorld).invert();
    this._mtxGripInRig.multiplyMatrices(this._mtxInvRigWorld, this._mtxGripWorld);
    this._mtxGripInRig.decompose(
      this.weaponGripAnchor.position,
      this.weaponGripAnchor.quaternion,
      this.weaponGripAnchor.scale,
    );
    this.weaponGripAnchor.updateMatrix();
  }

  /**
   * Toggle visibility of the stock FP hand GLB drawables only (not the weapon under
   * {@link weaponGripAnchor}), driven by {@link WeaponDefinition.fpHidesHandMesh} and gameplay
   * ({@link setFpGameplayStockHandVisible} — weapon or consumable on selected hotbar).
   *
   * GLTFs often ship helper groups or even the scene root with `visible: false`; that suppresses
   * the whole subtree regardless of mesh flags, so we first force the hand branch (excluding the
   * equipped weapon under the grip anchor) back to visible, then optionally hide drawables only.
   */
  setFpGameplayStockHandVisible(visible: boolean): void {
    if (this.fpGameplayStockHandVisible === visible) return;
    this.fpGameplayStockHandVisible = visible;
    this.applyFpHandMeshVisibility();
  }

  private applyFpHandMeshVisibility(): void {
    const hideForWeaponMesh = this.weaponDefinition?.fpHidesHandMesh === true;
    const hideForEmptyHands =
      !this.fpGameplayStockHandVisible && this.weaponDefinition == null;
    const hide = hideForWeaponMesh || hideForEmptyHands;
    if (!this.handScene || !this.weaponGripAnchor) return;
    const grip = this.weaponGripAnchor;
    this.handScene.visible = true;
    this.handScene.traverse((o) => {
      if (isDescendantOfGrip(grip, o)) return;
      o.visible = true;
    });
    if (!hide) return;
    this.handScene.traverse((o) => {
      if (isDescendantOfGrip(grip, o)) return;
      if (!FP_DRAWABLE_TYPES.has(o.type)) return;
      o.visible = false;
    });
  }

  async initViewmodel(): Promise<void> {
    if (this.viewmodelReady) return;
    const hand = this.modelRegistry.instantiateLoaded(FP_MELEE_HAND_RIGHT);
    if (!hand.ok) throw new Error(`[LocalFirstPersonPresenter] hand GLB: ${hand.error}`);
    this.handScene = hand.root as THREE.Object3D;
    this.handScene.name = "local_fp_hand_glb";
    forceDoubleSidedMeshes(this.handScene);
    const fpLayout = this.resolveFpViewmodelLayout();
    this.handScene.position.copy(fpLayout.handPosition);
    this.handScene.rotation.copy(fpLayout.handEuler);
    this.handScene.scale.copy(fpLayout.handScale);
    this.handScene.traverse((o) => {
      o.castShadow = false;
      o.frustumCulled = false;
    });
    this.rightHandRig.add(this.handScene);

    this.weaponGripAnchor = new THREE.Group();
    this.weaponGripAnchor.name = "weapon_grip_anchor";
    this.rightHandRig.add(this.weaponGripAnchor);
    this.fpAuthorGripAnchoredToLiveHandPose = true;
    this.syncGripAnchorFromLiveHandHierarchy();

    if (this.weaponDefinition) {
      this.equipWeaponFromDefinition();
    }
    this.viewmodelReady = true;
    this.refreshRigAimFromDefinition();
    this.applyFpHandMeshVisibility();
  }

  /**
   * When true, viewmodel stays at rest (no walk sway / swing) so TransformControls edits stick.
   * Look pitch still comes from the parent rig (same as gameplay).
   */
  setAuthoringFrozen(frozen: boolean): void {
    this.authoringFrozen = frozen;
    if (!frozen) this.authoringPoseMode = "rest";
  }

  setAuthoringPoseMode(mode: FpAuthoringPoseMode): void {
    this.authoringPoseMode = mode;
    if (mode === "aim") {
      this.refreshRigAimFromDefinition();
      this.applyRigAimToRightHandRig();
    } else if (this.authoringFrozen) {
      this.applyRigRestToRightHandRig();
    }
  }

  getAuthoringPoseMode(): FpAuthoringPoseMode {
    return this.authoringPoseMode;
  }

  /** Dev layout target: hand at hip rest, or rig root at full ADS pose. */
  getAuthoringPickList(): FpAuthoringPick[] {
    if (!this.handScene) return [];
    if (this.authoringPoseMode === "aim") {
      return [{ id: "aimRigRoot", label: "Aim rig (ADS)", object: this.rightHandRig }];
    }
    return [{ id: "hand", label: "Hand & weapon", object: this.handScene }];
  }

  /**
   * World-space center of FP authoring meshes (for editor orbit “look at”).
   * @returns false only before picks exist.
   */
  /**
   * Viewmodel root under head pitch (for editor-only helpers such as a default-anchor marker).
   */
  getFpViewmodelAuthoringRoot(): THREE.Object3D {
    return this.fpRoot;
  }

  /** Snap the hand+weapon rig block to the built-in shoulder rest (same as omitting `rigRoot` in JSON). */
  snapRigRootToAuthoringDefaults(): void {
    this.rigRestPos.copy(FP_RIG_DEFAULT_POSITION);
    clampFpRigRootPositionInPlace(this.rigRestPos);
    this.rigRestEuler.set(0, 0, 0, "XYZ");
    this.rigRestScale.set(1, 1, 1);
    this.applyRigRestToRightHandRig();
  }

  /**
   * Copy `rightHandRig` local transform into `rigRest*` so authoring-frozen {@link update} does not
   * overwrite TransformControls edits on the rig pick.
   */
  syncAuthoringRigRestFromAttachedRig(): void {
    if (!this.viewmodelReady) return;
    this.rigRestPos.copy(this.rightHandRig.position);
    clampFpRigRootPositionInPlace(this.rigRestPos);
    this.rigRestEuler.copy(this.rightHandRig.rotation);
    this.rigRestScale.copy(this.rightHandRig.scale);
  }

  /**
   * Copy `rightHandRig` into `rigAim*` after ADS gizmo edits. While authoring-frozen in aim mode,
   * {@link update} leaves `rightHandRig` alone (unlike hip rest, which re-applies `rigRest*` each frame).
   */
  syncAuthoringRigAimFromAttachedRig(): void {
    if (!this.viewmodelReady) return;
    this.rigAimPos.copy(this.rightHandRig.position);
    clampFpRigRootPositionInPlace(this.rigAimPos);
    this.rigAimEuler.copy(this.rightHandRig.rotation);
  }

  getAuthoringOrbitTargetWorld(out: THREE.Vector3): boolean {
    return resolveAuthoringOrbitTargetWorld(
      this.fpRoot,
      this.getAuthoringPickList(),
      _AUTHOR_ORBIT_FALLBACK_OFFSET,
      out,
      { gripSocketForBounds: this.weaponGripAnchor },
    );
  }

  /** Persist current weapon root local pose into the presenter baseline (call after authoring). */
  syncFpWeaponMountBaselineFromRoot(): void {
    this.weapon?.syncFpMountBaselineFromRoot();
  }

  /**
   * Moves `rigRestPos` so the crowbar mount’s bounds center sits **in front of** the gameplay
   * camera at a fixed FPS-style offset (forward / right / down in camera space). Works even when
   * the mount started behind or off-axis — no ray/plane solve.
   *
   * @param rootForWorldUpdate Scene root for `updateMatrixWorld` before sampling bounds.
   */
  frameWeaponMountIntoGameplayCamera(
    rootForWorldUpdate: THREE.Object3D,
    gameplayCamera: THREE.PerspectiveCamera,
    options?: { aheadM?: number; rightM?: number; lowerM?: number },
  ): boolean {
    if (!this.viewmodelReady || !this.weapon) return false;
    const aheadM = options?.aheadM ?? FP_AUTHOR_GAMEPLAY_MOUNT_AHEAD_M;
    const rightM = options?.rightM ?? FP_AUTHOR_GAMEPLAY_MOUNT_RIGHT_M;
    const lowerM = options?.lowerM ?? FP_AUTHOR_GAMEPLAY_MOUNT_LOWER_M;

    gameplayCamera.updateMatrixWorld(true);
    gameplayCamera.getWorldQuaternion(this._vmMountQ);
    this._vmMountFwd.set(0, 0, -1).applyQuaternion(this._vmMountQ);
    this._vmMountRight.set(1, 0, 0).applyQuaternion(this._vmMountQ);
    this._vmMountUp.set(0, 1, 0).applyQuaternion(this._vmMountQ);
    this._vmMountTgt
      .copy(gameplayCamera.position)
      .addScaledVector(this._vmMountFwd, aheadM)
      .addScaledVector(this._vmMountRight, rightM)
      .addScaledVector(this._vmMountUp, -lowerM);

    const convergeM = 0.028;
    const damp = 0.32;
    const maxIters = 20;

    for (let iter = 0; iter < maxIters; iter++) {
      this.fpRoot.rotation.set(0, 0, 0);
      this.applyRigRestToRightHandRig();
      rootForWorldUpdate.updateMatrixWorld(true);

      const box = this._vmMountBox.setFromObject(this.weapon.root);
      if (box.isEmpty()) return false;
      box.getCenter(this._vmMountCur);

      this._vmMountDw.subVectors(this._vmMountTgt, this._vmMountCur);
      if (this._vmMountDw.lengthSq() < convergeM * convergeM) break;

      this._vmMountDw.multiplyScalar(damp);
      this.fpRoot.getWorldQuaternion(this._vmMountQ);
      this._vmMountQ.invert();
      this._vmMountDl.copy(this._vmMountDw).applyQuaternion(this._vmMountQ);
      const step = largestValidAuthoringRigRestStep(this.rigRestPos, this._vmMountDl);
      if (step < 1e-9) break;
      this.rigRestPos.addScaledVector(this._vmMountDl, step);
    }

    this.fpRoot.rotation.set(0, 0, 0);
    clampFpRigRootPositionInPlace(this.rigRestPos);
    this.applyRigRestToRightHandRig();
    return true;
  }

  /**
   * After `applyWeaponPrimitivePresentationDoc` (dev) or disk reload, re-apply hand / grip / weapon
   * from the current `weaponDefinition.primitivePresentation`.
   */
  reloadWeaponPresentationLayout(): void {
    if (!this.viewmodelReady || !this.handScene || !this.weaponGripAnchor) return;
    this.refreshRigRestFromDefinition();
    this.aimBlend01 = 0;
    const lay = this.resolveFpViewmodelLayout();
    this.handScene.position.copy(lay.handPosition);
    this.handScene.rotation.copy(lay.handEuler);
    this.handScene.scale.copy(lay.handScale);
    this.syncGripAnchorFromLiveHandHierarchy();
    this.equipWeaponFromDefinition();
    this.refreshRigAimFromDefinition();
    this.reapplyAuthoringFrozenPose();
    this.applyFpHandMeshVisibility();
  }

  /** After hotbar swap / layout reload while the dev authoring panel is open. */
  private reapplyAuthoringFrozenPose(): void {
    if (!this.authoringFrozen) return;
    if (this.authoringPoseMode === "aim") this.applyRigAimToRightHandRig();
    else this.applyRigRestToRightHandRig();
  }

  private equipWeaponFromDefinition(): void {
    this.weapon?.dispose(this.fpRoot);
    this.weapon = undefined;
    if (!this.weaponDefinition) {
      this.applyFpHandMeshVisibility();
      return;
    }
    const res = this.modelRegistry.instantiateLoaded(asGltf(this.weaponDefinition.modelRef));
    if (!res.ok) {
      throw new Error(`[LocalFirstPersonPresenter] weapon GLB (${this.weaponDefinition.id}): ${res.error}`);
    }
    this.weapon = new WeaponPresenter({
      definition: this.weaponDefinition,
      role: "local_first_person",
      visual: res.root as THREE.Object3D,
    });
    this.weapon.normalizeVisualToMaxEdgeMeters(FP_CROWBAR_GLTF_MAX_EDGE_M);
    this.weapon.getVisual().scale.copy(this.resolveFpViewmodelLayout().weaponVisualScale);
    const anchor = this.weaponGripAnchor;
    if (!anchor) throw new Error("[LocalFirstPersonPresenter] grip anchor missing");
    const { pos, euler, scale } = computeWeaponGripMountFromDefinition(this.weaponDefinition);
    this.weapon.attachToFpHand(anchor, pos, euler, scale);
    this.weapon.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  private maybeTriggerFirearmShot(state: LocalPlayerGameplayState): void {
    if (state.firearmShotSeq <= this.lastFirearmShotSeq) return;
    this.lastFirearmShotSeq = state.firearmShotSeq;
    const config = fpFirearmShotVisualConfigForHeldItem(state.equippedPrimary);
    if (!config) return;
    this.firearmShotConfig = config;
    this.firearmShotElapsedS = 0;
  }

  private applyFirearmReloadVisual(state: LocalPlayerGameplayState): void {
    const reload = state.firearmReload;
    if (!reload || !fpFirearmShotVisualConfigForHeldItem(state.equippedPrimary)) return;
    const sample = sampleFpFirearmReloadVisual(reload.progress01, reload.roundsToLoad);
    const knockRad = sample.rotationRad.x;
    const liftM = sample.translationM.y;
    if (knockRad <= 1e-9 && liftM <= 1e-9) return;

    this.fpRoot.updateMatrixWorld(true);
    this._vmMountRight.set(1, 0, 0).transformDirection(this.fpRoot.matrixWorld).normalize();
    this._vmMountUp.set(0, 1, 0).transformDirection(this.fpRoot.matrixWorld).normalize();
    this.rightHandRig.rotateOnWorldAxis(this._vmMountRight, knockRad);
    this.rightHandRig.position.addScaledVector(this._vmMountUp, liftM);
  }

  private applyFirearmShotVisual(dt: number): void {
    const config = this.firearmShotConfig;
    if (!config) {
      this.firearmFlashRoot.visible = false;
      return;
    }
    const sample = sampleFpFirearmShotVisual(config, this.firearmShotElapsedS);
    this.rightHandRig.position.x += sample.translationM.x;
    this.rightHandRig.position.y += sample.translationM.y;
    this.rightHandRig.position.z += sample.translationM.z;
    this.rightHandRig.rotation.x += sample.rotationRad.x;
    this.rightHandRig.rotation.y += sample.rotationRad.y;
    this.rightHandRig.rotation.z += sample.rotationRad.z;

    if (sample.flashAlpha > 0) {
      this.firearmFlashRoot.visible = true;
      this.firearmFlashRoot.position.set(
        config.flashLocalPositionM.x,
        config.flashLocalPositionM.y,
        config.flashLocalPositionM.z,
      );
      this.firearmFlashRoot.scale.setScalar(sample.flashScaleM);
      this.firearmFlashMaterial.opacity = sample.flashAlpha;
    } else {
      this.firearmFlashRoot.visible = false;
      this.firearmFlashMaterial.opacity = 0;
    }

    this.firearmShotElapsedS += dt;
    if (this.firearmShotElapsedS >= config.durationS) {
      this.firearmShotConfig = null;
      this.firearmFlashRoot.visible = false;
      this.firearmFlashMaterial.opacity = 0;
    }
  }

  update(state: LocalPlayerGameplayState, dt: number): void {
    if (!this.viewmodelReady) return;
    this.maybeTriggerFirearmShot(state);
    this.fpRoot.rotation.set(0, 0, 0);
    if (this.authoringFrozen) {
      // Hip rest: re-apply stored rig each frame (gizmo targets hand child, not rightHandRig).
      // ADS: gizmo is on rightHandRig — do not overwrite TransformControls edits.
      if (this.authoringPoseMode === "rest") this.applyRigRestToRightHandRig();
      this.firearmFlashRoot.visible = false;
      const swingTrack = this.resolveFpMeleeSwingTrack();
      const ph = this.swingAuthoringPreviewPhase;
      if (ph !== null && swingTrack && swingTrack.length > 0) {
        const u = THREE.MathUtils.clamp(ph, 0, 1);
        const p = samplePrimitiveMeleeSwing(swingTrack, u);
        this.rightHandRig.position.set(
          this.rigRestPos.x + p.translationM.x,
          this.rigRestPos.y + p.translationM.y,
          this.rigRestPos.z + p.translationM.z,
        );
        this.rightHandRig.rotation.set(
          this.rigRestEuler.x + p.rotationRad.x,
          this.rigRestEuler.y + p.rotationRad.y,
          this.rigRestEuler.z + p.rotationRad.z,
        );
        this.rightHandRig.scale.copy(this.rigRestScale);
        this.weapon?.updateMeleeSwing(u);
      } else {
        this.weapon?.resetPose();
      }
      if (this.fpAuthorGripAnchoredToLiveHandPose) {
        this.syncGripAnchorFromLiveHandHierarchy();
      }
      return;
    }
    this.driver.setDesired({
      locomotion: state.animation.locomotion,
      overlay: state.animation.overlay,
    });
    if (state.meleeAttackSeq > this.lastMeleeSeq) {
      this.lastMeleeSeq = state.meleeAttackSeq;
      this.driver.triggerTransient("attack_light");
      this.onMeleeVisual?.({
        seq: state.meleeAttackSeq,
        weaponId: state.equippedPrimary,
      });
    }
    this.driver.update(dt);
    const phase = this.driver.getTransientPhase01("attack_light");
    if (this.weapon) {
      if (phase > 0) this.weapon.updateMeleeSwing(phase);
      else this.weapon.resetPose();
    }

    const moving =
      state.grounded && (state.locomotion === "walk" || state.locomotion === "run");
    const stride = state.stridePhaseRad;
    const sin2 = Math.sin(stride * 2);
    const cos2 = Math.cos(stride * 2);
    const runMul = state.locomotion === "run" ? 1.2 : 1;

    const reloadActive = state.firearmReload != null;
    const armSwing = moving
      ? sin2 * 0.1 * runMul * (1 - this.aimBlend01) * (reloadActive ? 0 : 1)
      : 0;
    const armSway = moving
      ? cos2 * 0.045 * runMul * (1 - this.aimBlend01) * (reloadActive ? 0 : 1)
      : 0;

    const fpSwing = this.resolveFpMeleeSwingTrack();
    if (fpSwing && phase > 0) {
      const p = samplePrimitiveMeleeSwing(fpSwing, phase);
      this._rigHipPos.set(
        this.rigRestPos.x + p.translationM.x,
        this.rigRestPos.y + p.translationM.y,
        this.rigRestPos.z + p.translationM.z,
      );
      this._rigHipEuler.set(
        this.rigRestEuler.x + p.rotationRad.x,
        this.rigRestEuler.y + p.rotationRad.y,
        this.rigRestEuler.z + p.rotationRad.z,
        "XYZ",
      );
    } else {
      this._rigHipPos.set(this.rigRestPos.x, this.rigRestPos.y, this.rigRestPos.z);
      this._rigHipEuler.set(
        this.rigRestEuler.x + -armSwing * 0.95,
        this.rigRestEuler.y,
        this.rigRestEuler.z + -armSway * 0.75,
        "XYZ",
      );
    }
    this.applyRightHandRigPoseWithAimBlend(this._rigHipPos, this._rigHipEuler, state, dt);
    this.applyFirearmReloadVisual(state);
    if (this.fpAuthorGripAnchoredToLiveHandPose) {
      this.syncGripAnchorFromLiveHandHierarchy();
    }
    this.applyFirearmShotVisual(dt);
  }

  dispose(): void {
    this.weapon?.dispose(this.fpRoot);
    this.weapon = undefined;
    if (this.handScene) {
      detachRegistryCloneSubtree(this.handScene);
      this.handScene = undefined;
    }
    if (this.weaponGripAnchor) {
      this.rightHandRig.remove(this.weaponGripAnchor);
      this.weaponGripAnchor = undefined;
    }
    this.fpRoot.remove(this.firearmFlashRoot);
    this.firearmFlashGeometry.dispose();
    this.firearmFlashMaterial.dispose();
    this.viewModelParent.remove(this.fpRoot);
    this.fpRoot.clear();
    this.driver.dispose();
  }
}
