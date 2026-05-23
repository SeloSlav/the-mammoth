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

const NPC_TARGET_HEIGHT_M = 1.55;
const NPC_YAW_OFFSET_RAD = Math.PI;
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

function sanitizeNpcClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => !track.name.endsWith(".scale"));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function normalizeNpcHumanoidModel(model: THREE.Object3D): void {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  if (height > 1e-6) {
    const s = NPC_TARGET_HEIGHT_M / height;
    model.scale.setScalar(s);
  }
  model.updateWorldMatrix(true, true);
  const grounded = new THREE.Box3().setFromObject(model);
  const center = grounded.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -grounded.min.y, -center.z);
  model.updateMatrixWorld(true);
}

function cloneNpcScene(template: THREE.Object3D): THREE.Object3D {
  const root = cloneSkeleton(template);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  return root;
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
    babushkaLoad = npcLoader.loadAsync(BABUSHKA_NPC_GLB_URI).then((gltf) => {
      babushkaTemplate = {
        scene: gltf.scene,
        animations: gltf.animations.map(sanitizeNpcClip),
      };
    });
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
  private displayPos = new THREE.Vector3();
  private displayYaw = 0;

  private constructor(body: AnimatedBabushkaBody) {
    this.root.name = "babushka_npc_root";
    this.body = body;
    this.root.add(body.root);
  }

  static async create(): Promise<BabushkaNpcPresenter> {
    await preloadBabushkaNpcBody();
    if (!babushkaTemplate) throw new Error("[BabushkaNpcPresenter] babushka GLB not loaded");
    return new BabushkaNpcPresenter(new AnimatedBabushkaBody(babushkaTemplate));
  }

  applySnapshot(snapshot: ReplicatedNpcSnapshot, dt: number): void {
    this.displayPos.set(snapshot.worldPosition.x, snapshot.worldPosition.y, snapshot.worldPosition.z);
    this.displayYaw = snapshot.yawRad;
    this.root.position.copy(this.displayPos);
    this.root.rotation.y = this.displayYaw + NPC_YAW_OFFSET_RAD;
    this.body.update(snapshot, dt);
  }

  dispose(): void {
    this.body.dispose();
  }
}

export class WorldNpcPresenterPool {
  private readonly scene: THREE.Scene;
  private readonly byId = new Map<string, BabushkaNpcPresenter>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async ensureReady(): Promise<void> {
    await preloadBabushkaNpcBody();
  }

  sync(snapshots: readonly ReplicatedNpcSnapshot[], dt: number): void {
    const live = new Set<string>();
    for (const snap of snapshots) {
      const key = snap.npcId.toString();
      live.add(key);
      let pres = this.byId.get(key);
      if (!pres) {
        if (snap.archetype !== "babushka") continue;
        void BabushkaNpcPresenter.create().then((created) => {
          if (this.byId.has(key)) {
            created.dispose();
            return;
          }
          this.byId.set(key, created);
          this.scene.add(created.root);
          created.applySnapshot(snap, dt);
        });
        continue;
      }
      pres.applySnapshot(snap, dt);
    }
    for (const [key, pres] of this.byId) {
      if (!live.has(key)) {
        this.scene.remove(pres.root);
        pres.dispose();
        this.byId.delete(key);
      }
    }
  }

  dispose(): void {
    for (const pres of this.byId.values()) {
      this.scene.remove(pres.root);
      pres.dispose();
    }
    this.byId.clear();
  }
}
