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
/** Visible apartment decor prop meshes (`mammothApartmentDecorProp` subset). */
const _visibleApartmentPropMeshes = new Float32Array(RING);
/** Visible unit-interior meshes owned by a `unit_*` shell id. */
const _visibleResidentialShellMeshes = new Float32Array(RING);
/** Visible unit-interior meshes with no resolved apartment/unit ownership tags. */
const _visibleAnonymousInteriorMeshes = new Float32Array(RING);
/** Visible unit-interior meshes marked generic-in-residential. */
const _visibleGenericInteriorMeshes = new Float32Array(RING);
/** Visible unit-interior meshes tagged as residential exterior glass. */
const _visibleExteriorGlassMeshes = new Float32Array(RING);
/** Visible transparent / alpha-tested building meshes. */
const _visibleTransparentMeshes = new Float32Array(RING);
/** Visible transparent meshes tagged as residential exterior glass. */
const _visibleTransparentExteriorGlassMeshes = new Float32Array(RING);
/** Frustum-intersected top-level floor plate groups. */
const _frustumFloorPlates = new Float32Array(RING);
/** Frustum-intersected meshes tagged `mammothUnitInterior`. */
const _frustumUnitInteriorMeshes = new Float32Array(RING);
/** Frustum-intersected apartment decor prop meshes (`mammothApartmentDecorProp` subset). */
const _frustumApartmentPropMeshes = new Float32Array(RING);
/** Frustum-intersected unit-interior meshes owned by a `unit_*` shell id. */
const _frustumResidentialShellMeshes = new Float32Array(RING);
/** Frustum-intersected unit-interior meshes with no resolved apartment/unit ownership tags. */
const _frustumAnonymousInteriorMeshes = new Float32Array(RING);
/** Frustum-intersected unit-interior meshes marked generic-in-residential. */
const _frustumGenericInteriorMeshes = new Float32Array(RING);
/** Frustum-intersected unit-interior meshes tagged as residential exterior glass. */
const _frustumExteriorGlassMeshes = new Float32Array(RING);
/** Frustum-intersected transparent / alpha-tested building meshes. */
const _frustumTransparentMeshes = new Float32Array(RING);
/** Frustum-intersected transparent meshes tagged as residential exterior glass. */
const _frustumTransparentExteriorGlassMeshes = new Float32Array(RING);
/** Draw calls after each frame (`renderer.info.render.calls`). */
const _drawCalls = new Float32Array(RING);
/** Submitted triangles after each frame (`renderer.info.render.triangles`). */
const _triangles = new Float32Array(RING);
/** Camera yaw (rad); `NaN` when not sampled. */
const _cameraYawRad = new Float32Array(RING);

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
  visibleResidentialShellMeshes: number;
  visibleAnonymousInteriorMeshes: number;
  visibleGenericInteriorMeshes: number;
  visibleExteriorGlassMeshes: number;
  visibleTransparentMeshes: number;
  visibleTransparentExteriorGlassMeshes: number;
  frustumFloorPlates: number;
  frustumUnitInteriorMeshes: number;
  frustumApartmentPropMeshes: number;
  frustumResidentialShellMeshes: number;
  frustumAnonymousInteriorMeshes: number;
  frustumGenericInteriorMeshes: number;
  frustumExteriorGlassMeshes: number;
  frustumTransparentMeshes: number;
  frustumTransparentExteriorGlassMeshes: number;
};

export type FpPerfHeavyMeshRecord = {
  tMs: number;
  frameTriangles: number;
  frameMs: number;
  cameraYawRad: number | null;
  meshTriangles: number;
  label: string;
  kind: string;
  unitKey: string | null;
  placedObjectId: string | null;
  materialName: string | null;
  geometryName: string | null;
  frustumCulled: boolean;
};

// Last renderer info — read by the UI; updated each frame.
let _lastDrawCalls = 0;
let _lastTriangles = 0;
let _lastVisibleFloorPlates = 0;
let _lastVisibleUnitInteriorMeshes = 0;
let _lastVisibleApartmentPropMeshes = 0;
let _lastVisibleResidentialShellMeshes = 0;
let _lastVisibleAnonymousInteriorMeshes = 0;
let _lastVisibleGenericInteriorMeshes = 0;
let _lastVisibleExteriorGlassMeshes = 0;
let _lastVisibleTransparentMeshes = 0;
let _lastVisibleTransparentExteriorGlassMeshes = 0;
let _lastFrustumFloorPlates = 0;
let _lastFrustumUnitInteriorMeshes = 0;
let _lastFrustumApartmentPropMeshes = 0;
let _lastFrustumResidentialShellMeshes = 0;
let _lastFrustumAnonymousInteriorMeshes = 0;
let _lastFrustumGenericInteriorMeshes = 0;
let _lastFrustumExteriorGlassMeshes = 0;
let _lastFrustumTransparentMeshes = 0;
let _lastFrustumTransparentExteriorGlassMeshes = 0;

const HEAVY_MESH_RECORD_LIMIT = 768;
const _heavyMeshRecords: FpPerfHeavyMeshRecord[] = [];

export function getLastRendererInfo(): FpRendererInfo {
  return {
    drawCalls: _lastDrawCalls,
    triangles: _lastTriangles,
    visibleFloorPlates: _lastVisibleFloorPlates,
    visibleUnitInteriorMeshes: _lastVisibleUnitInteriorMeshes,
    visibleApartmentPropMeshes: _lastVisibleApartmentPropMeshes,
    visibleResidentialShellMeshes: _lastVisibleResidentialShellMeshes,
    visibleAnonymousInteriorMeshes: _lastVisibleAnonymousInteriorMeshes,
    visibleGenericInteriorMeshes: _lastVisibleGenericInteriorMeshes,
    visibleExteriorGlassMeshes: _lastVisibleExteriorGlassMeshes,
    visibleTransparentMeshes: _lastVisibleTransparentMeshes,
    visibleTransparentExteriorGlassMeshes: _lastVisibleTransparentExteriorGlassMeshes,
    frustumFloorPlates: _lastFrustumFloorPlates,
    frustumUnitInteriorMeshes: _lastFrustumUnitInteriorMeshes,
    frustumApartmentPropMeshes: _lastFrustumApartmentPropMeshes,
    frustumResidentialShellMeshes: _lastFrustumResidentialShellMeshes,
    frustumAnonymousInteriorMeshes: _lastFrustumAnonymousInteriorMeshes,
    frustumGenericInteriorMeshes: _lastFrustumGenericInteriorMeshes,
    frustumExteriorGlassMeshes: _lastFrustumExteriorGlassMeshes,
    frustumTransparentMeshes: _lastFrustumTransparentMeshes,
    frustumTransparentExteriorGlassMeshes: _lastFrustumTransparentExteriorGlassMeshes,
  };
}

export function pushFpPerfFrame(
  nowMs: number,
  totalMs: number,
  sections: FpPerfSections,
  rendererInfo?: FpRendererInfo,
  cameraYawRad?: number | null,
): void {
  if (rendererInfo) {
    _lastDrawCalls = rendererInfo.drawCalls;
    _lastTriangles = rendererInfo.triangles;
    _lastVisibleFloorPlates = rendererInfo.visibleFloorPlates;
    _lastVisibleUnitInteriorMeshes = rendererInfo.visibleUnitInteriorMeshes;
    _lastVisibleApartmentPropMeshes = rendererInfo.visibleApartmentPropMeshes;
    _lastVisibleResidentialShellMeshes = rendererInfo.visibleResidentialShellMeshes;
    _lastVisibleAnonymousInteriorMeshes = rendererInfo.visibleAnonymousInteriorMeshes;
    _lastVisibleGenericInteriorMeshes = rendererInfo.visibleGenericInteriorMeshes;
    _lastVisibleExteriorGlassMeshes = rendererInfo.visibleExteriorGlassMeshes;
    _lastVisibleTransparentMeshes = rendererInfo.visibleTransparentMeshes;
    _lastVisibleTransparentExteriorGlassMeshes = rendererInfo.visibleTransparentExteriorGlassMeshes;
    _lastFrustumFloorPlates = rendererInfo.frustumFloorPlates;
    _lastFrustumUnitInteriorMeshes = rendererInfo.frustumUnitInteriorMeshes;
    _lastFrustumApartmentPropMeshes = rendererInfo.frustumApartmentPropMeshes;
    _lastFrustumResidentialShellMeshes = rendererInfo.frustumResidentialShellMeshes;
    _lastFrustumAnonymousInteriorMeshes = rendererInfo.frustumAnonymousInteriorMeshes;
    _lastFrustumGenericInteriorMeshes = rendererInfo.frustumGenericInteriorMeshes;
    _lastFrustumExteriorGlassMeshes = rendererInfo.frustumExteriorGlassMeshes;
    _lastFrustumTransparentMeshes = rendererInfo.frustumTransparentMeshes;
    _lastFrustumTransparentExteriorGlassMeshes =
      rendererInfo.frustumTransparentExteriorGlassMeshes;
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
  _visibleResidentialShellMeshes[i] = rendererInfo?.visibleResidentialShellMeshes ?? 0;
  _visibleAnonymousInteriorMeshes[i] = rendererInfo?.visibleAnonymousInteriorMeshes ?? 0;
  _visibleGenericInteriorMeshes[i] = rendererInfo?.visibleGenericInteriorMeshes ?? 0;
  _visibleExteriorGlassMeshes[i] = rendererInfo?.visibleExteriorGlassMeshes ?? 0;
  _visibleTransparentMeshes[i] = rendererInfo?.visibleTransparentMeshes ?? 0;
  _visibleTransparentExteriorGlassMeshes[i] =
    rendererInfo?.visibleTransparentExteriorGlassMeshes ?? 0;
  _frustumFloorPlates[i] = rendererInfo?.frustumFloorPlates ?? 0;
  _frustumUnitInteriorMeshes[i] = rendererInfo?.frustumUnitInteriorMeshes ?? 0;
  _frustumApartmentPropMeshes[i] = rendererInfo?.frustumApartmentPropMeshes ?? 0;
  _frustumResidentialShellMeshes[i] = rendererInfo?.frustumResidentialShellMeshes ?? 0;
  _frustumAnonymousInteriorMeshes[i] = rendererInfo?.frustumAnonymousInteriorMeshes ?? 0;
  _frustumGenericInteriorMeshes[i] = rendererInfo?.frustumGenericInteriorMeshes ?? 0;
  _frustumExteriorGlassMeshes[i] = rendererInfo?.frustumExteriorGlassMeshes ?? 0;
  _frustumTransparentMeshes[i] = rendererInfo?.frustumTransparentMeshes ?? 0;
  _frustumTransparentExteriorGlassMeshes[i] =
    rendererInfo?.frustumTransparentExteriorGlassMeshes ?? 0;
  _drawCalls[i] = rendererInfo?.drawCalls ?? 0;
  _triangles[i] = rendererInfo?.triangles ?? 0;
  _cameraYawRad[i] =
    typeof cameraYawRad === "number" && Number.isFinite(cameraYawRad) ? cameraYawRad : Number.NaN;
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

export function recordFpPerfHeavyMeshes(records: readonly FpPerfHeavyMeshRecord[]): void {
  if (records.length === 0) return;
  for (const record of records) {
    _heavyMeshRecords.push(record);
  }
  if (_heavyMeshRecords.length > HEAVY_MESH_RECORD_LIMIT) {
    _heavyMeshRecords.splice(0, _heavyMeshRecords.length - HEAVY_MESH_RECORD_LIMIT);
  }
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
  _visibleResidentialShellMeshes.fill(0);
  _visibleAnonymousInteriorMeshes.fill(0);
  _visibleGenericInteriorMeshes.fill(0);
  _visibleExteriorGlassMeshes.fill(0);
  _visibleTransparentMeshes.fill(0);
  _visibleTransparentExteriorGlassMeshes.fill(0);
  _frustumFloorPlates.fill(0);
  _frustumUnitInteriorMeshes.fill(0);
  _frustumApartmentPropMeshes.fill(0);
  _frustumResidentialShellMeshes.fill(0);
  _frustumAnonymousInteriorMeshes.fill(0);
  _frustumGenericInteriorMeshes.fill(0);
  _frustumExteriorGlassMeshes.fill(0);
  _frustumTransparentMeshes.fill(0);
  _frustumTransparentExteriorGlassMeshes.fill(0);
  _drawCalls.fill(0);
  _triangles.fill(0);
  _cameraYawRad.fill(Number.NaN);
  _pendingGpuRenderMsForNextSample = null;
  _listeners.clear();
  _lastNotifyMs = 0;
  _lastDrawCalls = 0;
  _lastTriangles = 0;
  _lastVisibleFloorPlates = 0;
  _lastVisibleUnitInteriorMeshes = 0;
  _lastVisibleApartmentPropMeshes = 0;
  _lastVisibleResidentialShellMeshes = 0;
  _lastVisibleAnonymousInteriorMeshes = 0;
  _lastVisibleGenericInteriorMeshes = 0;
  _lastVisibleExteriorGlassMeshes = 0;
  _lastVisibleTransparentMeshes = 0;
  _lastVisibleTransparentExteriorGlassMeshes = 0;
  _lastFrustumFloorPlates = 0;
  _lastFrustumUnitInteriorMeshes = 0;
  _lastFrustumApartmentPropMeshes = 0;
  _lastFrustumResidentialShellMeshes = 0;
  _lastFrustumAnonymousInteriorMeshes = 0;
  _lastFrustumGenericInteriorMeshes = 0;
  _lastFrustumExteriorGlassMeshes = 0;
  _lastFrustumTransparentMeshes = 0;
  _lastFrustumTransparentExteriorGlassMeshes = 0;
  _heavyMeshRecords.length = 0;
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
  /** Approximate real frame cadence from completed samples in-window (`samples / wallClock`). */
  fps: number;
  /**
   * CPU throughput estimate from `1000 / mean(totalFrameCpuMs)`. Useful to distinguish "game logic is
   * cheap" from "frames are actually being presented smoothly".
   */
  cpuFrameThroughputFps: number;
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
    visibleResidentialShellMeshes: number;
    visibleAnonymousInteriorMeshes: number;
    visibleGenericInteriorMeshes: number;
    visibleExteriorGlassMeshes: number;
    visibleTransparentMeshes: number;
    visibleTransparentExteriorGlassMeshes: number;
    frustumFloorPlates: number;
    frustumUnitInteriorMeshes: number;
    frustumApartmentPropMeshes: number;
    frustumResidentialShellMeshes: number;
    frustumAnonymousInteriorMeshes: number;
    frustumGenericInteriorMeshes: number;
    frustumExteriorGlassMeshes: number;
    frustumTransparentMeshes: number;
    frustumTransparentExteriorGlassMeshes: number;
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
  let sumVisibleResidentialShellMeshes = 0;
  let sumVisibleAnonymousInteriorMeshes = 0;
  let sumVisibleGenericInteriorMeshes = 0;
  let sumVisibleExteriorGlassMeshes = 0;
  let sumVisibleTransparentMeshes = 0;
  let sumVisibleTransparentExteriorGlassMeshes = 0;
  let sumFrustumFloorPlates = 0;
  let sumFrustumUnitInteriorMeshes = 0;
  let sumFrustumApartmentPropMeshes = 0;
  let sumFrustumResidentialShellMeshes = 0;
  let sumFrustumAnonymousInteriorMeshes = 0;
  let sumFrustumGenericInteriorMeshes = 0;
  let sumFrustumExteriorGlassMeshes = 0;
  let sumFrustumTransparentMeshes = 0;
  let sumFrustumTransparentExteriorGlassMeshes = 0;

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
    sumVisibleResidentialShellMeshes += _visibleResidentialShellMeshes[i]!;
    sumVisibleAnonymousInteriorMeshes += _visibleAnonymousInteriorMeshes[i]!;
    sumVisibleGenericInteriorMeshes += _visibleGenericInteriorMeshes[i]!;
    sumVisibleExteriorGlassMeshes += _visibleExteriorGlassMeshes[i]!;
    sumVisibleTransparentMeshes += _visibleTransparentMeshes[i]!;
    sumVisibleTransparentExteriorGlassMeshes += _visibleTransparentExteriorGlassMeshes[i]!;
    sumFrustumFloorPlates += _frustumFloorPlates[i]!;
    sumFrustumUnitInteriorMeshes += _frustumUnitInteriorMeshes[i]!;
    sumFrustumApartmentPropMeshes += _frustumApartmentPropMeshes[i]!;
    sumFrustumResidentialShellMeshes += _frustumResidentialShellMeshes[i]!;
    sumFrustumAnonymousInteriorMeshes += _frustumAnonymousInteriorMeshes[i]!;
    sumFrustumGenericInteriorMeshes += _frustumGenericInteriorMeshes[i]!;
    sumFrustumExteriorGlassMeshes += _frustumExteriorGlassMeshes[i]!;
    sumFrustumTransparentMeshes += _frustumTransparentMeshes[i]!;
    sumFrustumTransparentExteriorGlassMeshes += _frustumTransparentExteriorGlassMeshes[i]!;
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
  const cpuFrameThroughputFps =
    avgTotal >= 1e-6
      ? Math.min(9999, Math.round((1000 / avgTotal) * 10) / 10)
      : 0;
  const fps = n >= 2 ? profilerRingSampleHz : cpuFrameThroughputFps;
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
  const avgVisibleResidentialShellMeshes = sumVisibleResidentialShellMeshes / n;
  const avgVisibleAnonymousInteriorMeshes = sumVisibleAnonymousInteriorMeshes / n;
  const avgVisibleGenericInteriorMeshes = sumVisibleGenericInteriorMeshes / n;
  const avgVisibleExteriorGlassMeshes = sumVisibleExteriorGlassMeshes / n;
  const avgVisibleTransparentMeshes = sumVisibleTransparentMeshes / n;
  const avgVisibleTransparentExteriorGlassMeshes = sumVisibleTransparentExteriorGlassMeshes / n;
  const avgFrustumFloorPlates = sumFrustumFloorPlates / n;
  const avgFrustumUnitInteriorMeshes = sumFrustumUnitInteriorMeshes / n;
  const avgFrustumApartmentPropMeshes = sumFrustumApartmentPropMeshes / n;
  const avgFrustumResidentialShellMeshes = sumFrustumResidentialShellMeshes / n;
  const avgFrustumAnonymousInteriorMeshes = sumFrustumAnonymousInteriorMeshes / n;
  const avgFrustumGenericInteriorMeshes = sumFrustumGenericInteriorMeshes / n;
  const avgFrustumExteriorGlassMeshes = sumFrustumExteriorGlassMeshes / n;
  const avgFrustumTransparentMeshes = sumFrustumTransparentMeshes / n;
  const avgFrustumTransparentExteriorGlassMeshes = sumFrustumTransparentExteriorGlassMeshes / n;
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
    cpuFrameThroughputFps,
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
      visibleResidentialShellMeshes: Math.round(avgVisibleResidentialShellMeshes * 10) / 10,
      visibleAnonymousInteriorMeshes: Math.round(avgVisibleAnonymousInteriorMeshes * 10) / 10,
      visibleGenericInteriorMeshes: Math.round(avgVisibleGenericInteriorMeshes * 10) / 10,
      visibleExteriorGlassMeshes: Math.round(avgVisibleExteriorGlassMeshes * 10) / 10,
      visibleTransparentMeshes: Math.round(avgVisibleTransparentMeshes * 10) / 10,
      visibleTransparentExteriorGlassMeshes:
        Math.round(avgVisibleTransparentExteriorGlassMeshes * 10) / 10,
      frustumFloorPlates: Math.round(avgFrustumFloorPlates * 10) / 10,
      frustumUnitInteriorMeshes: Math.round(avgFrustumUnitInteriorMeshes * 10) / 10,
      frustumApartmentPropMeshes: Math.round(avgFrustumApartmentPropMeshes * 10) / 10,
      frustumResidentialShellMeshes: Math.round(avgFrustumResidentialShellMeshes * 10) / 10,
      frustumAnonymousInteriorMeshes: Math.round(avgFrustumAnonymousInteriorMeshes * 10) / 10,
      frustumGenericInteriorMeshes: Math.round(avgFrustumGenericInteriorMeshes * 10) / 10,
      frustumExteriorGlassMeshes: Math.round(avgFrustumExteriorGlassMeshes * 10) / 10,
      frustumTransparentMeshes: Math.round(avgFrustumTransparentMeshes * 10) / 10,
      frustumTransparentExteriorGlassMeshes:
        Math.round(avgFrustumTransparentExteriorGlassMeshes * 10) / 10,
    },
    histogram,
  };
}

// ---------------------------------------------------------------------------
// Timeline (ordered samples for captures / charts)
// ---------------------------------------------------------------------------

/** One profiler ring-buffer sample as plain objects for HUD/export (ordered oldest → newest). */
export type FpPerfTimelineSample = {
  tMs: number;
  totalMs: number;
  physicsMs: number;
  elevatorMs: number;
  presentMs: number;
  renderMs: number;
  renderFloorPlateVisMs: number;
  renderFpEnvironmentMs: number;
  renderFpEnvironmentSkyMs: number;
  renderFpEnvironmentLightingMs: number;
  renderSetupMs: number;
  renderThreeMs: number;
  renderThreeGpuMs: number | null;
  drawCalls: number;
  triangles: number;
  visibleFloorPlates: number;
  visibleUnitInteriorMeshes: number;
  visibleApartmentPropMeshes: number;
  visibleResidentialShellMeshes: number;
  visibleAnonymousInteriorMeshes: number;
  visibleGenericInteriorMeshes: number;
  visibleExteriorGlassMeshes: number;
  visibleTransparentMeshes: number;
  visibleTransparentExteriorGlassMeshes: number;
  frustumFloorPlates: number;
  frustumUnitInteriorMeshes: number;
  frustumApartmentPropMeshes: number;
  frustumResidentialShellMeshes: number;
  frustumAnonymousInteriorMeshes: number;
  frustumGenericInteriorMeshes: number;
  frustumExteriorGlassMeshes: number;
  frustumTransparentMeshes: number;
  frustumTransparentExteriorGlassMeshes: number;
  /** Camera yaw (rad); `null` if not recorded this frame. */
  cameraYawRad: number | null;
};

function collectIndicesOldestFirst(nowMs: number, windowSec: number): number[] {
  const count = Math.min(_wrote, RING);
  if (count === 0) return [];
  const cutoff = nowMs - windowSec * 1000;
  const newestFirst: number[] = [];
  for (let k = 0; k < count; k++) {
    const idx = (_head - 1 - k + RING) % RING;
    if ((_ts[idx] ?? 0) < cutoff) break;
    newestFirst.push(idx);
  }
  newestFirst.reverse();
  return newestFirst;
}

function timelineSampleFromRingIndex(i: number): FpPerfTimelineSample {
  const tg = _renderThreeGpu[i]!;
  const yaw = _cameraYawRad[i]!;
  return {
    tMs: _ts[i]!,
    totalMs: _total[i]!,
    physicsMs: _physics[i]!,
    elevatorMs: _elevator[i]!,
    presentMs: _present[i]!,
    renderMs: _render[i]!,
    renderFloorPlateVisMs: _renderFloorVis[i]!,
    renderFpEnvironmentMs: _renderFpEnv[i]!,
    renderFpEnvironmentSkyMs: _renderFpEnvSky[i]!,
    renderFpEnvironmentLightingMs: _renderFpEnvLighting[i]!,
    renderSetupMs: _renderSetup[i]!,
    renderThreeMs: _renderThree[i]!,
    renderThreeGpuMs: tg >= 0 ? tg : null,
    drawCalls: _drawCalls[i]!,
    triangles: _triangles[i]!,
    visibleFloorPlates: _visibleFloorPlates[i]!,
    visibleUnitInteriorMeshes: _visibleUnitInteriorMeshes[i]!,
    visibleApartmentPropMeshes: _visibleApartmentPropMeshes[i]!,
    visibleResidentialShellMeshes: _visibleResidentialShellMeshes[i]!,
    visibleAnonymousInteriorMeshes: _visibleAnonymousInteriorMeshes[i]!,
    visibleGenericInteriorMeshes: _visibleGenericInteriorMeshes[i]!,
    visibleExteriorGlassMeshes: _visibleExteriorGlassMeshes[i]!,
    visibleTransparentMeshes: _visibleTransparentMeshes[i]!,
    visibleTransparentExteriorGlassMeshes: _visibleTransparentExteriorGlassMeshes[i]!,
    frustumFloorPlates: _frustumFloorPlates[i]!,
    frustumUnitInteriorMeshes: _frustumUnitInteriorMeshes[i]!,
    frustumApartmentPropMeshes: _frustumApartmentPropMeshes[i]!,
    frustumResidentialShellMeshes: _frustumResidentialShellMeshes[i]!,
    frustumAnonymousInteriorMeshes: _frustumAnonymousInteriorMeshes[i]!,
    frustumGenericInteriorMeshes: _frustumGenericInteriorMeshes[i]!,
    frustumExteriorGlassMeshes: _frustumExteriorGlassMeshes[i]!,
    frustumTransparentMeshes: _frustumTransparentMeshes[i]!,
    frustumTransparentExteriorGlassMeshes: _frustumTransparentExteriorGlassMeshes[i]!,
    cameraYawRad: Number.isFinite(yaw) ? yaw : null,
  };
}

/**
 * Samples in `[nowMs - windowSec, nowMs]` from the ring buffer, oldest first.
 */
export function getFpPerfTimeline(nowMs: number, windowSec: number): FpPerfTimelineSample[] {
  return collectIndicesOldestFirst(nowMs, windowSec).map(timelineSampleFromRingIndex);
}

/**
 * Same aggregates as {@link computeFpPerfStats}, but from a frozen timeline slice (e.g. recording export).
 * `nominalWindowSec` is the requested capture horizon for labeling only.
 */
export function computeFpPerfStatsFromTimeline(
  samples: readonly FpPerfTimelineSample[],
  nominalWindowSec: number,
): FpPerfStats | null {
  const n = samples.length;
  if (n === 0) return null;

  if (_sortBuf === null || _sortBuf.length < n) {
    _sortBuf = new Float32Array(Math.max(n, RING));
  }

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
  let sumVisibleResidentialShellMeshes = 0;
  let sumVisibleAnonymousInteriorMeshes = 0;
  let sumVisibleGenericInteriorMeshes = 0;
  let sumVisibleExteriorGlassMeshes = 0;
  let sumVisibleTransparentMeshes = 0;
  let sumVisibleTransparentExteriorGlassMeshes = 0;
  let sumFrustumFloorPlates = 0;
  let sumFrustumUnitInteriorMeshes = 0;
  let sumFrustumApartmentPropMeshes = 0;
  let sumFrustumResidentialShellMeshes = 0;
  let sumFrustumAnonymousInteriorMeshes = 0;
  let sumFrustumGenericInteriorMeshes = 0;
  let sumFrustumExteriorGlassMeshes = 0;
  let sumFrustumTransparentMeshes = 0;
  let sumFrustumTransparentExteriorGlassMeshes = 0;

  const hist = new Int32Array(6);

  for (let k = 0; k < n; k++) {
    const row = samples[k]!;
    const t = row.totalMs;
    _sortBuf[k] = t;
    if (t < minMs) minMs = t;
    if (t > maxMs) maxMs = t;
    sumTotal += t;
    sumPhysics += row.physicsMs;
    sumElev += row.elevatorMs;
    sumPresent += row.presentMs;
    sumRender += row.renderMs;
    sumRenderFloorVis += row.renderFloorPlateVisMs;
    sumRenderFpEnv += row.renderFpEnvironmentMs;
    sumRenderFpEnvSky += row.renderFpEnvironmentSkyMs;
    sumRenderFpEnvLighting += row.renderFpEnvironmentLightingMs;
    sumRenderSetup += row.renderSetupMs;
    sumRenderThree += row.renderThreeMs;
    sumVisibleFloorPlates += row.visibleFloorPlates;
    sumVisibleUnitInteriorMeshes += row.visibleUnitInteriorMeshes;
    sumVisibleApartmentPropMeshes += row.visibleApartmentPropMeshes;
    sumVisibleResidentialShellMeshes += row.visibleResidentialShellMeshes;
    sumVisibleAnonymousInteriorMeshes += row.visibleAnonymousInteriorMeshes;
    sumVisibleGenericInteriorMeshes += row.visibleGenericInteriorMeshes;
    sumVisibleExteriorGlassMeshes += row.visibleExteriorGlassMeshes;
    sumVisibleTransparentMeshes += row.visibleTransparentMeshes;
    sumVisibleTransparentExteriorGlassMeshes += row.visibleTransparentExteriorGlassMeshes;
    sumFrustumFloorPlates += row.frustumFloorPlates;
    sumFrustumUnitInteriorMeshes += row.frustumUnitInteriorMeshes;
    sumFrustumApartmentPropMeshes += row.frustumApartmentPropMeshes;
    sumFrustumResidentialShellMeshes += row.frustumResidentialShellMeshes;
    sumFrustumAnonymousInteriorMeshes += row.frustumAnonymousInteriorMeshes;
    sumFrustumGenericInteriorMeshes += row.frustumGenericInteriorMeshes;
    sumFrustumExteriorGlassMeshes += row.frustumExteriorGlassMeshes;
    sumFrustumTransparentMeshes += row.frustumTransparentMeshes;
    sumFrustumTransparentExteriorGlassMeshes += row.frustumTransparentExteriorGlassMeshes;
    const tg = row.renderThreeGpuMs;
    if (tg != null && tg >= 0) {
      sumRenderThreeGpu += tg;
      gpuSamples += 1;
    }

    let b = 5;
    for (let e = 0; e < HIST_EDGES.length; e++) {
      if (t < HIST_EDGES[e]!) {
        b = e;
        break;
      }
    }
    hist[b] = (hist[b] ?? 0) + 1;
  }

  const slice = _sortBuf.subarray(0, n);
  slice.sort();

  const p = (frac: number) => {
    const idx = Math.min(n - 1, Math.floor(frac * n));
    return Math.round(slice[idx]! * 10) / 10;
  };

  const oldestTs = samples[0]!.tMs;
  const newestTs = samples[n - 1]!.tMs;
  const actualElapsedSec = Math.max(0.001, (newestTs - oldestTs) / 1000);
  const profilerRingSampleHz =
    actualElapsedSec > 0 ? Math.round((n / actualElapsedSec) * 10) / 10 : 0;

  const avgTotal = sumTotal / n;
  const cpuFrameThroughputFps =
    avgTotal >= 1e-6 ? Math.min(9999, Math.round((1000 / avgTotal) * 10) / 10) : 0;
  const fps = n >= 2 ? profilerRingSampleHz : cpuFrameThroughputFps;
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
  const avgVisibleResidentialShellMeshes = sumVisibleResidentialShellMeshes / n;
  const avgVisibleAnonymousInteriorMeshes = sumVisibleAnonymousInteriorMeshes / n;
  const avgVisibleGenericInteriorMeshes = sumVisibleGenericInteriorMeshes / n;
  const avgVisibleExteriorGlassMeshes = sumVisibleExteriorGlassMeshes / n;
  const avgVisibleTransparentMeshes = sumVisibleTransparentMeshes / n;
  const avgVisibleTransparentExteriorGlassMeshes = sumVisibleTransparentExteriorGlassMeshes / n;
  const avgFrustumFloorPlates = sumFrustumFloorPlates / n;
  const avgFrustumUnitInteriorMeshes = sumFrustumUnitInteriorMeshes / n;
  const avgFrustumApartmentPropMeshes = sumFrustumApartmentPropMeshes / n;
  const avgFrustumResidentialShellMeshes = sumFrustumResidentialShellMeshes / n;
  const avgFrustumAnonymousInteriorMeshes = sumFrustumAnonymousInteriorMeshes / n;
  const avgFrustumGenericInteriorMeshes = sumFrustumGenericInteriorMeshes / n;
  const avgFrustumExteriorGlassMeshes = sumFrustumExteriorGlassMeshes / n;
  const avgFrustumTransparentMeshes = sumFrustumTransparentMeshes / n;
  const avgFrustumTransparentExteriorGlassMeshes = sumFrustumTransparentExteriorGlassMeshes / n;
  const avgOther = Math.max(0, avgTotal - avgPhysics - avgElev - avgPresent - avgRender);

  const histogram: FpPerfHistBucket[] = HIST_LABELS.map((label, b) => ({
    label,
    count: hist[b]!,
    frac: n > 0 ? hist[b]! / n : 0,
  }));

  return {
    windowSec: nominalWindowSec,
    actualElapsedSec,
    samples: n,
    fps,
    cpuFrameThroughputFps,
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
      visibleResidentialShellMeshes: Math.round(avgVisibleResidentialShellMeshes * 10) / 10,
      visibleAnonymousInteriorMeshes: Math.round(avgVisibleAnonymousInteriorMeshes * 10) / 10,
      visibleGenericInteriorMeshes: Math.round(avgVisibleGenericInteriorMeshes * 10) / 10,
      visibleExteriorGlassMeshes: Math.round(avgVisibleExteriorGlassMeshes * 10) / 10,
      visibleTransparentMeshes: Math.round(avgVisibleTransparentMeshes * 10) / 10,
      visibleTransparentExteriorGlassMeshes:
        Math.round(avgVisibleTransparentExteriorGlassMeshes * 10) / 10,
      frustumFloorPlates: Math.round(avgFrustumFloorPlates * 10) / 10,
      frustumUnitInteriorMeshes: Math.round(avgFrustumUnitInteriorMeshes * 10) / 10,
      frustumApartmentPropMeshes: Math.round(avgFrustumApartmentPropMeshes * 10) / 10,
      frustumResidentialShellMeshes: Math.round(avgFrustumResidentialShellMeshes * 10) / 10,
      frustumAnonymousInteriorMeshes: Math.round(avgFrustumAnonymousInteriorMeshes * 10) / 10,
      frustumGenericInteriorMeshes: Math.round(avgFrustumGenericInteriorMeshes * 10) / 10,
      frustumExteriorGlassMeshes: Math.round(avgFrustumExteriorGlassMeshes * 10) / 10,
      frustumTransparentMeshes: Math.round(avgFrustumTransparentMeshes * 10) / 10,
      frustumTransparentExteriorGlassMeshes:
        Math.round(avgFrustumTransparentExteriorGlassMeshes * 10) / 10,
    },
    histogram,
  };
}

function timelineSamplesToAverageRendererInfo(samples: readonly FpPerfTimelineSample[]): FpRendererInfo {
  const n = samples.length;
  if (n === 0) {
    return {
      drawCalls: 0,
      triangles: 0,
      visibleFloorPlates: 0,
      visibleUnitInteriorMeshes: 0,
      visibleApartmentPropMeshes: 0,
      visibleResidentialShellMeshes: 0,
      visibleAnonymousInteriorMeshes: 0,
      visibleGenericInteriorMeshes: 0,
      visibleExteriorGlassMeshes: 0,
      visibleTransparentMeshes: 0,
      visibleTransparentExteriorGlassMeshes: 0,
      frustumFloorPlates: 0,
      frustumUnitInteriorMeshes: 0,
      frustumApartmentPropMeshes: 0,
      frustumResidentialShellMeshes: 0,
      frustumAnonymousInteriorMeshes: 0,
      frustumGenericInteriorMeshes: 0,
      frustumExteriorGlassMeshes: 0,
      frustumTransparentMeshes: 0,
      frustumTransparentExteriorGlassMeshes: 0,
    };
  }
  let drawCalls = 0;
  let triangles = 0;
  let visibleFloorPlates = 0;
  let visibleUnitInteriorMeshes = 0;
  let visibleApartmentPropMeshes = 0;
  let visibleResidentialShellMeshes = 0;
  let visibleAnonymousInteriorMeshes = 0;
  let visibleGenericInteriorMeshes = 0;
  let visibleExteriorGlassMeshes = 0;
  let visibleTransparentMeshes = 0;
  let visibleTransparentExteriorGlassMeshes = 0;
  let frustumFloorPlates = 0;
  let frustumUnitInteriorMeshes = 0;
  let frustumApartmentPropMeshes = 0;
  let frustumResidentialShellMeshes = 0;
  let frustumAnonymousInteriorMeshes = 0;
  let frustumGenericInteriorMeshes = 0;
  let frustumExteriorGlassMeshes = 0;
  let frustumTransparentMeshes = 0;
  let frustumTransparentExteriorGlassMeshes = 0;
  for (const s of samples) {
    drawCalls += s.drawCalls;
    triangles += s.triangles;
    visibleFloorPlates += s.visibleFloorPlates;
    visibleUnitInteriorMeshes += s.visibleUnitInteriorMeshes;
    visibleApartmentPropMeshes += s.visibleApartmentPropMeshes;
    visibleResidentialShellMeshes += s.visibleResidentialShellMeshes;
    visibleAnonymousInteriorMeshes += s.visibleAnonymousInteriorMeshes;
    visibleGenericInteriorMeshes += s.visibleGenericInteriorMeshes;
    visibleExteriorGlassMeshes += s.visibleExteriorGlassMeshes;
    visibleTransparentMeshes += s.visibleTransparentMeshes;
    visibleTransparentExteriorGlassMeshes += s.visibleTransparentExteriorGlassMeshes;
    frustumFloorPlates += s.frustumFloorPlates;
    frustumUnitInteriorMeshes += s.frustumUnitInteriorMeshes;
    frustumApartmentPropMeshes += s.frustumApartmentPropMeshes;
    frustumResidentialShellMeshes += s.frustumResidentialShellMeshes;
    frustumAnonymousInteriorMeshes += s.frustumAnonymousInteriorMeshes;
    frustumGenericInteriorMeshes += s.frustumGenericInteriorMeshes;
    frustumExteriorGlassMeshes += s.frustumExteriorGlassMeshes;
    frustumTransparentMeshes += s.frustumTransparentMeshes;
    frustumTransparentExteriorGlassMeshes += s.frustumTransparentExteriorGlassMeshes;
  }
  const r1 = (sum: number) => Math.round((sum / n) * 10) / 10;
  return {
    drawCalls: Math.round(drawCalls / n),
    triangles: Math.round(triangles / n),
    visibleFloorPlates: r1(visibleFloorPlates),
    visibleUnitInteriorMeshes: r1(visibleUnitInteriorMeshes),
    visibleApartmentPropMeshes: r1(visibleApartmentPropMeshes),
    visibleResidentialShellMeshes: r1(visibleResidentialShellMeshes),
    visibleAnonymousInteriorMeshes: r1(visibleAnonymousInteriorMeshes),
    visibleGenericInteriorMeshes: r1(visibleGenericInteriorMeshes),
    visibleExteriorGlassMeshes: r1(visibleExteriorGlassMeshes),
    visibleTransparentMeshes: r1(visibleTransparentMeshes),
    visibleTransparentExteriorGlassMeshes: r1(visibleTransparentExteriorGlassMeshes),
    frustumFloorPlates: r1(frustumFloorPlates),
    frustumUnitInteriorMeshes: r1(frustumUnitInteriorMeshes),
    frustumApartmentPropMeshes: r1(frustumApartmentPropMeshes),
    frustumResidentialShellMeshes: r1(frustumResidentialShellMeshes),
    frustumAnonymousInteriorMeshes: r1(frustumAnonymousInteriorMeshes),
    frustumGenericInteriorMeshes: r1(frustumGenericInteriorMeshes),
    frustumExteriorGlassMeshes: r1(frustumExteriorGlassMeshes),
    frustumTransparentMeshes: r1(frustumTransparentMeshes),
    frustumTransparentExteriorGlassMeshes: r1(frustumTransparentExteriorGlassMeshes),
  };
}

/** Tab-separated timeline dump for chat/logs (includes header row). */
export function exportFpPerfTimelineDump(samples: readonly FpPerfTimelineSample[]): string {
  if (samples.length === 0) return "(no samples)";
  const t0 = samples[0]!.tMs;
  const header =
    "tMs\trelMs\ttotalMs\trenderMs\trenderThreeMs\tphysicsMs\tdrawCalls\tkTri\tvisUI\tfrUI\tfrProps\tuiShell\tuiAnon\tuiGlass\ttrGlass\tfrTrans\tyawDeg";
  const lines = samples.map((s) => {
    const relMs = Math.round((s.tMs - t0) * 10) / 10;
    const yawDeg =
      s.cameraYawRad != null ? Math.round((s.cameraYawRad * 180) / Math.PI * 10) / 10 : "";
    return [
      Math.round(s.tMs),
      relMs,
      Math.round(s.totalMs * 100) / 100,
      Math.round(s.renderMs * 100) / 100,
      Math.round(s.renderThreeMs * 100) / 100,
      Math.round(s.physicsMs * 100) / 100,
      Math.round(s.drawCalls),
      Math.round(s.triangles / 100) / 10,
      Math.round(s.visibleUnitInteriorMeshes),
      Math.round(s.frustumUnitInteriorMeshes),
      Math.round(s.frustumApartmentPropMeshes),
      Math.round(s.visibleResidentialShellMeshes),
      Math.round(s.visibleAnonymousInteriorMeshes),
      Math.round(s.visibleExteriorGlassMeshes),
      Math.round(s.visibleTransparentExteriorGlassMeshes),
      Math.round(s.frustumTransparentMeshes),
      yawDeg === "" ? "" : yawDeg,
    ].join("\t");
  });
  return [header, ...lines].join("\n");
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

type HeavyMeshPeak = FpPerfHeavyMeshRecord & {
  hits: number;
};

function heavyMeshPeaksForWindow(nowMs: number, windowSec: number): HeavyMeshPeak[] {
  const cutoff = nowMs - windowSec * 1000;
  const byLabel = new Map<string, HeavyMeshPeak>();
  for (const record of _heavyMeshRecords) {
    if (record.tMs < cutoff || record.tMs > nowMs) continue;
    const existing = byLabel.get(record.label);
    if (!existing) {
      byLabel.set(record.label, { ...record, hits: 1 });
      continue;
    }
    existing.hits += 1;
    if (
      record.meshTriangles > existing.meshTriangles ||
      (record.meshTriangles === existing.meshTriangles &&
        record.frameTriangles > existing.frameTriangles)
    ) {
      byLabel.set(record.label, { ...record, hits: existing.hits });
    }
  }
  return [...byLabel.values()]
    .sort((a, b) => b.meshTriangles - a.meshTriangles || b.frameTriangles - a.frameTriangles)
    .slice(0, 12);
}

function formatHeavyMeshPeakLines(nowMs: number, windowSec: number): string[] {
  const peaks = heavyMeshPeaksForWindow(nowMs, windowSec);
  if (peaks.length === 0) {
    return [
      "Heavy mesh peaks:",
      "  (none captured; spin through the slowdown while frame triangles exceed the sampler threshold)",
    ];
  }
  return [
    "Heavy mesh peaks (frustum-visible during high-triangle frames):",
    ...peaks.map((p, i) => {
      const yawDeg =
        p.cameraYawRad != null
          ? `${Math.round((p.cameraYawRad * 180) / Math.PI * 10) / 10}deg`
          : "n/a";
      const extras = [
        p.kind,
        p.unitKey ? `unit=${p.unitKey}` : "",
        p.placedObjectId ? `placed=${p.placedObjectId}` : "",
        p.materialName ? `mat=${p.materialName}` : "",
        p.geometryName ? `geo=${p.geometryName}` : "",
        p.frustumCulled ? "culled=yes" : "culled=no",
      ]
        .filter(Boolean)
        .join("  ");
      return `  ${String(i + 1).padStart(2)}. ${(p.meshTriangles / 1000)
        .toFixed(1)
        .padStart(7)}k tri  frame=${(p.frameTriangles / 1000)
        .toFixed(1)
        .padStart(7)}k  hits=${String(p.hits).padStart(2)}  yaw=${yawDeg.padStart(
        8,
      )}  ${p.label}${extras ? `  [${extras}]` : ""}`;
    }),
  ];
}

function formatFpPerfReportMarkdown(
  s: FpPerfStats,
  ri: FpRendererInfo,
  opts?: { headerCountsAreTimelineAverage?: boolean; reportNowMs?: number },
): string {
  const { frameMs, sections, sceneCounts, histogram } = s;
  const hdrNote = opts?.headerCountsAreTimelineAverage ? " (avg)" : "";
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
    `Window: ${s.windowSec}s  Samples: ${s.samples}  Elapsed: ${s.actualElapsedSec.toFixed(1)}s`,
    `Renderer${hdrNote}: ${ri.drawCalls} draw calls  ${(ri.triangles / 1000).toFixed(1)}k triangles`,
    `Scene${hdrNote}   vis: plates=${ri.visibleFloorPlates}  unitInterior=${ri.visibleUnitInteriorMeshes}  props=${ri.visibleApartmentPropMeshes}  transparent=${ri.visibleTransparentMeshes}`,
    `        fr${hdrNote}:  plates=${ri.frustumFloorPlates}  unitInterior=${ri.frustumUnitInteriorMeshes}  props=${ri.frustumApartmentPropMeshes}  transparent=${ri.frustumTransparentMeshes}`,
    "",
    `FPS   ~${s.fps} (from completed frame cadence)  (${frameMs.min}ms best / ${frameMs.max}ms worst)`,
    `CPU   ~${s.cpuFrameThroughputFps} (from avg frame cpu)`,
    `Diag  profiler ring samples/s=${s.profilerRingSampleHz}`,
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
      : `    GPU hw     n/a  (adapter missing timestamp-query or disabled via ?fpgpuoff=1)`,
    `  other     ${sections.otherMs.toFixed(2).padStart(6)}ms  ${secBar(sections.otherMs, secMax)}`,
    "",
    "Scene content (avg / frame):",
    `  floorPlates    vis ${sceneCounts.visibleFloorPlates.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumFloorPlates.toFixed(1).padStart(6)}`,
    `  unitInterior   vis ${sceneCounts.visibleUnitInteriorMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumUnitInteriorMeshes.toFixed(1).padStart(6)}`,
    `  apartmentProps vis ${sceneCounts.visibleApartmentPropMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumApartmentPropMeshes.toFixed(1).padStart(6)}`,
    `  transparent    vis ${sceneCounts.visibleTransparentMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumTransparentMeshes.toFixed(1).padStart(6)}`,
    "",
    "Leak-debug breakdown (avg / frame):",
    `  unitShells     vis ${sceneCounts.visibleResidentialShellMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumResidentialShellMeshes.toFixed(1).padStart(6)}`,
    `  unitAnon       vis ${sceneCounts.visibleAnonymousInteriorMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumAnonymousInteriorMeshes.toFixed(1).padStart(6)}`,
    `  unitGeneric    vis ${sceneCounts.visibleGenericInteriorMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumGenericInteriorMeshes.toFixed(1).padStart(6)}`,
    `  unitGlass      vis ${sceneCounts.visibleExteriorGlassMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumExteriorGlassMeshes.toFixed(1).padStart(6)}`,
    `  transGlass     vis ${sceneCounts.visibleTransparentExteriorGlassMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumTransparentExteriorGlassMeshes.toFixed(1).padStart(6)}`,
    "",
    "Frame-time histogram:",
    ...histogram.map(
      (b) =>
        `  ${b.label.padEnd(7)}  ${(b.frac * 100).toFixed(0).padStart(3)}%  ${bar(b.frac, 28)}  (${b.count})`,
    ),
    "",
    ...formatHeavyMeshPeakLines(opts?.reportNowMs ?? performance.now(), s.windowSec),
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  return lines.join("\n");
}

export function exportFpPerfReport(nowMs: number, windowSec: number): string {
  const s = computeFpPerfStats(nowMs, windowSec);
  if (!s) return "No profiler data available yet.";
  return formatFpPerfReportMarkdown(s, getLastRendererInfo(), { reportNowMs: nowMs });
}

/** Frozen recording: summary derived from samples + tab-separated timeline dump. */
export function exportFpPerfRecordingReport(
  samples: readonly FpPerfTimelineSample[],
  nominalWindowSec: number,
): string {
  const s = computeFpPerfStatsFromTimeline(samples, nominalWindowSec);
  if (!s) return "No profiler samples in recording.";
  const ri = timelineSamplesToAverageRendererInfo(samples);
  const summary = formatFpPerfReportMarkdown(s, ri, {
    headerCountsAreTimelineAverage: true,
    reportNowMs: samples[samples.length - 1]!.tMs,
  });
  const dump = exportFpPerfTimelineDump(samples);
  return `${summary}\n\n=== Timeline (${samples.length} samples · ${nominalWindowSec}s window) ===\n${dump}\n`;
}
