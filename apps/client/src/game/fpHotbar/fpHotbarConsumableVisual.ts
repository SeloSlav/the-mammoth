import * as THREE from "three";
import {
  detachRegistryCloneSubtree,
  getConfiguredGltfLoader,
  loadGltfFirstMatch,
} from "@the-mammoth/engine";
import { mammothCatalogGlbCandidates } from "@the-mammoth/assets";

type ConsumableMount = {
  positionM: { x: number; y: number; z: number };
  eulerRad: { x: number; y: number; z: number };
  scaleM: { x: number; y: number; z: number };
};

const DEFAULT_CONSUMABLE_MOUNT: ConsumableMount = {
  positionM: { x: 0.32, y: -0.18, z: 0.38 },
  eulerRad: { x: 0, y: 0, z: 0 },
  scaleM: { x: 1, y: 1, z: 1 },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readVec3(
  value: unknown,
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  if (!value || typeof value !== "object") return { ...fallback };
  const candidate = value as Record<string, unknown>;
  return {
    x: isFiniteNumber(candidate.x) ? candidate.x : fallback.x,
    y: isFiniteNumber(candidate.y) ? candidate.y : fallback.y,
    z: isFiniteNumber(candidate.z) ? candidate.z : fallback.z,
  };
}

async function loadConsumableMount(defId: string): Promise<ConsumableMount> {
  try {
    const response = await fetch(`/content/consumables/${defId}.presentation.json`, {
      cache: "no-store",
    });
    if (!response.ok) return DEFAULT_CONSUMABLE_MOUNT;
    const parsed = JSON.parse(await response.text()) as { firstPerson?: { mount?: unknown } };
    const mount = parsed?.firstPerson?.mount;
    return {
      positionM: readVec3(mount && typeof mount === "object" ? (mount as Record<string, unknown>).positionM : null, DEFAULT_CONSUMABLE_MOUNT.positionM),
      eulerRad: readVec3(mount && typeof mount === "object" ? (mount as Record<string, unknown>).eulerRad : null, DEFAULT_CONSUMABLE_MOUNT.eulerRad),
      scaleM: readVec3(mount && typeof mount === "object" ? (mount as Record<string, unknown>).scaleM : null, DEFAULT_CONSUMABLE_MOUNT.scaleM),
    };
  } catch {
    return DEFAULT_CONSUMABLE_MOUNT;
  }
}

export class FpHotbarConsumableVisual {
  private readonly loader = getConfiguredGltfLoader();
  private readonly templateByDefId = new Map<string, THREE.Object3D>();
  private readonly mountByDefId = new Map<string, ConsumableMount>();
  private readonly preloadPromiseByDefId = new Map<string, Promise<void>>();
  private currentDefId: string | null = null;
  private currentRoot: THREE.Group | null = null;

  async preload(defIds: readonly string[]): Promise<void> {
    await Promise.all(defIds.map((defId) => this.ensurePreloaded(defId)));
  }

  private mountConsumableCloneOnGrip(defId: string, gripAnchor: THREE.Object3D): void {
    if (this.currentDefId !== defId) return;
    if (this.currentRoot?.parent === gripAnchor) return;
    const template = this.templateByDefId.get(defId);
    if (!template) return;
    const mount = this.mountByDefId.get(defId) ?? DEFAULT_CONSUMABLE_MOUNT;
    const root = new THREE.Group();
    root.name = `fp_hotbar_consumable_${defId}`;
    root.position.set(mount.positionM.x, mount.positionM.y, mount.positionM.z);
    root.rotation.set(mount.eulerRad.x, mount.eulerRad.y, mount.eulerRad.z, "XYZ");
    root.scale.set(mount.scaleM.x, mount.scaleM.y, mount.scaleM.z);
    root.add(template.clone(true));
    gripAnchor.add(root);
    this.currentRoot = root;
  }

  syncSelected(defId: string | null, gripAnchor: THREE.Object3D | undefined): void {
    if (!gripAnchor) {
      this.dispose();
      return;
    }
    if (defId === this.currentDefId && this.currentRoot?.parent === gripAnchor) return;
    this.clearCurrent();
    this.currentDefId = defId;
    if (!defId) return;
    const template = this.templateByDefId.get(defId);
    if (!template) {
      void this.ensurePreloaded(defId).then(() => {
        if (this.currentDefId !== defId) return;
        this.mountConsumableCloneOnGrip(defId, gripAnchor);
      });
      return;
    }
    this.mountConsumableCloneOnGrip(defId, gripAnchor);
  }

  dispose(): void {
    this.currentDefId = null;
    this.clearCurrent();
  }

  private clearCurrent(): void {
    const root = this.currentRoot;
    if (!root) return;
    detachRegistryCloneSubtree(root);
    this.currentRoot = null;
  }

  private ensurePreloaded(defId: string): Promise<void> {
    const existing = this.preloadPromiseByDefId.get(defId);
    if (existing) return existing;
    const promise = Promise.all([
      loadGltfFirstMatch(mammothCatalogGlbCandidates(defId), this.loader),
      loadConsumableMount(defId),
    ])
      .then(([gltf, mount]) => {
        gltf.scene.traverse((obj) => {
          obj.castShadow = false;
          obj.frustumCulled = false;
        });
        this.templateByDefId.set(defId, gltf.scene);
        this.mountByDefId.set(defId, mount);
      })
      .catch((error) => {
        this.mountByDefId.set(defId, DEFAULT_CONSUMABLE_MOUNT);
        console.warn(`[FpHotbarConsumableVisual] preload failed for ${defId}`, error);
      });
    this.preloadPromiseByDefId.set(defId, promise);
    return promise;
  }
}
