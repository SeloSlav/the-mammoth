import type * as THREE from "three";

export type CrowdSkinnedLodHooks = {
  freezeForLodLo: () => void;
  resumeAfterLodHi: () => void;
};

/**
 * Shared high (skinned GLB) / low (primitive) branch visibility for remote players and NPCs.
 */
export class CrowdSkinnedPresenter {
  private highActive: boolean;

  constructor(
    private readonly highBranch: THREE.Object3D,
    private readonly lowBranch: THREE.Object3D,
    private readonly hooks: CrowdSkinnedLodHooks,
    initialHigh: boolean,
  ) {
    this.highActive = initialHigh;
    this.highBranch.visible = initialHigh;
    this.lowBranch.visible = !initialHigh;
    if (!initialHigh) hooks.freezeForLodLo();
  }

  isHighDetailActive(): boolean {
    return this.highActive;
  }

  setDetailLevel(wantSkinnedGlb: boolean): void {
    if (wantSkinnedGlb === this.highActive) return;
    this.highActive = wantSkinnedGlb;
    this.highBranch.visible = wantSkinnedGlb;
    this.lowBranch.visible = !wantSkinnedGlb;
    if (wantSkinnedGlb) {
      this.hooks.resumeAfterLodHi();
    } else {
      this.hooks.freezeForLodLo();
    }
  }
}
