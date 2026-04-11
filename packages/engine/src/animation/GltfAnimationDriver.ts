import type { AnimationActionName } from "@the-mammoth/game";
import type { AnimationDriverDesiredState, IAnimationDriver } from "./animationDriverTypes.js";

/**
 * Placeholder for THREE.AnimationMixer + clip retargeting.
 * Wire-up steps (TODO):
 * - Load GLB with skeleton + clip library
 * - Map `AnimationActionName` -> clip names per weapon/body archetype
 * - Cross-fade locomotion states; upper-body mask for overlays
 * - Drive `getTransientPhase01` from mixer timeAction or custom curves
 */
export class GltfAnimationDriver implements IAnimationDriver {
  setDesired(desired: AnimationDriverDesiredState): void {
    void desired;
    /* TODO: sync mixer locomotion layer */
  }

  triggerTransient(action: AnimationActionName): void {
    void action;
    /* TODO: cross-fade into one-shot clip */
  }

  update(dt: number): void {
    void dt;
    /* TODO: mixer.update */
  }

  getTransientPhase01(action: AnimationActionName): number {
    void action;
    return 0;
  }

  dispose(): void {
    /* TODO: stop + dispose mixer actions */
  }
}
