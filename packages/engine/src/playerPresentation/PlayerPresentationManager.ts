import * as THREE from "three";
import { mammothCatalogGlbCandidates } from "@the-mammoth/assets";
import type { IModelLoadRegistry, ModelRef } from "@the-mammoth/assets";
import type { HeldItemId, LocalPlayerGameplayState, ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import { ALL_WEAPON_DEFINITIONS, getWeaponDefinitionForEquippedPrimary } from "../weapons/weaponRegistry.js";
import type { WeaponDefinition } from "../weapons/weaponTypes.js";
import {
  createGltfModelLoadRegistry,
  GltfModelLoadRegistry,
} from "../loaders/GltfModelLoadRegistry.js";
import {
  LocalFirstPersonPresenter,
  type FpAuthoringPick,
} from "./local/LocalFirstPersonPresenter.js";
import {
  LocalMirrorPlayerPresenter,
  preloadRemotePlayerBody,
  RemotePlayerPresenter,
} from "./remote/RemotePlayerPresenter.js";
import { FP_MELEE_HAND_RIGHT } from "./fpViewmodelRefs.js";
import type { MeleeCombatVisualSink } from "./combatVisuals.js";

export type PlayerPresentationManagerOptions = {
  scene: THREE.Scene;
  /** Viewmodel root: pitch on `headPitch`, not Alt yaw (camera uses `headFreeLook` → `headCameraPitch`). */
  fpViewModelParent: THREE.Object3D;
  /** When omitted, a {@link createGltfModelLoadRegistry} is created for the session. */
  modelRegistry?: IModelLoadRegistry;
  onMeleeVisual?: MeleeCombatVisualSink;
  /** First equipped weapon for FP viewmodel (defaults to unarmed / hands only). */
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
  private readonly localMirror: LocalMirrorPlayerPresenter;
  private readonly remotes = new Map<string, RemotePlayerPresenter>();
  private lastLocalEquipped: HeldItemId;
  /** Pooled set — cleared and reused each update() to avoid per-frame allocation. */
  private readonly _keepIds = new Set<string>();

  private constructor(
    scene: THREE.Scene,
    modelRegistry: IModelLoadRegistry,
    local: LocalFirstPersonPresenter,
    localMirror: LocalMirrorPlayerPresenter,
    initialEquipped: HeldItemId,
  ) {
    this.scene = scene;
    this.modelRegistry = modelRegistry;
    this.local = local;
    this.localMirror = localMirror;
    this.lastLocalEquipped = initialEquipped;
  }

  /**
   * Preload weapon GLBs, build the local FP viewmodel (hand + weapon), then return the manager.
   */
  static async create(opts: PlayerPresentationManagerOptions): Promise<PlayerPresentationManager> {
    const modelRegistry = opts.modelRegistry ?? createGltfModelLoadRegistry();
    const initialEquipped = opts.initialEquippedPrimary ?? "unarmed";
    const initialDef = getWeaponDefinitionForEquippedPrimary(initialEquipped) ?? null;
    const preloadWeapons =
      modelRegistry instanceof GltfModelLoadRegistry
        ? ALL_WEAPON_DEFINITIONS.map((d) =>
            modelRegistry.preloadWithUriCandidates(
              d.modelRef as Extract<ModelRef, { kind: "gltf" }>,
              mammothCatalogGlbCandidates(d.id),
            ),
          )
        : ALL_WEAPON_DEFINITIONS.map((d) => modelRegistry.preload(d.modelRef));

    await Promise.all([
      modelRegistry.preload(FP_MELEE_HAND_RIGHT),
      preloadRemotePlayerBody(),
      ...preloadWeapons,
    ]);
    const local = new LocalFirstPersonPresenter({
      viewModelParent: opts.fpViewModelParent,
      modelRegistry,
      weaponDefinition: initialDef,
      onMeleeVisual: opts.onMeleeVisual,
    });
    await local.initViewmodel();
    const localMirror = new LocalMirrorPlayerPresenter(opts.scene);
    return new PlayerPresentationManager(
      opts.scene,
      modelRegistry,
      local,
      localMirror,
      initialEquipped,
    );
  }

  update(
    dt: number,
    localState: LocalPlayerGameplayState,
    remoteSnapshots: ReadonlyMap<string, ReplicatedPlayerSnapshot>,
    nowMs: number,
  ): void {
    if (localState.equippedPrimary !== this.lastLocalEquipped) {
      this.lastLocalEquipped = localState.equippedPrimary;
      this.local.setWeaponDefinition(
        getWeaponDefinitionForEquippedPrimary(localState.equippedPrimary) ?? null,
      );
    }
    this.local.update(localState, dt);
    this.localMirror.updateFromLocalState(localState, dt);
    this._keepIds.clear();
    for (const [id, snap] of remoteSnapshots) {
      this._keepIds.add(id);
      let rp = this.remotes.get(id);
      if (!rp) {
        rp = new RemotePlayerPresenter(this.scene, this.modelRegistry);
        this.remotes.set(id, rp);
      }
      rp.updateFromSnapshot(snap, dt, nowMs);
    }
    for (const [id, rp] of this.remotes) {
      if (!this._keepIds.has(id)) {
        rp.dispose(this.scene);
        this.remotes.delete(id);
      }
    }
  }

  dispose(): void {
    this.local.dispose();
    this.localMirror.dispose(this.scene);
    for (const rp of this.remotes.values()) rp.dispose(this.scene);
    this.remotes.clear();
  }

  setLocalMirrorAvatarVisible(visible: boolean): void {
    this.localMirror.setVisible(visible);
  }

  setLocalMirrorAvatarLayer(layer: number): void {
    this.localMirror.root.traverse((obj) => obj.layers.set(layer));
  }

  /** Dev / tools: freeze FP viewmodel motion so gizmos stay stable under the gameplay camera. */
  setFpAuthoringFrozen(frozen: boolean): void {
    this.local.setAuthoringFrozen(frozen);
  }

  getFpAuthoringPickList(): FpAuthoringPick[] {
    return this.local.getAuthoringPickList();
  }

  /** Local gameplay: shared hand socket used by weapons and hotbar consumables. */
  getLocalFpGripAnchorObject(): THREE.Object3D | undefined {
    return this.local.getFpGripAnchorObject();
  }

  /** Weapon mesh object for authoring scale persistence (separate from simplified `weapon` gizmo root). */
  getLocalFpWeaponVisualObject(): THREE.Object3D | undefined {
    return this.local.getFpWeaponVisualObject();
  }

  /** Hide stock hand meshes when the selected hotbar has neither a weapon nor a consumable. */
  setLocalFpGameplayStockHandVisible(visible: boolean): void {
    this.local.setFpGameplayStockHandVisible(visible);
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
    const cur = this.local.getWeaponDefinition();
    if (cur?.id === weaponId) {
      this.local.reloadWeaponPresentationLayout();
    }
  }
}
