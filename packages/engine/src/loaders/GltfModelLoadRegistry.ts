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

  /**
   * Try `candidates` in order; cache the first successful load under `ref.key`.
   * Updates `ref.uri` to the winning URL (callers use the same `ref` for {@link instantiateLoaded}).
   */
  async preloadWithUriCandidates(
    ref: Extract<ModelRef, { kind: "gltf" }>,
    candidates: readonly string[],
  ): Promise<string> {
    if (ref.kind !== "gltf") return ref.uri;
    const cur = this.templates.get(ref.key);
    if (cur?.scene) {
      ref.uri = cur.uri;
      return cur.uri;
    }
    let lastErr: unknown;
    for (const uri of candidates) {
      try {
        const gltf = await this.loader.loadAsync(uri);
        this.templates.set(ref.key, { uri, scene: gltf.scene });
        ref.uri = uri;
        return uri;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(
      `GltfModelLoadRegistry: no candidate GLB loaded for key ${ref.key} (${candidates.length} tried): ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
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
