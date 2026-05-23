import * as THREE from "three";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";
import {
  resolveNpcBodyClipName,
  type NpcBodyClipName,
} from "@the-mammoth/game";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { deepDisposeObject3D } from "../loaders/deepDisposeObject3D.js";
import { upgradeApartmentDecorMaterialToStandard } from "../rendering/apartmentDecorMaterialUpgrade.js";

export const BABUSHKA_NPC_GLB_URI = "/static/models/npcs/babushka.glb";

/** Scene-graph tag — skip megablock perf probes / floor-plate walks. */
export const MAMMOTH_FP_WORLD_NPC_UD = "mammothFpWorldNpc";

const NPC_YAW_OFFSET_RAD = 0;
export const BABUSHKA_NPC_AUTHORITATIVE_HEIGHT_M = 1.55;
const NPC_CLIP_TRANSITION_SEC = 0.18;
const NPC_STATE_DEAD = 2;
const NPC_FALLBACK_SKIN_HEX = 0xb8927a;

const BABUSHKA_CLIP_NAMES = {
  idle: "Idle_4",
  walk: "Walking",
  run: "Running",
  punch: "Punch_Combo",
} as const satisfies Record<NpcBodyClipName, string>;

const npcLoader = new GLTFLoader();
type NpcBodyTemplate = { scene: THREE.Object3D; animations: readonly THREE.AnimationClip[] };
let babushkaTemplate: NpcBodyTemplate | null = null;
let babushkaLoad: Promise<void> | null = null;

function isRootMotionPositionTrack(trackName: string): boolean {
  if (!trackName.endsWith(".position")) return false;
  const bone = trackName.slice(0, -".position".length);
  return bone === "Hips" || bone === "Armature" || bone.endsWith("Hips");
}

function sanitizeNpcClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter(
    (track) => !track.name.endsWith(".scale") && !isRootMotionPositionTrack(track.name),
  );
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function prepareNpcMaterial(material: THREE.Material): THREE.MeshStandardMaterial {
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

function updateNpcSkinnedMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const sk = obj as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) sk.skeleton.update();
  });
}

function measureNpcModelWorldBox(model: THREE.Object3D): THREE.Box3 {
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

function normalizeNpcHumanoidModel(model: THREE.Object3D): void {
  /**
   * Meshy humanoids bake cm→m on `Armature.scale` (~0.01), same as `male.glb`. Never apply an extra
   * root scale — it multiplies walk hip keys into giants. Ground feet using skinned bounds, not bind-pose
   * stubs from `setFromObject` alone (those read ~1–2 cm and bury the mesh).
   */
  let box = measureNpcModelWorldBox(model);
  const height = box.max.y - box.min.y;
  if (height < 0.5) {
    const hips = model.getObjectByName("Hips");
    if (hips) {
      const hipsWorld = new THREE.Vector3();
      hips.getWorldPosition(hipsWorld);
      const hipsTargetY = BABUSHKA_NPC_AUTHORITATIVE_HEIGHT_M * 0.58;
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

function cloneNpcScene(template: THREE.Object3D): THREE.Object3D {
  const root = cloneSkeleton(template);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = true;
    mesh.frustumCulled = false;
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

function createLoopingAction(
  mixer: THREE.AnimationMixer,
  clips: Map<string, THREE.AnimationClip>,
  name: string,
  loop: THREE.AnimationActionLoopStyles,
): THREE.AnimationAction | null {
  const clip = clips.get(name);
  if (!clip) return null;
  const action = mixer.clipAction(clip);
  action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
  return action;
}

export async function preloadBabushkaNpcBody(): Promise<void> {
  if (babushkaTemplate) return;
  if (!babushkaLoad) {
    babushkaLoad = npcLoader.loadAsync(BABUSHKA_NPC_GLB_URI).then(
      (gltf) => {
        babushkaTemplate = {
          scene: gltf.scene,
          animations: gltf.animations.map(sanitizeNpcClip),
        };
      },
      (err) => {
        babushkaLoad = null;
        console.error("[BabushkaNpcPresenter] failed to load GLB", BABUSHKA_NPC_GLB_URI, err);
        throw err;
      },
    );
  }
  await babushkaLoad;
}

/** Vitest-only: seed cached GLB without FileLoader fetch. */
export function seedBabushkaNpcBodyTemplateForTests(template: NpcBodyTemplate): void {
  babushkaTemplate = template;
  babushkaLoad = Promise.resolve();
}

class AnimatedBabushkaBody {
  readonly root = new THREE.Group();
  private readonly modelRoot: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<NpcBodyClipName, THREE.AnimationAction>();
  private activeClip: NpcBodyClipName | null = null;
  private lastMeleeSeq = 0;
  private punchAction: THREE.AnimationAction | null = null;

  constructor(template: NpcBodyTemplate) {
    this.root.name = "babushka_npc_body";
    this.modelRoot = cloneNpcScene(template.scene);
    this.modelRoot.name = "babushka_npc_model";
    normalizeNpcHumanoidModel(this.modelRoot);
    this.root.add(this.modelRoot);
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    const clipLibrary = new Map(template.animations.map((clip) => [clip.name, clip] as const));
    for (const [key, clipName] of Object.entries(BABUSHKA_CLIP_NAMES) as [NpcBodyClipName, string][]) {
      const loop = key === "punch" ? THREE.LoopOnce : THREE.LoopRepeat;
      const action = createLoopingAction(this.mixer, clipLibrary, clipName, loop);
      if (action) this.actions.set(key, action);
      if (key === "punch") this.punchAction = action;
    }
    this.playLocomotionClip("idle", true);
  }

  update(snapshot: ReplicatedNpcSnapshot, dt: number): void {
    const dead = snapshot.state === NPC_STATE_DEAD || snapshot.health <= 0;
    if (snapshot.meleePresentationSeq > this.lastMeleeSeq) {
      this.lastMeleeSeq = snapshot.meleePresentationSeq;
      this.playPunchOnce();
    }
    if (!this.punchAction?.isRunning()) {
      this.playLocomotionClip(
        resolveNpcBodyClipName({
          grounded: snapshot.grounded,
          locomotion: snapshot.locomotion,
          dead,
          velocity: snapshot.velocity,
        }),
        false,
      );
    }
    this.mixer.update(dt);
    updateNpcSkinnedMeshes(this.modelRoot);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    deepDisposeObject3D(this.root);
  }

  private playLocomotionClip(next: NpcBodyClipName, immediate: boolean): void {
    if (next === "punch") return;
    if (this.activeClip === next) return;
    const nextAction = this.actions.get(next);
    if (!nextAction) return;
    const prevAction = this.activeClip ? this.actions.get(this.activeClip) : null;
    this.activeClip = next;
    if (prevAction && prevAction !== nextAction) {
      prevAction.fadeOut(immediate ? 0 : NPC_CLIP_TRANSITION_SEC);
    }
    nextAction.reset();
    nextAction.fadeIn(immediate ? 0 : NPC_CLIP_TRANSITION_SEC);
    nextAction.play();
  }

  private playPunchOnce(): void {
    const punch = this.punchAction;
    if (!punch) return;
    for (const action of this.actions.values()) {
      if (action !== punch) action.fadeOut(0.06);
    }
    punch.reset();
    punch.fadeIn(0.04);
    punch.play();
    this.activeClip = "punch";
  }
}

export class BabushkaNpcPresenter {
  readonly root = new THREE.Group();

  private readonly body: AnimatedBabushkaBody;

  private constructor(body: AnimatedBabushkaBody) {
    this.root.name = "babushka_npc_root";
    this.root.userData[MAMMOTH_FP_WORLD_NPC_UD] = true;
    this.body = body;
    this.root.add(body.root);
  }

  static createSync(): BabushkaNpcPresenter {
    if (!babushkaTemplate) {
      throw new Error("[BabushkaNpcPresenter] call preloadBabushkaNpcBody() before createSync()");
    }
    return new BabushkaNpcPresenter(new AnimatedBabushkaBody(babushkaTemplate));
  }

  static async create(): Promise<BabushkaNpcPresenter> {
    await preloadBabushkaNpcBody();
    return BabushkaNpcPresenter.createSync();
  }

  applySnapshot(snapshot: ReplicatedNpcSnapshot, dt: number, envTexture: THREE.Texture | null = null): void {
    this.root.visible = true;
    this.root.position.set(
      snapshot.worldPosition.x,
      snapshot.worldPosition.y,
      snapshot.worldPosition.z,
    );
    this.root.rotation.y = snapshot.yawRad + NPC_YAW_OFFSET_RAD;
    bindNpcOutdoorReadableEnv(this.root, envTexture);
    this.body.update(snapshot, dt);
    this.root.updateMatrixWorld(true);
  }

  dispose(): void {
    this.body.dispose();
  }
}

export class WorldNpcPresenterPool {
  private readonly parent: THREE.Object3D;
  private readonly byId = new Map<string, BabushkaNpcPresenter>();
  private envTextureProvider: (() => THREE.Texture | null) | null = null;

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
  }

  setEnvTextureProvider(provider: (() => THREE.Texture | null) | null): void {
    this.envTextureProvider = provider;
  }

  async ensureReady(): Promise<void> {
    await preloadBabushkaNpcBody();
  }

  isReady(): boolean {
    return babushkaTemplate !== null;
  }

  private envTexture(): THREE.Texture | null {
    return this.envTextureProvider?.() ?? null;
  }

  sync(snapshots: readonly ReplicatedNpcSnapshot[], dt: number): void {
    if (!babushkaTemplate) return;
    const envTexture = this.envTexture();
    const live = new Set<string>();
    for (const snap of snapshots) {
      const key = snap.npcId.toString();
      live.add(key);
      if (snap.archetype !== "babushka") continue;
      let pres = this.byId.get(key);
      if (!pres) {
        try {
          pres = BabushkaNpcPresenter.createSync();
          this.byId.set(key, pres);
          this.parent.add(pres.root);
        } catch (err) {
          console.error("[WorldNpcPresenterPool] babushka presenter create failed", err);
          continue;
        }
      }
      pres.applySnapshot(snap, dt, envTexture);
    }
    for (const [key, pres] of this.byId) {
      if (!live.has(key)) {
        this.parent.remove(pres.root);
        pres.dispose();
        this.byId.delete(key);
      }
    }
  }

  dispose(): void {
    for (const pres of this.byId.values()) {
      this.parent.remove(pres.root);
      pres.dispose();
    }
    this.byId.clear();
  }
}
