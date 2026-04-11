import * as THREE from "three";
import type { LocalPlayerGameplayState } from "@the-mammoth/game";
import type { IAnimationDriver } from "../../animation/animationDriverTypes.js";
import { PrimitiveAnimationDriver } from "../../animation/PrimitiveAnimationDriver.js";
import { crowbarWeaponDefinition } from "../../weapons/sampleDefinitions.js";
import { samplePrimitiveMeleeSwing } from "../../weapons/weaponPrimitiveAuthoring.js";
import { WeaponPresenter } from "../../weapons/WeaponPresenter.js";
import type { MeleeCombatVisualSink } from "../combatVisuals.js";

export type LocalFirstPersonPresenterOptions = {
  camera: THREE.Camera;
  /** Where `fpRoot` attaches — use `headPitch` from {@link createFPRig}, not the camera. */
  viewModelParent: THREE.Object3D;
  /** Optional injection for tests / GLTF path later. */
  animationDriver?: IAnimationDriver;
  onMeleeVisual?: MeleeCombatVisualSink;
};

/**
 * Shoulder / rig row for **both** arms: large **+Z** (shallow −Z) so when looking straight down the
 * limbs sit toward the bottom of the screen instead of reading like the “back” of thin prisms.
 */
/** `pz` toward **+Z** pulls both shoulder origins back (shallower than −Z forward). */
const FP_SHOULDER_REST = { px: 0.33, py: -0.59, pz: 0.03 } as const;

/** Right rig only: lift so the forearm volume meets the crowbar (left stays on `FP_SHOULDER_REST.py`). */
const FP_RIGHT_RIG_PY_LIFT = 0.12 as const;

/** Hips / leg stack origin (below torso). */
const FP_HIP_POS = { x: 0, y: -0.52, z: FP_SHOULDER_REST.pz } as const;

/**
 * Left arm hanging **straight down** in `fpRoot` space (long box axis = local **±Y**), slight roll only.
 * Same shoulder row as the right rig so both attach from one line.
 */
const FP_LEFT_SIDE_POS = {
  x: -FP_SHOULDER_REST.px,
  y: FP_SHOULDER_REST.py,
  z: FP_SHOULDER_REST.pz,
} as const;
const FP_LEFT_SIDE_EULER = { x: 0, y: 0, z: -0.09 } as const;

/** Reflection R' = S·R·S with S = diag(−1,1,1) so the right limb matches a mirrored copy of the left. */
function mirrorEulerAcrossYz(e: THREE.Euler): THREE.Euler {
  const R = new THREE.Matrix4().makeRotationFromEuler(e);
  const S = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const Rm = new THREE.Matrix4().multiplyMatrices(S, R).multiply(S);
  return new THREE.Euler().setFromRotationMatrix(Rm, e.order);
}

const _eLeftBind = new THREE.Euler(
  FP_LEFT_SIDE_EULER.x,
  FP_LEFT_SIDE_EULER.y,
  FP_LEFT_SIDE_EULER.z,
  "XYZ",
);
const FP_RIGHT_ARM_BIND_EULER = mirrorEulerAcrossYz(_eLeftBind);

/**
 * First-person-only presentation (never reuse remote body meshes).
 * Parents a viewmodel root to **`headPitch`** (via `viewModelParent`) so it does not inherit Alt
 * **free-look yaw** (that lives under `headFreeLook` → camera). **`fpRoot` is always counter-pitched**
 * against `headPitch` so look up/down moves only the camera (“head”), never arms/legs/weapon.
 *
 * **Crowbar:** parented under a placeholder **forearm rig** (shoulder group + forearm mesh) so the
 * tool stays rigid in “hand” space while the whole arm drives the authored swing — same idea as a weapon bone.
 */
export class LocalFirstPersonPresenter {
  private readonly camera: THREE.Camera;
  private readonly viewModelParent: THREE.Object3D;
  private readonly fpRoot = new THREE.Group();
  private readonly driver: IAnimationDriver;
  private readonly onMeleeVisual?: MeleeCombatVisualSink;
  private weapon?: WeaponPresenter;
  private lastMeleeSeq = 0;
  private readonly leftArm: THREE.Mesh;
  private readonly leftFoot: THREE.Mesh;
  private readonly rightFoot: THREE.Mesh;
  private readonly leftThighRig: THREE.Group;
  private readonly rightThighRig: THREE.Group;
  private readonly leftCalfRig: THREE.Group;
  private readonly rightCalfRig: THREE.Group;
  /** Shoulder pivot in fpRoot space; swing **rotation keys** apply here (default XYZ like the left mesh). */
  private readonly rightArmRig = new THREE.Group();
  /** Right shoulder pivot, lifted vs shared row so the mesh intersects the weapon grip. */
  private readonly rightShoulderRest = {
    px: FP_SHOULDER_REST.px,
    py: FP_SHOULDER_REST.py + FP_RIGHT_RIG_PY_LIFT,
    pz: FP_SHOULDER_REST.pz,
  };

  constructor(opts: LocalFirstPersonPresenterOptions) {
    this.camera = opts.camera;
    this.viewModelParent = opts.viewModelParent;
    this.driver = opts.animationDriver ?? new PrimitiveAnimationDriver();
    this.onMeleeVisual = opts.onMeleeVisual;
    this.fpRoot.name = "local_fp_viewmodel_root";
    this.viewModelParent.add(this.fpRoot);
    const built = this.buildPlaceholderViewmodel();
    this.leftArm = built.left;
    this.leftFoot = built.leftFoot;
    this.rightFoot = built.rightFoot;
    this.leftThighRig = built.leftThighRig;
    this.rightThighRig = built.rightThighRig;
    this.leftCalfRig = built.leftCalfRig;
    this.rightCalfRig = built.rightCalfRig;
    this.equipCrowbar();
  }

  /**
   * Grip pose for `WeaponPresenter.root` **relative to `rightArmRig`**, so the on-screen layout
   * matches the old fpRoot mount when the arm is at rest.
   */
  private computeWeaponHandLocalMount(): { pos: THREE.Vector3; euler: THREE.Euler } {
    const pres = crowbarWeaponDefinition.primitivePresentation?.firstPerson;
    if (!pres) {
      return {
        pos: new THREE.Vector3(0.02, -0.02, -0.48),
        euler: new THREE.Euler(0.1, 0.4, 0.12, "XYZ"),
      };
    }
    const armPos = new THREE.Vector3(
      this.rightShoulderRest.px,
      this.rightShoulderRest.py,
      this.rightShoulderRest.pz,
    );
    /** At rest the rig has identity rotation; the forearm uses the YZ-mirrored bind of the left arm. */
    const armEuler = FP_RIGHT_ARM_BIND_EULER.clone();
    const weaponW = new THREE.Vector3(
      pres.mount.positionM.x,
      pres.mount.positionM.y,
      pres.mount.positionM.z,
    );
    const weaponE = new THREE.Euler(
      pres.mount.eulerRad.x,
      pres.mount.eulerRad.y,
      pres.mount.eulerRad.z,
      "XYZ",
    );
    const qArm = new THREE.Quaternion().setFromEuler(armEuler);
    const localPos = weaponW.clone().sub(armPos).applyQuaternion(qArm.clone().invert());
    const qW = new THREE.Quaternion().setFromEuler(weaponE);
    const qLocal = qW.clone().multiply(qArm.clone().invert());
    const localEuler = new THREE.Euler().setFromQuaternion(qLocal, "XYZ");
    // Grip on the bar: slight +Y; +Z pulls the tool inward (toward torso) vs pure authored mount.
    localPos.z += 0.08;
    localPos.y += 0.03;
    return { pos: localPos, euler: localEuler };
  }

  private buildPlaceholderViewmodel(): {
    left: THREE.Mesh;
    leftFoot: THREE.Mesh;
    rightFoot: THREE.Mesh;
    leftThighRig: THREE.Group;
    rightThighRig: THREE.Group;
    leftCalfRig: THREE.Group;
    rightCalfRig: THREE.Group;
  } {
    const skinTpl = new THREE.MeshStandardMaterial({
      color: 0xc7b299,
      roughness: 0.55,
      metalness: 0.02,
    });
    const shirtMat = skinTpl.clone();
    shirtMat.color.setHex(0x6a5a52);
    shirtMat.roughness = 0.68;

    /** Shorter left forearm (Y = long axis). */
    const geoL = new THREE.BoxGeometry(0.1, 0.46, 0.1);
    const geoR = new THREE.BoxGeometry(0.14, 0.14, 0.84);
    const left = new THREE.Mesh(geoL, skinTpl.clone());
    left.name = "local_fp_left_arm_primitive";
    left.position.set(FP_LEFT_SIDE_POS.x, FP_LEFT_SIDE_POS.y, FP_LEFT_SIDE_POS.z);
    left.rotation.set(FP_LEFT_SIDE_EULER.x, FP_LEFT_SIDE_EULER.y, FP_LEFT_SIDE_EULER.z);
    left.castShadow = false;

    /** Narrow slab between ~±0.33 arms; shallow −Z so it does not eat horizontal FOV. */
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.38, 0.16 / 3),
      shirtMat,
    );
    torso.name = "local_fp_torso_primitive";
    torso.position.set(0, -0.3, FP_SHOULDER_REST.pz + 0.01);
    torso.castShadow = false;

    const legsRoot = new THREE.Group();
    legsRoot.name = "local_fp_legs_root";
    legsRoot.position.set(FP_HIP_POS.x, FP_HIP_POS.y, FP_HIP_POS.z);

    const thighLen = 0.3;
    const calfLen = 0.28;
    const thighGeo = new THREE.BoxGeometry(0.13, thighLen, 0.13);
    const calfGeo = new THREE.BoxGeometry(0.11, calfLen, 0.11);

    const mkLeg = (side: "L" | "R") => {
      const thighRig = new THREE.Group();
      thighRig.name = `local_fp_${side}_thigh`;
      thighRig.position.set(side === "L" ? -0.1 : 0.1, 0, 0);
      const thigh = new THREE.Mesh(thighGeo, skinTpl.clone());
      thigh.position.set(0, -thighLen * 0.5, 0);
      thigh.castShadow = false;
      thighRig.add(thigh);

      const calfRig = new THREE.Group();
      calfRig.name = `local_fp_${side}_calf`;
      calfRig.position.set(0, -thighLen, 0);
      const calf = new THREE.Mesh(calfGeo, skinTpl.clone());
      calf.position.set(0, -calfLen * 0.5, 0);
      calf.castShadow = false;
      calfRig.add(calf);
      thighRig.add(calfRig);

      return { thighRig, calfRig };
    };

    const L = mkLeg("L");
    const R = mkLeg("R");
    legsRoot.add(L.thighRig, R.thighRig);

    const footMat = skinTpl.clone();
    footMat.color.setHex(0xb8a090);
    footMat.roughness = 0.62;
    const footGeo = new THREE.BoxGeometry(0.055, 0.038, 0.2);
    const leftFoot = new THREE.Mesh(footGeo, footMat);
    leftFoot.name = "local_fp_left_foot";
    const rightFoot = new THREE.Mesh(footGeo, footMat.clone());
    rightFoot.name = "local_fp_right_foot";
    leftFoot.position.set(0, -calfLen, 0.02);
    rightFoot.position.set(0, -calfLen, 0.02);
    leftFoot.castShadow = false;
    rightFoot.castShadow = false;
    L.calfRig.add(leftFoot);
    R.calfRig.add(rightFoot);

    this.rightArmRig.name = "local_fp_right_arm_rig";
    this.rightArmRig.position.set(
      this.rightShoulderRest.px,
      this.rightShoulderRest.py,
      this.rightShoulderRest.pz,
    );
    this.rightArmRig.rotation.set(0, 0, 0);
    const forearm = new THREE.Mesh(geoR, skinTpl.clone());
    forearm.name = "local_fp_forearm_primitive";
    forearm.position.set(0, 0.04, -0.16);
    forearm.rotation.copy(FP_RIGHT_ARM_BIND_EULER);
    forearm.castShadow = false;
    this.rightArmRig.add(forearm);

    this.fpRoot.add(torso, legsRoot, left, this.rightArmRig);
    skinTpl.dispose();

    return {
      left,
      leftFoot,
      rightFoot,
      leftThighRig: L.thighRig,
      rightThighRig: R.thighRig,
      leftCalfRig: L.calfRig,
      rightCalfRig: R.calfRig,
    };
  }

  private equipCrowbar(): void {
    this.weapon?.dispose(this.fpRoot);
    this.weapon = new WeaponPresenter({
      definition: crowbarWeaponDefinition,
      role: "local_first_person",
      color: 0x7c8aa0,
    });
    const { pos, euler } = this.computeWeaponHandLocalMount();
    this.weapon.attachToFpHand(this.rightArmRig, pos, euler);
  }

  update(state: LocalPlayerGameplayState, dt: number): void {
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

    /** Mouse look down → more negative `pitchRad`; only then show feet (body peek). */
    const feetVisible = state.pitchRad < -0.86;
    this.leftFoot.visible = feetVisible;
    this.rightFoot.visible = feetVisible;

    const thighAmp = 0.32 * runMul;
    const kneeAmp = 0.55 * runMul;
    if (moving) {
      this.leftThighRig.rotation.x = sin2 * thighAmp;
      this.rightThighRig.rotation.x = -sin2 * thighAmp;
      this.leftCalfRig.rotation.x = -Math.max(0, sin2) * kneeAmp;
      this.rightCalfRig.rotation.x = -Math.max(0, -sin2) * kneeAmp;
    } else {
      const d = 10;
      this.leftThighRig.rotation.x = THREE.MathUtils.damp(this.leftThighRig.rotation.x, 0, d, dt);
      this.rightThighRig.rotation.x = THREE.MathUtils.damp(this.rightThighRig.rotation.x, 0, d, dt);
      this.leftCalfRig.rotation.x = THREE.MathUtils.damp(this.leftCalfRig.rotation.x, 0, d, dt);
      this.rightCalfRig.rotation.x = THREE.MathUtils.damp(this.rightCalfRig.rotation.x, 0, d, dt);
    }

    const armSwing = moving ? sin2 * 0.1 * runMul : 0;
    const armSway = moving ? cos2 * 0.045 * runMul : 0;

    this.leftArm.position.set(FP_LEFT_SIDE_POS.x, FP_LEFT_SIDE_POS.y, FP_LEFT_SIDE_POS.z);
    this.leftArm.rotation.set(
      FP_LEFT_SIDE_EULER.x + armSwing,
      FP_LEFT_SIDE_EULER.y,
      FP_LEFT_SIDE_EULER.z + armSway,
    );

    const fpSwing = crowbarWeaponDefinition.primitivePresentation?.firstPerson.meleeSwing;
    if (fpSwing && phase > 0) {
      const p = samplePrimitiveMeleeSwing(fpSwing, phase);
      this.rightArmRig.position.set(
        this.rightShoulderRest.px + p.translationM.x,
        this.rightShoulderRest.py + p.translationM.y,
        this.rightShoulderRest.pz + p.translationM.z,
      );
      this.rightArmRig.rotation.set(p.rotationRad.x, p.rotationRad.y, p.rotationRad.z);
    } else {
      this.rightArmRig.position.set(
        this.rightShoulderRest.px,
        this.rightShoulderRest.py,
        this.rightShoulderRest.pz,
      );
      /** Opposite phase on right for a simple gait read while holding the weapon. */
      this.rightArmRig.rotation.set(-armSwing * 0.95, 0, -armSway * 0.75);
    }

    /** `viewModelParent` is `headPitch`; cancel its pitch so the viewmodel stays torso-stable. */
    this.fpRoot.rotation.set(-state.pitchRad, 0, 0);
  }

  dispose(): void {
    this.weapon?.dispose(this.fpRoot);
    this.weapon = undefined;
    this.fpRoot.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material;
        if (!Array.isArray(mat)) mat.dispose();
        else mat.forEach((x) => x.dispose());
      }
    });
    this.viewModelParent.remove(this.fpRoot);
    this.fpRoot.clear();
    this.driver.dispose();
  }
}
