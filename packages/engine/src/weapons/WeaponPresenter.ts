import * as THREE from "three";
import type { WeaponDefinition } from "./weaponTypes.js";
import type { WeaponPresentationRole } from "./weaponTypes.js";
import { createCrowbarPrimitive } from "./primitiveWeaponMeshes.js";
import { samplePrimitiveMeleeSwing } from "./weaponPrimitiveAuthoring.js";

export type WeaponPresenterConfig = {
  definition: WeaponDefinition;
  role: WeaponPresentationRole;
  /** Tint for quick silhouette reads in debug builds. */
  color?: number;
};

/**
 * Owns the Three.js subtree for a single equipped weapon instance.
 * TODO: swap mesh when `IModelLoadRegistry` returns a GLTF scene; keep anchors stable.
 */
export class WeaponPresenter {
  readonly root = new THREE.Group();
  private visual: THREE.Group;
  private role: WeaponPresentationRole;
  private readonly definition: WeaponDefinition;
  /**
   * When true (FP only), `root` is parented to the forearm/hand rig and stays rigid in hand —
   * swing pose is applied on the parent rig, not here (avoids double motion + matches bone attach).
   */
  fpHandAttached = false;
  /** Rest pose for `root` (fpRoot / hand space). Swing **translation** is added here so it is not tilted by mount rotation on the visual. */
  private readonly baseRootPos = new THREE.Vector3();
  private readonly baseRootEuler = new THREE.Euler();

  constructor(cfg: WeaponPresenterConfig) {
    this.role = cfg.role;
    this.definition = cfg.definition;
    this.visual = createCrowbarPrimitive(cfg.color ?? 0x6e7a87);
    this.root.add(this.visual);
    this.applyMountFromAuthoring();
  }

  private applyMountFromAuthoring(): void {
    const doc = this.definition.primitivePresentation;
    const role = this.role === "local_first_person" ? doc?.firstPerson : doc?.thirdPerson;
    if (role) {
      const m = role.mount;
      this.baseRootPos.set(m.positionM.x, m.positionM.y, m.positionM.z);
      this.baseRootEuler.set(m.eulerRad.x, m.eulerRad.y, m.eulerRad.z, "XYZ");
    } else if (this.role === "local_first_person") {
      this.baseRootPos.set(0.32, -0.22, -0.58);
      this.baseRootEuler.set(0.15, 0.55, 0.2, "XYZ");
    } else {
      this.baseRootPos.set(0.08, 0.02, 0.06);
      this.baseRootEuler.set(0, 0, -0.35, "XYZ");
    }
    this.syncRootToMount();
  }

  private syncRootToMount(): void {
    this.root.position.copy(this.baseRootPos);
    this.root.rotation.copy(this.baseRootEuler);
  }

  /**
   * Parent weapon under the FP forearm rig with a fixed grip pose (like a weapon bone).
   * After this, melee swing is driven by the parent; this mesh stays rigid in hand.
   */
  attachToFpHand(
    handRig: THREE.Object3D,
    localPosition: THREE.Vector3,
    localEuler: THREE.Euler,
  ): void {
    if (this.role !== "local_first_person") return;
    if (this.root.parent) this.root.parent.remove(this.root);
    handRig.add(this.root);
    this.root.position.copy(localPosition);
    this.root.rotation.copy(localEuler);
    this.baseRootPos.copy(localPosition);
    this.baseRootEuler.copy(localEuler);
    this.fpHandAttached = true;
    this.syncRootToMount();
    this.visual.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
  }

  /**
   * Primitive swing from `primitivePresentation` JSON when present; else built-in defaults.
   * TODO: replace with bone-driven weapon aim / GLTF clip when rigs land.
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
      this.visual.rotation.set(swing * -0.62, swing * -1.05, swing * 0.18);
      this.visual.position.set(0, 0, 0);
    } else {
      this.root.position.copy(this.baseRootPos);
      this.root.rotation.copy(this.baseRootEuler);
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
    this.visual.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material;
        if (!Array.isArray(mat)) mat.dispose();
        else mat.forEach((x) => x.dispose());
      }
    });
  }
}
