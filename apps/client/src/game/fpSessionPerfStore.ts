/**
 * Lock-free, zero-GC frame-timing ring buffer for the FP session.
 *
 * Data is stored in typed arrays so no heap allocation occurs on the hot path.
 * Stats are computed on demand (only when the profiler panel is open) and are
 * intentionally not cached to avoid stale reads.
 */

// ---------------------------------------------------------------------------
// Ring buffer — 30 s at 60 fps = 1 800 slots
// ---------------------------------------------------------------------------

const RING = 1800;

/** Absolute timestamp of each sample (ms, Float64 for precision). */
const _ts = new Float64Array(RING);
/** Total frame time — wall-clock start to after renderer.render (ms). */
const _total = new Float32Array(RING);
/** Physics substep section (simulatePredictedPlayerStep). */
const _physics = new Float32Array(RING);
/** Elevator tick + hail UI section. */
const _elevator = new Float32Array(RING);
/** Presentation update section (PlayerPresentationManager.update). */
const _present = new Float32Array(RING);
/** Render section (syncBuildingFloorPlateVisibility + renderer.render). */
const _render = new Float32Array(RING);

/** Next write slot (wraps around RING). */
let _head = 0;
/** Total frames ever written (capped at RING for oldest/newest logic). */
let _wrote = 0;

// ---------------------------------------------------------------------------
// Public write API — called once per frame from mountFpSession
// ---------------------------------------------------------------------------

export type FpPerfSections = {
  physicsMs: number;
  elevatorMs: number;
  presentMs: number;
  renderMs: number;
};

/** Renderer counters read from renderer.info.render after each frame. */
export type FpRendererInfo = {
  drawCalls: number;
  triangles: number;
};

// Last renderer info — read by the UI; updated each frame.
let _lastDrawCalls = 0;
let _lastTriangles = 0;

export function getLastRendererInfo(): FpRendererInfo {
  return { drawCalls: _lastDrawCalls, triangles: _lastTriangles };
}

export function pushFpPerfFrame(
  nowMs: number,
  totalMs: number,
  sections: FpPerfSections,
  rendererInfo?: FpRendererInfo,
): void {
  if (rendererInfo) {
    _lastDrawCalls = rendererInfo.drawCalls;
    _lastTriangles = rendererInfo.triangles;
  }
  const i = _head;
  _ts[i] = nowMs;
  _total[i] = totalMs;
  _physics[i] = sections.physicsMs;
  _elevator[i] = sections.elevatorMs;
  _present[i] = sections.presentMs;
  _render[i] = sections.renderMs;
  _head = (_head + 1) % RING;
  _wrote += 1;
  _notifyIfNeeded(nowMs);
}

export function resetFpPerfStore(): void {
  _head = 0;
  _wrote = 0;
  _ts.fill(0);
  _total.fill(0);
  _physics.fill(0);
  _elevator.fill(0);
  _present.fill(0);
  _render.fill(0);
  _listeners.clear();
  _lastNotifyMs = 0;
}

// ---------------------------------------------------------------------------
// Subscriptions — throttled so React only re-renders at ~10 fps when open
// ---------------------------------------------------------------------------

const _listeners = new Set<() => void>();
let _lastNotifyMs = 0;
const NOTIFY_INTERVAL_MS = 100; // ~10 fps for profiler UI

function _notifyIfNeeded(nowMs: number): void {
  if (_listeners.size === 0) return;
  if (nowMs - _lastNotifyMs < NOTIFY_INTERVAL_MS) return;
  _lastNotifyMs = nowMs;
  for (const cb of _listeners) cb();
}

export function subscribeFpPerf(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Stats computation — zero-allocation inner loop, one temp sort array
// ---------------------------------------------------------------------------

/** Histogram bucket boundaries (ms): <4, 4-8, 8-16, 16-33, 33-50, >50. */
const HIST_EDGES = [4, 8, 16, 33, 50] as const;
const HIST_LABELS = ["<4ms", "4-8ms", "8-16ms", "16-33ms", "33-50ms", ">50ms"] as const;

export type FpPerfHistBucket = {
  label: string;
  count: number;
  /** 0–1 fraction of total samples. */
  frac: number;
};

export type FpPerfStats = {
  windowSec: number;
  /** Actual elapsed time covered by the samples (may be < windowSec early in session). */
  actualElapsedSec: number;
  samples: number;
  fps: number;
  frameMs: {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  sections: {
    physicsMs: number;
    elevatorMs: number;
    presentMs: number;
    renderMs: number;
    otherMs: number;
  };
  histogram: FpPerfHistBucket[];
};

/** Reused scratch buffer for percentile sorting — avoids allocation. */
let _sortBuf: Float32Array | null = null;

export function computeFpPerfStats(
  nowMs: number,
  windowSec: number,
): FpPerfStats | null {
  const count = Math.min(_wrote, RING);
  if (count === 0) return null;

  const cutoff = nowMs - windowSec * 1000;

  // Collect indices of samples within the window (ring order, oldest first).
  // We walk backwards from head-1 while timestamps are within the window,
  // then reverse to get oldest-first order for stable percentile computation.
  const indices: number[] = [];
  for (let k = 0; k < count; k++) {
    // Walk backwards from the slot just before head.
    const i = (_head - 1 - k + RING) % RING;
    if ((_ts[i] ?? 0) < cutoff) break;
    indices.push(i);
  }

  const n = indices.length;
  if (n === 0) return null;

  // Allocate / grow scratch buffer once.
  if (_sortBuf === null || _sortBuf.length < n) {
    _sortBuf = new Float32Array(Math.max(n, RING));
  }

  // Accumulate.
  let minMs = Infinity;
  let maxMs = -Infinity;
  let sumTotal = 0;
  let sumPhysics = 0;
  let sumElev = 0;
  let sumPresent = 0;
  let sumRender = 0;

  const hist = new Int32Array(6);

  for (let k = 0; k < n; k++) {
    const i = indices[k]!;
    const t = _total[i]!;
    _sortBuf[k] = t;
    if (t < minMs) minMs = t;
    if (t > maxMs) maxMs = t;
    sumTotal += t;
    sumPhysics += _physics[i]!;
    sumElev += _elevator[i]!;
    sumPresent += _present[i]!;
    sumRender += _render[i]!;

    // Histogram bucket.
    let b = 5;
    for (let e = 0; e < HIST_EDGES.length; e++) {
      if (t < HIST_EDGES[e]!) {
        b = e;
        break;
      }
    }
    hist[b] = (hist[b] ?? 0) + 1;
  }

  // Sort for percentiles (in-place on typed slice).
  const slice = _sortBuf.subarray(0, n);
  slice.sort();

  const p = (frac: number) => {
    const idx = Math.min(n - 1, Math.floor(frac * n));
    return Math.round(slice[idx]! * 10) / 10;
  };

  // Oldest/newest sample timestamps.
  const oldestTs = _ts[indices[indices.length - 1]!]!;
  const newestTs = _ts[indices[0]!]!;
  const actualElapsedSec = Math.max(0.001, (newestTs - oldestTs) / 1000);
  const fps = Math.round((n / actualElapsedSec) * 10) / 10;

  const avgTotal = sumTotal / n;
  const avgPhysics = sumPhysics / n;
  const avgElev = sumElev / n;
  const avgPresent = sumPresent / n;
  const avgRender = sumRender / n;
  const avgOther = Math.max(0, avgTotal - avgPhysics - avgElev - avgPresent - avgRender);

  const histogram: FpPerfHistBucket[] = HIST_LABELS.map((label, b) => ({
    label,
    count: hist[b]!,
    frac: n > 0 ? hist[b]! / n : 0,
  }));

  return {
    windowSec,
    actualElapsedSec,
    samples: n,
    fps,
    frameMs: {
      avg: Math.round(avgTotal * 10) / 10,
      min: Math.round(minMs * 10) / 10,
      max: Math.round(maxMs * 10) / 10,
      p50: p(0.5),
      p95: p(0.95),
      p99: p(0.99),
    },
    sections: {
      physicsMs: Math.round(avgPhysics * 100) / 100,
      elevatorMs: Math.round(avgElev * 100) / 100,
      presentMs: Math.round(avgPresent * 100) / 100,
      renderMs: Math.round(avgRender * 100) / 100,
      otherMs: Math.round(avgOther * 100) / 100,
    },
    histogram,
  };
}

// ---------------------------------------------------------------------------
// Clipboard export
// ---------------------------------------------------------------------------

function bar(frac: number, width = 24): string {
  const filled = Math.round(frac * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function secBar(ms: number, maxMs: number, width = 18): string {
  return bar(maxMs > 0 ? ms / maxMs : 0, width);
}

export function exportFpPerfReport(nowMs: number, windowSec: number): string {
  const s = computeFpPerfStats(nowMs, windowSec);
  if (!s) return "No profiler data available yet.";
  const ri = getLastRendererInfo();

  const { frameMs, sections, histogram } = s;
  const secMax = Math.max(
    sections.physicsMs,
    sections.elevatorMs,
    sections.presentMs,
    sections.renderMs,
    sections.otherMs,
  );

  const lines: string[] = [
    "=== The Mammoth — Performance Report ===",
    `Window: ${windowSec}s  Samples: ${s.samples}  Elapsed: ${s.actualElapsedSec.toFixed(1)}s`,
    `Renderer: ${ri.drawCalls} draw calls  ${(ri.triangles / 1000).toFixed(1)}k triangles`,
    "",
    `FPS    avg=${s.fps}  (${frameMs.min}ms best / ${frameMs.max}ms worst)`,
    `Frame  avg=${frameMs.avg}ms  p50=${frameMs.p50}ms  p95=${frameMs.p95}ms  p99=${frameMs.p99}ms`,
    "",
    "Section breakdown (avg ms/frame):",
    `  physics   ${sections.physicsMs.toFixed(2).padStart(6)}ms  ${secBar(sections.physicsMs, secMax)}`,
    `  elevator  ${sections.elevatorMs.toFixed(2).padStart(6)}ms  ${secBar(sections.elevatorMs, secMax)}`,
    `  present   ${sections.presentMs.toFixed(2).padStart(6)}ms  ${secBar(sections.presentMs, secMax)}`,
    `  render    ${sections.renderMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderMs, secMax)}`,
    `  other     ${sections.otherMs.toFixed(2).padStart(6)}ms  ${secBar(sections.otherMs, secMax)}`,
    "",
    "Frame-time histogram:",
    ...histogram.map(
      (b) =>
        `  ${b.label.padEnd(7)}  ${(b.frac * 100).toFixed(0).padStart(3)}%  ${bar(b.frac, 28)}  (${b.count})`,
    ),
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  return lines.join("\n");
}
