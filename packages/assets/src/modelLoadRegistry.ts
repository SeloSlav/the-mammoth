import type { ModelRef } from "./modelRef.js";

/**
 * Successful GLB clone for scene attachment. Callers own `root` and must dispose GPU resources
 * (e.g. traverse meshes) when removing the instance — registries do not retain per-instance handles.
 */
export type ModelInstantiationResult =
  | { ok: true; root: object }
  | { ok: false; error: string };

export interface IModelLoadRegistry {
  /** Load and cache template for `ref` (required before {@link instantiateLoaded}). */
  preload(ref: ModelRef): Promise<void>;
  /**
   * Clone a previously preloaded GLTF template. **Sync** after successful `preload`.
   * @throws Never — returns `{ ok: false }` if the template is missing or `ref` is not GLTF.
   */
  instantiateLoaded(ref: Extract<ModelRef, { kind: "gltf" }>): ModelInstantiationResult;
}

/** Used in tests or headless tooling where no GLB pipeline is wired. */
export class NoopModelLoadRegistry implements IModelLoadRegistry {
  async preload(ref: ModelRef): Promise<void> {
    void ref;
  }

  instantiateLoaded(ref: Extract<ModelRef, { kind: "gltf" }>): ModelInstantiationResult {
    return {
      ok: false,
      error: `NoopModelLoadRegistry: GLB not available (${ref.key} → ${ref.uri})`,
    };
  }
}
