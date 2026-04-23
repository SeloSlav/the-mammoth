import * as THREE from "three";
import type { IModelLoadRegistry } from "@the-mammoth/assets";
import type { LocalPlayerGameplayState, ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { deepDisposeObject3D } from "../../loaders/deepDisposeObject3D.js";
import { resolvePlayerBodyClipName, type PlayerBodyClipName } from "./playerBodyMotion.js";

const REMOTE_PLAYER_MODEL_URI = "/static/models/players/male.glb";
const REMOTE_PLAYER_YAW_OFFSET_RAD = Math.PI;
const REMOTE_PLAYER_TRANSITION_SEC = 0.18;
const LOCAL_MIRROR_BODY_FORWARD_OFFSET_M = 0.12;
const LOCAL_MIRROR_BODY_DOWN_OFFSET_M = 0.02;
const REMOTE_PLAYER_CLIP_NAMES = {
  idle: "Idle",
  walk: "Walking",
  run: "Running",
  jump: "Regular_Jump",
} as const satisfies Record<PlayerBodyClipName, string>;

const remotePlayerLoader = new GLTFLoader();
let remotePlayerTemplatePromise:
  | Promise<{ scene: THREE.Object3D; animations: readonly THREE.AnimationClip[] }>
  | null = null;
let remotePlayerTemplate:
  | { scene: THREE.Object3D; animations: readonly THREE.AnimationClip[] }
  | null = null;

function sanitizeRemotePlayerClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  /**
   * The shipped body GLB contains scale keys on multiple bones, and `Idle` notably drives
   * `Hips.scale` above 1.0. That makes the whole avatar visibly grow/shrink when transitioning
   * between idle and locomotion. Third-person gameplay should preserve a stable silhouette, so
   * strip skeletal scale animation and keep only translation/rotation.
   */
  const tracks = clip.tracks.filter((track) => !track.name.endsWith(".scale"));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function cloneRemotePlayerScene(template: THREE.Object3D): THREE.Object3D {
  const root = cloneSkeleton(template);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.geometry = mesh.geometry.clone();
    const mat = mesh.material;
    mesh.material = Array.isArray(mat) ? mat.map((entry) => entry.clone()) : mat.clone();
  });
  return root;
}

function normalizeRemotePlayerModel(model: THREE.Object3D): void {
  /**
   * `male.glb` already bakes the correct cm->m conversion on the armature root (`Armature.scale = 0.01`).
   * Scaling the cloned scene again blows up animated hip translations (`~95` authored cm keys become
   * tens of world meters once multiplied by the extra root scale), which is why remote players read as
   * building-sized giants. Keep authored scale; only recenter the scene so feet stay on Y=0.
   */
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  model.updateMatrixWorld(true);
}

function createLoopingAction(
  mixer: THREE.AnimationMixer,
  clipLibrary: Map<string, THREE.AnimationClip>,
  clipName: string,
  loopMode: number,
): THREE.AnimationAction | null {
  const clip = clipLibrary.get(clipName);
  if (!clip) return null;
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.setLoop(
    loopMode as THREE.AnimationActionLoopStyles,
    loopMode === THREE.LoopOnce ? 1 : Infinity,
  );
  action.clampWhenFinished = loopMode === THREE.LoopOnce;
  return action;
}

class AnimatedRemotePlayerBody {
  readonly root = new THREE.Group();
  private readonly modelRoot: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<PlayerBodyClipName, THREE.AnimationAction>();
  private activeClip: PlayerBodyClipName | null = null;

  constructor(template: { scene: THREE.Object3D; animations: readonly THREE.AnimationClip[] }) {
    this.root.name = "remote_player_body";
    this.modelRoot = cloneRemotePlayerScene(template.scene);
    this.modelRoot.name = "remote_player_model";
    normalizeRemotePlayerModel(this.modelRoot);
    this.root.add(this.modelRoot);
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    const clipLibrary = new Map(template.animations.map((clip) => [clip.name, clip] as const));
    const idle = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.idle,
      THREE.LoopRepeat,
    );
    const walk = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.walk,
      THREE.LoopRepeat,
    );
    const run = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.run,
      THREE.LoopRepeat,
    );
    const jump = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.jump,
      THREE.LoopOnce,
    );
    if (idle) this.actions.set("idle", idle);
    if (walk) this.actions.set("walk", walk);
    if (run) this.actions.set("run", run);
    if (jump) this.actions.set("jump", jump);
    this.playClip("idle", true);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  collapseHeadForMirrorSelf(): void {
    for (const name of ["Head", "headfront", "head_end"]) {
      const node = this.modelRoot.getObjectByName(name);
      if (!node) continue;
      node.scale.setScalar(0.001);
      node.updateMatrixWorld(true);
    }
  }

  syncTransform(position: { x: number; y: number; z: number }, yawRad: number): void {
    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.y = yawRad + REMOTE_PLAYER_YAW_OFFSET_RAD;
  }

  updateMotion(args: { grounded: boolean; locomotion: ReplicatedPlayerSnapshot["locomotion"] }, dt: number): void {
    this.playClip(resolvePlayerBodyClipName(args), false);
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    deepDisposeObject3D(this.root);
  }

  private playClip(next: PlayerBodyClipName, immediate: boolean): void {
    if (this.activeClip === next) return;
    const nextAction = this.actions.get(next);
    if (!nextAction) return;
    const prevAction = this.activeClip ? this.actions.get(this.activeClip) : null;
    this.activeClip = next;
    if (prevAction && prevAction !== nextAction) {
      prevAction.fadeOut(immediate ? 0 : REMOTE_PLAYER_TRANSITION_SEC);
    }
    nextAction.reset();
    nextAction.fadeIn(immediate ? 0 : REMOTE_PLAYER_TRANSITION_SEC);
    nextAction.play();
  }
}

function getRemotePlayerTemplate(): { scene: THREE.Object3D; animations: readonly THREE.AnimationClip[] } {
  if (!remotePlayerTemplate) throw new Error("Remote player body not preloaded");
  return remotePlayerTemplate;
}

export async function preloadRemotePlayerBody(): Promise<void> {
  if (!remotePlayerTemplatePromise) {
    remotePlayerTemplatePromise = remotePlayerLoader
      .loadAsync(REMOTE_PLAYER_MODEL_URI)
      .then((gltf) => ({
        scene: gltf.scene,
        animations: gltf.animations.map(sanitizeRemotePlayerClip),
      }));
  }
  remotePlayerTemplate = await remotePlayerTemplatePromise;
}

type BodyPose = {
  position: { x: number; y: number; z: number };
  yawRad: number;
  locomotion: ReplicatedPlayerSnapshot["locomotion"];
  grounded: boolean;
};

class WorldPlayerBodyPresenter {
  readonly root: THREE.Group;
  private readonly body: AnimatedRemotePlayerBody;

  constructor(scene: THREE.Scene) {
    this.body = new AnimatedRemotePlayerBody(getRemotePlayerTemplate());
    this.root = this.body.root;
    scene.add(this.root);
  }

  updateFromPose(pose: BodyPose, dt: number): void {
    this.body.syncTransform(pose.position, pose.yawRad);
    this.body.updateMotion({ grounded: pose.grounded, locomotion: pose.locomotion }, dt);
  }

  setVisible(visible: boolean): void {
    this.body.setVisible(visible);
  }

  collapseHeadForMirrorSelf(): void {
    this.body.collapseHeadForMirrorSelf();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.body.dispose();
  }
}

export class RemotePlayerPresenter {
  readonly root: THREE.Group;
  private readonly presenter: WorldPlayerBodyPresenter;

  constructor(scene: THREE.Scene, _modelRegistry: IModelLoadRegistry) {
    this.presenter = new WorldPlayerBodyPresenter(scene);
    this.root = this.presenter.root;
  }

  updateFromSnapshot(snap: ReplicatedPlayerSnapshot, dt: number, nowMs: number): void {
    void nowMs;
    this.presenter.updateFromPose(
      {
        position: snap.worldPosition,
        yawRad: snap.yawRad,
        locomotion: snap.locomotion,
        grounded: snap.grounded,
      },
      dt,
    );
  }

  dispose(scene: THREE.Scene): void {
    this.presenter.dispose(scene);
  }
}

export class LocalMirrorPlayerPresenter {
  readonly root: THREE.Group;
  private readonly presenter: WorldPlayerBodyPresenter;
  private readonly mirrorPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.presenter = new WorldPlayerBodyPresenter(scene);
    this.root = this.presenter.root;
    this.presenter.setVisible(false);
    this.presenter.collapseHeadForMirrorSelf();
  }

  updateFromLocalState(state: LocalPlayerGameplayState, dt: number): void {
    this.mirrorPosition.set(
      state.position.x - Math.sin(state.yawRad) * LOCAL_MIRROR_BODY_FORWARD_OFFSET_M,
      state.position.y - LOCAL_MIRROR_BODY_DOWN_OFFSET_M,
      state.position.z - Math.cos(state.yawRad) * LOCAL_MIRROR_BODY_FORWARD_OFFSET_M,
    );
    this.presenter.updateFromPose(
      {
        position: this.mirrorPosition,
        yawRad: state.yawRad,
        locomotion: state.locomotion,
        grounded: state.grounded,
      },
      dt,
    );
  }

  setVisible(visible: boolean): void {
    this.presenter.setVisible(visible);
  }

  dispose(scene: THREE.Scene): void {
    this.presenter.dispose(scene);
  }
}
