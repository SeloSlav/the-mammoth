import * as THREE from "three";
import type { NpcPerceptionProfile, ReplicatedNpcSnapshot } from "@the-mammoth/game";
import {
  createNpcVisualSmoothingState,
  ingestNpcAuthoritativeTransform,
  stepNpcVisualSmoothing,
  type NpcVisualAnimationState,
  type NpcVisualSmoothingState,
} from "./NpcVisualSmoothingState.js";
import { NpcHitDebugOverlay } from "./NpcHitDebugOverlay.js";
import { NpcDetectionDebugOverlay } from "./NpcDetectionDebugOverlay.js";
import { bindNpcOutdoorReadableEnv } from "./npcModelUtils.js";
import { MAMMOTH_FP_WORLD_NPC_UD } from "./npcConstants.js";

const NPC_YAW_OFFSET_RAD = 0;

export interface WorldNpcPresenter {
  readonly root: THREE.Group;
  ingestAuthoritativeSnapshot(snapshot: ReplicatedNpcSnapshot): void;
  tickVisualSnapshot(
    snapshot: ReplicatedNpcSnapshot,
    dt: number,
    envTexture: THREE.Texture | null,
  ): void;
  setHitDebugVolumesEnabled(enabled: boolean): void;
  setVisionConeDebugEnabled(enabled: boolean): void;
  flashHitDebug(headshot: boolean): void;
  dispose(): void;
}

/** Shared root pose smoothing + dev debug overlays for replicated world NPC presenters. */
export abstract class NpcPresenterFrame implements WorldNpcPresenter {
  readonly root = new THREE.Group();
  protected readonly visualSmoothing: NpcVisualSmoothingState = createNpcVisualSmoothingState();
  protected abstract readonly perceptionProfile: NpcPerceptionProfile;

  private hitDebug: NpcHitDebugOverlay | null = null;
  private visionConeDebug: NpcDetectionDebugOverlay | null = null;
  private showVisionConeDebug = false;

  protected constructor(rootName: string) {
    this.root.name = rootName;
    this.root.userData[MAMMOTH_FP_WORLD_NPC_UD] = true;
  }

  protected abstract tickBody(
    snapshot: ReplicatedNpcSnapshot,
    dt: number,
    animationState: NpcVisualAnimationState,
  ): void;

  protected abstract disposeBody(): void;

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
    this.hitDebug.root.visible = false;
  }

  setVisionConeDebugEnabled(enabled: boolean): void {
    this.showVisionConeDebug = enabled;
    if (enabled) {
      if (!this.visionConeDebug) {
        this.visionConeDebug = new NpcDetectionDebugOverlay(this.perceptionProfile);
        this.root.add(this.visionConeDebug.root);
      }
      this.visionConeDebug.setVisible(true);
      return;
    }
    if (!this.visionConeDebug) return;
    this.visionConeDebug.setVisible(false);
  }

  ingestAuthoritativeSnapshot(snapshot: ReplicatedNpcSnapshot): void {
    ingestNpcAuthoritativeTransform(
      this.visualSmoothing,
      snapshot.worldPosition,
      snapshot.yawRad + NPC_YAW_OFFSET_RAD,
    );
  }

  tickVisualSnapshot(
    snapshot: ReplicatedNpcSnapshot,
    dt: number,
    envTexture: THREE.Texture | null = null,
  ): void {
    bindNpcOutdoorReadableEnv(this.root, envTexture);

    const { animationState } = stepNpcVisualSmoothing(this.visualSmoothing, dt);
    this.root.position.copy(this.visualSmoothing.visualPosition);
    this.root.quaternion.copy(this.visualSmoothing.smoothedRotation);
    this.hitDebug?.tick(dt);
    this.tickBody(snapshot, dt, animationState);
    this.root.updateMatrixWorld(true);
  }

  flashHitDebug(headshot: boolean): void {
    this.hitDebug?.flashHit(headshot);
  }

  applySnapshot(
    snapshot: ReplicatedNpcSnapshot,
    dt: number,
    envTexture: THREE.Texture | null = null,
  ): void {
    this.ingestAuthoritativeSnapshot(snapshot);
    this.tickVisualSnapshot(snapshot, dt, envTexture);
  }

  dispose(): void {
    if (this.hitDebug) {
      this.root.remove(this.hitDebug.root);
      this.hitDebug.dispose();
      this.hitDebug = null;
    }
    if (this.visionConeDebug) {
      this.root.remove(this.visionConeDebug.root);
      this.visionConeDebug.dispose();
      this.visionConeDebug = null;
    }
    this.disposeBody();
  }
}
