import type { IModelLoadRegistry, ModelInstantiationResult, ModelRef } from "@the-mammoth/assets";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Minimal GLB cache: `preload` loads once; `instantiateLoaded` returns `scene.clone(true)` clones.
 * Intended for the client; keep construction in `mountFpSession` (or tests with real files).
 */
export class GltfModelLoadRegistry implements IModelLoadRegistry {
  private readonly loader = new GLTFLoader();
  private readonly templates = new Map<string, { uri: string; scene: THREE.Object3D }>();

  async preload(ref: ModelRef): Promise<void> {
    if (ref.kind !== "gltf") return;
    const cur = this.templates.get(ref.key);
    if (cur?.uri === ref.uri) return;
    const gltf = await this.loader.loadAsync(ref.uri);
    this.templates.set(ref.key, { uri: ref.uri, scene: gltf.scene });
  }

  instantiateLoaded(ref: Extract<ModelRef, { kind: "gltf" }>): ModelInstantiationResult {
    const t = this.templates.get(ref.key)?.scene;
    if (!t) {
      return { ok: false, error: `GltfModelLoadRegistry: missing template for ${ref.key} (preload first)` };
    }
    return { ok: true, root: t.clone(true) };
  }
}

export function createGltfModelLoadRegistry(): GltfModelLoadRegistry {
  return new GltfModelLoadRegistry();
}
