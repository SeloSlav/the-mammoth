import type { AnimationActionName } from "@the-mammoth/game";
import type { AnimationDriverDesiredState, IAnimationDriver } from "./animationDriverTypes.js";

type Transient = { elapsed: number; duration: number };

const DEFAULT_ATTACK_LIGHT_S = 0.46;

/**
 * Procedural/timer-based animation backend for placeholder meshes.
 * TODO: replace overlay curves with sampled keyframes or additive bones on GLB rigs.
 */
export class PrimitiveAnimationDriver implements IAnimationDriver {
  private desired: AnimationDriverDesiredState = { locomotion: "idle" };
  private transients = new Map<AnimationActionName, Transient>();

  setDesired(desired: AnimationDriverDesiredState): void {
    this.desired = desired;
  }

  triggerTransient(action: AnimationActionName): void {
    if (action === "attack_light" || action === "attack_heavy") {
      const existing = this.transients.get(action);
      /** Same-frame / dual-input duplicate (e.g. `pointerdown` + legacy `mousedown`) restarts the swing. */
      if (existing !== undefined && existing.elapsed < 0.22) return;
      this.transients.set(action, { elapsed: 0, duration: DEFAULT_ATTACK_LIGHT_S });
      return;
    }
    this.transients.set(action, { elapsed: 0, duration: 0.25 });
  }

  update(dt: number): void {
    for (const [k, v] of this.transients) {
      const next = { ...v, elapsed: v.elapsed + dt };
      if (next.elapsed >= next.duration) this.transients.delete(k);
      else this.transients.set(k, next);
    }
  }

  getTransientPhase01(action: AnimationActionName): number {
    const t = this.transients.get(action);
    if (!t || t.duration <= 0) return 0;
    return Math.min(1, t.elapsed / t.duration);
  }

  dispose(): void {
    this.transients.clear();
  }
}
