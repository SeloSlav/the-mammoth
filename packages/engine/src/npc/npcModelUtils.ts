import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { upgradeApartmentDecorMaterialToStandard } from "../rendering/apartmentDecorMaterialUpgrade.js";

const NPC_FALLBACK_SKIN_HEX = 0xb8927a;

export type NpcBodyTemplate = {
  scene: THREE.Object3D;
  animations: readonly THREE.AnimationClip[];
};

function isRootMotionPositionTrack(trackName: string): boolean {
  if (!trackName.endsWith(".position")) return false;
  const bone = trackName.slice(0, -".position".length);
  return bone === "Hips" || bone === "Armature" || bone.endsWith("Hips");
}

export function sanitizeNpcClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter(
    (track) => !track.name.endsWith(".scale") && !isRootMotionPositionTrack(track.name),
  );
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function prepareNpcMaterial(material: THREE.Material): THREE.MeshStandardMaterial {
  const std = upgradeApartmentDecorMaterialToStandard(material);
  std.metalness = Math.min(std.metalness, 0.08);
  std.roughness = Math.max(std.roughness, 0.72);
  if (!std.map) {
    std.color.setHex(NPC_FALLBACK_SKIN_HEX);
  }
  std.emissive.setHex(0x3a2818);
  std.emissiveIntensity = 0.38;
  std.needsUpdate = true;
  return std;
}

export function updateNpcSkinnedMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const sk = obj as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) sk.skeleton.update();
  });
}

export function measureNpcModelWorldBox(model: THREE.Object3D): THREE.Box3 {
  updateNpcSkinnedMeshes(model);
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  let hasSkinned = false;
  model.traverse((obj) => {
    const sk = obj as THREE.SkinnedMesh;
    if (!sk.isSkinnedMesh) return;
    hasSkinned = true;
    sk.computeBoundingBox();
    if (!sk.boundingBox) return;
    box.union(sk.boundingBox.clone().applyMatrix4(sk.matrixWorld));
  });
  if (!hasSkinned || box.isEmpty()) {
    box.setFromObject(model);
  }
  return box;
}

export function normalizeNpcHumanoidModel(model: THREE.Object3D, authoritativeHeightM: number): void {
  let box = measureNpcModelWorldBox(model);
  const height = box.max.y - box.min.y;
  if (height < 0.5) {
    const hips = model.getObjectByName("Hips");
    if (hips) {
      const hipsWorld = new THREE.Vector3();
      hips.getWorldPosition(hipsWorld);
      const hipsTargetY = authoritativeHeightM * 0.58;
      model.position.y += hipsTargetY - hipsWorld.y;
      model.updateMatrixWorld(true);
      box = measureNpcModelWorldBox(model);
    }
  }
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  model.position.x += -center.x;
  model.position.y += -box.min.y;
  model.position.z += -center.z;
  model.updateMatrixWorld(true);
}

/** Keep animated skinned bounds pinned so feet stay on Y=0 (squat / death lower the rig). */
export function snapNpcModelFeetToLocalGround(
  model: THREE.Object3D,
  groundParent: THREE.Object3D,
): void {
  const box = measureNpcModelWorldBox(model);
  if (box.isEmpty()) return;
  groundParent.updateMatrixWorld(true);
  const minLocal = box.min.clone();
  groundParent.worldToLocal(minLocal);
  if (Math.abs(minLocal.y) <= 0.002) return;
  model.position.y -= minLocal.y;
  model.updateMatrixWorld(true);
}

export function cloneNpcScene(template: THREE.Object3D): THREE.Object3D {
  const root = cloneSkeleton(template);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = true;
    mesh.frustumCulled = true;
    const mat = mesh.material;
    mesh.material = Array.isArray(mat)
      ? mat.map((entry) => prepareNpcMaterial(entry.clone()))
      : prepareNpcMaterial(mat.clone());
  });
  return root;
}

/** Bind session PMREM env so outdoor combat arena lighting matches remote players. */
export function bindNpcOutdoorReadableEnv(root: THREE.Object3D, envTexture: THREE.Texture | null): void {
  if (!envTexture) return;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of materials) {
      if (!(raw instanceof THREE.MeshStandardMaterial)) continue;
      raw.envMap = envTexture;
      raw.envMapIntensity = 0.62;
      raw.needsUpdate = true;
    }
  });
}

export function normalizeClipLabel(name: string): string {
  return name.toLowerCase().replace(/[\s_]+/g, "");
}

export function buildNormalizedClipLibrary(
  animations: readonly THREE.AnimationClip[],
): Map<string, THREE.AnimationClip> {
  const library = new Map<string, THREE.AnimationClip>();
  for (const clip of animations) {
    library.set(normalizeClipLabel(clip.name), clip);
  }
  return library;
}

export function resolveNpcClipByCandidates(
  library: Map<string, THREE.AnimationClip>,
  candidates: readonly string[],
): THREE.AnimationClip | null {
  for (const candidate of candidates) {
    const clip = library.get(normalizeClipLabel(candidate));
    if (clip) return clip;
  }
  return null;
}

export function createNpcAction(
  mixer: THREE.AnimationMixer,
  clip: THREE.AnimationClip,
  loop: THREE.AnimationActionLoopStyles,
): THREE.AnimationAction {
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
  action.clampWhenFinished = loop === THREE.LoopOnce;
  return action;
}
