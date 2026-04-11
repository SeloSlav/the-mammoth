import type { ModelRef } from "./modelRef.js";

/**
 * Async model pipeline — implemented in the client/engine with THREE.GLTFLoader later.
 * Keeps `@the-mammoth/assets` free of three.js while giving a single injection point.
 */
export type LoadedModelHandle = {
  dispose: () => void;
};

export type ModelInstantiationResult =
  | { ok: true; handle: LoadedModelHandle }
  | { ok: false; error: string };

export interface IModelLoadRegistry {
  /** Cache + instantiate clone for a scene attachment. */
  instantiate(ref: ModelRef): Promise<ModelInstantiationResult>;
  preload(ref: ModelRef): Promise<void>;
}

/** Default until GLB pipeline lands — callers keep primitive visuals. */
export class NoopModelLoadRegistry implements IModelLoadRegistry {
  async instantiate(ref: ModelRef): Promise<ModelInstantiationResult> {
    if (ref.kind === "gltf") {
      return {
        ok: false,
        error: `GLTF load not wired for ${ref.key} (${ref.uri})`,
      };
    }
    return { ok: false, error: "primitive_fallback — no GLB instance" };
  }

  async preload(ref: ModelRef): Promise<void> {
    void ref;
  }
}
