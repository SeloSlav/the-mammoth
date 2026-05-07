import * as THREE from "three";

/**
 * Ordered wrist/hand bone name guess-list (first match wins).
 * Shipped `male.glb` / `female.glb` use plain `RightHand` / `LeftHand` on 24-joint rigs (glTF node names).
 * Mixamo and other DCC exports follow.
 */
export const SKINNED_HUMANOID_RIGHT_HAND_BONE_NAMES: readonly string[] = [
  "RightHand",
  "rightHand",
  "mixamorigRightHand",
  "mixamorig:RightHand",
  "mixamorig_RightHand",
  "Hand_R",
  "hand_r",
  "hand.R",
  "Hand.R",
  "Armature_Bone_RightHand",
  "Bip01 R Hand",
  "CC_Base_R_Hand",
  "r_hand",
  "R_Hand",
];

const _rightHandBoneCache = new WeakMap<THREE.Object3D, THREE.Object3D | null>();

const SKINNED_HUMANOID_LEFT_HAND_BONE_NAMES: readonly string[] = [
  "LeftHand",
  "leftHand",
  "mixamorigLeftHand",
  "mixamorig:LeftHand",
  "Hand_L",
  "hand_l",
  "hand.L",
  "Bip01 L Hand",
  "CC_Base_L_Hand",
  "l_hand",
  "L_Hand",
];

/**
 * Finds a descendant Object3D (usually a {@link THREE.Bone}) to parent props/weapons for third-person.
 * Cached per `modelRoot` instance (each cloned avatar).
 */
export function resolveSkinnedHumanoidHandBone(
  modelRoot: THREE.Object3D,
  hand: "right" | "left",
): THREE.Object3D | null {
  if (hand === "right") {
    const hit = _rightHandBoneCache.get(modelRoot);
    if (hit !== undefined) return hit;
    let bone: THREE.Object3D | null = null;
    for (const name of SKINNED_HUMANOID_RIGHT_HAND_BONE_NAMES) {
      const found = modelRoot.getObjectByName(name);
      if (found) {
        bone = found;
        break;
      }
    }
    _rightHandBoneCache.set(modelRoot, bone);
    return bone;
  }
  for (const name of SKINNED_HUMANOID_LEFT_HAND_BONE_NAMES) {
    const found = modelRoot.getObjectByName(name);
    if (found) return found;
  }
  return null;
}
