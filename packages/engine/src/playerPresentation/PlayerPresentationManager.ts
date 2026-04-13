import * as THREE from "three";
import type { LocalPlayerGameplayState, ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import type { IModelLoadRegistry } from "@the-mammoth/assets";
import { NoopModelLoadRegistry } from "@the-mammoth/assets";
import { LocalFirstPersonPresenter } from "./local/LocalFirstPersonPresenter.js";
import { RemotePlayerPresenter } from "./remote/RemotePlayerPresenter.js";
import type { MeleeCombatVisualSink } from "./combatVisuals.js";

export type PlayerPresentationManagerOptions = {
  scene: THREE.Scene;
  /** Viewmodel root: pitch on `headPitch`, not Alt yaw (camera uses `headFreeLook` → `headCameraPitch`). */
  fpViewModelParent: THREE.Object3D;
  modelRegistry?: IModelLoadRegistry;
  onMeleeVisual?: MeleeCombatVisualSink;
};

/**
 * Owns local first-person + N remote third-person presenters.
 * Apps feed normalized snapshots each frame; SpaceTimeDB stays outside this class.
 */
export class PlayerPresentationManager {
  private readonly scene: THREE.Scene;
  private readonly modelRegistry: IModelLoadRegistry;
  private readonly local: LocalFirstPersonPresenter;
  private readonly remotes = new Map<string, RemotePlayerPresenter>();
  private remoteTintCursor = 0;

  constructor(opts: PlayerPresentationManagerOptions) {
    this.scene = opts.scene;
    this.modelRegistry = opts.modelRegistry ?? new NoopModelLoadRegistry();
    void this.modelRegistry.preload({ kind: "primitive_fallback" });
    this.local = new LocalFirstPersonPresenter({
      viewModelParent: opts.fpViewModelParent,
      onMeleeVisual: opts.onMeleeVisual,
    });
  }

  update(
    dt: number,
    localState: LocalPlayerGameplayState,
    remoteSnapshots: ReadonlyMap<string, ReplicatedPlayerSnapshot>,
    nowMs: number,
  ): void {
    this.local.update(localState, dt);
    const keep = new Set<string>();
    for (const [id, snap] of remoteSnapshots) {
      keep.add(id);
      let rp = this.remotes.get(id);
      if (!rp) {
        rp = new RemotePlayerPresenter(this.scene, this.pickTint());
        this.remotes.set(id, rp);
      }
      rp.updateFromSnapshot(snap, dt, nowMs);
    }
    for (const [id, rp] of this.remotes) {
      if (!keep.has(id)) {
        rp.dispose(this.scene);
        this.remotes.delete(id);
      }
    }
  }

  private pickTint(): number {
    const palette = [0x9f7a6b, 0x7fa38f, 0x8b9ac9, 0xb89f6b];
    const c = palette[this.remoteTintCursor % palette.length]!;
    this.remoteTintCursor += 1;
    return c;
  }

  dispose(): void {
    this.local.dispose();
    for (const rp of this.remotes.values()) rp.dispose(this.scene);
    this.remotes.clear();
  }
}
