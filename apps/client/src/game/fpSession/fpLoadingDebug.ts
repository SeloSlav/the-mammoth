/**
 * Diagnose perceived “black screen / slow login”: Spacetime connect, subscriptions,
 * FP `mountFpSession` async gaps, CPU long tasks, and large RAF deltas.
 *
 * Interpretation: `long_task_cpu` and `[Violation] requestAnimationFrame handler took …ms`
 * both mean the main thread was busy (JS parse, WASM, shader compile, layout, slicing work,
 * GC, DevTools overhead). Matching `raf_frame_gap` timestamps mean the RAF loop stalled
 * for the same reason. Logs use one-line `console.info` to avoid Chrome printing huge
 * `requestAnimationFrame` async stacks beside each warning.
 *
 * **Reading logs**: `fpLoadingDbgTimed` / `TimedSync` register a coarse `phase=…` stack; every
 * `fpLoadingDbgMark` is captured in a short ring buffer. Long tasks and RAF gaps append
 * `marksInWindow` (milestones whose timestamp fell inside the stall) plus `lastMarkBefore`
 * (what you were closest to entering when the stall had no overlapping marks — typical for
 * between-frame gaps). No Chrome Performance tab required — only console order + these fields.
 *
 * Enable: `localStorage.setItem("mammothFpLoadingDebug","1")` + refresh,
 * URL `?loaddebug=1`, or the in-game Mammoth Debug menu toggle.
 */

import { LS_FP_LOADING_DEBUG } from "../fpDebugMenuStorage.js";

const PREFIX = "[mmLoadDbg]";
const RAF_GAP_WARN_MS = 120;
/** Log at most one sub-severe RAF gap / this many ms (severe gaps always log). */
const RAF_GAP_LOG_COOLDOWN_MS = 750;
const RAF_GAP_SEVERE_MS = 400;
/** Long-task entries are Chromium-only; durations are typically ≥50 ms. */
let lastRafGapLogMonoMs = 0;

const MILESTONE_RING_CAP = 64;
/** Bytes-like cap per stored line — keeps heap + logs bounded. */
const MILESTONE_LABEL_MAX = 220;

/** Monotonic timestamps from `performance.now()`; aligns with Chromium `longtask` entry times. */
const milestoneRing: { at: number; label: string }[] = [];
const phaseStack: string[] = [];

let sessionAnchorMs = 0;
let lastMarkMs = 0;

function truncateDbgLine(label: string, max = MILESTONE_LABEL_MAX): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

function formatMarkRecordLine(
  label: string,
  detail?: Record<string, number | string | boolean | null | undefined>,
): string {
  if (!detail || Object.keys(detail).length === 0) return truncateDbgLine(label);
  try {
    return truncateDbgLine(`${label} ${JSON.stringify(detail)}`);
  } catch {
    return truncateDbgLine(label);
  }
}

function pushMilestoneRecord(line: string): void {
  milestoneRing.push({ at: performance.now(), label: line });
  while (milestoneRing.length > MILESTONE_RING_CAP) milestoneRing.shift();
}

/**
 * Builds a readable explanation for the time window **[t0, t1]** (same clock as `performance.now()` /
 * Chromium `PerformanceEntry`), using milestones + coarse phase stack snapshots (see file header).
 * Exported so Vitest can lock the formatting down.
 */
export function fpLoadingDbgExplainPerfInterval(
  t0: number,
  t1: number,
  ring: readonly { at: number; label: string }[],
  phases: readonly string[],
): string {
  const phase = phases.length ? phases.join(">") : "no_phase";

  let lastBefore: { at: number; label: string } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const e = ring[i]!;
    if (e.at < t0 && (!lastBefore || e.at > lastBefore.at)) lastBefore = e;
  }

  const inside = ring.filter((e) => e.at >= t0 && e.at <= t1).sort((a, b) => a.at - b.at);
  const marksIn =
    inside.length === 0
      ? "(none)"
      : inside.map((e) => `${e.label}[+${Math.round(e.at - t0)}ms]`).join(" · ");

  const lastMarkBefore =
    lastBefore === null
      ? "(none)"
      : `${lastBefore.label} (${Math.round(t0 - lastBefore.at)}ms before window)`;

  return `phase=${phase} | marksInWindow=${marksIn} | lastMarkBefore=${lastMarkBefore}`;
}

function correlationSnapshot(): { ring: readonly { at: number; label: string }[]; phases: readonly string[] } {
  return { ring: milestoneRing.slice(), phases: phaseStack.slice() };
}

/** Optional manual nesting (e.g. hot inner loops); `Timed`/`TimedSync` manage this automatically. */
export function fpLoadingDbgPushPhase(label: string): void {
  if (!isFpLoadingDebugEnabled()) return;
  phaseStack.push(label);
}

export function fpLoadingDbgPopPhase(): void {
  if (!isFpLoadingDebugEnabled()) return;
  phaseStack.pop();
}

export function isFpLoadingDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has("loaddebug")) return true;
    return window.localStorage.getItem(LS_FP_LOADING_DEBUG) === "1";
  } catch {
    return false;
  }
}

/** Start (or restart) timers for milestone deltas in this browsing session. */
export function fpLoadingDebugResetAnchors(reason: string): void {
  const now = performance.now();
  sessionAnchorMs = now;
  lastMarkMs = now;
  if (!isFpLoadingDebugEnabled()) return;
  console.info(PREFIX, "anchors_reset", { reason, perfTimeOriginMs: Math.round(performance.timeOrigin) });
}

export function fpLoadingDbgMark(
  label: string,
  detail?: Record<string, number | string | boolean | null | undefined>,
): void {
  if (!isFpLoadingDebugEnabled()) return;
  initAnchorsOnce();
  const now = performance.now();
  const sinceSessionStart = Math.round(now - sessionAnchorMs);
  const sincePrev = Math.round(now - lastMarkMs);
  lastMarkMs = now;
  console.info(PREFIX, label, {
    msSinceNavStartApprox: sinceSessionStart,
    msSincePrevMark: sincePrev,
    ...detail,
  });
}

/** Async section timing (await boundaries). */
export async function fpLoadingDbgTimed<T>(
  label: string,
  work: () => Promise<T>,
  detail?: Record<string, number | string | boolean | null | undefined>,
): Promise<T> {
  if (!isFpLoadingDebugEnabled()) {
    return work();
  }
  fpLoadingDbgMark(`${label}:start`, detail);
  const t0 = performance.now();
  try {
    const v = await work();
    fpLoadingDbgMark(`${label}:done`, {
      ...detail,
      elapsedMs: Math.round(performance.now() - t0),
    });
    return v;
  } catch (e) {
    fpLoadingDbgMark(`${label}:throw`, {
      ...detail,
      elapsedMs: Math.round(performance.now() - t0),
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** Synchronous block timing (heavy CPU on main thread — e.g. world parse). */
export function fpLoadingDbgTimedSync<T>(
  label: string,
  work: () => T,
  detail?: Record<string, number | string | boolean | null | undefined>,
): T {
  if (!isFpLoadingDebugEnabled()) {
    return work();
  }
  fpLoadingDbgMark(`${label}:start`, detail);
  const t0 = performance.now();
  try {
    const v = work();
    fpLoadingDbgMark(`${label}:done`, {
      ...detail,
      elapsedMs: Math.round(performance.now() - t0),
    });
    return v;
  } catch (e) {
    fpLoadingDbgMark(`${label}:throw`, {
      ...detail,
      elapsedMs: Math.round(performance.now() - t0),
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

function initAnchorsOnce(): void {
  if (sessionAnchorMs === 0) {
    sessionAnchorMs = performance.now();
    lastMarkMs = sessionAnchorMs;
  }
}

type GlobalCleanup = () => void;
let globalRefCount = 0;
let globalCleanup: GlobalCleanup | null = null;

/**
 * Install `longtask` observer + visibility gap logging once (ref-counted).
 * Call from provider mount; survives LoginGate-only UI.
 */
export function ensureFpLoadingDebugGlobalObservers(): GlobalCleanup {
  if (!isFpLoadingDebugEnabled()) {
    return () => {};
  }
  initAnchorsOnce();
  globalRefCount += 1;
  if (globalCleanup) {
    return () => {
      globalRefCount -= 1;
      if (globalRefCount <= 0 && globalCleanup) {
        globalCleanup();
        globalCleanup = null;
      }
    };
  }

  fpLoadingDbgMark("global_observers:install");

  let hiddenSinceMs = 0;
  let longTaskObs: PerformanceObserver | null = null;

  try {
    longTaskObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        // Single-line info avoids DevTools attaching a giant async stack (unlike console.warn objects).
        console.info(
          `${PREFIX} long_task_cpu durationMs=${Math.round(e.duration)} startTimeMs=${Math.round(e.startTime)} name=${e.name}`,
        );
      }
    });
    longTaskObs.observe({ type: "longtask", buffered: true });
  } catch {
    console.info(PREFIX, "long_task_cpu:unsupported (need Chromium PerformanceObserver)");
  }

  const onVisibility = (): void => {
    if (!isFpLoadingDebugEnabled()) return;
    if (document.visibilityState === "hidden") {
      hiddenSinceMs = performance.now();
      fpLoadingDbgMark("visibility:hidden");
      return;
    }
    const gapMs = hiddenSinceMs > 0 ? Math.round(performance.now() - hiddenSinceMs) : 0;
    fpLoadingDbgMark("visibility:visible", { hiddenGapMs: gapMs });
    hiddenSinceMs = 0;
  };
  document.addEventListener("visibilitychange", onVisibility);

  globalCleanup = () => {
    longTaskObs?.disconnect();
    longTaskObs = null;
    document.removeEventListener("visibilitychange", onVisibility);
    fpLoadingDbgMark("global_observers:teardown");
  };

  return () => {
    globalRefCount -= 1;
    if (globalRefCount <= 0 && globalCleanup) {
      globalCleanup();
      globalCleanup = null;
    }
  };
}

export function fpLoadingDbgCheckRafGap(
  prevFrameStartMs: number,
  frameStartMs: number,
): void {
  if (!isFpLoadingDebugEnabled()) return;
  initAnchorsOnce();
  const gapMs = Math.round(frameStartMs - prevFrameStartMs);
  if (gapMs < RAF_GAP_WARN_MS) return;
  const now = frameStartMs;
  const severe = gapMs >= RAF_GAP_SEVERE_MS;
  if (!severe && now - lastRafGapLogMonoMs < RAF_GAP_LOG_COOLDOWN_MS) return;
  lastRafGapLogMonoMs = now;
  const effFps = gapMs > 0 ? Math.round(1000 / gapMs) : 0;
  console.info(
    `${PREFIX} raf_frame_gap gapMs=${gapMs} effectiveFps~${effFps}${severe ? " (severe)" : ""}`,
  );
}
