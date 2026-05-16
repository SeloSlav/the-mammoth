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
/** Render section wall time: floor visibility + fp environment + render setup + `renderer.render`. */
const _render = new Float32Array(RING);
/** Stairwell dark sample + elevator shaft visual culling (see {@link fpSessionMainRafFrame}). */
const _renderFloorVis = new Float32Array(RING);
/** Whole {@link FpSessionEnvironmentHandle.onFrame} wall time. */
const _renderFpEnv = new Float32Array(RING);
/** Sky/cloud update subset of {@link _renderFpEnv}. */
const _renderFpEnvSky = new Float32Array(RING);
/** Lighting/exposure update subset of {@link _renderFpEnv}. */
const _renderFpEnvLighting = new Float32Array(RING);
/** CPU render setup between env updates and raw `renderer.render` (mirror sync, `renderer.info.reset`, etc). */
const _renderSetup = new Float32Array(RING);
/** `renderer.render` — WebGPU record/submit and usually the main thread wait for GPU. */
const _renderThree = new Float32Array(RING);
/** GPU timer resolve for main render passes (ms), when `trackTimestamp` is enabled; `-1` = no sample. */
const _renderThreeGpu = new Float32Array(RING);
/** Visible top-level floor plate groups (current frame snapshot). */
const _visibleFloorPlates = new Float32Array(RING);
/** Visible meshes tagged `mammothUnitInterior` (includes apartment props). */
const _visibleUnitInteriorMeshes = new Float32Array(RING);
/** Visible apartment prop meshes (`mammothApartmentFurnitureProp` subset). */
const _visibleApartmentPropMeshes = new Float32Array(RING);
/** Visible transparent / alpha-tested building meshes. */
const _visibleTransparentMeshes = new Float32Array(RING);
/** Visible exterior tree roots. */
const _visibleExteriorTreeRoots = new Float32Array(RING);
/** Frustum-intersected top-level floor plate groups. */
const _frustumFloorPlates = new Float32Array(RING);
/** Frustum-intersected meshes tagged `mammothUnitInterior`. */
const _frustumUnitInteriorMeshes = new Float32Array(RING);
/** Frustum-intersected apartment prop meshes (`mammothApartmentFurnitureProp` subset). */
const _frustumApartmentPropMeshes = new Float32Array(RING);
/** Frustum-intersected transparent / alpha-tested building meshes. */
const _frustumTransparentMeshes = new Float32Array(RING);
/** Frustum-intersected exterior tree roots. */
const _frustumExteriorTreeRoots = new Float32Array(RING);

/** Next write slot (wraps around RING). */
let _head = 0;
/** Total frames ever written (capped at RING for oldest/newest logic). */
let _wrote = 0;

/** Filled when {@link deliverFpSessionGpuRenderMs} runs (async after `resolveTimestampsAsync`). */
let _pendingGpuRenderMsForNextSample: number | null = null;

// ---------------------------------------------------------------------------
// Public write API — called once per frame from mountFpSession
// ---------------------------------------------------------------------------

export type FpPerfSections = {
  physicsMs: number;
  elevatorMs: number;
  /**
   * `_t_elevEnd` → end of {@link PlayerPresentationManager.update}: rig/camera/audio, building
   * floor-plate + furniture visibility, remote snapshots, presentation. Pickup HUD runs after this
   * (counted in {@link renderMs}).
   */
  presentMs: number;
  renderMs: number;
  /**
   * Split of {@link renderMs}. `renderFloorPlateVisMs` + `renderFpEnvironmentMs` + `renderSetupMs` +
   * `renderThreeMs` should match `renderMs` modulo small `performance.now()` measurement noise.
   * Stairwell dark target + smoothing and elevator shaft visual culling happen before
   * `fpEnvironment.onFrame`.
   */
  renderFloorPlateVisMs: number;
  renderFpEnvironmentMs: number;
  renderFpEnvironmentSkyMs: number;
  renderFpEnvironmentLightingMs: number;
  renderSetupMs: number;
  renderThreeMs: number;
};

/** Renderer counters read from renderer.info.render after each frame. */
export type FpRendererInfo = {
  drawCalls: number;
  triangles: number;
  visibleFloorPlates: number;
  visibleUnitInteriorMeshes: number;
  visibleApartmentPropMeshes: number;
  visibleTransparentMeshes: number;
  visibleExteriorTreeRoots: number;
  frustumFloorPlates: number;
  frustumUnitInteriorMeshes: number;
  frustumApartmentPropMeshes: number;
  frustumTransparentMeshes: number;
  frustumExteriorTreeRoots: number;
};

// Last renderer info — read by the UI; updated each frame.
let _lastDrawCalls = 0;
let _lastTriangles = 0;
let _lastVisibleFloorPlates = 0;
let _lastVisibleUnitInteriorMeshes = 0;
let _lastVisibleApartmentPropMeshes = 0;
let _lastVisibleTransparentMeshes = 0;
let _lastVisibleExteriorTreeRoots = 0;
let _lastFrustumFloorPlates = 0;
let _lastFrustumUnitInteriorMeshes = 0;
let _lastFrustumApartmentPropMeshes = 0;
let _lastFrustumTransparentMeshes = 0;
let _lastFrustumExteriorTreeRoots = 0;

export function getLastRendererInfo(): FpRendererInfo {
  return {
    drawCalls: _lastDrawCalls,
    triangles: _lastTriangles,
    visibleFloorPlates: _lastVisibleFloorPlates,
    visibleUnitInteriorMeshes: _lastVisibleUnitInteriorMeshes,
    visibleApartmentPropMeshes: _lastVisibleApartmentPropMeshes,
    visibleTransparentMeshes: _lastVisibleTransparentMeshes,
    visibleExteriorTreeRoots: _lastVisibleExteriorTreeRoots,
    frustumFloorPlates: _lastFrustumFloorPlates,
    frustumUnitInteriorMeshes: _lastFrustumUnitInteriorMeshes,
    frustumApartmentPropMeshes: _lastFrustumApartmentPropMeshes,
    frustumTransparentMeshes: _lastFrustumTransparentMeshes,
    frustumExteriorTreeRoots: _lastFrustumExteriorTreeRoots,
  };
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
    _lastVisibleFloorPlates = rendererInfo.visibleFloorPlates;
    _lastVisibleUnitInteriorMeshes = rendererInfo.visibleUnitInteriorMeshes;
    _lastVisibleApartmentPropMeshes = rendererInfo.visibleApartmentPropMeshes;
    _lastVisibleTransparentMeshes = rendererInfo.visibleTransparentMeshes;
    _lastVisibleExteriorTreeRoots = rendererInfo.visibleExteriorTreeRoots;
    _lastFrustumFloorPlates = rendererInfo.frustumFloorPlates;
    _lastFrustumUnitInteriorMeshes = rendererInfo.frustumUnitInteriorMeshes;
    _lastFrustumApartmentPropMeshes = rendererInfo.frustumApartmentPropMeshes;
    _lastFrustumTransparentMeshes = rendererInfo.frustumTransparentMeshes;
    _lastFrustumExteriorTreeRoots = rendererInfo.frustumExteriorTreeRoots;
  }
  const i = _head;
  _ts[i] = nowMs;
  _total[i] = totalMs;
  _physics[i] = sections.physicsMs;
  _elevator[i] = sections.elevatorMs;
  _present[i] = sections.presentMs;
  _render[i] = sections.renderMs;
  _renderFloorVis[i] = sections.renderFloorPlateVisMs;
  _renderFpEnv[i] = sections.renderFpEnvironmentMs;
  _renderFpEnvSky[i] = sections.renderFpEnvironmentSkyMs;
  _renderFpEnvLighting[i] = sections.renderFpEnvironmentLightingMs;
  _renderSetup[i] = sections.renderSetupMs;
  _renderThree[i] = sections.renderThreeMs;
  _visibleFloorPlates[i] = rendererInfo?.visibleFloorPlates ?? 0;
  _visibleUnitInteriorMeshes[i] = rendererInfo?.visibleUnitInteriorMeshes ?? 0;
  _visibleApartmentPropMeshes[i] = rendererInfo?.visibleApartmentPropMeshes ?? 0;
  _visibleTransparentMeshes[i] = rendererInfo?.visibleTransparentMeshes ?? 0;
  _visibleExteriorTreeRoots[i] = rendererInfo?.visibleExteriorTreeRoots ?? 0;
  _frustumFloorPlates[i] = rendererInfo?.frustumFloorPlates ?? 0;
  _frustumUnitInteriorMeshes[i] = rendererInfo?.frustumUnitInteriorMeshes ?? 0;
  _frustumApartmentPropMeshes[i] = rendererInfo?.frustumApartmentPropMeshes ?? 0;
  _frustumTransparentMeshes[i] = rendererInfo?.frustumTransparentMeshes ?? 0;
  _frustumExteriorTreeRoots[i] = rendererInfo?.frustumExteriorTreeRoots ?? 0;
  const g = _pendingGpuRenderMsForNextSample;
  _pendingGpuRenderMsForNextSample = null;
  _renderThreeGpu[i] = g != null ? g : -1;
  _head = (_head + 1) % RING;
  _wrote += 1;
  _notifyIfNeeded(nowMs);
}

/**
 * Called when `resolveTimestampsAsync` completes (typically 1–2 frames after the render).
 * The value is attached to the **next** {@link pushFpPerfFrame} sample.
 */
export function deliverFpSessionGpuRenderMs(ms: number | undefined): void {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return;
  _pendingGpuRenderMsForNextSample = ms;
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
  _renderFloorVis.fill(0);
  _renderFpEnv.fill(0);
  _renderFpEnvSky.fill(0);
  _renderFpEnvLighting.fill(0);
  _renderSetup.fill(0);
  _renderThree.fill(0);
  _renderThreeGpu.fill(-1);
  _visibleFloorPlates.fill(0);
  _visibleUnitInteriorMeshes.fill(0);
  _visibleApartmentPropMeshes.fill(0);
  _visibleTransparentMeshes.fill(0);
  _visibleExteriorTreeRoots.fill(0);
  _frustumFloorPlates.fill(0);
  _frustumUnitInteriorMeshes.fill(0);
  _frustumApartmentPropMeshes.fill(0);
  _frustumTransparentMeshes.fill(0);
  _frustumExteriorTreeRoots.fill(0);
  _pendingGpuRenderMsForNextSample = null;
  _listeners.clear();
  _lastNotifyMs = 0;
  _lastDrawCalls = 0;
  _lastTriangles = 0;
  _lastVisibleFloorPlates = 0;
  _lastVisibleUnitInteriorMeshes = 0;
  _lastVisibleApartmentPropMeshes = 0;
  _lastVisibleTransparentMeshes = 0;
  _lastVisibleExteriorTreeRoots = 0;
  _lastFrustumFloorPlates = 0;
  _lastFrustumUnitInteriorMeshes = 0;
  _lastFrustumApartmentPropMeshes = 0;
  _lastFrustumTransparentMeshes = 0;
  _lastFrustumExteriorTreeRoots = 0;
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
  /**
   * ~`1000 / mean(totalFrameCpuMs)` for samples in-window — aligns with avg frame-ms when the RAF loop
   * is consistent. Previously this was `(samples / wallClock)` (= profiler ring occupancy rate).
   */
  fps: number;
  /** Profiler ring writes per wall-clock second (`samples / actualElapsedSec`) — diagnostics only. */
  profilerRingSampleHz: number;
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
    renderFloorPlateVisMs: number;
    renderFpEnvironmentMs: number;
    renderFpEnvironmentSkyMs: number;
    renderFpEnvironmentLightingMs: number;
    renderSetupMs: number;
    renderThreeMs: number;
    /** Hardware GPU time for render pass batch when timestamp queries work; `null` if unsupported or no samples. */
    renderThreeGpuMs: number | null;
  };
  sceneCounts: {
    visibleFloorPlates: number;
    visibleUnitInteriorMeshes: number;
    visibleApartmentPropMeshes: number;
    visibleTransparentMeshes: number;
    visibleExteriorTreeRoots: number;
    frustumFloorPlates: number;
    frustumUnitInteriorMeshes: number;
    frustumApartmentPropMeshes: number;
    frustumTransparentMeshes: number;
    frustumExteriorTreeRoots: number;
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
  let sumRenderFloorVis = 0;
  let sumRenderFpEnv = 0;
  let sumRenderFpEnvSky = 0;
  let sumRenderFpEnvLighting = 0;
  let sumRenderSetup = 0;
  let sumRenderThree = 0;
  let sumRenderThreeGpu = 0;
  let gpuSamples = 0;
  let sumVisibleFloorPlates = 0;
  let sumVisibleUnitInteriorMeshes = 0;
  let sumVisibleApartmentPropMeshes = 0;
  let sumVisibleTransparentMeshes = 0;
  let sumVisibleExteriorTreeRoots = 0;
  let sumFrustumFloorPlates = 0;
  let sumFrustumUnitInteriorMeshes = 0;
  let sumFrustumApartmentPropMeshes = 0;
  let sumFrustumTransparentMeshes = 0;
  let sumFrustumExteriorTreeRoots = 0;

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
    sumRenderFloorVis += _renderFloorVis[i]!;
    sumRenderFpEnv += _renderFpEnv[i]!;
    sumRenderFpEnvSky += _renderFpEnvSky[i]!;
    sumRenderFpEnvLighting += _renderFpEnvLighting[i]!;
    sumRenderSetup += _renderSetup[i]!;
    sumRenderThree += _renderThree[i]!;
    sumVisibleFloorPlates += _visibleFloorPlates[i]!;
    sumVisibleUnitInteriorMeshes += _visibleUnitInteriorMeshes[i]!;
    sumVisibleApartmentPropMeshes += _visibleApartmentPropMeshes[i]!;
    sumVisibleTransparentMeshes += _visibleTransparentMeshes[i]!;
    sumVisibleExteriorTreeRoots += _visibleExteriorTreeRoots[i]!;
    sumFrustumFloorPlates += _frustumFloorPlates[i]!;
    sumFrustumUnitInteriorMeshes += _frustumUnitInteriorMeshes[i]!;
    sumFrustumApartmentPropMeshes += _frustumApartmentPropMeshes[i]!;
    sumFrustumTransparentMeshes += _frustumTransparentMeshes[i]!;
    sumFrustumExteriorTreeRoots += _frustumExteriorTreeRoots[i]!;
    const tg = _renderThreeGpu[i]!;
    if (tg >= 0) {
      sumRenderThreeGpu += tg;
      gpuSamples += 1;
    }

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
  const profilerRingSampleHz =
    actualElapsedSec > 0 ? Math.round((n / actualElapsedSec) * 10) / 10 : 0;

  const avgTotal = sumTotal / n;
  const fps =
    avgTotal >= 1e-6
      ? Math.min(9999, Math.round((1000 / avgTotal) * 10) / 10)
      : 0;
  const avgPhysics = sumPhysics / n;
  const avgElev = sumElev / n;
  const avgPresent = sumPresent / n;
  const avgRender = sumRender / n;
  const avgRenderFloorVis = sumRenderFloorVis / n;
  const avgRenderFpEnv = sumRenderFpEnv / n;
  const avgRenderFpEnvSky = sumRenderFpEnvSky / n;
  const avgRenderFpEnvLighting = sumRenderFpEnvLighting / n;
  const avgRenderSetup = sumRenderSetup / n;
  const avgRenderThree = sumRenderThree / n;
  const avgVisibleFloorPlates = sumVisibleFloorPlates / n;
  const avgVisibleUnitInteriorMeshes = sumVisibleUnitInteriorMeshes / n;
  const avgVisibleApartmentPropMeshes = sumVisibleApartmentPropMeshes / n;
  const avgVisibleTransparentMeshes = sumVisibleTransparentMeshes / n;
  const avgVisibleExteriorTreeRoots = sumVisibleExteriorTreeRoots / n;
  const avgFrustumFloorPlates = sumFrustumFloorPlates / n;
  const avgFrustumUnitInteriorMeshes = sumFrustumUnitInteriorMeshes / n;
  const avgFrustumApartmentPropMeshes = sumFrustumApartmentPropMeshes / n;
  const avgFrustumTransparentMeshes = sumFrustumTransparentMeshes / n;
  const avgFrustumExteriorTreeRoots = sumFrustumExteriorTreeRoots / n;
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
    profilerRingSampleHz,
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
      renderFloorPlateVisMs: Math.round(avgRenderFloorVis * 100) / 100,
      renderFpEnvironmentMs: Math.round(avgRenderFpEnv * 100) / 100,
      renderFpEnvironmentSkyMs: Math.round(avgRenderFpEnvSky * 100) / 100,
      renderFpEnvironmentLightingMs: Math.round(avgRenderFpEnvLighting * 100) / 100,
      renderSetupMs: Math.round(avgRenderSetup * 100) / 100,
      renderThreeMs: Math.round(avgRenderThree * 100) / 100,
      renderThreeGpuMs:
        gpuSamples > 0 ? Math.round((sumRenderThreeGpu / gpuSamples) * 100) / 100 : null,
    },
    sceneCounts: {
      visibleFloorPlates: Math.round(avgVisibleFloorPlates * 10) / 10,
      visibleUnitInteriorMeshes: Math.round(avgVisibleUnitInteriorMeshes * 10) / 10,
      visibleApartmentPropMeshes: Math.round(avgVisibleApartmentPropMeshes * 10) / 10,
      visibleTransparentMeshes: Math.round(avgVisibleTransparentMeshes * 10) / 10,
      visibleExteriorTreeRoots: Math.round(avgVisibleExteriorTreeRoots * 10) / 10,
      frustumFloorPlates: Math.round(avgFrustumFloorPlates * 10) / 10,
      frustumUnitInteriorMeshes: Math.round(avgFrustumUnitInteriorMeshes * 10) / 10,
      frustumApartmentPropMeshes: Math.round(avgFrustumApartmentPropMeshes * 10) / 10,
      frustumTransparentMeshes: Math.round(avgFrustumTransparentMeshes * 10) / 10,
      frustumExteriorTreeRoots: Math.round(avgFrustumExteriorTreeRoots * 10) / 10,
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

  const { frameMs, sections, sceneCounts, histogram } = s;
  const secMax = Math.max(
    sections.physicsMs,
    sections.elevatorMs,
    sections.presentMs,
    sections.renderMs,
    sections.otherMs,
    sections.renderFloorPlateVisMs,
    sections.renderFpEnvironmentMs,
    sections.renderFpEnvironmentSkyMs,
    sections.renderFpEnvironmentLightingMs,
    sections.renderSetupMs,
    sections.renderThreeMs,
    sections.renderThreeGpuMs ?? 0,
  );

  const lines: string[] = [
    "=== The Mammoth — Performance Report ===",
    `Window: ${windowSec}s  Samples: ${s.samples}  Elapsed: ${s.actualElapsedSec.toFixed(1)}s`,
    `Renderer: ${ri.drawCalls} draw calls  ${(ri.triangles / 1000).toFixed(1)}k triangles`,
    `Scene   vis: plates=${ri.visibleFloorPlates}  unitInterior=${ri.visibleUnitInteriorMeshes}  props=${ri.visibleApartmentPropMeshes}  transparent=${ri.visibleTransparentMeshes}  trees=${ri.visibleExteriorTreeRoots}`,
    `        fr:  plates=${ri.frustumFloorPlates}  unitInterior=${ri.frustumUnitInteriorMeshes}  props=${ri.frustumApartmentPropMeshes}  transparent=${ri.frustumTransparentMeshes}  trees=${ri.frustumExteriorTreeRoots}`,
    "",
    `FPS   ~${s.fps} (from avg frame cpu)    profiler samples/s=${s.profilerRingSampleHz}  (${frameMs.min}ms best / ${frameMs.max}ms worst)`,
    `Frame  avg=${frameMs.avg}ms  p50=${frameMs.p50}ms  p95=${frameMs.p95}ms  p99=${frameMs.p99}ms`,
    "",
    "Section breakdown (avg ms/frame):",
    `  physics   ${sections.physicsMs.toFixed(2).padStart(6)}ms  ${secBar(sections.physicsMs, secMax)}`,
    `  elevator  ${sections.elevatorMs.toFixed(2).padStart(6)}ms  ${secBar(sections.elevatorMs, secMax)}`,
    `  present   ${sections.presentMs.toFixed(2).padStart(6)}ms  ${secBar(sections.presentMs, secMax)}`,
    `  render    ${sections.renderMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderMs, secMax)}`,
    `    preEnv   ${sections.renderFloorPlateVisMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderFloorPlateVisMs, secMax)}`,
    `    fpEnv    ${sections.renderFpEnvironmentMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderFpEnvironmentMs, secMax)}`,
    `      sky     ${sections.renderFpEnvironmentSkyMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderFpEnvironmentSkyMs, secMax)}`,
    `      light   ${sections.renderFpEnvironmentLightingMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderFpEnvironmentLightingMs, secMax)}`,
    `    setup    ${sections.renderSetupMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderSetupMs, secMax)}`,
    `    three.js ${sections.renderThreeMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderThreeMs, secMax)}`,
    sections.renderThreeGpuMs != null
      ? `    GPU hw  ${sections.renderThreeGpuMs.toFixed(2).padStart(6)}ms  ${secBar(sections.renderThreeGpuMs, secMax)}`
      : `    GPU hw     n/a  (enable timestamp-query + trackTimestamp)`,
    `  other     ${sections.otherMs.toFixed(2).padStart(6)}ms  ${secBar(sections.otherMs, secMax)}`,
    "",
    "Scene content (avg / frame):",
    `  floorPlates    vis ${sceneCounts.visibleFloorPlates.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumFloorPlates.toFixed(1).padStart(6)}`,
    `  unitInterior   vis ${sceneCounts.visibleUnitInteriorMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumUnitInteriorMeshes.toFixed(1).padStart(6)}`,
    `  apartmentProps vis ${sceneCounts.visibleApartmentPropMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumApartmentPropMeshes.toFixed(1).padStart(6)}`,
    `  transparent    vis ${sceneCounts.visibleTransparentMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumTransparentMeshes.toFixed(1).padStart(6)}`,
    `  exteriorTrees  vis ${sceneCounts.visibleExteriorTreeRoots.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumExteriorTreeRoots.toFixed(1).padStart(6)}`,
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
