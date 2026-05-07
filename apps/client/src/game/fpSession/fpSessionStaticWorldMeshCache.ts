import {
  createFpSessionStaticWorldAsync,
  type FpSessionStaticWorld,
  type MegablockBackdropHooks,
} from "./fpSessionWorldMount.js";
import { disposeStaticWorldObjectTree } from "./fpSessionStaticWorldDispose.js";

export type { MegablockBackdropHooks };

let megablockInflightBuild: Promise<FpSessionStaticWorld> | null = null;

/**
 * Starts the static world mesh CPU build — auth backdrop passes progressive hooks; `mountFpSession`
 * shares the same promise via {@link waitMegablockStaticWorldMeshReady}.
 */
export function primeMegablockStaticWorldMeshBuild(opts?: {
  getBackdropHooks?: () => MegablockBackdropHooks | null | undefined;
}): void {
  if (megablockInflightBuild) return;
  megablockInflightBuild = createFpSessionStaticWorldAsync({
    getBackdropHooks: opts?.getBackdropHooks,
  });
}

/** Called from profile submit / `mountFpSession` — second caller shares the same promise. */
export async function waitMegablockStaticWorldMeshReady(): Promise<FpSessionStaticWorld> {
  primeMegablockStaticWorldMeshBuild();
  return await megablockInflightBuild!;
}

/**
 * FP session tore down legitimately — allow a future login to build again.
 * Caller must have already disposed `buildingRoot` / `cellRoot` GPU resources via
 * {@link disposeStaticWorldObjectTree}.
 */
export function forgetMegablockStaticWorldMeshCache(): void {
  megablockInflightBuild = null;
}

/** User signed out (or tore down WS) without an active gameplay disposer disposing meshes. */
export function abandonMegablockStaticWorldMeshCache(): void {
  const p = megablockInflightBuild;
  megablockInflightBuild = null;
  if (!p) return;
  void p
    .then((w) => {
      disposeStaticWorldObjectTree(w.buildingRoot);
      disposeStaticWorldObjectTree(w.cellRoot);
    })
    .catch(() => {});
}
