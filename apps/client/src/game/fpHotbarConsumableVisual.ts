import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { deepDisposeObject3D } from "@the-mammoth/engine";

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

function consumableGltfUri(defId: string): string {
  return `/static/models/consumables/${defId}.glb`;
}

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
    const parsed = (await response.json()) as { firstPerson?: { mount?: unknown } };
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
  private readonly loader = new GLTFLoader();
  private currentDefId: string | null = null;
  private currentRoot: THREE.Group | null = null;
  private pendingDefId: string | null = null;
  private pendingGripAnchor: THREE.Object3D | null = null;
  private loadToken = 0;

  syncSelected(defId: string | null, gripAnchor: THREE.Object3D | undefined): void {
    if (!gripAnchor) {
      this.dispose();
      return;
    }
    const samePending =
      defId !== null && defId === this.pendingDefId && this.pendingGripAnchor === gripAnchor;
    if (defId === this.currentDefId && this.currentRoot?.parent === gripAnchor) return;
    if (samePending) return;
    this.loadToken++;
    this.clearCurrent();
    this.currentDefId = defId;
    if (!defId) {
      this.pendingDefId = null;
      this.pendingGripAnchor = null;
      return;
    }
    this.pendingDefId = defId;
    this.pendingGripAnchor = gripAnchor;
    const token = this.loadToken;
    void this.loadAndAttach(defId, gripAnchor, token);
  }

  dispose(): void {
    this.loadToken++;
    this.currentDefId = null;
    this.pendingDefId = null;
    this.pendingGripAnchor = null;
    this.clearCurrent();
  }

  private clearCurrent(): void {
    const root = this.currentRoot;
    if (!root) return;
    root.removeFromParent();
    deepDisposeObject3D(root);
    this.currentRoot = null;
  }

  private async loadAndAttach(
    defId: string,
    gripAnchor: THREE.Object3D,
    token: number,
  ): Promise<void> {
    try {
      const [gltf, mount] = await Promise.all([
        this.loader.loadAsync(consumableGltfUri(defId)),
        loadConsumableMount(defId),
      ]);
      if (token !== this.loadToken || this.currentDefId !== defId) {
        deepDisposeObject3D(gltf.scene);
        return;
      }
      const root = new THREE.Group();
      root.name = `fp_hotbar_consumable_${defId}`;
      root.position.set(mount.positionM.x, mount.positionM.y, mount.positionM.z);
      root.rotation.set(mount.eulerRad.x, mount.eulerRad.y, mount.eulerRad.z, "XYZ");
      root.scale.set(mount.scaleM.x, mount.scaleM.y, mount.scaleM.z);
      gltf.scene.traverse((obj) => {
        obj.castShadow = false;
        obj.frustumCulled = false;
      });
      root.add(gltf.scene);
      gripAnchor.add(root);
      this.currentRoot = root;
      this.pendingDefId = null;
      this.pendingGripAnchor = null;
    } catch {
      if (token === this.loadToken && this.currentDefId === defId) {
        this.currentRoot = null;
        this.pendingDefId = null;
        this.pendingGripAnchor = null;
      }
    }
  }
}
