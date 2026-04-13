import * as THREE from "three";
import type { LocalPlayerGameplayState } from "@the-mammoth/game";
import type { IModelLoadRegistry, ModelRef } from "@the-mammoth/assets";
import type { IAnimationDriver } from "../../animation/animationDriverTypes.js";
import { PrimitiveAnimationDriver } from "../../animation/PrimitiveAnimationDriver.js";
import type { WeaponDefinition } from "../../weapons/weaponTypes.js";
import {
  clampFpRigRootPositionInPlace,
  FP_RIG_ROOT_XZ_MAX_ABS_M,
  FP_RIG_ROOT_Y_MAX_M,
  FP_RIG_ROOT_Y_MIN_M,
  isFpRigRootPositionAuthorable,
  samplePrimitiveMeleeSwing,
  type WeaponAuthorVec3,
} from "../../weapons/weaponPrimitiveAuthoring.js";
import { WeaponPresenter } from "../../weapons/WeaponPresenter.js";
import type { MeleeCombatVisualSink } from "../combatVisuals.js";
import { FP_MELEE_HAND_RIGHT } from "../fpViewmodelRefs.js";
import {
  FP_CROWBAR_GLTF_MAX_EDGE_M,
  forceDoubleSidedMeshes,
} from "../viewModelNormalize.js";
import { deepDisposeObject3D } from "../../loaders/deepDisposeObject3D.js";

export type LocalFirstPersonPresenterOptions = {
  /** Where `fpRoot` attaches — use `headPitch` from {@link createFPRig}, not the camera. */
  viewModelParent: THREE.Object3D;
  modelRegistry: IModelLoadRegistry;
  /** Active weapon (mount + swing + FP layout read from `primitivePresentation`). */
  weaponDefinition: WeaponDefinition;
  /** Optional injection for tests / GLTF path later. */
  animationDriver?: IAnimationDriver;
  onMeleeVisual?: MeleeCombatVisualSink;
};

/**
 * Rest offset of the right-hand rig under `fpRoot` (local meters; `fpRoot` counter-pitches with look).
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

export type FpAuthoringPick = { id: string; label: string; object: THREE.Object3D };

/**
 * First-person-only presentation (never reuse remote body meshes).
 * GLB right hand + GLB weapon; swing keyframes drive {@link rightHandRig}.
 */
export class LocalFirstPersonPresenter {
  private weaponDefinition: WeaponDefinition;
  private readonly viewModelParent: THREE.Object3D;
  private readonly modelRegistry: IModelLoadRegistry;
  private readonly fpRoot = new THREE.Group();
  private readonly driver: IAnimationDriver;
  private readonly onMeleeVisual?: MeleeCombatVisualSink;
  private weapon?: WeaponPresenter;
  private lastMeleeSeq = 0;
  private viewmodelReady = false;
  private readonly rightHandRig = new THREE.Group();
  /** Rest pose for {@link rightHandRig} under `fpRoot` (before walk sway / melee offset). */
  private readonly rigRestPos = new THREE.Vector3();
  private readonly rigRestEuler = new THREE.Euler(0, 0, 0, "XYZ");
  private readonly rigRestScale = new THREE.Vector3(1, 1, 1);
  private handScene?: THREE.Object3D;
  private weaponGripAnchor?: THREE.Group;
  private authoringFrozen = false;
  /** Scratch for {@link frameWeaponMountIntoGameplayCamera}. */
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
    this.viewModelParent.add(this.fpRoot);

    this.rightHandRig.name = "local_fp_right_hand_rig";
    this.fpRoot.add(this.rightHandRig);
    this.refreshRigRestFromDefinition();
    this.applyRigRestToRightHandRig();
  }

  private resolveFpViewmodelLayout(): {
    gripPosition: THREE.Vector3;
    handPosition: THREE.Vector3;
    handEuler: THREE.Euler;
    handScale: THREE.Vector3;
    weaponVisualScale: THREE.Vector3;
  } {
    const fp = this.weaponDefinition.primitivePresentation?.firstPerson?.fpViewmodel;
    return {
      gripPosition: vec3FromAuthorOr(fp?.gripAnchorPositionM, DEFAULT_FP_GRIP),
      handPosition: vec3FromAuthorOr(fp?.hand?.positionM, DEFAULT_FP_HAND_POS),
      handEuler: eulerFromAuthorOr(fp?.hand?.eulerRad, DEFAULT_FP_HAND_EULER),
      handScale: vec3FromAuthorOr(fp?.hand?.scale, DEFAULT_FP_HAND_SCALE),
      weaponVisualScale: vec3FromAuthorOr(fp?.weaponVisualScale, DEFAULT_FP_WEAPON_VISUAL_SCALE),
    };
  }

  /** Runtime / editor: swap weapon mesh + authoring data (caller preloads `modelRef`). */
  setWeaponDefinition(def: WeaponDefinition): void {
    this.weaponDefinition = def;
    if (this.viewmodelReady && this.handScene && this.weaponGripAnchor) {
      this.reloadWeaponPresentationLayout();
    }
  }

  getWeaponDefinition(): WeaponDefinition {
    return this.weaponDefinition;
  }

  private refreshRigRestFromDefinition(): void {
    const rr = this.weaponDefinition.primitivePresentation?.firstPerson?.fpViewmodel?.rigRoot;
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
  }

  private applyRigRestToRightHandRig(): void {
    this.rightHandRig.position.copy(this.rigRestPos);
    this.rightHandRig.rotation.copy(this.rigRestEuler);
    this.rightHandRig.scale.copy(this.rigRestScale);
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
    });
    this.rightHandRig.add(this.handScene);

    this.weaponGripAnchor = new THREE.Group();
    this.weaponGripAnchor.name = "weapon_grip_anchor";
    this.weaponGripAnchor.position.copy(fpLayout.gripPosition);
    this.handScene.add(this.weaponGripAnchor);

    this.equipWeaponFromDefinition();
    this.viewmodelReady = true;
  }

  /**
   * When true, viewmodel stays at rest (no walk sway / swing) so TransformControls edits stick.
   * Head pitch on `fpRoot` still follows look — matches the gameplay camera framing.
   */
  setAuthoringFrozen(frozen: boolean): void {
    this.authoringFrozen = frozen;
  }

  /** Targets for dev FP layout tools (hand mesh, grip socket, weapon root / visual). */
  getAuthoringPickList(): FpAuthoringPick[] {
    const list: FpAuthoringPick[] = [];
    list.push({
      id: "rigRoot",
      label: "Hand + weapon (camera / view offset)",
      object: this.rightHandRig,
    });
    if (this.handScene) {
      list.push({ id: "hand", label: "Hand GLB (scale / mirror / tilt)", object: this.handScene });
    }
    if (this.weaponGripAnchor) {
      list.push({ id: "gripAnchor", label: "Weapon grip anchor (socket on hand)", object: this.weaponGripAnchor });
    }
    if (this.weapon) {
      const dn = this.weaponDefinition.displayName;
      list.push({
        id: "weaponRoot",
        label: `${dn} mount (weapon root vs grip)`,
        object: this.weapon.root,
      });
      list.push({
        id: "weaponVisual",
        label: `${dn} mesh (visual scale)`,
        object: this.weapon.getVisual(),
      });
    }
    return list;
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

  getAuthoringOrbitTargetWorld(out: THREE.Vector3): boolean {
    const picks = this.getAuthoringPickList();
    if (picks.length === 0) return false;
    const box = new THREE.Box3();
    const weaponMount = picks.find((p) => p.id === "weaponRoot");
    const gripSocket = picks.find((p) => p.id === "gripAnchor");
    if (weaponMount) {
      box.setFromObject(weaponMount.object);
      if (gripSocket) {
        const gripBox = new THREE.Box3().setFromObject(gripSocket.object);
        box.union(gripBox);
      }
    } else {
      for (const p of picks) {
        box.expandByObject(p.object);
      }
    }
    if (box.isEmpty() || !Number.isFinite(box.min.x)) {
      this.fpRoot.getWorldPosition(out);
      out.add(_AUTHOR_ORBIT_FALLBACK_OFFSET);
      return true;
    }
    box.getCenter(out);
    return true;
  }

  /** Persist current weapon root local pose into the presenter baseline (call after authoring). */
  syncFpWeaponMountBaselineFromRoot(): void {
    this.weapon?.syncFpMountBaselineFromRoot();
  }

  /**
   * Max α∈(0,1] so `rest + α·delta` stays inside the FP rig authoring box (asymmetric on Y).
   */
  private static largestValidAuthoringRigRestStep(rest: THREE.Vector3, delta: THREE.Vector3): number {
    const capXz = FP_RIG_ROOT_XZ_MAX_ABS_M * 0.999;
    const yLo = FP_RIG_ROOT_Y_MIN_M;
    const yHi = FP_RIG_ROOT_Y_MAX_M;
    let t = 1;
    for (let k = 0; k < 28; k++) {
      const nx = rest.x + t * delta.x;
      const ny = rest.y + t * delta.y;
      const nz = rest.z + t * delta.z;
      if (
        Math.abs(nx) <= capXz &&
        Math.abs(nz) <= capXz &&
        ny >= yLo &&
        ny <= yHi
      ) {
        return t;
      }
      t *= 0.5;
    }
    return 0;
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
    pitchRad: number,
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
      this.fpRoot.rotation.set(-pitchRad, 0, 0);
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
      const step = LocalFirstPersonPresenter.largestValidAuthoringRigRestStep(this.rigRestPos, this._vmMountDl);
      if (step < 1e-9) break;
      this.rigRestPos.addScaledVector(this._vmMountDl, step);
    }

    this.fpRoot.rotation.set(-pitchRad, 0, 0);
    clampFpRigRootPositionInPlace(this.rigRestPos);
    this.applyRigRestToRightHandRig();
    return true;
  }

  private computeWeaponGripMount(): {
    pos: THREE.Vector3;
    euler: THREE.Euler;
    scale: THREE.Vector3;
  } {
    const pres = this.weaponDefinition.primitivePresentation?.firstPerson;
    if (!pres) {
      return {
        pos: new THREE.Vector3(),
        euler: new THREE.Euler(0, 0, 0, "XYZ"),
        scale: new THREE.Vector3(1, 1, 1),
      };
    }
    const sm = pres.mount.scaleM;
    return {
      pos: new THREE.Vector3(
        pres.mount.positionM.x,
        pres.mount.positionM.y,
        pres.mount.positionM.z,
      ),
      euler: new THREE.Euler(
        pres.mount.eulerRad.x,
        pres.mount.eulerRad.y,
        pres.mount.eulerRad.z,
        "XYZ",
      ),
      scale: sm ? new THREE.Vector3(sm.x, sm.y, sm.z) : new THREE.Vector3(1, 1, 1),
    };
  }

  /**
   * After `applyWeaponPrimitivePresentationDoc` (dev) or disk reload, re-apply hand / grip / weapon
   * from the current `weaponDefinition.primitivePresentation`.
   */
  reloadWeaponPresentationLayout(): void {
    if (!this.viewmodelReady || !this.handScene || !this.weaponGripAnchor) return;
    this.refreshRigRestFromDefinition();
    this.applyRigRestToRightHandRig();
    const lay = this.resolveFpViewmodelLayout();
    this.handScene.position.copy(lay.handPosition);
    this.handScene.rotation.copy(lay.handEuler);
    this.handScene.scale.copy(lay.handScale);
    this.weaponGripAnchor.position.copy(lay.gripPosition);
    this.equipWeaponFromDefinition();
  }

  private equipWeaponFromDefinition(): void {
    this.weapon?.dispose(this.fpRoot);
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
    const { pos, euler, scale } = this.computeWeaponGripMount();
    this.weapon.attachToFpHand(anchor, pos, euler, scale);
  }

  update(state: LocalPlayerGameplayState, dt: number): void {
    if (!this.viewmodelReady) return;
    if (this.authoringFrozen) {
      this.fpRoot.rotation.set(-state.pitchRad, 0, 0);
      this.applyRigRestToRightHandRig();
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

    const armSwing = moving ? sin2 * 0.1 * runMul : 0;
    const armSway = moving ? cos2 * 0.045 * runMul : 0;

    const fpSwing = this.weaponDefinition.primitivePresentation?.firstPerson?.meleeSwing;
    if (fpSwing && phase > 0) {
      const p = samplePrimitiveMeleeSwing(fpSwing, phase);
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
    } else {
      this.rightHandRig.position.set(
        this.rigRestPos.x,
        this.rigRestPos.y,
        this.rigRestPos.z,
      );
      this.rightHandRig.rotation.set(
        this.rigRestEuler.x + -armSwing * 0.95,
        this.rigRestEuler.y,
        this.rigRestEuler.z + -armSway * 0.75,
      );
      this.rightHandRig.scale.copy(this.rigRestScale);
    }

    this.fpRoot.rotation.set(-state.pitchRad, 0, 0);
  }

  dispose(): void {
    this.weapon?.dispose(this.fpRoot);
    this.weapon = undefined;
    if (this.handScene) {
      this.rightHandRig.remove(this.handScene);
      deepDisposeObject3D(this.handScene);
      this.handScene = undefined;
    }
    this.weaponGripAnchor = undefined;
    this.viewModelParent.remove(this.fpRoot);
    this.fpRoot.clear();
    this.driver.dispose();
  }
}
