import * as THREE from "three";
import type { WeaponDefinition } from "./weaponTypes.js";
import type { WeaponPresentationRole } from "./weaponTypes.js";
import { samplePrimitiveMeleeSwing } from "./weaponPrimitiveAuthoring.js";
import { deepDisposeObject3D } from "../loaders/deepDisposeObject3D.js";
import { setMaxEdgeUniformScale } from "../playerPresentation/viewModelNormalize.js";

const FP_HAND_MOUNT_DEFAULT_SCALE = new THREE.Vector3(1, 1, 1);

export type WeaponPresenterConfig = {
  definition: WeaponDefinition;
  role: WeaponPresentationRole;
  /** Cloned GLB scene root (caller transfers ownership — {@link dispose} frees GPU resources). */
  visual: THREE.Object3D;
};

/**
 * Owns the Three.js subtree for a single equipped weapon instance (GLB `visual` under `root`).
 */
export class WeaponPresenter {
  readonly root = new THREE.Group();
  private readonly visual: THREE.Object3D;
  private role: WeaponPresentationRole;
  private readonly definition: WeaponDefinition;
  /**
   * When true (FP only), `root` is parented under a hand grip anchor and stays rigid in hand —
   * swing pose is applied on the parent rig, not here.
   */
  fpHandAttached = false;
  /** Rest pose for `root` (hand / tp mount space). Swing **translation** keys add on top when not FP-attached. */
  private readonly baseRootPos = new THREE.Vector3();
  private readonly baseRootEuler = new THREE.Euler();
  private readonly baseRootScale = new THREE.Vector3(1, 1, 1);

  constructor(cfg: WeaponPresenterConfig) {
    this.role = cfg.role;
    this.definition = cfg.definition;
    this.visual = cfg.visual;
    this.root.add(this.visual);
    this.applyMountFromAuthoring();
  }

  /** GLB subtree under {@link root} (normalized scale may be applied here). */
  getVisual(): THREE.Object3D {
    return this.visual;
  }

  /**
   * After FP authoring, copy the weapon {@link root} local transform into the baseline used by
   * {@link resetPose} / swing so gameplay matches the gizmo.
   */
  syncFpMountBaselineFromRoot(): void {
    if (!this.fpHandAttached || this.role !== "local_first_person") return;
    this.baseRootPos.copy(this.root.position);
    this.baseRootEuler.copy(this.root.rotation);
    this.baseRootScale.copy(this.root.scale);
  }

  private applyMountFromAuthoring(): void {
    const doc = this.definition.primitivePresentation;
    const role = this.role === "local_first_person" ? doc?.firstPerson : doc?.thirdPerson;
    if (role) {
      const m = role.mount;
      this.baseRootPos.set(m.positionM.x, m.positionM.y, m.positionM.z);
      this.baseRootEuler.set(m.eulerRad.x, m.eulerRad.y, m.eulerRad.z, "XYZ");
      const sm = m.scaleM;
      this.baseRootScale.set(sm?.x ?? 1, sm?.y ?? 1, sm?.z ?? 1);
    } else if (this.role === "local_first_person") {
      this.baseRootPos.set(0.32, -0.22, -0.58);
      this.baseRootEuler.set(0.15, 0.55, 0.2, "XYZ");
      this.baseRootScale.set(1, 1, 1);
    } else {
      this.baseRootPos.set(0.035, -0.02, 0.045);
      this.baseRootEuler.set(0.12, -0.05, -0.38, "XYZ");
      this.baseRootScale.set(1, 1, 1);
    }
    this.syncRootToMount();
  }

  private syncRootToMount(): void {
    this.root.position.copy(this.baseRootPos);
    this.root.rotation.copy(this.baseRootEuler);
    this.root.scale.copy(this.baseRootScale);
  }

  /**
   * Parent weapon under a FP grip anchor with a fixed local grip pose.
   * After this, melee swing is driven by the parent rig; this mesh stays rigid in hand.
   */
  attachToFpHand(
    gripParent: THREE.Object3D,
    localPosition: THREE.Vector3,
    localEuler: THREE.Euler,
    localScale?: THREE.Vector3,
  ): void {
    if (this.role !== "local_first_person") return;
    const sc = localScale ?? FP_HAND_MOUNT_DEFAULT_SCALE;
    if (this.root.parent) this.root.parent.remove(this.root);
    gripParent.add(this.root);
    this.root.position.copy(localPosition);
    this.root.rotation.copy(localEuler);
    this.root.scale.copy(sc);
    this.baseRootPos.copy(localPosition);
    this.baseRootEuler.copy(localEuler);
    this.baseRootScale.copy(sc);
    this.fpHandAttached = true;
    this.syncRootToMount();
    this.visual.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
  }

  /**
   * Melee swing from `primitivePresentation` JSON when present; else built-in defaults.
   * TODO: drive from GLTF clips on the hand / weapon skeletons when rigs land.
   */
  updateMeleeSwing(phase01: number): void {
    if (this.fpHandAttached && this.role === "local_first_person") {
      this.syncRootToMount();
      this.visual.rotation.set(0, 0, 0);
      this.visual.position.set(0, 0, 0);
      return;
    }
    const doc = this.definition.primitivePresentation;
    const keys =
      this.role === "local_first_person"
        ? doc?.firstPerson.meleeSwing
        : doc?.thirdPerson.meleeSwing;
    if (keys && keys.length > 0) {
      const p = samplePrimitiveMeleeSwing(keys, phase01);
      this.root.position.set(
        this.baseRootPos.x + p.translationM.x,
        this.baseRootPos.y + p.translationM.y,
        this.baseRootPos.z + p.translationM.z,
      );
      this.root.rotation.copy(this.baseRootEuler);
      this.root.scale.copy(this.baseRootScale);
      this.visual.rotation.set(p.rotationRad.x, p.rotationRad.y, p.rotationRad.z);
      this.visual.position.set(0, 0, 0);
      return;
    }
    const swing = Math.sin(phase01 * Math.PI);
    if (this.role === "local_first_person") {
      this.root.position.set(
        this.baseRootPos.x + swing * -0.06,
        this.baseRootPos.y + swing * -0.04,
        this.baseRootPos.z + swing * -0.12,
      );
      this.root.rotation.copy(this.baseRootEuler);
      this.root.scale.copy(this.baseRootScale);
      this.visual.rotation.set(swing * -0.62, swing * -1.05, swing * 0.18);
      this.visual.position.set(0, 0, 0);
    } else {
      this.root.position.copy(this.baseRootPos);
      this.root.rotation.copy(this.baseRootEuler);
      this.root.scale.copy(this.baseRootScale);
      this.visual.rotation.set(swing * 0.55, swing * 0.85, swing * -0.12);
      this.visual.position.set(swing * 0.05, swing * -0.02, swing * 0.04);
    }
  }

  resetPose(): void {
    this.syncRootToMount();
    this.visual.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
  }

  dispose(fallbackParent: THREE.Object3D): void {
    const p = this.root.parent ?? fallbackParent;
    p.remove(this.root);
    deepDisposeObject3D(this.visual);
  }

  /**
   * Shrinks an oversized GLB to match former primitive weapon footprint (meters).
   * Call once after construction, before or after {@link attachToFpHand}.
   */
  normalizeVisualToMaxEdgeMeters(maxEdgeMeters: number): void {
    setMaxEdgeUniformScale(this.visual, maxEdgeMeters);
  }
}
