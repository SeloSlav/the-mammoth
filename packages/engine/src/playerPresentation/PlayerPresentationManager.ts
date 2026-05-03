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
  REMOTE_PLAYER_CROWD_FULL_DETAIL_NEAREST,
} from "./remote/RemotePlayerPresenter.js";
import { FP_MELEE_HAND_RIGHT } from "./fpViewmodelRefs.js";
import type { MeleeCombatVisualSink } from "./combatVisuals.js";
import { remoteIdsForTopKFullDetail, sortRemoteCrowdRankInPlace } from "./remoteCrowdLod.js";

export type RemotePresentationLodCamera = {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
};

export type PlayerPresentationManagerOptions = {
  scene: THREE.Scene;
  /** Viewmodel root: pitch on `headPitch`, not Alt yaw (camera uses `headFreeLook` → `headCameraPitch`). */
  fpViewModelParent: THREE.Object3D;
  /** When omitted, a {@link createGltfModelLoadRegistry} is created for the session. */
  modelRegistry?: IModelLoadRegistry;
  onMeleeVisual?: MeleeCombatVisualSink;
  /** First equipped weapon for FP viewmodel (defaults to unarmed / hands only). */
  initialEquippedPrimary?: HeldItemId;
  /**
   * Nearest N remotes use the full skinned GLB; the rest are instanced-ish primitives (~36 tris each).
   * Default {@link REMOTE_PLAYER_CROWD_FULL_DETAIL_NEAREST}.
   */
  maxFullDetailRemoteBodies?: number;
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
  private readonly maxFullDetailRemoteBodies: number;
  /** Reused each `update()` for crowd LOD ranking — avoids per-frame allocs. */
  private readonly _remoteLodRankScratch: { id: string; distSq: number }[] = [];
  /** Equip id currently shown on the local FP weapon mesh (may trail gameplay by a frame while a GLB loads). */
  private lastAppliedLocalWeaponVisualEquip: HeldItemId;
  private latestDesiredLocalEquip: HeldItemId;
  /** True while {@link drainLocalWeaponGlbs} owns the preload chain — never await inside `update()`. */
  private localWeaponGlbDrainRunning = false;
  /** Pooled set — cleared and reused each update() to avoid per-frame allocation. */
  private readonly _keepIds = new Set<string>();

  private constructor(
    scene: THREE.Scene,
    modelRegistry: IModelLoadRegistry,
    local: LocalFirstPersonPresenter,
    localMirror: LocalMirrorPlayerPresenter,
    initialEquipped: HeldItemId,
    maxFullDetailRemoteBodies: number,
  ) {
    this.scene = scene;
    this.modelRegistry = modelRegistry;
    this.local = local;
    this.localMirror = localMirror;
    this.lastAppliedLocalWeaponVisualEquip = initialEquipped;
    this.latestDesiredLocalEquip = initialEquipped;
    this.maxFullDetailRemoteBodies = maxFullDetailRemoteBodies;
  }

  /**
   * Preload the FP hand + remote body + **all** shipped weapon GLBs (remote third-person meshes),
   * optionally the initial local equipped weapon, then build the local viewmodel.
   */
  static async create(opts: PlayerPresentationManagerOptions): Promise<PlayerPresentationManager> {
    const modelRegistry = opts.modelRegistry ?? createGltfModelLoadRegistry();
    const initialEquipped = opts.initialEquippedPrimary ?? "unarmed";
    const initialDef = getWeaponDefinitionForEquippedPrimary(initialEquipped) ?? null;
    const preloadInitialWeapon =
      initialDef &&
      (modelRegistry instanceof GltfModelLoadRegistry
        ? modelRegistry.preloadWithUriCandidates(
            initialDef.modelRef as Extract<ModelRef, { kind: "gltf" }>,
            mammothCatalogGlbCandidates(initialDef.id),
          )
        : modelRegistry.preload(initialDef.modelRef));

    const preloadAllRemoteWeaponGlbs =
      modelRegistry instanceof GltfModelLoadRegistry
        ? ALL_WEAPON_DEFINITIONS.map((def) =>
            modelRegistry.preloadWithUriCandidates(
              def.modelRef as Extract<ModelRef, { kind: "gltf" }>,
              mammothCatalogGlbCandidates(def.id),
            ),
          )
        : ALL_WEAPON_DEFINITIONS.map((def) => modelRegistry.preload(def.modelRef));

    await Promise.all([
      modelRegistry.preload(FP_MELEE_HAND_RIGHT),
      preloadRemotePlayerBody(),
      ...(preloadInitialWeapon ? [preloadInitialWeapon] : []),
      ...preloadAllRemoteWeaponGlbs,
    ]);
    const local = new LocalFirstPersonPresenter({
      viewModelParent: opts.fpViewModelParent,
      modelRegistry,
      weaponDefinition: initialDef,
      onMeleeVisual: opts.onMeleeVisual,
    });
    await local.initViewmodel();
    const localMirror = new LocalMirrorPlayerPresenter(opts.scene);
    const maxFullDetail =
      opts.maxFullDetailRemoteBodies ?? REMOTE_PLAYER_CROWD_FULL_DETAIL_NEAREST;
    return new PlayerPresentationManager(
      opts.scene,
      modelRegistry,
      local,
      localMirror,
      initialEquipped,
      maxFullDetail,
    );
  }

  update(
    dt: number,
    localState: LocalPlayerGameplayState,
    remoteSnapshots: ReadonlyMap<string, ReplicatedPlayerSnapshot>,
    nowMs: number,
    remoteLod?: RemotePresentationLodCamera,
  ): void {
    this.latestDesiredLocalEquip = localState.equippedPrimary;
    if (
      !this.localWeaponGlbDrainRunning &&
      this.latestDesiredLocalEquip !== this.lastAppliedLocalWeaponVisualEquip
    ) {
      this.localWeaponGlbDrainRunning = true;
      void this.drainLocalWeaponGlbs().finally(() => {
        this.localWeaponGlbDrainRunning = false;
      });
    }
    this.local.update(localState, dt);
    this.localMirror.updateFromLocalState(localState, dt);
    this._keepIds.clear();

    let fullDetailRemotes: Set<string> | null = null;
    if (remoteLod && remoteSnapshots.size > 0) {
      const camX = remoteLod.cameraX;
      const camY = remoteLod.cameraY;
      const camZ = remoteLod.cameraZ;
      const rank = this._remoteLodRankScratch;
      rank.length = 0;
      for (const [id, snap] of remoteSnapshots) {
        const p = snap.worldPosition;
        const dx = p.x - camX;
        const dy = p.y - camY;
        const dz = p.z - camZ;
        rank.push({ id, distSq: dx * dx + dy * dy + dz * dz });
      }
      sortRemoteCrowdRankInPlace(rank);
      fullDetailRemotes = remoteIdsForTopKFullDetail(rank, this.maxFullDetailRemoteBodies);
    }

    for (const [id, snap] of remoteSnapshots) {
      this._keepIds.add(id);
      let rp = this.remotes.get(id);
      if (!rp) {
        rp = new RemotePlayerPresenter(this.scene, this.modelRegistry);
        this.remotes.set(id, rp);
      }
      if (fullDetailRemotes) {
        rp.setRemoteCrowdDetail(fullDetailRemotes.has(id));
      } else {
        rp.setRemoteCrowdDetail(true);
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

  private async drainLocalWeaponGlbs(): Promise<void> {
    while (this.latestDesiredLocalEquip !== this.lastAppliedLocalWeaponVisualEquip) {
      const targetEquip = this.latestDesiredLocalEquip;
      const wantDef = getWeaponDefinitionForEquippedPrimary(targetEquip) ?? null;
      let visualDef: typeof wantDef = wantDef;
      try {
        if (wantDef) {
          const reg = this.modelRegistry;
          if (reg instanceof GltfModelLoadRegistry) {
            await reg.preloadWithUriCandidates(
              wantDef.modelRef as Extract<ModelRef, { kind: "gltf" }>,
              mammothCatalogGlbCandidates(wantDef.id),
            );
          } else {
            await reg.preload(wantDef.modelRef);
          }
        }
      } catch (err) {
        console.error(`[PlayerPresentationManager] weapon GLB preload failed (${targetEquip})`, err);
        visualDef = null;
      }
      if (this.latestDesiredLocalEquip !== targetEquip) {
        continue;
      }
      this.local.setWeaponDefinition(visualDef);
      this.lastAppliedLocalWeaponVisualEquip = targetEquip;
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
