import * as THREE from "three";
import type { LocalPlayerGameplayState, ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { deepDisposeObject3D } from "../../loaders/deepDisposeObject3D.js";
import { buildPrimitiveHumanoid } from "../primitiveHumanoid.js";
import { resolvePlayerBodyClipName, type PlayerBodyClipName } from "./playerBodyMotion.js";

/**
 * Nearest N other players keep the full skinned `male.glb`; everyone else uses a shared-material
 * primitive (~36 tris / 6 draws) so crowds stay inside a sane GPU budget.
 */
export const REMOTE_PLAYER_CROWD_FULL_DETAIL_NEAREST = 6;

const REMOTE_PLAYER_MODEL_URI = "/static/models/players/male.glb";
const REMOTE_PLAYER_YAW_OFFSET_RAD = Math.PI;
const REMOTE_PLAYER_TRANSITION_SEC = 0.18;
const LOCAL_MIRROR_BODY_FORWARD_OFFSET_M = 0.12;
const LOCAL_MIRROR_BODY_DOWN_OFFSET_M = 0.02;
const REMOTE_PLAYER_ENV_INTENSITY = 0.35;
const REMOTE_PLAYER_MIN_ROUGHNESS = 0.82;
const REMOTE_PLAYER_MAX_METALNESS = 0.04;
const REMOTE_NAME_TAG_Y_M = 2.08;
const REMOTE_NAME_TAG_WORLD_WIDTH_M = 1.1;
const REMOTE_NAME_TAG_WORLD_HEIGHT_M = 0.26;
const REMOTE_PLAYER_CLIP_NAMES = {
  idle: "Idle",
  walk: "Walking",
  run: "Running",
  jump: "Regular_Jump",
} as const satisfies Record<PlayerBodyClipName, string>;
/**
 * Bind-pose bounds sit inside locomotion extremes; inflate the frustum sphere so culling stays on
 * without clipping animated limbs (avoids `frustumCulled = false`, which submits every remote every frame).
 */
const REMOTE_PLAYER_FRUSTUM_SPHERE_RADIUS_MUL = 1.45;

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
    /** FP session lighting is unshadowed; skip shadow flags so a future `castShadow` sun cannot multiply skinned cost. */
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.computeBoundingSphere();
    const bs = mesh.geometry.boundingSphere;
    if (bs) {
      bs.radius *= REMOTE_PLAYER_FRUSTUM_SPHERE_RADIUS_MUL;
    }
    mesh.frustumCulled = true;
    const mat = mesh.material;
    mesh.material = Array.isArray(mat)
      ? mat.map((entry) => tuneRemotePlayerMaterial(entry.clone()))
      : tuneRemotePlayerMaterial(mat.clone());
  });
  return root;
}

function tuneRemotePlayerMaterial<T extends THREE.Material>(material: T): T {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    /**
     * The authored GLB reads far glossier than the building shell under the session's muted
     * overcast lighting + environment map. Keep its albedo/normal detail, but bias the imported
     * body materials toward matte dielectric values so remotes sit in the same lighting family as
     * the world instead of reflecting like polished plastic.
     */
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, REMOTE_PLAYER_ENV_INTENSITY);
    material.metalnessMap = null;
    material.metalness = Math.min(material.metalness, REMOTE_PLAYER_MAX_METALNESS);
    material.roughness = Math.max(material.roughness, REMOTE_PLAYER_MIN_ROUGHNESS);
    material.needsUpdate = true;
  }
  return material;
}

/** One skin + one cloth material for every low-LOD remote — avoids N× material instances in crowds. */
const remoteCrowdLodSkinMat = new THREE.MeshStandardMaterial({
  color: 0x9f7a6b,
  roughness: 0.72,
  metalness: 0.06,
});
const remoteCrowdLodClothMat = new THREE.MeshStandardMaterial({
  color: 0x4a5568,
  roughness: 0.78,
  metalness: 0.05,
});
tuneRemotePlayerMaterial(remoteCrowdLodSkinMat);
tuneRemotePlayerMaterial(remoteCrowdLodClothMat);

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

function renderRemoteNameTagTexture(displayName: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const label = displayName.trim().slice(0, 24) || "Guest";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(4, 8, 14, 0.72)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.lineWidth = 3;
  const x = 18;
  const y = 28;
  const w = canvas.width - x * 2;
  const h = 72;
  const r = 20;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = "700 38px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillStyle = "rgba(238, 246, 255, 0.96)";
  ctx.strokeText(label, canvas.width / 2, y + h / 2 + 1);
  ctx.fillText(label, canvas.width / 2, y + h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
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

  /** Low-LOD path: hide skinned branch and stop mixer work. */
  freezeForLodLo(): void {
    this.mixer.stopAllAction();
    this.activeClip = null;
  }

  /** After showing the skinned body again, restart from a stable idle pose. */
  resumeAfterLodHi(): void {
    this.playClip("idle", true);
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
  displayName?: string;
};

class WorldPlayerBodyPresenter {
  readonly root: THREE.Group;
  private readonly body: AnimatedRemotePlayerBody;
  private readonly highBranch: THREE.Group;
  private readonly lowBranch: THREE.Group;
  private readonly crowdLod: boolean;
  private crowdLodHighActive = false;
  private readonly nameTag: THREE.Sprite | null = null;
  private readonly nameTagMaterial: THREE.SpriteMaterial | null = null;
  private nameTagText = "";

  constructor(scene: THREE.Scene, opts: { showNameTag: boolean; crowdLod: boolean }) {
    this.crowdLod = opts.crowdLod;
    this.root = new THREE.Group();
    this.root.name = "remote_player_world_root";

    this.highBranch = new THREE.Group();
    this.highBranch.name = "remote_player_high_lod_branch";

    this.body = new AnimatedRemotePlayerBody(getRemotePlayerTemplate());
    this.highBranch.add(this.body.root);

    this.lowBranch = new THREE.Group();
    this.lowBranch.name = "remote_player_low_lod_branch";
    if (opts.crowdLod) {
      const prim = buildPrimitiveHumanoid({
        sharedMaterials: { skin: remoteCrowdLodSkinMat, cloth: remoteCrowdLodClothMat },
        castShadow: false,
      });
      prim.root.name = "remote_player_primitive_body";
      prim.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.frustumCulled = true;
        }
      });
      this.lowBranch.add(prim.root);
    }

    this.root.add(this.highBranch);
    this.root.add(this.lowBranch);

    if (opts.showNameTag) {
      this.nameTagMaterial = new THREE.SpriteMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        map: renderRemoteNameTagTexture("Guest"),
      });
      this.nameTag = new THREE.Sprite(this.nameTagMaterial);
      this.nameTag.name = "remote_player_name_tag";
      this.nameTag.position.set(0, REMOTE_NAME_TAG_Y_M, 0);
      this.nameTag.scale.set(REMOTE_NAME_TAG_WORLD_WIDTH_M, REMOTE_NAME_TAG_WORLD_HEIGHT_M, 1);
      this.nameTag.renderOrder = 2000;
      this.root.add(this.nameTag);
    }

    if (opts.crowdLod) {
      this.crowdLodHighActive = false;
      this.highBranch.visible = false;
      this.lowBranch.visible = true;
      this.body.freezeForLodLo();
    } else {
      this.crowdLodHighActive = true;
      this.highBranch.visible = true;
      this.lowBranch.visible = false;
    }

    scene.add(this.root);
  }

  /**
   * When `crowdLod` is false (local mirror), this is a no-op — skinned body stays on.
   * Otherwise toggles skinned GLB vs shared primitive + freezes/resumes the animation mixer.
   */
  setDetailLevel(wantSkinnedGlb: boolean): void {
    if (!this.crowdLod) {
      this.highBranch.visible = true;
      this.lowBranch.visible = false;
      return;
    }
    if (wantSkinnedGlb === this.crowdLodHighActive) return;
    this.crowdLodHighActive = wantSkinnedGlb;
    this.highBranch.visible = wantSkinnedGlb;
    this.lowBranch.visible = !wantSkinnedGlb;
    if (wantSkinnedGlb) {
      this.body.resumeAfterLodHi();
    } else {
      this.body.freezeForLodLo();
    }
  }

  private applyWorldFromPose(pose: BodyPose): void {
    this.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.root.rotation.y = pose.yawRad + REMOTE_PLAYER_YAW_OFFSET_RAD;
  }

  updateFromPose(pose: BodyPose, dt: number): void {
    this.applyWorldFromPose(pose);
    if (!this.crowdLod || this.crowdLodHighActive) {
      this.body.updateMotion({ grounded: pose.grounded, locomotion: pose.locomotion }, dt);
    }
    this.setNameTagText(pose.displayName ?? "Guest");
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.nameTagMaterial?.map?.dispose();
    this.nameTagMaterial?.dispose();
    this.body.dispose();
    if (this.crowdLod) {
      this.lowBranch.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
        }
      });
    }
  }

  private setNameTagText(displayName: string): void {
    if (!this.nameTagMaterial) return;
    const next = displayName.trim() || "Guest";
    if (next === this.nameTagText) return;
    this.nameTagText = next;
    const prev = this.nameTagMaterial.map;
    this.nameTagMaterial.map = renderRemoteNameTagTexture(next);
    this.nameTagMaterial.needsUpdate = true;
    prev?.dispose();
  }
}

export class RemotePlayerPresenter {
  readonly root: THREE.Group;
  private readonly presenter: WorldPlayerBodyPresenter;

  constructor(scene: THREE.Scene) {
    this.presenter = new WorldPlayerBodyPresenter(scene, { showNameTag: true, crowdLod: true });
    this.root = this.presenter.root;
  }

  /**
   * Nearest peers should pass true (skinned GLB); everyone else false (primitive).
   * No-op cost when the value is unchanged.
   */
  setRemoteCrowdDetail(wantSkinnedGlb: boolean): void {
    this.presenter.setDetailLevel(wantSkinnedGlb);
  }

  updateFromSnapshot(snap: ReplicatedPlayerSnapshot, dt: number, nowMs: number): void {
    void nowMs;
    this.presenter.updateFromPose(
      {
        position: snap.worldPosition,
        yawRad: snap.yawRad,
        locomotion: snap.locomotion,
        grounded: snap.grounded,
        displayName: snap.displayName,
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
    this.presenter = new WorldPlayerBodyPresenter(scene, { showNameTag: false, crowdLod: false });
    this.root = this.presenter.root;
    this.presenter.setVisible(false);
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
