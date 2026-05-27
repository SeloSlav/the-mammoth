import { fpLoadingDbgMark, isFpLoadingDebugEnabled } from "../fpSession/fpLoadingDebug.js";

export type FpApartmentDecorRebuildTimings = {
  yieldMs: number;
  yieldCount: number;
  layoutMs: number;
  prefetchMs: number;
  prefetchLoadCount: number;
  templateLoadMs: number;
  templateLoadCount: number;
  templateCacheHitCount: number;
  decorMountMs: number;
  decorMountCount: number;
  wallMs: number;
  wallCount: number;
  mirrorMs: number;
  mirrorCount: number;
  finalizeMs: number;
};

export function emptyFpApartmentDecorRebuildTimings(): FpApartmentDecorRebuildTimings {
  return {
    yieldMs: 0,
    yieldCount: 0,
    layoutMs: 0,
    prefetchMs: 0,
    prefetchLoadCount: 0,
    templateLoadMs: 0,
    templateLoadCount: 0,
    templateCacheHitCount: 0,
    decorMountMs: 0,
    decorMountCount: 0,
    wallMs: 0,
    wallCount: 0,
    mirrorMs: 0,
    mirrorCount: 0,
    finalizeMs: 0,
  };
}

export function roundRebuildMs(ms: number): number {
  return Math.round(ms);
}

export function beginFpApartmentDecorRebuildLoadDebug(): {
  enabled: boolean;
  rebuildT0: number;
  timings: FpApartmentDecorRebuildTimings | null;
} {
  const enabled = isFpLoadingDebugEnabled();
  return {
    enabled,
    rebuildT0: enabled ? performance.now() : 0,
    timings: enabled ? emptyFpApartmentDecorRebuildTimings() : null,
  };
}

export function markFpApartmentDecorRebuildStart(
  timings: FpApartmentDecorRebuildTimings | null,
  detail: {
    epoch: number;
    rowCount: number;
    decorRows: number;
    wallRows: number;
    mirrorRows: number;
    uniqueTemplateRequests: number;
  },
): void {
  if (!timings) return;
  fpLoadingDbgMark("fp_apartment_decor_rebuild:start", {
    ...detail,
    layoutMs: roundRebuildMs(timings.layoutMs),
  });
}

export function markFpApartmentDecorRebuildDone(
  timings: FpApartmentDecorRebuildTimings,
  rebuildT0: number,
  detail: { epoch: number; rowCount: number; uniqueTemplates: number },
): void {
  fpLoadingDbgMark("fp_apartment_decor_rebuild:done", {
    ...detail,
    elapsedMs: roundRebuildMs(performance.now() - rebuildT0),
    yieldMs: roundRebuildMs(timings.yieldMs),
    yieldCount: timings.yieldCount,
    layoutMs: roundRebuildMs(timings.layoutMs),
    prefetchMs: roundRebuildMs(timings.prefetchMs),
    prefetchLoadCount: timings.prefetchLoadCount,
    templateLoadMs: roundRebuildMs(timings.templateLoadMs),
    templateLoadCount: timings.templateLoadCount,
    templateCacheHitCount: timings.templateCacheHitCount,
    decorMountMs: roundRebuildMs(timings.decorMountMs),
    decorMountCount: timings.decorMountCount,
    wallMs: roundRebuildMs(timings.wallMs),
    wallCount: timings.wallCount,
    mirrorMs: roundRebuildMs(timings.mirrorMs),
    mirrorCount: timings.mirrorCount,
    finalizeMs: roundRebuildMs(timings.finalizeMs),
  });
}
