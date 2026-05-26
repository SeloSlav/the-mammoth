/**
 * Rate-limits hidden→visible GPU state reveals (WebGPU pipeline compile bursts).
 * Used by apartment decor warm-up and async PBR first-draw scheduling.
 */

export type GpuRevealScope = "loading" | "steady" | "asyncMaterial";

export type GpuRevealLimits = {
  warmupMax: number;
  steadyMax: number;
  asyncMaterialMax?: number;
};

export const DEFAULT_GPU_REVEAL_LIMITS: GpuRevealLimits = {
  warmupMax: 32,
  steadyMax: 8,
  asyncMaterialMax: 2,
};

export type GpuRevealSchedulerState<TKey extends string = string> = {
  warmedKeys: Set<TKey>;
  visibleKeys: Set<TKey>;
};

export function createGpuRevealSchedulerState<TKey extends string = string>(): GpuRevealSchedulerState<TKey> {
  return { warmedKeys: new Set(), visibleKeys: new Set() };
}

export type GpuRevealApplyItem<TKey extends string = string> = {
  key: TKey;
  desiredVisible: boolean;
  /** Higher runs first when budget is tight (e.g. forward dot toward camera). */
  priority?: number;
  setVisible: (visible: boolean) => void;
};

export function applyGpuRevealBudget<TKey extends string>(
  items: readonly GpuRevealApplyItem<TKey>[],
  state: GpuRevealSchedulerState<TKey>,
  scope: GpuRevealScope,
  limits: GpuRevealLimits = DEFAULT_GPU_REVEAL_LIMITS,
): void {
  const warmupMax = limits.warmupMax;
  const steadyMax =
    scope === "asyncMaterial"
      ? (limits.asyncMaterialMax ?? limits.steadyMax)
      : limits.steadyMax;
  const showBudget =
    scope === "loading" ? warmupMax : scope === "steady" ? steadyMax : steadyMax;

  const pendingWarmUp: GpuRevealApplyItem<TKey>[] = [];
  const pendingSteadyShow: GpuRevealApplyItem<TKey>[] = [];

  for (const item of items) {
    if (!item.desiredVisible) {
      item.setVisible(false);
      state.visibleKeys.delete(item.key);
      continue;
    }
    if (!state.warmedKeys.has(item.key)) {
      pendingWarmUp.push(item);
      continue;
    }
    if (state.visibleKeys.has(item.key)) {
      item.setVisible(true);
      continue;
    }
    pendingSteadyShow.push(item);
  }

  const sortByPriority = (a: GpuRevealApplyItem<TKey>, b: GpuRevealApplyItem<TKey>) =>
    (b.priority ?? 0) - (a.priority ?? 0);
  pendingWarmUp.sort(sortByPriority);
  pendingSteadyShow.sort(sortByPriority);

  const warmCap =
    scope === "loading" || scope === "asyncMaterial"
      ? Math.max(0, warmupMax)
      : Math.max(0, warmupMax);
  for (let i = 0; i < pendingWarmUp.length; i++) {
    const item = pendingWarmUp[i]!;
    if (i < warmCap) {
      item.setVisible(true);
      state.visibleKeys.add(item.key);
      state.warmedKeys.add(item.key);
    } else {
      item.setVisible(false);
    }
  }

  const steadyCap = Math.max(0, showBudget);
  for (let i = 0; i < pendingSteadyShow.length; i++) {
    const item = pendingSteadyShow[i]!;
    if (i < steadyCap) {
      item.setVisible(true);
      state.visibleKeys.add(item.key);
    } else {
      item.setVisible(false);
    }
  }
}
