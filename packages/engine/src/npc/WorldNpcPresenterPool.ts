import type { NpcArchetypeId, ReplicatedNpcSnapshot } from "@the-mammoth/game";
import type * as THREE from "three";
import type { WorldNpcPresenter } from "./NpcPresenter.js";
import {
  BabushkaNpcPresenter,
  isBabushkaNpcBodyReady,
  preloadBabushkaNpcBody,
} from "./archetypes/babushka/BabushkaNpcPresenter.js";

function createPresenterForArchetype(archetype: NpcArchetypeId): WorldNpcPresenter | null {
  if (archetype === "babushka") {
    return BabushkaNpcPresenter.createSync();
  }
  return null;
}

export class WorldNpcPresenterPool {
  private readonly parent: THREE.Object3D;
  private readonly byId = new Map<string, WorldNpcPresenter>();
  private readonly retired = new Set<WorldNpcPresenter>();
  private envTextureProvider: (() => THREE.Texture | null) | null = null;
  private showHitDebugVolumes = false;
  private showDetectionRadiusDebug = false;
  private showVisionConeDebug = false;
  private renderPvsGate: ((snap: ReplicatedNpcSnapshot) => boolean) | null = null;

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

  setShowDetectionRadiusDebug(enabled: boolean): void {
    if (this.showDetectionRadiusDebug === enabled) return;
    this.showDetectionRadiusDebug = enabled;
    for (const pres of this.byId.values()) {
      pres.setDetectionRadiusDebugEnabled(enabled);
    }
  }

  setShowVisionConeDebug(enabled: boolean): void {
    if (this.showVisionConeDebug === enabled) return;
    this.showVisionConeDebug = enabled;
    for (const pres of this.byId.values()) {
      pres.setVisionConeDebugEnabled(enabled);
    }
  }

  setEnvTextureProvider(provider: (() => THREE.Texture | null) | null): void {
    this.envTextureProvider = provider;
  }

  /** Optional CPU PVS gate — when set, presenters outside the gate are hidden each tick. */
  setRenderPvsGate(gate: ((snap: ReplicatedNpcSnapshot) => boolean) | null): void {
    this.renderPvsGate = gate;
  }

  async ensureReady(): Promise<void> {
    await preloadBabushkaNpcBody();
  }

  isReady(): boolean {
    return isBabushkaNpcBodyReady();
  }

  private envTexture(): THREE.Texture | null {
    return this.envTextureProvider?.() ?? null;
  }

  private applyDebugFlags(pres: WorldNpcPresenter): void {
    if (this.showHitDebugVolumes) {
      pres.setHitDebugVolumesEnabled(true);
    }
    if (this.showDetectionRadiusDebug) {
      pres.setDetectionRadiusDebugEnabled(true);
    }
    if (this.showVisionConeDebug) {
      pres.setVisionConeDebugEnabled(true);
    }
  }

  ingestAuthoritative(snapshots: readonly ReplicatedNpcSnapshot[]): void {
    if (!isBabushkaNpcBodyReady()) return;
    const live = new Set<string>();
    for (const snap of snapshots) {
      const key = snap.npcId.toString();
      live.add(key);
      let pres = this.byId.get(key);
      if (!pres) {
        try {
          pres = createPresenterForArchetype(snap.archetype);
          if (!pres) continue;
          this.applyDebugFlags(pres);
          this.byId.set(key, pres);
          this.parent.add(pres.root);
        } catch (err) {
          console.error("[WorldNpcPresenterPool] presenter create failed", snap.archetype, err);
          continue;
        }
      }
      pres.ingestAuthoritativeSnapshot(snap);
    }
    for (const [key, pres] of this.byId) {
      if (!live.has(key)) {
        this.parent.remove(pres.root);
        this.retired.add(pres);
        this.byId.delete(key);
      }
    }
  }

  tickVisual(snapshots: readonly ReplicatedNpcSnapshot[], dt: number): void {
    if (!isBabushkaNpcBodyReady()) return;
    const envTexture = this.envTexture();
    const gate = this.renderPvsGate;
    for (const snap of snapshots) {
      const pres = this.byId.get(snap.npcId.toString());
      if (!pres) continue;
      const allowRender = gate ? gate(snap) : true;
      pres.root.visible = allowRender;
      if (!allowRender) continue;
      pres.tickVisualSnapshot(snap, dt, envTexture);
    }
  }

  sync(snapshots: readonly ReplicatedNpcSnapshot[], dt: number): void {
    this.ingestAuthoritative(snapshots);
    this.tickVisual(snapshots, dt);
  }

  /** Match replicated flesh-impact one-shots to the nearest NPC debug overlay. */
  flashHitDebugAtWorld(x: number, y: number, z: number, headshot: boolean): void {
    if (!this.showHitDebugVolumes) return;
    let best: { pres: WorldNpcPresenter; distSq: number } | null = null;
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
    for (const pres of this.retired) {
      pres.dispose();
    }
    this.retired.clear();
  }
}
