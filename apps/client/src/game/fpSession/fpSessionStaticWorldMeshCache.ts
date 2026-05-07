import {
  createFpSessionStaticWorldAsync,
  type FpSessionStaticWorld,
} from "./fpSessionWorldMount.js";
import { disposeStaticWorldObjectTree } from "./fpSessionStaticWorldDispose.js";

/** Hub / lobby plate — prioritized for mesh author + merge while other storeys lag behind. */
const HUB_PREFETCH_PLATE_LEVELS: readonly number[] = [1];

let megablockInflightBuild: Promise<FpSessionStaticWorld> | null = null;

/**
 * Starts the static world mesh CPU build. Shared by the auth-screen orbit ({@link waitMegablockStaticWorldMeshReady}),
 * username-submit / gameplay prefetch, and `mountFpSession` — first caller kicks off work; others await the same promise.
 */
export function primeMegablockStaticWorldMeshBuild(): void {
  if (megablockInflightBuild) return;
  megablockInflightBuild = createFpSessionStaticWorldAsync({
    priorityPlateLevelIndices: HUB_PREFETCH_PLATE_LEVELS,
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
