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

/** Only cache successful hits — never cache `null` (avoids sticky float fallback if resolve ran too early). */
const _rightHandBoneCache = new WeakMap<THREE.Object3D, THREE.Object3D>();

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

function isSkinnedMeshObject(obj: THREE.Object3D): obj is THREE.SkinnedMesh {
  return (obj as THREE.SkinnedMesh).isSkinnedMesh === true;
}

function isBoneObject(obj: THREE.Object3D): boolean {
  return (obj as THREE.Bone).isBone === true;
}

/**
 * Some GLTF / import paths keep valid bind bones only on {@link THREE.SkinnedMesh#skeleton}; a scene
 * traversal may not expose every bone the way `getObjectByName` expects. Shipped player bodies still
 * resolve via the graph, but this covers edge rigs and tests.
 *
 * Uses `isSkinnedMesh` instead of `instanceof` so WebGPU and non-WebGPU Three builds both match.
 */
function findHandBoneFromSkinnedMeshes(
  modelRoot: THREE.Object3D,
  names: readonly string[],
): THREE.Object3D | null {
  let result: THREE.Object3D | null = null;
  modelRoot.traverse((obj) => {
    if (result !== null) return;
    if (!isSkinnedMeshObject(obj) || !obj.skeleton?.bones?.length) return;
    for (const name of names) {
      const b = obj.skeleton.bones.find((bn) => bn.name === name);
      if (b) {
        result = b;
        break;
      }
    }
  });
  return result;
}

function resolveRightHandFromSceneGraph(modelRoot: THREE.Object3D): THREE.Object3D | null {
  for (const name of SKINNED_HUMANOID_RIGHT_HAND_BONE_NAMES) {
    const found = modelRoot.getObjectByName(name);
    if (!found) continue;
    if (isBoneObject(found)) return found;
  }
  return null;
}

function resolveLeftHandFromSceneGraph(modelRoot: THREE.Object3D): THREE.Object3D | null {
  for (const name of SKINNED_HUMANOID_LEFT_HAND_BONE_NAMES) {
    const found = modelRoot.getObjectByName(name);
    if (!found) continue;
    if (isBoneObject(found)) return found;
  }
  return null;
}

/**
 * Finds a descendant Object3D (usually a {@link THREE.Bone}) to parent props/weapons for third-person.
 * Caches successful right-hand hits per `modelRoot` (each cloned avatar). **Never** caches `null`.
 */
export function resolveSkinnedHumanoidHandBone(
  modelRoot: THREE.Object3D,
  hand: "right" | "left",
): THREE.Object3D | null {
  const names = hand === "right" ? SKINNED_HUMANOID_RIGHT_HAND_BONE_NAMES : SKINNED_HUMANOID_LEFT_HAND_BONE_NAMES;

  if (hand === "right") {
    const cached = _rightHandBoneCache.get(modelRoot);
    if (cached) return cached;
    let bone = resolveRightHandFromSceneGraph(modelRoot);
    if (!bone) {
      bone = findHandBoneFromSkinnedMeshes(modelRoot, names);
    }
    if (bone) {
      _rightHandBoneCache.set(modelRoot, bone);
    }
    return bone;
  }

  let bone = resolveLeftHandFromSceneGraph(modelRoot);
  if (!bone) {
    bone = findHandBoneFromSkinnedMeshes(modelRoot, names);
  }
  return bone;
}
