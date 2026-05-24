import * as THREE from "three";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";
import type { NpcBodyClipName } from "@the-mammoth/game";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { deepDisposeObject3D } from "../loaders/deepDisposeObject3D.js";
import { upgradeApartmentDecorMaterialToStandard } from "../rendering/apartmentDecorMaterialUpgrade.js";
import {
  createNpcVisualSmoothingState,
  ingestNpcAuthoritativeTransform,
  stepNpcVisualSmoothing,
  type NpcVisualAnimationState,
  type NpcVisualSmoothingState,
} from "./NpcVisualSmoothingState.js";
import { NpcHitDebugOverlay } from "./NpcHitDebugOverlay.js";

export const BABUSHKA_NPC_GLB_URI = "/static/models/npcs/babushka.glb";

/** Dead clip duration (s) — client epitaph scheduling; refreshed from GLB on preload. */
export let BABUSHKA_NPC_DEATH_CLIP_SEC = 2.97;

/** Scene-graph tag — skip megablock perf probes / floor-plate walks. */
export const MAMMOTH_FP_WORLD_NPC_UD = "mammothFpWorldNpc";

const NPC_YAW_OFFSET_RAD = 0;
export const BABUSHKA_NPC_AUTHORITATIVE_HEIGHT_M = 1.55;
const NPC_CLIP_TRANSITION_SEC = 0.18;
const NPC_LOCOMOTION_SWITCH_STABLE_SEC = 0.16;
const NPC_MOVING_CLIP_MIN_HOLD_SEC = 0.65;
const NPC_STATE_DEAD = 2;
const NPC_FALLBACK_SKIN_HEX = 0xb8927a;
const IDLE_AIR_SQUAT_ROLL_MOD = 100;
const IDLE_AIR_SQUAT_CHANCE = 42;
const IDLE_VARIANT_MIN_SEC = 3.5;
const IDLE_VARIANT_MAX_SEC = 7;

type BabushkaClipKey =
  | NpcBodyClipName
  | "airSquat"
  | "hit"
  | "dead"
  | "punch1"
  | "punch5";

const PUNCH_VARIANTS: readonly BabushkaClipKey[] = ["punch", "punch1", "punch5"];
const PUNCH_CLIP_KEYS = new Set<BabushkaClipKey>(PUNCH_VARIANTS);

/** Meshy UI labels and GLB export names — resolve with normalized matching. */
const BABUSHKA_CLIP_CANDIDATES: Record<BabushkaClipKey, readonly string[]> = {
  idle: ["Idle"],
  airSquat: ["Air Squat", "Air_Squat"],
  walk: ["Walking"],
  run: ["Running"],
  punch: ["Punch Combo", "Punch_Combo"],
  punch1: ["Punch Combo 1", "Punch_Combo_1"],
  punch5: ["Punch Combo 5", "Punch_Combo_5"],
  hit: ["Hit Reaction to Waist", "Hit_Reaction_to_Waist"],
  dead: ["Dead"],
};

const LOCOMOTION_CLIP_KEYS = new Set<BabushkaClipKey>(["idle", "airSquat", "walk", "run"]);
const OVERLAY_CLIP_KEYS = new Set<BabushkaClipKey>(["punch", "punch1", "punch5", "hit", "dead"]);

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

function normalizeClipLabel(name: string): string {
  return name.toLowerCase().replace(/[\s_]+/g, "");
}

function buildNormalizedClipLibrary(
  animations: readonly THREE.AnimationClip[],
): Map<string, THREE.AnimationClip> {
  const library = new Map<string, THREE.AnimationClip>();
  for (const clip of animations) {
    library.set(normalizeClipLabel(clip.name), clip);
  }
  return library;
}

function resolveBabushkaClip(
  library: Map<string, THREE.AnimationClip>,
  candidates: readonly string[],
): THREE.AnimationClip | null {
  for (const candidate of candidates) {
    const clip = library.get(normalizeClipLabel(candidate));
    if (clip) return clip;
  }
  return null;
}

function createNpcAction(
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

export async function preloadBabushkaNpcBody(): Promise<void> {
  if (babushkaTemplate) return;
  if (!babushkaLoad) {
    babushkaLoad = npcLoader.loadAsync(BABUSHKA_NPC_GLB_URI).then(
      (gltf) => {
        const deadClip = gltf.animations.find(
          (clip) => normalizeClipLabel(clip.name) === normalizeClipLabel("Dead"),
        );
        if (deadClip && deadClip.duration > 0) {
          BABUSHKA_NPC_DEATH_CLIP_SEC = deadClip.duration;
        }
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
  private readonly actions = new Map<BabushkaClipKey, THREE.AnimationAction>();
  private locomotionClip: BabushkaClipKey | null = null;
  private locomotionClipAgeSec = 0;
  private pendingLocomotionClip: BabushkaClipKey | null = null;
  private pendingLocomotionSec = 0;
  private overlayClip: BabushkaClipKey | null = null;
  private overlayTimeLeftSec = 0;
  private lastMeleeSeq = 0;
  private lastHitSeq = 0;
  private lastPunchVariant: BabushkaClipKey | null = null;
  private deadLocked = false;
  private idleVariantTimerSec = IDLE_VARIANT_MIN_SEC;
  private idleVariant: "idle" | "airSquat" = "idle";

  constructor(template: NpcBodyTemplate) {
    this.root.name = "babushka_npc_body";
    this.modelRoot = cloneNpcScene(template.scene);
    this.modelRoot.name = "babushka_npc_model";
    normalizeNpcHumanoidModel(this.modelRoot);
    this.root.add(this.modelRoot);
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    const clipLibrary = buildNormalizedClipLibrary(template.animations);
    for (const key of Object.keys(BABUSHKA_CLIP_CANDIDATES) as BabushkaClipKey[]) {
      const clip = resolveBabushkaClip(clipLibrary, BABUSHKA_CLIP_CANDIDATES[key]);
      if (!clip) {
        console.warn(`[BabushkaNpcPresenter] missing clip for ${key}`, BABUSHKA_CLIP_CANDIDATES[key]);
        continue;
      }
      const loop = OVERLAY_CLIP_KEYS.has(key) ? THREE.LoopOnce : THREE.LoopRepeat;
      this.actions.set(key, createNpcAction(this.mixer, clip, loop));
    }
    this.playLocomotion("idle", true);
  }

  update(
    snapshot: ReplicatedNpcSnapshot,
    dt: number,
    visualLocomotion: NpcVisualAnimationState,
  ): void {
    const dead = snapshot.state === NPC_STATE_DEAD || snapshot.health <= 0;

    if (dead) {
      if (!this.deadLocked) {
        this.deadLocked = true;
        this.playDeath();
      }
      this.mixer.update(dt);
      updateNpcSkinnedMeshes(this.modelRoot);
      return;
    }

    this.idleVariantTimerSec -= dt;
    if (this.idleVariantTimerSec <= 0) {
      const bucket = Math.floor(snapshot.observedTimeMs / 1000);
      const roll =
        (Number(snapshot.npcId) + bucket * 17 + Math.floor(snapshot.observedTimeMs / 250)) %
        IDLE_AIR_SQUAT_ROLL_MOD;
      this.idleVariant = roll < IDLE_AIR_SQUAT_CHANCE ? "airSquat" : "idle";
      this.idleVariantTimerSec =
        IDLE_VARIANT_MIN_SEC +
        (Number(snapshot.npcId) % Math.ceil(IDLE_VARIANT_MAX_SEC - IDLE_VARIANT_MIN_SEC));
    }

    this.locomotionClipAgeSec += dt;

    // Keep a base locomotion action alive every frame. If one-shots fail or finish, the rig never
    // falls back to bind/A-pose.
    // Locomotion clips follow smoothed visual speed — not raw SpaceTimeDB update cadence.
    const requestedLocomotion = this.resolveLocomotionClip(snapshot, visualLocomotion);
    this.playLocomotion(this.resolveStableLocomotionClip(requestedLocomotion, dt), false);

    const meleeTriggered = snapshot.meleePresentationSeq > this.lastMeleeSeq;
    const hitTriggered = snapshot.hitPresentationSeq > this.lastHitSeq;

    if (meleeTriggered) {
      this.lastMeleeSeq = snapshot.meleePresentationSeq;
      if (hitTriggered) {
        this.lastHitSeq = snapshot.hitPresentationSeq;
      }
      if (!this.isMeleeOverlayPlaying()) {
        this.playOverlay(this.selectPunchVariant(snapshot));
      }
    } else if (hitTriggered) {
      this.lastHitSeq = snapshot.hitPresentationSeq;
      this.playOverlay("hit");
    }

    if (this.overlayTimeLeftSec > 0) {
      this.overlayTimeLeftSec = Math.max(0, this.overlayTimeLeftSec - dt);
      if (this.overlayTimeLeftSec > 0) {
        this.mixer.update(dt);
        updateNpcSkinnedMeshes(this.modelRoot);
        return;
      }
      this.stopOverlay();
    }

    this.mixer.update(dt);
    updateNpcSkinnedMeshes(this.modelRoot);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    deepDisposeObject3D(this.root);
  }

  private resolveLocomotionClip(
    snapshot: ReplicatedNpcSnapshot,
    visualLocomotion: NpcVisualAnimationState,
  ): BabushkaClipKey {
    const base: NpcBodyClipName = !snapshot.grounded
      ? "idle"
      : visualLocomotion === "run"
        ? "run"
        : visualLocomotion === "walk"
          ? "walk"
          : "idle";

    if (base !== "idle" || snapshot.state !== 0) {
      return base;
    }

    if (this.idleVariant === "airSquat" && this.actions.has("airSquat")) {
      return "airSquat";
    }
    return "idle";
  }

  private playLocomotion(next: BabushkaClipKey, immediate: boolean): void {
    if (!LOCOMOTION_CLIP_KEYS.has(next)) return;
    const nextAction = this.actions.get(next);
    if (!nextAction) {
      console.warn(`[BabushkaNpcPresenter] locomotion clip not loaded: ${next}`);
      if (next !== "idle") {
        this.playLocomotion("idle", true);
      }
      return;
    }
    if (this.locomotionClip === next && nextAction.isRunning()) {
      nextAction.enabled = true;
      nextAction.paused = false;
      nextAction.setEffectiveTimeScale(1);
      return;
    }

    const prevAction =
      this.locomotionClip !== null ? this.actions.get(this.locomotionClip) : undefined;

    this.locomotionClip = next;
    this.locomotionClipAgeSec = 0;
    nextAction.enabled = true;
    nextAction.paused = false;
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    if (prevAction && prevAction !== nextAction && prevAction.isRunning() && !immediate) {
      nextAction.reset().play();
      prevAction.crossFadeTo(nextAction, NPC_CLIP_TRANSITION_SEC, true);
      return;
    }

    for (const key of LOCOMOTION_CLIP_KEYS) {
      if (key === next) continue;
      this.actions.get(key)?.stop();
    }

    nextAction.reset();
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    if (!immediate) {
      nextAction.fadeIn(NPC_CLIP_TRANSITION_SEC);
    }
    nextAction.play();
  }

  private resolveStableLocomotionClip(next: BabushkaClipKey, dt: number): BabushkaClipKey {
    const current = this.locomotionClip;
    if (current === null || current === next) {
      this.pendingLocomotionClip = null;
      this.pendingLocomotionSec = 0;
      return next;
    }

    const currentMoving = current === "walk" || current === "run";
    const nextMoving = next === "walk" || next === "run";
    if (!currentMoving && nextMoving) {
      this.pendingLocomotionClip = null;
      this.pendingLocomotionSec = 0;
      return next;
    }

    if (currentMoving && this.locomotionClipAgeSec < NPC_MOVING_CLIP_MIN_HOLD_SEC) {
      return current;
    }

    if (this.pendingLocomotionClip !== next) {
      this.pendingLocomotionClip = next;
      this.pendingLocomotionSec = 0;
      return current;
    }

    this.pendingLocomotionSec += dt;
    if (this.pendingLocomotionSec < NPC_LOCOMOTION_SWITCH_STABLE_SEC) {
      return current;
    }

    this.pendingLocomotionClip = null;
    this.pendingLocomotionSec = 0;
    return next;
  }

  private isMeleeOverlayPlaying(): boolean {
    return (
      this.overlayClip !== null &&
      PUNCH_CLIP_KEYS.has(this.overlayClip) &&
      this.overlayTimeLeftSec > 0
    );
  }

  private playOverlay(key: BabushkaClipKey): void {
    const action = this.actions.get(key);
    if (!action) {
      console.warn(`[BabushkaNpcPresenter] overlay clip not loaded: ${key}`);
      return;
    }
    for (const [clipKey, clipAction] of this.actions) {
      if (clipKey === key) continue;
      if (key === "dead" || OVERLAY_CLIP_KEYS.has(clipKey)) clipAction.stop();
    }
    action.reset();
    action.setEffectiveWeight(1);
    action.fadeIn(0.05);
    action.play();
    this.overlayClip = key;
    this.overlayTimeLeftSec = action.getClip().duration;
    if (key === "dead") {
      this.overlayTimeLeftSec = Number.POSITIVE_INFINITY;
    }
  }

  private selectPunchVariant(snapshot: ReplicatedNpcSnapshot): BabushkaClipKey {
    const available = PUNCH_VARIANTS.filter((key) => this.actions.has(key));
    if (available.length === 0) return "punch";
    if (available.length === 1) return available[0] ?? "punch";

    const seed =
      Number(snapshot.npcId % 997n) * 31 +
      snapshot.meleePresentationSeq * 17 +
      Math.floor(snapshot.observedTimeMs / 137);
    let variant = available[Math.abs(seed) % available.length] ?? available[0] ?? "punch";
    if (variant === this.lastPunchVariant) {
      const idx = available.indexOf(variant);
      variant = available[(idx + 1) % available.length] ?? variant;
    }
    this.lastPunchVariant = variant;
    return variant;
  }

  private playDeath(): void {
    const action = this.actions.get("dead");
    if (!action) {
      console.warn("[BabushkaNpcPresenter] death clip not loaded");
      return;
    }
    this.mixer.stopAllAction();
    action.enabled = true;
    action.paused = false;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();
    this.overlayClip = "dead";
    this.overlayTimeLeftSec = Number.POSITIVE_INFINITY;
  }

  private stopOverlay(): void {
    if (this.overlayClip) {
      this.actions.get(this.overlayClip)?.stop();
      this.overlayClip = null;
    }
    this.overlayTimeLeftSec = 0;
    this.locomotionClip = null;
  }
}

export class BabushkaNpcPresenter {
  readonly root = new THREE.Group();

  private readonly body: AnimatedBabushkaBody;
  /** Presentation-only pose — authoritative position lives in replicated snapshots. */
  private readonly visualSmoothing: NpcVisualSmoothingState = createNpcVisualSmoothingState();
  private hitDebug: NpcHitDebugOverlay | null = null;

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

  /** Dev-only — attach or remove authoritative hit-volume wireframes at runtime. */
  setHitDebugVolumesEnabled(enabled: boolean): void {
    if (enabled) {
      if (!this.hitDebug) {
        this.hitDebug = new NpcHitDebugOverlay();
        this.root.add(this.hitDebug.root);
      }
      this.hitDebug.root.visible = true;
      return;
    }
    if (!this.hitDebug) return;
    this.hitDebug.dispose();
    this.root.remove(this.hitDebug.root);
    this.hitDebug = null;
  }

  static async create(): Promise<BabushkaNpcPresenter> {
    await preloadBabushkaNpcBody();
    return BabushkaNpcPresenter.createSync();
  }

  /** SpaceTimeDB row ingest — updates authoritative network pose only. */
  ingestAuthoritativeSnapshot(snapshot: ReplicatedNpcSnapshot): void {
    ingestNpcAuthoritativeTransform(
      this.visualSmoothing,
      snapshot.worldPosition,
      snapshot.yawRad + NPC_YAW_OFFSET_RAD,
    );
  }

  /** Per-frame visual follow — never snaps the mesh to raw network updates (except teleports). */
  tickVisualSnapshot(
    snapshot: ReplicatedNpcSnapshot,
    dt: number,
    envTexture: THREE.Texture | null = null,
  ): void {
    this.root.visible = true;
    bindNpcOutdoorReadableEnv(this.root, envTexture);

    const { animationState } = stepNpcVisualSmoothing(this.visualSmoothing, dt);
    this.root.position.copy(this.visualSmoothing.visualPosition);
    this.root.quaternion.copy(this.visualSmoothing.smoothedRotation);
    this.hitDebug?.tick(dt);
    this.body.update(snapshot, dt, animationState);
    this.root.updateMatrixWorld(true);
  }

  /** Dev-only — flashes BODY / HEADSHOT label over the authoritative hit volumes. */
  flashHitDebug(headshot: boolean): void {
    this.hitDebug?.flashHit(headshot);
  }

  applySnapshot(snapshot: ReplicatedNpcSnapshot, dt: number, envTexture: THREE.Texture | null = null): void {
    this.ingestAuthoritativeSnapshot(snapshot);
    this.tickVisualSnapshot(snapshot, dt, envTexture);
  }

  dispose(): void {
    this.setHitDebugVolumesEnabled(false);
    this.body.dispose();
  }
}

export class WorldNpcPresenterPool {
  private readonly parent: THREE.Object3D;
  private readonly byId = new Map<string, BabushkaNpcPresenter>();
  private envTextureProvider: (() => THREE.Texture | null) | null = null;
  private showHitDebugVolumes = false;

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
  }

  setShowHitDebugVolumes(enabled: boolean): void {
    if (this.showHitDebugVolumes === enabled) return;
    this.showHitDebugVolumes = enabled;
    for (const pres of this.byId.values()) {
      pres.setHitDebugVolumesEnabled(enabled);
    }
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

  ingestAuthoritative(snapshots: readonly ReplicatedNpcSnapshot[]): void {
    if (!babushkaTemplate) return;
    const live = new Set<string>();
    for (const snap of snapshots) {
      const key = snap.npcId.toString();
      live.add(key);
      if (snap.archetype !== "babushka") continue;
      let pres = this.byId.get(key);
      if (!pres) {
        try {
          pres = BabushkaNpcPresenter.createSync();
          if (this.showHitDebugVolumes) {
            pres.setHitDebugVolumesEnabled(true);
          }
          this.byId.set(key, pres);
          this.parent.add(pres.root);
        } catch (err) {
          console.error("[WorldNpcPresenterPool] babushka presenter create failed", err);
          continue;
        }
      }
      pres.ingestAuthoritativeSnapshot(snap);
    }
    for (const [key, pres] of this.byId) {
      if (!live.has(key)) {
        this.parent.remove(pres.root);
        pres.dispose();
        this.byId.delete(key);
      }
    }
  }

  tickVisual(snapshots: readonly ReplicatedNpcSnapshot[], dt: number): void {
    if (!babushkaTemplate) return;
    const envTexture = this.envTexture();
    for (const snap of snapshots) {
      if (snap.archetype !== "babushka") continue;
      const pres = this.byId.get(snap.npcId.toString());
      pres?.tickVisualSnapshot(snap, dt, envTexture);
    }
  }

  sync(snapshots: readonly ReplicatedNpcSnapshot[], dt: number): void {
    this.ingestAuthoritative(snapshots);
    this.tickVisual(snapshots, dt);
  }

  /** Match replicated flesh-impact one-shots to the nearest NPC debug overlay. */
  flashHitDebugAtWorld(x: number, y: number, z: number, headshot: boolean): void {
    if (!this.showHitDebugVolumes) return;
    let best: { pres: BabushkaNpcPresenter; distSq: number } | null = null;
    for (const pres of this.byId.values()) {
      const dx = pres.root.position.x - x;
      const dy = pres.root.position.y - y;
      const dz = pres.root.position.z - z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > 3.5 * 3.5) continue;
      if (!best || distSq < best.distSq) {
        best = { pres, distSq };
      }
    }
    best?.pres.flashHitDebug(headshot);
  }

  dispose(): void {
    for (const pres of this.byId.values()) {
      this.parent.remove(pres.root);
      pres.dispose();
    }
    this.byId.clear();
  }
}
