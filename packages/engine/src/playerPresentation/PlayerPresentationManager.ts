import * as THREE from "three";
import type { HeldItemId, LocalPlayerGameplayState, ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import type { IModelLoadRegistry } from "@the-mammoth/assets";
import { ALL_WEAPON_DEFINITIONS, getWeaponDefinitionForEquippedPrimary } from "../weapons/weaponRegistry.js";
import type { WeaponDefinition } from "../weapons/weaponTypes.js";
import { createGltfModelLoadRegistry } from "../loaders/GltfModelLoadRegistry.js";
import {
  LocalFirstPersonPresenter,
  type FpAuthoringPick,
} from "./local/LocalFirstPersonPresenter.js";
import { RemotePlayerPresenter } from "./remote/RemotePlayerPresenter.js";
import { FP_MELEE_HAND_RIGHT } from "./fpViewmodelRefs.js";
import type { MeleeCombatVisualSink } from "./combatVisuals.js";

export type PlayerPresentationManagerOptions = {
  scene: THREE.Scene;
  /** Viewmodel root: pitch on `headPitch`, not Alt yaw (camera uses `headFreeLook` → `headCameraPitch`). */
  fpViewModelParent: THREE.Object3D;
  /** When omitted, a {@link createGltfModelLoadRegistry} is created for the session. */
  modelRegistry?: IModelLoadRegistry;
  onMeleeVisual?: MeleeCombatVisualSink;
  /** First equipped weapon for FP viewmodel (defaults to crowbar). */
  initialEquippedPrimary?: HeldItemId;
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
  private lastLocalEquipped: HeldItemId;

  private constructor(
    scene: THREE.Scene,
    modelRegistry: IModelLoadRegistry,
    local: LocalFirstPersonPresenter,
    initialEquipped: HeldItemId,
  ) {
    this.scene = scene;
    this.modelRegistry = modelRegistry;
    this.local = local;
    this.lastLocalEquipped = initialEquipped;
  }

  /**
   * Preload weapon GLBs, build the local FP viewmodel (hand + weapon), then return the manager.
   */
  static async create(opts: PlayerPresentationManagerOptions): Promise<PlayerPresentationManager> {
    const modelRegistry = opts.modelRegistry ?? createGltfModelLoadRegistry();
    const initialEquipped = opts.initialEquippedPrimary ?? "crowbar";
    const initialDef = getWeaponDefinitionForEquippedPrimary(initialEquipped);
    await Promise.all([
      modelRegistry.preload(FP_MELEE_HAND_RIGHT),
      ...ALL_WEAPON_DEFINITIONS.map((d) => modelRegistry.preload(d.modelRef)),
    ]);
    const local = new LocalFirstPersonPresenter({
      viewModelParent: opts.fpViewModelParent,
      modelRegistry,
      weaponDefinition: initialDef,
      onMeleeVisual: opts.onMeleeVisual,
    });
    await local.initViewmodel();
    return new PlayerPresentationManager(opts.scene, modelRegistry, local, initialEquipped);
  }

  update(
    dt: number,
    localState: LocalPlayerGameplayState,
    remoteSnapshots: ReadonlyMap<string, ReplicatedPlayerSnapshot>,
    nowMs: number,
  ): void {
    if (localState.equippedPrimary !== this.lastLocalEquipped) {
      this.lastLocalEquipped = localState.equippedPrimary;
      this.local.setWeaponDefinition(getWeaponDefinitionForEquippedPrimary(localState.equippedPrimary));
    }
    this.local.update(localState, dt);
    const keep = new Set<string>();
    for (const [id, snap] of remoteSnapshots) {
      keep.add(id);
      let rp = this.remotes.get(id);
      if (!rp) {
        rp = new RemotePlayerPresenter(this.scene, this.pickTint(), this.modelRegistry);
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

  /** Dev / tools: freeze FP viewmodel motion so gizmos stay stable under the gameplay camera. */
  setFpAuthoringFrozen(frozen: boolean): void {
    this.local.setAuthoringFrozen(frozen);
  }

  getFpAuthoringPickList(): FpAuthoringPick[] {
    return this.local.getAuthoringPickList();
  }

  /** After moving the weapon root in authoring, sync baseline so gameplay matches. */
  syncLocalFpWeaponMountBaselineFromRoot(): void {
    this.local.syncFpWeaponMountBaselineFromRoot();
  }

  /**
   * Dev: re-read layout from the in-memory weapon definition after hot-reloading presentation JSON.
   * No-op if the local viewmodel is showing a different weapon id.
   */
  reloadLocalWeaponPresentationLayoutForWeapon(weaponId: WeaponDefinition["id"]): void {
    if (this.local.getWeaponDefinition().id === weaponId) {
      this.local.reloadWeaponPresentationLayout();
    }
  }
}
