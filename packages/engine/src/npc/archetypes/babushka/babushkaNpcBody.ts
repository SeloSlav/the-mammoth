import * as THREE from "three";
import type { NpcBodyClipName, ReplicatedNpcSnapshot } from "@the-mammoth/game";
import { mammothGlbLoadCandidates } from "@the-mammoth/assets";
import { loadGltfFirstMatch } from "../../../loaders/gltfLoadFirstMatch.js";
import { detachSkinnedModelCloneSubtree } from "../../../loaders/deepDisposeObject3D.js";
import type { NpcVisualAnimationState } from "../../NpcVisualSmoothingState.js";
import {
  buildNormalizedClipLibrary,
  cloneNpcScene,
  createNpcAction,
  normalizeClipLabel,
  normalizeNpcHumanoidModel,
  resolveNpcClipByCandidates,
  sanitizeNpcClip,
  snapNpcModelFeetToLocalGround,
  updateNpcSkinnedMeshes,
  type NpcBodyTemplate,
} from "../../npcModelUtils.js";

export const BABUSHKA_NPC_GLB_URI = "/static/models/npcs/babushka.glb";

/** Dead clip duration (s) — client epitaph scheduling; refreshed from GLB on preload. */
export let BABUSHKA_NPC_DEATH_CLIP_SEC = 2.97;

export const BABUSHKA_NPC_AUTHORITATIVE_HEIGHT_M = 1.55;

const NPC_CLIP_TRANSITION_SEC = 0.18;
const NPC_LOCOMOTION_SWITCH_STABLE_SEC = 0.16;
const NPC_MOVING_CLIP_MIN_HOLD_SEC = 0.65;
const NPC_STATE_DEAD = 2;
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

const BABUSHKA_NPC_LOAD_CANDIDATES = mammothGlbLoadCandidates(BABUSHKA_NPC_GLB_URI);
let babushkaTemplate: NpcBodyTemplate | null = null;
let babushkaLoad: Promise<void> | null = null;

export async function preloadBabushkaNpcBody(): Promise<void> {
  if (babushkaTemplate) return;
  if (!babushkaLoad) {
    babushkaLoad = loadGltfFirstMatch(BABUSHKA_NPC_LOAD_CANDIDATES).then(
      ({ animations, scene }) => {
        const deadClip = animations.find(
          (clip) => normalizeClipLabel(clip.name) === normalizeClipLabel("Dead"),
        );
        if (deadClip && deadClip.duration > 0) {
          BABUSHKA_NPC_DEATH_CLIP_SEC = deadClip.duration;
        }
        babushkaTemplate = {
          scene,
          animations: animations.map(sanitizeNpcClip),
        };
      },
      (err) => {
        babushkaLoad = null;
        console.error("[babushkaNpcBody] failed to load GLB", BABUSHKA_NPC_GLB_URI, err);
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

export function isBabushkaNpcBodyReady(): boolean {
  return babushkaTemplate !== null;
}

export function createBabushkaNpcBody(): AnimatedBabushkaBody {
  if (!babushkaTemplate) {
    throw new Error("[babushkaNpcBody] call preloadBabushkaNpcBody() before createBabushkaNpcBody()");
  }
  return new AnimatedBabushkaBody(babushkaTemplate);
}

export class AnimatedBabushkaBody {
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
    normalizeNpcHumanoidModel(this.modelRoot, BABUSHKA_NPC_AUTHORITATIVE_HEIGHT_M);
    this.root.add(this.modelRoot);
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    const clipLibrary = buildNormalizedClipLibrary(template.animations);
    for (const key of Object.keys(BABUSHKA_CLIP_CANDIDATES) as BabushkaClipKey[]) {
      const clip = resolveNpcClipByCandidates(clipLibrary, BABUSHKA_CLIP_CANDIDATES[key]);
      if (!clip) {
        console.warn(`[babushkaNpcBody] missing clip for ${key}`, BABUSHKA_CLIP_CANDIDATES[key]);
        continue;
      }
      const loop = OVERLAY_CLIP_KEYS.has(key) ? THREE.LoopOnce : THREE.LoopRepeat;
      this.actions.set(key, createNpcAction(this.mixer, clip, loop));
    }
    this.playLocomotion("idle", true);
  }

  private snapFeetToGround(): void {
    snapNpcModelFeetToLocalGround(this.modelRoot, this.root);
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
      this.snapFeetToGround();
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
        this.snapFeetToGround();
        return;
      }
      this.stopOverlay();
    }

    this.mixer.update(dt);
    updateNpcSkinnedMeshes(this.modelRoot);
    this.snapFeetToGround();
  }

  dispose(): void {
    this.mixer.stopAllAction();
    detachSkinnedModelCloneSubtree(this.root);
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
      console.warn(`[babushkaNpcBody] locomotion clip not loaded: ${next}`);
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
      console.warn(`[babushkaNpcBody] overlay clip not loaded: ${key}`);
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
      console.warn("[babushkaNpcBody] death clip not loaded");
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
