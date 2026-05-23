import * as THREE from "three";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";
import {
  resolveNpcBodyClipName,
  type NpcBodyClipName,
} from "@the-mammoth/game";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { deepDisposeObject3D } from "../loaders/deepDisposeObject3D.js";

export const BABUSHKA_NPC_GLB_URI = "/static/models/npcs/babushka.glb";

/** Marks roots that must never participate in megablock floor-plate culling. */
export const MAMMOTH_FP_WORLD_NPC_UD = "mammothFpWorldNpc";

const NPC_YAW_OFFSET_RAD = Math.PI;
/** Authoritative combat height (server `BABUSHKA_BODY_HEIGHT_M`); Meshy GLB is ~1.7 m without extra root scale. */
export const BABUSHKA_NPC_AUTHORITATIVE_HEIGHT_M = 1.55;
const NPC_CLIP_TRANSITION_SEC = 0.18;
const NPC_STATE_DEAD = 2;

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

function normalizeNpcHumanoidModel(model: THREE.Object3D): void {
  /**
   * Meshy humanoids bake cm→m on `Armature.scale` (~0.01), same as `male.glb`. Scaling the cloned
   * scene root again multiplies animated hip translations during locomotion clips — hips reach tens
   * of meters while bind-pose bounds still read ~1.5 m (combat-sim "giant babushka"). Recentre only.
   */
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  model.updateMatrixWorld(true);
}

function tuneNpcMaterial<T extends THREE.Material>(material: T): T {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.42);
    material.metalnessMap = null;
    material.metalness = Math.min(material.metalness, 0.08);
    material.roughness = Math.max(material.roughness, 0.78);
    material.needsUpdate = true;
  }
  return material;
}

function prepareNpcTemplateMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) {
        mat[i] = tuneNpcMaterial(mat[i]!);
      }
    } else {
      mesh.material = tuneNpcMaterial(mat);
    }
  });
}

function cloneNpcScene(template: THREE.Object3D): THREE.Object3D {
  return cloneSkeleton(template);
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
        prepareNpcTemplateMeshes(gltf.scene);
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

  resetMotionState(): void {
    /* pooled presenters always snap to authoritative feet */
  }

  applySnapshot(snapshot: ReplicatedNpcSnapshot, dt: number): void {
    this.root.position.set(
      snapshot.worldPosition.x,
      snapshot.worldPosition.y,
      snapshot.worldPosition.z,
    );
    this.root.rotation.y = snapshot.yawRad + NPC_YAW_OFFSET_RAD;
    this.body.update(snapshot, dt);
  }

  dispose(): void {
    this.body.dispose();
  }
}

export class WorldNpcPresenterPool {
  private readonly parent: THREE.Object3D;
  private readonly byId = new Map<string, BabushkaNpcPresenter>();
  private readonly spare: BabushkaNpcPresenter[] = [];
  private preloadReady = false;

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
  }

  async ensureReady(): Promise<void> {
    await preloadBabushkaNpcBody();
    this.preloadReady = true;
  }

  isReady(): boolean {
    return this.preloadReady;
  }

  private acquirePresenter(): BabushkaNpcPresenter | undefined {
    if (!this.preloadReady) return undefined;
    try {
      return this.spare.pop() ?? BabushkaNpcPresenter.createSync();
    } catch (err) {
      console.error("[WorldNpcPresenterPool] babushka presenter create failed", err);
      return undefined;
    }
  }

  private releasePresenter(pres: BabushkaNpcPresenter): void {
    this.parent.remove(pres.root);
    if (this.spare.length < 2) {
      this.spare.push(pres);
      return;
    }
    pres.dispose();
  }

  sync(snapshots: readonly ReplicatedNpcSnapshot[], dt: number): void {
    if (!this.preloadReady) return;
    const live = new Set<string>();
    for (const snap of snapshots) {
      const key = snap.npcId.toString();
      live.add(key);
      let pres = this.byId.get(key);
      if (!pres) {
        if (snap.archetype !== "babushka") continue;
        pres = this.acquirePresenter();
        if (!pres) continue;
        this.byId.set(key, pres);
        this.parent.add(pres.root);
      }
      pres.applySnapshot(snap, dt);
    }
    for (const [key, pres] of this.byId) {
      if (!live.has(key)) {
        this.releasePresenter(pres);
        this.byId.delete(key);
      }
    }
  }

  dispose(): void {
    for (const pres of this.byId.values()) {
      this.parent.remove(pres.root);
      pres.dispose();
    }
    for (const pres of this.spare) {
      pres.dispose();
    }
    this.byId.clear();
    this.spare.length = 0;
  }
}
