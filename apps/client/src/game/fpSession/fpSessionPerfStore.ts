/**
 * Lock-free, zero-GC frame-timing ring buffer for the FP session.
 *
 * Data is stored in typed arrays so no heap allocation occurs on the hot path.
 * Stats are computed on demand (only when the profiler panel is open) and are
 * intentionally not cached to avoid stale reads.
 */

import { formatFpPerfSpikeCorrelationReport } from "./fpSessionPerfSpikeCorrelation.js";
import {
  addFpPracticalDecorLightKindFields,
  createFpPracticalDecorLightKindRingBuffers,
  emptyFpPracticalDecorLightKindFields,
  formatFpPracticalDecorLightKindAverages,
  fpPracticalDecorLightKindFieldsFromCounter,
  readFpPracticalDecorLightKindFieldsFromRing,
  resetFpPracticalDecorLightKindRingBuffers,
  scaleFpPracticalDecorLightKindFields,
  writeFpPracticalDecorLightKindFieldsToRing,
  type FpPracticalDecorLightKindFields,
} from "./fpSessionPracticalLightPerfKinds.js";

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
/** Visible decor floor-shadow overlay meshes (`mammothApartmentBakedFloorShadow`). */
const _visibleApartmentDecorFloorShadowMeshes = new Float32Array(RING);
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
/** Frustum-intersected decor floor-shadow overlay meshes. */
const _frustumApartmentDecorFloorShadowMeshes = new Float32Array(RING);
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
/** Visible apartment decor practical lights (TV/ceiling/standing/etc — not window fill). */
const _visiblePracticalDecorLights = new Float32Array(RING);
/** Frustum-intersected decor practical lights. */
const _frustumPracticalDecorLights = new Float32Array(RING);
/** Visible window-fill practical lights. */
const _visiblePracticalWindowLights = new Float32Array(RING);
/** Frustum-intersected window-fill practical lights. */
const _frustumPracticalWindowLights = new Float32Array(RING);
const _practicalDecorKindRing = createFpPracticalDecorLightKindRingBuffers(RING);
/** Draw calls after each frame (`renderer.info.render.calls`). */
const _drawCalls = new Float32Array(RING);
/** Submitted triangles after each frame (`renderer.info.render.triangles`). */
const _triangles = new Float32Array(RING);
/** Scene-graph visible mesh triangles (honest geometry, not GPU pass inflation). */
const _sceneGraphVisibleTriangles = new Float32Array(RING);
/** Top scene-graph buckets per frame (e.g. `droppedItem=650k worldNpc=65k`). */
const _sceneGraphBreakdown: string[] = Array.from({ length: RING }, () => "");
/** Visible `decor_inst:*` InstancedMesh batches (cross-placement decor). */
const _decorInstancedBatches = new Float32Array(RING);
/** Instance count on visible decor instanced batches. */
const _decorInstancedInstances = new Float32Array(RING);
/** Hidden placement roots replaced by instancing (`mammothApartmentDecorInstanced`). */
const _decorInstancedHiddenPlacements = new Float32Array(RING);
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
  /** Sum of visible mesh tris in the scene graph (instanced meshes count base × instance count). */
  sceneGraphVisibleTriangles: number;
  /** Top buckets from {@link summarizeFpSessionSceneTriangles}, e.g. `droppedItem=650k worldNpc=65k`. */
  sceneGraphBreakdown: string;
  visibleFloorPlates: number;
  visibleUnitInteriorMeshes: number;
  visibleApartmentPropMeshes: number;
  visibleApartmentDecorFloorShadowMeshes: number;
  visibleResidentialShellMeshes: number;
  visibleAnonymousInteriorMeshes: number;
  visibleGenericInteriorMeshes: number;
  visibleExteriorGlassMeshes: number;
  visibleTransparentMeshes: number;
  visibleTransparentExteriorGlassMeshes: number;
  frustumFloorPlates: number;
  frustumUnitInteriorMeshes: number;
  frustumApartmentPropMeshes: number;
  frustumApartmentDecorFloorShadowMeshes: number;
  frustumResidentialShellMeshes: number;
  frustumAnonymousInteriorMeshes: number;
  frustumGenericInteriorMeshes: number;
  frustumExteriorGlassMeshes: number;
  frustumTransparentMeshes: number;
  frustumTransparentExteriorGlassMeshes: number;
  visiblePracticalDecorLights: number;
  frustumPracticalDecorLights: number;
  visiblePracticalWindowLights: number;
  frustumPracticalWindowLights: number;
  /** Active decor lights by kind — last frame snapshot, e.g. `tv:1 ceiling:4`. */
  practicalDecorLightBreakdownVis: string;
  practicalDecorLightBreakdownFr: string;
  /** Cross-placement decor instancing (see {@link summarizeApartmentDecorCrossPlacementInstancingInScene}). */
  decorInstancedBatchesVisible: number;
  decorInstancedInstancesVisible: number;
  decorInstancedBatchesFrustum: number;
  decorInstancedInstancesFrustum: number;
  decorInstancedHiddenPlacements: number;
  decorInstancedEstDrawSavings: number;
  /** Last rebuild batch list, e.g. `light-ceiling-2.glb×13`. */
  decorInstancingLastRebuild: string;
} & FpPracticalDecorLightKindFields;

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
let _lastSceneGraphVisibleTriangles = 0;
let _lastSceneGraphBreakdown = "";
let _lastVisibleFloorPlates = 0;
let _lastVisibleUnitInteriorMeshes = 0;
let _lastVisibleApartmentPropMeshes = 0;
let _lastVisibleApartmentDecorFloorShadowMeshes = 0;
let _lastVisibleResidentialShellMeshes = 0;
let _lastVisibleAnonymousInteriorMeshes = 0;
let _lastVisibleGenericInteriorMeshes = 0;
let _lastVisibleExteriorGlassMeshes = 0;
let _lastVisibleTransparentMeshes = 0;
let _lastVisibleTransparentExteriorGlassMeshes = 0;
let _lastFrustumFloorPlates = 0;
let _lastFrustumUnitInteriorMeshes = 0;
let _lastFrustumApartmentPropMeshes = 0;
let _lastFrustumApartmentDecorFloorShadowMeshes = 0;
let _lastFrustumResidentialShellMeshes = 0;
let _lastFrustumAnonymousInteriorMeshes = 0;
let _lastFrustumGenericInteriorMeshes = 0;
let _lastFrustumExteriorGlassMeshes = 0;
let _lastFrustumTransparentMeshes = 0;
let _lastFrustumTransparentExteriorGlassMeshes = 0;
let _lastVisiblePracticalDecorLights = 0;
let _lastFrustumPracticalDecorLights = 0;
let _lastVisiblePracticalWindowLights = 0;
let _lastFrustumPracticalWindowLights = 0;
let _lastPracticalDecorLightBreakdownVis = "";
let _lastPracticalDecorLightBreakdownFr = "";
let _lastPracticalDecorKindFields = emptyFpPracticalDecorLightKindFields();
let _lastDecorInstancedBatchesVisible = 0;
let _lastDecorInstancedInstancesVisible = 0;
let _lastDecorInstancedBatchesFrustum = 0;
let _lastDecorInstancedInstancesFrustum = 0;
let _lastDecorInstancedHiddenPlacements = 0;
let _lastDecorInstancedEstDrawSavings = 0;
let _lastDecorInstancingLastRebuild = "";

const HEAVY_MESH_RECORD_LIMIT = 768;
const _heavyMeshRecords: FpPerfHeavyMeshRecord[] = [];

/** Stable reference for `useSyncExternalStore` — replaced only when counters change. */
let _cachedLastRendererInfo: FpRendererInfo = {
  drawCalls: 0,
  triangles: 0,
  sceneGraphVisibleTriangles: 0,
  sceneGraphBreakdown: "",
  visibleFloorPlates: 0,
  visibleUnitInteriorMeshes: 0,
  visibleApartmentPropMeshes: 0,
  visibleApartmentDecorFloorShadowMeshes: 0,
  visibleResidentialShellMeshes: 0,
  visibleAnonymousInteriorMeshes: 0,
  visibleGenericInteriorMeshes: 0,
  visibleExteriorGlassMeshes: 0,
  visibleTransparentMeshes: 0,
  visibleTransparentExteriorGlassMeshes: 0,
  frustumFloorPlates: 0,
  frustumUnitInteriorMeshes: 0,
  frustumApartmentPropMeshes: 0,
  frustumApartmentDecorFloorShadowMeshes: 0,
  frustumResidentialShellMeshes: 0,
  frustumAnonymousInteriorMeshes: 0,
  frustumGenericInteriorMeshes: 0,
  frustumExteriorGlassMeshes: 0,
  frustumTransparentMeshes: 0,
  frustumTransparentExteriorGlassMeshes: 0,
  visiblePracticalDecorLights: 0,
  frustumPracticalDecorLights: 0,
  visiblePracticalWindowLights: 0,
  frustumPracticalWindowLights: 0,
  practicalDecorLightBreakdownVis: "",
  practicalDecorLightBreakdownFr: "",
  decorInstancedBatchesVisible: 0,
  decorInstancedInstancesVisible: 0,
  decorInstancedBatchesFrustum: 0,
  decorInstancedInstancesFrustum: 0,
  decorInstancedHiddenPlacements: 0,
  decorInstancedEstDrawSavings: 0,
  decorInstancingLastRebuild: "",
  ...emptyFpPracticalDecorLightKindFields(),
};

function _rebuildCachedLastRendererInfo(): void {
  _cachedLastRendererInfo = {
    drawCalls: _lastDrawCalls,
    triangles: _lastTriangles,
    sceneGraphVisibleTriangles: _lastSceneGraphVisibleTriangles,
    sceneGraphBreakdown: _lastSceneGraphBreakdown,
    visibleFloorPlates: _lastVisibleFloorPlates,
    visibleUnitInteriorMeshes: _lastVisibleUnitInteriorMeshes,
    visibleApartmentPropMeshes: _lastVisibleApartmentPropMeshes,
    visibleApartmentDecorFloorShadowMeshes: _lastVisibleApartmentDecorFloorShadowMeshes,
    visibleResidentialShellMeshes: _lastVisibleResidentialShellMeshes,
    visibleAnonymousInteriorMeshes: _lastVisibleAnonymousInteriorMeshes,
    visibleGenericInteriorMeshes: _lastVisibleGenericInteriorMeshes,
    visibleExteriorGlassMeshes: _lastVisibleExteriorGlassMeshes,
    visibleTransparentMeshes: _lastVisibleTransparentMeshes,
    visibleTransparentExteriorGlassMeshes: _lastVisibleTransparentExteriorGlassMeshes,
    frustumFloorPlates: _lastFrustumFloorPlates,
    frustumUnitInteriorMeshes: _lastFrustumUnitInteriorMeshes,
    frustumApartmentPropMeshes: _lastFrustumApartmentPropMeshes,
    frustumApartmentDecorFloorShadowMeshes: _lastFrustumApartmentDecorFloorShadowMeshes,
    frustumResidentialShellMeshes: _lastFrustumResidentialShellMeshes,
    frustumAnonymousInteriorMeshes: _lastFrustumAnonymousInteriorMeshes,
    frustumGenericInteriorMeshes: _lastFrustumGenericInteriorMeshes,
    frustumExteriorGlassMeshes: _lastFrustumExteriorGlassMeshes,
    frustumTransparentMeshes: _lastFrustumTransparentMeshes,
    frustumTransparentExteriorGlassMeshes: _lastFrustumTransparentExteriorGlassMeshes,
    visiblePracticalDecorLights: _lastVisiblePracticalDecorLights,
    frustumPracticalDecorLights: _lastFrustumPracticalDecorLights,
    visiblePracticalWindowLights: _lastVisiblePracticalWindowLights,
    frustumPracticalWindowLights: _lastFrustumPracticalWindowLights,
    practicalDecorLightBreakdownVis: _lastPracticalDecorLightBreakdownVis,
    practicalDecorLightBreakdownFr: _lastPracticalDecorLightBreakdownFr,
    decorInstancedBatchesVisible: _lastDecorInstancedBatchesVisible,
    decorInstancedInstancesVisible: _lastDecorInstancedInstancesVisible,
    decorInstancedBatchesFrustum: _lastDecorInstancedBatchesFrustum,
    decorInstancedInstancesFrustum: _lastDecorInstancedInstancesFrustum,
    decorInstancedHiddenPlacements: _lastDecorInstancedHiddenPlacements,
    decorInstancedEstDrawSavings: _lastDecorInstancedEstDrawSavings,
    decorInstancingLastRebuild: _lastDecorInstancingLastRebuild,
    ..._lastPracticalDecorKindFields,
  };
}

export function getLastRendererInfo(): FpRendererInfo {
  return _cachedLastRendererInfo;
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
    _lastSceneGraphVisibleTriangles = rendererInfo.sceneGraphVisibleTriangles;
    _lastSceneGraphBreakdown = rendererInfo.sceneGraphBreakdown;
    _lastVisibleFloorPlates = rendererInfo.visibleFloorPlates;
    _lastVisibleUnitInteriorMeshes = rendererInfo.visibleUnitInteriorMeshes;
    _lastVisibleApartmentPropMeshes = rendererInfo.visibleApartmentPropMeshes;
    _lastVisibleApartmentDecorFloorShadowMeshes =
      rendererInfo.visibleApartmentDecorFloorShadowMeshes;
    _lastVisibleResidentialShellMeshes = rendererInfo.visibleResidentialShellMeshes;
    _lastVisibleAnonymousInteriorMeshes = rendererInfo.visibleAnonymousInteriorMeshes;
    _lastVisibleGenericInteriorMeshes = rendererInfo.visibleGenericInteriorMeshes;
    _lastVisibleExteriorGlassMeshes = rendererInfo.visibleExteriorGlassMeshes;
    _lastVisibleTransparentMeshes = rendererInfo.visibleTransparentMeshes;
    _lastVisibleTransparentExteriorGlassMeshes = rendererInfo.visibleTransparentExteriorGlassMeshes;
    _lastFrustumFloorPlates = rendererInfo.frustumFloorPlates;
    _lastFrustumUnitInteriorMeshes = rendererInfo.frustumUnitInteriorMeshes;
    _lastFrustumApartmentPropMeshes = rendererInfo.frustumApartmentPropMeshes;
    _lastFrustumApartmentDecorFloorShadowMeshes =
      rendererInfo.frustumApartmentDecorFloorShadowMeshes;
    _lastFrustumResidentialShellMeshes = rendererInfo.frustumResidentialShellMeshes;
    _lastFrustumAnonymousInteriorMeshes = rendererInfo.frustumAnonymousInteriorMeshes;
    _lastFrustumGenericInteriorMeshes = rendererInfo.frustumGenericInteriorMeshes;
    _lastFrustumExteriorGlassMeshes = rendererInfo.frustumExteriorGlassMeshes;
    _lastFrustumTransparentMeshes = rendererInfo.frustumTransparentMeshes;
    _lastFrustumTransparentExteriorGlassMeshes =
      rendererInfo.frustumTransparentExteriorGlassMeshes;
    _lastVisiblePracticalDecorLights = rendererInfo.visiblePracticalDecorLights;
    _lastFrustumPracticalDecorLights = rendererInfo.frustumPracticalDecorLights;
    _lastVisiblePracticalWindowLights = rendererInfo.visiblePracticalWindowLights;
    _lastFrustumPracticalWindowLights = rendererInfo.frustumPracticalWindowLights;
    _lastPracticalDecorLightBreakdownVis = rendererInfo.practicalDecorLightBreakdownVis;
    _lastPracticalDecorLightBreakdownFr = rendererInfo.practicalDecorLightBreakdownFr;
    _lastDecorInstancedBatchesVisible = rendererInfo.decorInstancedBatchesVisible;
    _lastDecorInstancedInstancesVisible = rendererInfo.decorInstancedInstancesVisible;
    _lastDecorInstancedBatchesFrustum = rendererInfo.decorInstancedBatchesFrustum;
    _lastDecorInstancedInstancesFrustum = rendererInfo.decorInstancedInstancesFrustum;
    _lastDecorInstancedHiddenPlacements = rendererInfo.decorInstancedHiddenPlacements;
    _lastDecorInstancedEstDrawSavings = rendererInfo.decorInstancedEstDrawSavings;
    _lastDecorInstancingLastRebuild = rendererInfo.decorInstancingLastRebuild;
    _lastPracticalDecorKindFields = {
      visiblePracticalDecorTvLights: rendererInfo.visiblePracticalDecorTvLights,
      frustumPracticalDecorTvLights: rendererInfo.frustumPracticalDecorTvLights,
      visiblePracticalDecorComputerLights: rendererInfo.visiblePracticalDecorComputerLights,
      frustumPracticalDecorComputerLights: rendererInfo.frustumPracticalDecorComputerLights,
      visiblePracticalDecorCeilingLights: rendererInfo.visiblePracticalDecorCeilingLights,
      frustumPracticalDecorCeilingLights: rendererInfo.frustumPracticalDecorCeilingLights,
      visiblePracticalDecorChandelierLights: rendererInfo.visiblePracticalDecorChandelierLights,
      frustumPracticalDecorChandelierLights: rendererInfo.frustumPracticalDecorChandelierLights,
      visiblePracticalDecorStandingLights: rendererInfo.visiblePracticalDecorStandingLights,
      frustumPracticalDecorStandingLights: rendererInfo.frustumPracticalDecorStandingLights,
      visiblePracticalDecorGrowOpLights: rendererInfo.visiblePracticalDecorGrowOpLights,
      frustumPracticalDecorGrowOpLights: rendererInfo.frustumPracticalDecorGrowOpLights,
    };
    _rebuildCachedLastRendererInfo();
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
  _visibleApartmentDecorFloorShadowMeshes[i] =
    rendererInfo?.visibleApartmentDecorFloorShadowMeshes ?? 0;
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
  _frustumApartmentDecorFloorShadowMeshes[i] =
    rendererInfo?.frustumApartmentDecorFloorShadowMeshes ?? 0;
  _frustumResidentialShellMeshes[i] = rendererInfo?.frustumResidentialShellMeshes ?? 0;
  _frustumAnonymousInteriorMeshes[i] = rendererInfo?.frustumAnonymousInteriorMeshes ?? 0;
  _frustumGenericInteriorMeshes[i] = rendererInfo?.frustumGenericInteriorMeshes ?? 0;
  _frustumExteriorGlassMeshes[i] = rendererInfo?.frustumExteriorGlassMeshes ?? 0;
  _frustumTransparentMeshes[i] = rendererInfo?.frustumTransparentMeshes ?? 0;
  _frustumTransparentExteriorGlassMeshes[i] =
    rendererInfo?.frustumTransparentExteriorGlassMeshes ?? 0;
  _visiblePracticalDecorLights[i] = rendererInfo?.visiblePracticalDecorLights ?? 0;
  _frustumPracticalDecorLights[i] = rendererInfo?.frustumPracticalDecorLights ?? 0;
  _visiblePracticalWindowLights[i] = rendererInfo?.visiblePracticalWindowLights ?? 0;
  _frustumPracticalWindowLights[i] = rendererInfo?.frustumPracticalWindowLights ?? 0;
  if (rendererInfo) {
    writeFpPracticalDecorLightKindFieldsToRing(
      i,
      fpPracticalDecorLightKindFieldsFromCounter({
        tv: {
          visible: rendererInfo.visiblePracticalDecorTvLights,
          frustum: rendererInfo.frustumPracticalDecorTvLights,
        },
        computer: {
          visible: rendererInfo.visiblePracticalDecorComputerLights,
          frustum: rendererInfo.frustumPracticalDecorComputerLights,
        },
        ceiling: {
          visible: rendererInfo.visiblePracticalDecorCeilingLights,
          frustum: rendererInfo.frustumPracticalDecorCeilingLights,
        },
        chandelier: {
          visible: rendererInfo.visiblePracticalDecorChandelierLights,
          frustum: rendererInfo.frustumPracticalDecorChandelierLights,
        },
        standing: {
          visible: rendererInfo.visiblePracticalDecorStandingLights,
          frustum: rendererInfo.frustumPracticalDecorStandingLights,
        },
        growOp: {
          visible: rendererInfo.visiblePracticalDecorGrowOpLights,
          frustum: rendererInfo.frustumPracticalDecorGrowOpLights,
        },
      }),
      _practicalDecorKindRing,
    );
  } else {
    writeFpPracticalDecorLightKindFieldsToRing(
      i,
      emptyFpPracticalDecorLightKindFields(),
      _practicalDecorKindRing,
    );
  }
  _drawCalls[i] = rendererInfo?.drawCalls ?? 0;
  _triangles[i] = rendererInfo?.triangles ?? 0;
  _sceneGraphVisibleTriangles[i] = rendererInfo?.sceneGraphVisibleTriangles ?? 0;
  _sceneGraphBreakdown[i] = rendererInfo?.sceneGraphBreakdown ?? "";
  _decorInstancedBatches[i] = rendererInfo?.decorInstancedBatchesVisible ?? 0;
  _decorInstancedInstances[i] = rendererInfo?.decorInstancedInstancesVisible ?? 0;
  _decorInstancedHiddenPlacements[i] = rendererInfo?.decorInstancedHiddenPlacements ?? 0;
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
  _visibleApartmentDecorFloorShadowMeshes.fill(0);
  _visibleResidentialShellMeshes.fill(0);
  _visibleAnonymousInteriorMeshes.fill(0);
  _visibleGenericInteriorMeshes.fill(0);
  _visibleExteriorGlassMeshes.fill(0);
  _visibleTransparentMeshes.fill(0);
  _visibleTransparentExteriorGlassMeshes.fill(0);
  _frustumFloorPlates.fill(0);
  _frustumUnitInteriorMeshes.fill(0);
  _frustumApartmentPropMeshes.fill(0);
  _frustumApartmentDecorFloorShadowMeshes.fill(0);
  _frustumResidentialShellMeshes.fill(0);
  _frustumAnonymousInteriorMeshes.fill(0);
  _frustumGenericInteriorMeshes.fill(0);
  _frustumExteriorGlassMeshes.fill(0);
  _frustumTransparentMeshes.fill(0);
  _frustumTransparentExteriorGlassMeshes.fill(0);
  _visiblePracticalDecorLights.fill(0);
  _frustumPracticalDecorLights.fill(0);
  _visiblePracticalWindowLights.fill(0);
  _frustumPracticalWindowLights.fill(0);
  resetFpPracticalDecorLightKindRingBuffers(_practicalDecorKindRing);
  _drawCalls.fill(0);
  _triangles.fill(0);
  _sceneGraphVisibleTriangles.fill(0);
  _sceneGraphBreakdown.fill("");
  _decorInstancedBatches.fill(0);
  _decorInstancedInstances.fill(0);
  _decorInstancedHiddenPlacements.fill(0);
  _cameraYawRad.fill(Number.NaN);
  _pendingGpuRenderMsForNextSample = null;
  _listeners.clear();
  _lastNotifyMs = 0;
  _lastDrawCalls = 0;
  _lastTriangles = 0;
  _lastSceneGraphVisibleTriangles = 0;
  _lastSceneGraphBreakdown = "";
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
  _lastVisiblePracticalDecorLights = 0;
  _lastFrustumPracticalDecorLights = 0;
  _lastVisiblePracticalWindowLights = 0;
  _lastFrustumPracticalWindowLights = 0;
  _lastPracticalDecorLightBreakdownVis = "";
  _lastPracticalDecorLightBreakdownFr = "";
  _lastPracticalDecorKindFields = emptyFpPracticalDecorLightKindFields();
  _lastDecorInstancedBatchesVisible = 0;
  _lastDecorInstancedInstancesVisible = 0;
  _lastDecorInstancedBatchesFrustum = 0;
  _lastDecorInstancedInstancesFrustum = 0;
  _lastDecorInstancedHiddenPlacements = 0;
  _lastDecorInstancedEstDrawSavings = 0;
  _lastDecorInstancingLastRebuild = "";
  _rebuildCachedLastRendererInfo();
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
    visibleApartmentDecorFloorShadowMeshes: number;
    visibleResidentialShellMeshes: number;
    visibleAnonymousInteriorMeshes: number;
    visibleGenericInteriorMeshes: number;
    visibleExteriorGlassMeshes: number;
    visibleTransparentMeshes: number;
    visibleTransparentExteriorGlassMeshes: number;
    frustumFloorPlates: number;
    frustumUnitInteriorMeshes: number;
    frustumApartmentPropMeshes: number;
    frustumApartmentDecorFloorShadowMeshes: number;
    frustumResidentialShellMeshes: number;
    frustumAnonymousInteriorMeshes: number;
    frustumGenericInteriorMeshes: number;
    frustumExteriorGlassMeshes: number;
    frustumTransparentMeshes: number;
    frustumTransparentExteriorGlassMeshes: number;
    visiblePracticalDecorLights: number;
    frustumPracticalDecorLights: number;
    visiblePracticalWindowLights: number;
    frustumPracticalWindowLights: number;
    decorInstancedBatchesVisible: number;
    decorInstancedInstancesVisible: number;
    decorInstancedHiddenPlacements: number;
  } & FpPracticalDecorLightKindFields;
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
  let sumVisibleApartmentDecorFloorShadowMeshes = 0;
  let sumVisibleResidentialShellMeshes = 0;
  let sumVisibleAnonymousInteriorMeshes = 0;
  let sumVisibleGenericInteriorMeshes = 0;
  let sumVisibleExteriorGlassMeshes = 0;
  let sumVisibleTransparentMeshes = 0;
  let sumVisibleTransparentExteriorGlassMeshes = 0;
  let sumFrustumFloorPlates = 0;
  let sumFrustumUnitInteriorMeshes = 0;
  let sumFrustumApartmentPropMeshes = 0;
  let sumFrustumApartmentDecorFloorShadowMeshes = 0;
  let sumFrustumResidentialShellMeshes = 0;
  let sumFrustumAnonymousInteriorMeshes = 0;
  let sumFrustumGenericInteriorMeshes = 0;
  let sumFrustumExteriorGlassMeshes = 0;
  let sumFrustumTransparentMeshes = 0;
  let sumFrustumTransparentExteriorGlassMeshes = 0;
  let sumVisiblePracticalDecorLights = 0;
  let sumFrustumPracticalDecorLights = 0;
  let sumVisiblePracticalWindowLights = 0;
  let sumFrustumPracticalWindowLights = 0;
  let sumDecorInstancedBatches = 0;
  let sumDecorInstancedInstances = 0;
  let sumDecorInstancedHidden = 0;
  const sumPracticalDecorKindFields = emptyFpPracticalDecorLightKindFields();

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
    sumVisibleApartmentDecorFloorShadowMeshes += _visibleApartmentDecorFloorShadowMeshes[i]!;
    sumVisibleResidentialShellMeshes += _visibleResidentialShellMeshes[i]!;
    sumVisibleAnonymousInteriorMeshes += _visibleAnonymousInteriorMeshes[i]!;
    sumVisibleGenericInteriorMeshes += _visibleGenericInteriorMeshes[i]!;
    sumVisibleExteriorGlassMeshes += _visibleExteriorGlassMeshes[i]!;
    sumVisibleTransparentMeshes += _visibleTransparentMeshes[i]!;
    sumVisibleTransparentExteriorGlassMeshes += _visibleTransparentExteriorGlassMeshes[i]!;
    sumFrustumFloorPlates += _frustumFloorPlates[i]!;
    sumFrustumUnitInteriorMeshes += _frustumUnitInteriorMeshes[i]!;
    sumFrustumApartmentPropMeshes += _frustumApartmentPropMeshes[i]!;
    sumFrustumApartmentDecorFloorShadowMeshes += _frustumApartmentDecorFloorShadowMeshes[i]!;
    sumFrustumResidentialShellMeshes += _frustumResidentialShellMeshes[i]!;
    sumFrustumAnonymousInteriorMeshes += _frustumAnonymousInteriorMeshes[i]!;
    sumFrustumGenericInteriorMeshes += _frustumGenericInteriorMeshes[i]!;
    sumFrustumExteriorGlassMeshes += _frustumExteriorGlassMeshes[i]!;
    sumFrustumTransparentMeshes += _frustumTransparentMeshes[i]!;
    sumFrustumTransparentExteriorGlassMeshes += _frustumTransparentExteriorGlassMeshes[i]!;
    sumVisiblePracticalDecorLights += _visiblePracticalDecorLights[i]!;
    sumFrustumPracticalDecorLights += _frustumPracticalDecorLights[i]!;
    sumVisiblePracticalWindowLights += _visiblePracticalWindowLights[i]!;
    sumFrustumPracticalWindowLights += _frustumPracticalWindowLights[i]!;
    sumDecorInstancedBatches += _decorInstancedBatches[i]!;
    sumDecorInstancedInstances += _decorInstancedInstances[i]!;
    sumDecorInstancedHidden += _decorInstancedHiddenPlacements[i]!;
    addFpPracticalDecorLightKindFields(
      sumPracticalDecorKindFields,
      readFpPracticalDecorLightKindFieldsFromRing(i, _practicalDecorKindRing),
    );
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
  const avgVisibleApartmentDecorFloorShadowMeshes = sumVisibleApartmentDecorFloorShadowMeshes / n;
  const avgVisibleResidentialShellMeshes = sumVisibleResidentialShellMeshes / n;
  const avgVisibleAnonymousInteriorMeshes = sumVisibleAnonymousInteriorMeshes / n;
  const avgVisibleGenericInteriorMeshes = sumVisibleGenericInteriorMeshes / n;
  const avgVisibleExteriorGlassMeshes = sumVisibleExteriorGlassMeshes / n;
  const avgVisibleTransparentMeshes = sumVisibleTransparentMeshes / n;
  const avgVisibleTransparentExteriorGlassMeshes = sumVisibleTransparentExteriorGlassMeshes / n;
  const avgFrustumFloorPlates = sumFrustumFloorPlates / n;
  const avgFrustumUnitInteriorMeshes = sumFrustumUnitInteriorMeshes / n;
  const avgFrustumApartmentPropMeshes = sumFrustumApartmentPropMeshes / n;
  const avgFrustumApartmentDecorFloorShadowMeshes = sumFrustumApartmentDecorFloorShadowMeshes / n;
  const avgFrustumResidentialShellMeshes = sumFrustumResidentialShellMeshes / n;
  const avgFrustumAnonymousInteriorMeshes = sumFrustumAnonymousInteriorMeshes / n;
  const avgFrustumGenericInteriorMeshes = sumFrustumGenericInteriorMeshes / n;
  const avgFrustumExteriorGlassMeshes = sumFrustumExteriorGlassMeshes / n;
  const avgFrustumTransparentMeshes = sumFrustumTransparentMeshes / n;
  const avgFrustumTransparentExteriorGlassMeshes = sumFrustumTransparentExteriorGlassMeshes / n;
  const avgVisiblePracticalDecorLights = sumVisiblePracticalDecorLights / n;
  const avgFrustumPracticalDecorLights = sumFrustumPracticalDecorLights / n;
  const avgVisiblePracticalWindowLights = sumVisiblePracticalWindowLights / n;
  const avgFrustumPracticalWindowLights = sumFrustumPracticalWindowLights / n;
  const avgPracticalDecorKindFields = scaleFpPracticalDecorLightKindFields(
    sumPracticalDecorKindFields,
    n,
  );
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
      visibleApartmentDecorFloorShadowMeshes:
        Math.round(avgVisibleApartmentDecorFloorShadowMeshes * 10) / 10,
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
      frustumApartmentDecorFloorShadowMeshes:
        Math.round(avgFrustumApartmentDecorFloorShadowMeshes * 10) / 10,
      frustumResidentialShellMeshes: Math.round(avgFrustumResidentialShellMeshes * 10) / 10,
      frustumAnonymousInteriorMeshes: Math.round(avgFrustumAnonymousInteriorMeshes * 10) / 10,
      frustumGenericInteriorMeshes: Math.round(avgFrustumGenericInteriorMeshes * 10) / 10,
      frustumExteriorGlassMeshes: Math.round(avgFrustumExteriorGlassMeshes * 10) / 10,
      frustumTransparentMeshes: Math.round(avgFrustumTransparentMeshes * 10) / 10,
      frustumTransparentExteriorGlassMeshes:
        Math.round(avgFrustumTransparentExteriorGlassMeshes * 10) / 10,
      visiblePracticalDecorLights: Math.round(avgVisiblePracticalDecorLights * 10) / 10,
      frustumPracticalDecorLights: Math.round(avgFrustumPracticalDecorLights * 10) / 10,
      visiblePracticalWindowLights: Math.round(avgVisiblePracticalWindowLights * 10) / 10,
      frustumPracticalWindowLights: Math.round(avgFrustumPracticalWindowLights * 10) / 10,
      decorInstancedBatchesVisible: Math.round((sumDecorInstancedBatches / n) * 10) / 10,
      decorInstancedInstancesVisible: Math.round((sumDecorInstancedInstances / n) * 10) / 10,
      decorInstancedHiddenPlacements: Math.round((sumDecorInstancedHidden / n) * 10) / 10,
      ...avgPracticalDecorKindFields,
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
  sceneGraphVisibleTriangles: number;
  sceneGraphBreakdown: string;
  visibleFloorPlates: number;
  visibleUnitInteriorMeshes: number;
  visibleApartmentPropMeshes: number;
  visibleApartmentDecorFloorShadowMeshes: number;
  visibleResidentialShellMeshes: number;
  visibleAnonymousInteriorMeshes: number;
  visibleGenericInteriorMeshes: number;
  visibleExteriorGlassMeshes: number;
  visibleTransparentMeshes: number;
  visibleTransparentExteriorGlassMeshes: number;
  frustumFloorPlates: number;
  frustumUnitInteriorMeshes: number;
  frustumApartmentPropMeshes: number;
  frustumApartmentDecorFloorShadowMeshes: number;
  frustumResidentialShellMeshes: number;
  frustumAnonymousInteriorMeshes: number;
  frustumGenericInteriorMeshes: number;
  frustumExteriorGlassMeshes: number;
  frustumTransparentMeshes: number;
  frustumTransparentExteriorGlassMeshes: number;
  visiblePracticalDecorLights: number;
  frustumPracticalDecorLights: number;
  visiblePracticalWindowLights: number;
  frustumPracticalWindowLights: number;
  /** Camera yaw (rad); `null` if not recorded this frame. */
  cameraYawRad: number | null;
  decorInstancedBatchesVisible: number;
  decorInstancedInstancesVisible: number;
  decorInstancedHiddenPlacements: number;
} & FpPracticalDecorLightKindFields;

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
    sceneGraphVisibleTriangles: _sceneGraphVisibleTriangles[i]!,
    sceneGraphBreakdown: _sceneGraphBreakdown[i] ?? "",
    visibleFloorPlates: _visibleFloorPlates[i]!,
    visibleUnitInteriorMeshes: _visibleUnitInteriorMeshes[i]!,
    visibleApartmentPropMeshes: _visibleApartmentPropMeshes[i]!,
    visibleApartmentDecorFloorShadowMeshes: _visibleApartmentDecorFloorShadowMeshes[i]!,
    visibleResidentialShellMeshes: _visibleResidentialShellMeshes[i]!,
    visibleAnonymousInteriorMeshes: _visibleAnonymousInteriorMeshes[i]!,
    visibleGenericInteriorMeshes: _visibleGenericInteriorMeshes[i]!,
    visibleExteriorGlassMeshes: _visibleExteriorGlassMeshes[i]!,
    visibleTransparentMeshes: _visibleTransparentMeshes[i]!,
    visibleTransparentExteriorGlassMeshes: _visibleTransparentExteriorGlassMeshes[i]!,
    frustumFloorPlates: _frustumFloorPlates[i]!,
    frustumUnitInteriorMeshes: _frustumUnitInteriorMeshes[i]!,
    frustumApartmentPropMeshes: _frustumApartmentPropMeshes[i]!,
    frustumApartmentDecorFloorShadowMeshes: _frustumApartmentDecorFloorShadowMeshes[i]!,
    frustumResidentialShellMeshes: _frustumResidentialShellMeshes[i]!,
    frustumAnonymousInteriorMeshes: _frustumAnonymousInteriorMeshes[i]!,
    frustumGenericInteriorMeshes: _frustumGenericInteriorMeshes[i]!,
    frustumExteriorGlassMeshes: _frustumExteriorGlassMeshes[i]!,
    frustumTransparentMeshes: _frustumTransparentMeshes[i]!,
    frustumTransparentExteriorGlassMeshes: _frustumTransparentExteriorGlassMeshes[i]!,
    visiblePracticalDecorLights: _visiblePracticalDecorLights[i]!,
    frustumPracticalDecorLights: _frustumPracticalDecorLights[i]!,
    visiblePracticalWindowLights: _visiblePracticalWindowLights[i]!,
    frustumPracticalWindowLights: _frustumPracticalWindowLights[i]!,
    ...readFpPracticalDecorLightKindFieldsFromRing(i, _practicalDecorKindRing),
    cameraYawRad: Number.isFinite(yaw) ? yaw : null,
    decorInstancedBatchesVisible: _decorInstancedBatches[i]!,
    decorInstancedInstancesVisible: _decorInstancedInstances[i]!,
    decorInstancedHiddenPlacements: _decorInstancedHiddenPlacements[i]!,
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
  let sumVisibleApartmentDecorFloorShadowMeshes = 0;
  let sumVisibleResidentialShellMeshes = 0;
  let sumVisibleAnonymousInteriorMeshes = 0;
  let sumVisibleGenericInteriorMeshes = 0;
  let sumVisibleExteriorGlassMeshes = 0;
  let sumVisibleTransparentMeshes = 0;
  let sumVisibleTransparentExteriorGlassMeshes = 0;
  let sumFrustumFloorPlates = 0;
  let sumFrustumUnitInteriorMeshes = 0;
  let sumFrustumApartmentPropMeshes = 0;
  let sumFrustumApartmentDecorFloorShadowMeshes = 0;
  let sumFrustumResidentialShellMeshes = 0;
  let sumFrustumAnonymousInteriorMeshes = 0;
  let sumFrustumGenericInteriorMeshes = 0;
  let sumFrustumExteriorGlassMeshes = 0;
  let sumFrustumTransparentMeshes = 0;
  let sumFrustumTransparentExteriorGlassMeshes = 0;
  let sumVisiblePracticalDecorLights = 0;
  let sumFrustumPracticalDecorLights = 0;
  let sumVisiblePracticalWindowLights = 0;
  let sumFrustumPracticalWindowLights = 0;
  let sumDecorInstancedBatches = 0;
  let sumDecorInstancedInstances = 0;
  let sumDecorInstancedHidden = 0;
  const sumPracticalDecorKindFields = emptyFpPracticalDecorLightKindFields();

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
    sumVisibleApartmentDecorFloorShadowMeshes += row.visibleApartmentDecorFloorShadowMeshes;
    sumVisibleResidentialShellMeshes += row.visibleResidentialShellMeshes;
    sumVisibleAnonymousInteriorMeshes += row.visibleAnonymousInteriorMeshes;
    sumVisibleGenericInteriorMeshes += row.visibleGenericInteriorMeshes;
    sumVisibleExteriorGlassMeshes += row.visibleExteriorGlassMeshes;
    sumVisibleTransparentMeshes += row.visibleTransparentMeshes;
    sumVisibleTransparentExteriorGlassMeshes += row.visibleTransparentExteriorGlassMeshes;
    sumFrustumFloorPlates += row.frustumFloorPlates;
    sumFrustumUnitInteriorMeshes += row.frustumUnitInteriorMeshes;
    sumFrustumApartmentPropMeshes += row.frustumApartmentPropMeshes;
    sumFrustumApartmentDecorFloorShadowMeshes += row.frustumApartmentDecorFloorShadowMeshes;
    sumFrustumResidentialShellMeshes += row.frustumResidentialShellMeshes;
    sumFrustumAnonymousInteriorMeshes += row.frustumAnonymousInteriorMeshes;
    sumFrustumGenericInteriorMeshes += row.frustumGenericInteriorMeshes;
    sumFrustumExteriorGlassMeshes += row.frustumExteriorGlassMeshes;
    sumFrustumTransparentMeshes += row.frustumTransparentMeshes;
    sumFrustumTransparentExteriorGlassMeshes += row.frustumTransparentExteriorGlassMeshes;
    sumVisiblePracticalDecorLights += row.visiblePracticalDecorLights;
    sumFrustumPracticalDecorLights += row.frustumPracticalDecorLights;
    sumVisiblePracticalWindowLights += row.visiblePracticalWindowLights;
    sumFrustumPracticalWindowLights += row.frustumPracticalWindowLights;
    sumDecorInstancedBatches += row.decorInstancedBatchesVisible;
    sumDecorInstancedInstances += row.decorInstancedInstancesVisible;
    sumDecorInstancedHidden += row.decorInstancedHiddenPlacements;
    addFpPracticalDecorLightKindFields(sumPracticalDecorKindFields, row);
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
  const avgVisibleApartmentDecorFloorShadowMeshes = sumVisibleApartmentDecorFloorShadowMeshes / n;
  const avgVisibleResidentialShellMeshes = sumVisibleResidentialShellMeshes / n;
  const avgVisibleAnonymousInteriorMeshes = sumVisibleAnonymousInteriorMeshes / n;
  const avgVisibleGenericInteriorMeshes = sumVisibleGenericInteriorMeshes / n;
  const avgVisibleExteriorGlassMeshes = sumVisibleExteriorGlassMeshes / n;
  const avgVisibleTransparentMeshes = sumVisibleTransparentMeshes / n;
  const avgVisibleTransparentExteriorGlassMeshes = sumVisibleTransparentExteriorGlassMeshes / n;
  const avgFrustumFloorPlates = sumFrustumFloorPlates / n;
  const avgFrustumUnitInteriorMeshes = sumFrustumUnitInteriorMeshes / n;
  const avgFrustumApartmentPropMeshes = sumFrustumApartmentPropMeshes / n;
  const avgFrustumApartmentDecorFloorShadowMeshes = sumFrustumApartmentDecorFloorShadowMeshes / n;
  const avgFrustumResidentialShellMeshes = sumFrustumResidentialShellMeshes / n;
  const avgFrustumAnonymousInteriorMeshes = sumFrustumAnonymousInteriorMeshes / n;
  const avgFrustumGenericInteriorMeshes = sumFrustumGenericInteriorMeshes / n;
  const avgFrustumExteriorGlassMeshes = sumFrustumExteriorGlassMeshes / n;
  const avgFrustumTransparentMeshes = sumFrustumTransparentMeshes / n;
  const avgFrustumTransparentExteriorGlassMeshes = sumFrustumTransparentExteriorGlassMeshes / n;
  const avgVisiblePracticalDecorLights = sumVisiblePracticalDecorLights / n;
  const avgFrustumPracticalDecorLights = sumFrustumPracticalDecorLights / n;
  const avgVisiblePracticalWindowLights = sumVisiblePracticalWindowLights / n;
  const avgFrustumPracticalWindowLights = sumFrustumPracticalWindowLights / n;
  const avgPracticalDecorKindFields = scaleFpPracticalDecorLightKindFields(
    sumPracticalDecorKindFields,
    n,
  );
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
      visibleApartmentDecorFloorShadowMeshes:
        Math.round(avgVisibleApartmentDecorFloorShadowMeshes * 10) / 10,
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
      frustumApartmentDecorFloorShadowMeshes:
        Math.round(avgFrustumApartmentDecorFloorShadowMeshes * 10) / 10,
      frustumResidentialShellMeshes: Math.round(avgFrustumResidentialShellMeshes * 10) / 10,
      frustumAnonymousInteriorMeshes: Math.round(avgFrustumAnonymousInteriorMeshes * 10) / 10,
      frustumGenericInteriorMeshes: Math.round(avgFrustumGenericInteriorMeshes * 10) / 10,
      frustumExteriorGlassMeshes: Math.round(avgFrustumExteriorGlassMeshes * 10) / 10,
      frustumTransparentMeshes: Math.round(avgFrustumTransparentMeshes * 10) / 10,
      frustumTransparentExteriorGlassMeshes:
        Math.round(avgFrustumTransparentExteriorGlassMeshes * 10) / 10,
      visiblePracticalDecorLights: Math.round(avgVisiblePracticalDecorLights * 10) / 10,
      frustumPracticalDecorLights: Math.round(avgFrustumPracticalDecorLights * 10) / 10,
      visiblePracticalWindowLights: Math.round(avgVisiblePracticalWindowLights * 10) / 10,
      frustumPracticalWindowLights: Math.round(avgFrustumPracticalWindowLights * 10) / 10,
      decorInstancedBatchesVisible: Math.round((sumDecorInstancedBatches / n) * 10) / 10,
      decorInstancedInstancesVisible: Math.round((sumDecorInstancedInstances / n) * 10) / 10,
      decorInstancedHiddenPlacements: Math.round((sumDecorInstancedHidden / n) * 10) / 10,
      ...avgPracticalDecorKindFields,
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
      sceneGraphVisibleTriangles: 0,
      sceneGraphBreakdown: "",
      visibleFloorPlates: 0,
      visibleUnitInteriorMeshes: 0,
      visibleApartmentPropMeshes: 0,
      visibleApartmentDecorFloorShadowMeshes: 0,
      visibleResidentialShellMeshes: 0,
      visibleAnonymousInteriorMeshes: 0,
      visibleGenericInteriorMeshes: 0,
      visibleExteriorGlassMeshes: 0,
      visibleTransparentMeshes: 0,
      visibleTransparentExteriorGlassMeshes: 0,
      frustumFloorPlates: 0,
      frustumUnitInteriorMeshes: 0,
      frustumApartmentPropMeshes: 0,
      frustumApartmentDecorFloorShadowMeshes: 0,
      frustumResidentialShellMeshes: 0,
      frustumAnonymousInteriorMeshes: 0,
      frustumGenericInteriorMeshes: 0,
      frustumExteriorGlassMeshes: 0,
      frustumTransparentMeshes: 0,
      frustumTransparentExteriorGlassMeshes: 0,
      visiblePracticalDecorLights: 0,
      frustumPracticalDecorLights: 0,
      visiblePracticalWindowLights: 0,
      frustumPracticalWindowLights: 0,
      practicalDecorLightBreakdownVis: "(none)",
      practicalDecorLightBreakdownFr: "(none)",
      decorInstancedBatchesVisible: 0,
      decorInstancedInstancesVisible: 0,
      decorInstancedBatchesFrustum: 0,
      decorInstancedInstancesFrustum: 0,
      decorInstancedHiddenPlacements: 0,
      decorInstancedEstDrawSavings: 0,
      decorInstancingLastRebuild: "",
      ...emptyFpPracticalDecorLightKindFields(),
    };
  }
  let drawCalls = 0;
  let triangles = 0;
  let sceneGraphVisibleTriangles = 0;
  let sceneGraphBreakdown = "";
  let visibleFloorPlates = 0;
  let visibleUnitInteriorMeshes = 0;
  let visibleApartmentPropMeshes = 0;
  let visibleApartmentDecorFloorShadowMeshes = 0;
  let visibleResidentialShellMeshes = 0;
  let visibleAnonymousInteriorMeshes = 0;
  let visibleGenericInteriorMeshes = 0;
  let visibleExteriorGlassMeshes = 0;
  let visibleTransparentMeshes = 0;
  let visibleTransparentExteriorGlassMeshes = 0;
  let frustumFloorPlates = 0;
  let frustumUnitInteriorMeshes = 0;
  let frustumApartmentPropMeshes = 0;
  let frustumApartmentDecorFloorShadowMeshes = 0;
  let frustumResidentialShellMeshes = 0;
  let frustumAnonymousInteriorMeshes = 0;
  let frustumGenericInteriorMeshes = 0;
  let frustumExteriorGlassMeshes = 0;
  let frustumTransparentMeshes = 0;
  let frustumTransparentExteriorGlassMeshes = 0;
  let visiblePracticalDecorLights = 0;
  let frustumPracticalDecorLights = 0;
  let visiblePracticalWindowLights = 0;
  let frustumPracticalWindowLights = 0;
  let decorInstancedBatchesVisible = 0;
  let decorInstancedInstancesVisible = 0;
  let decorInstancedHiddenPlacements = 0;
  const sumPracticalDecorKindFields = emptyFpPracticalDecorLightKindFields();
  for (const s of samples) {
    drawCalls += s.drawCalls;
    triangles += s.triangles;
    sceneGraphVisibleTriangles += s.sceneGraphVisibleTriangles;
    if ((s.sceneGraphBreakdown ?? "").length > 0) sceneGraphBreakdown = s.sceneGraphBreakdown ?? "";
    visibleFloorPlates += s.visibleFloorPlates;
    visibleUnitInteriorMeshes += s.visibleUnitInteriorMeshes;
    visibleApartmentPropMeshes += s.visibleApartmentPropMeshes;
    visibleApartmentDecorFloorShadowMeshes += s.visibleApartmentDecorFloorShadowMeshes;
    visibleResidentialShellMeshes += s.visibleResidentialShellMeshes;
    visibleAnonymousInteriorMeshes += s.visibleAnonymousInteriorMeshes;
    visibleGenericInteriorMeshes += s.visibleGenericInteriorMeshes;
    visibleExteriorGlassMeshes += s.visibleExteriorGlassMeshes;
    visibleTransparentMeshes += s.visibleTransparentMeshes;
    visibleTransparentExteriorGlassMeshes += s.visibleTransparentExteriorGlassMeshes;
    frustumFloorPlates += s.frustumFloorPlates;
    frustumUnitInteriorMeshes += s.frustumUnitInteriorMeshes;
    frustumApartmentPropMeshes += s.frustumApartmentPropMeshes;
    frustumApartmentDecorFloorShadowMeshes += s.frustumApartmentDecorFloorShadowMeshes;
    frustumResidentialShellMeshes += s.frustumResidentialShellMeshes;
    frustumAnonymousInteriorMeshes += s.frustumAnonymousInteriorMeshes;
    frustumGenericInteriorMeshes += s.frustumGenericInteriorMeshes;
    frustumExteriorGlassMeshes += s.frustumExteriorGlassMeshes;
    frustumTransparentMeshes += s.frustumTransparentMeshes;
    frustumTransparentExteriorGlassMeshes += s.frustumTransparentExteriorGlassMeshes;
    visiblePracticalDecorLights += s.visiblePracticalDecorLights;
    frustumPracticalDecorLights += s.frustumPracticalDecorLights;
    visiblePracticalWindowLights += s.visiblePracticalWindowLights;
    frustumPracticalWindowLights += s.frustumPracticalWindowLights;
    decorInstancedBatchesVisible += s.decorInstancedBatchesVisible;
    decorInstancedInstancesVisible += s.decorInstancedInstancesVisible;
    decorInstancedHiddenPlacements += s.decorInstancedHiddenPlacements;
    addFpPracticalDecorLightKindFields(sumPracticalDecorKindFields, s);
  }
  const r1 = (sum: number) => Math.round((sum / n) * 10) / 10;
  const avgKindFields = scaleFpPracticalDecorLightKindFields(sumPracticalDecorKindFields, n);
  const avgDecorBatches = r1(decorInstancedBatchesVisible);
  const avgDecorHidden = r1(decorInstancedHiddenPlacements);
  return {
    drawCalls: Math.round(drawCalls / n),
    triangles: Math.round(triangles / n),
    sceneGraphVisibleTriangles: Math.round(sceneGraphVisibleTriangles / n),
    sceneGraphBreakdown,
    visibleFloorPlates: r1(visibleFloorPlates),
    visibleUnitInteriorMeshes: r1(visibleUnitInteriorMeshes),
    visibleApartmentPropMeshes: r1(visibleApartmentPropMeshes),
    visibleApartmentDecorFloorShadowMeshes: r1(visibleApartmentDecorFloorShadowMeshes),
    visibleResidentialShellMeshes: r1(visibleResidentialShellMeshes),
    visibleAnonymousInteriorMeshes: r1(visibleAnonymousInteriorMeshes),
    visibleGenericInteriorMeshes: r1(visibleGenericInteriorMeshes),
    visibleExteriorGlassMeshes: r1(visibleExteriorGlassMeshes),
    visibleTransparentMeshes: r1(visibleTransparentMeshes),
    visibleTransparentExteriorGlassMeshes: r1(visibleTransparentExteriorGlassMeshes),
    frustumFloorPlates: r1(frustumFloorPlates),
    frustumUnitInteriorMeshes: r1(frustumUnitInteriorMeshes),
    frustumApartmentPropMeshes: r1(frustumApartmentPropMeshes),
    frustumApartmentDecorFloorShadowMeshes: r1(frustumApartmentDecorFloorShadowMeshes),
    frustumResidentialShellMeshes: r1(frustumResidentialShellMeshes),
    frustumAnonymousInteriorMeshes: r1(frustumAnonymousInteriorMeshes),
    frustumGenericInteriorMeshes: r1(frustumGenericInteriorMeshes),
    frustumExteriorGlassMeshes: r1(frustumExteriorGlassMeshes),
    frustumTransparentMeshes: r1(frustumTransparentMeshes),
    frustumTransparentExteriorGlassMeshes: r1(frustumTransparentExteriorGlassMeshes),
    visiblePracticalDecorLights: r1(visiblePracticalDecorLights),
    frustumPracticalDecorLights: r1(frustumPracticalDecorLights),
    visiblePracticalWindowLights: r1(visiblePracticalWindowLights),
    frustumPracticalWindowLights: r1(frustumPracticalWindowLights),
    practicalDecorLightBreakdownVis: formatFpPracticalDecorLightKindAverages(avgKindFields, "visible"),
    practicalDecorLightBreakdownFr: formatFpPracticalDecorLightKindAverages(avgKindFields, "frustum"),
    decorInstancedBatchesVisible: avgDecorBatches,
    decorInstancedInstancesVisible: r1(decorInstancedInstancesVisible),
    decorInstancedBatchesFrustum: avgDecorBatches,
    decorInstancedInstancesFrustum: r1(decorInstancedInstancesVisible),
    decorInstancedHiddenPlacements: avgDecorHidden,
    decorInstancedEstDrawSavings: Math.max(0, Math.round(avgDecorHidden - avgDecorBatches)),
    decorInstancingLastRebuild: getLastRendererInfo().decorInstancingLastRebuild,
    ...avgKindFields,
  };
}

/** Tab-separated timeline dump for chat/logs (includes header row). */
export function exportFpPerfTimelineDump(samples: readonly FpPerfTimelineSample[]): string {
  if (samples.length === 0) return "(no samples)";
  const t0 = samples[0]!.tMs;
  const header =
    "tMs\trelMs\ttotalMs\trenderMs\trenderThreeMs\tphysicsMs\tdrawCalls\tkTri\tdecorInstB\tdecorInstN\tdecorInstHidden\tvisUI\tfrUI\tfrProps\tfrDecorLights\tfrTv\tfrComputer\tfrCeiling\tfrChandelier\tfrStanding\tfrGrowOp\tfrWindowLights\tuiShell\tuiAnon\tuiGlass\ttrGlass\tfrTrans\tyawDeg";
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
      Math.round(s.decorInstancedBatchesVisible),
      Math.round(s.decorInstancedInstancesVisible),
      Math.round(s.decorInstancedHiddenPlacements),
      Math.round(s.visibleUnitInteriorMeshes),
      Math.round(s.frustumUnitInteriorMeshes),
      Math.round(s.frustumApartmentPropMeshes),
      Math.round(s.frustumPracticalDecorLights),
      Math.round(s.frustumPracticalDecorTvLights),
      Math.round(s.frustumPracticalDecorComputerLights),
      Math.round(s.frustumPracticalDecorCeilingLights),
      Math.round(s.frustumPracticalDecorChandelierLights),
      Math.round(s.frustumPracticalDecorStandingLights),
      Math.round(s.frustumPracticalDecorGrowOpLights),
      Math.round(s.frustumPracticalWindowLights),
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
  opts?: {
    headerCountsAreTimelineAverage?: boolean;
    reportNowMs?: number;
    timelineSamples?: readonly FpPerfTimelineSample[];
  },
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
    `Renderer${hdrNote}: ${ri.drawCalls} draw calls  ${(ri.triangles / 1000).toFixed(1)}k GPU tris`,
    ri.sceneGraphVisibleTriangles > 0
      ? `Scene graph${hdrNote}: ${(ri.sceneGraphVisibleTriangles / 1000).toFixed(1)}k mesh tris (instanced base×count)  |  GPU ${(ri.triangles / 1000).toFixed(1)}k`
      : `Scene graph${hdrNote}: n/a  (run __fpDebug.auditScene() in console)`,
    ...(ri.sceneGraphBreakdown.length > 0
      ? [`Scene graph breakdown${hdrNote}: ${ri.sceneGraphBreakdown}`]
      : []),
    `Scene${hdrNote}   vis: plates=${ri.visibleFloorPlates}  unitInterior=${ri.visibleUnitInteriorMeshes}  props=${ri.visibleApartmentPropMeshes}  decorShadows=${ri.visibleApartmentDecorFloorShadowMeshes}  decorLights=${ri.visiblePracticalDecorLights}  windowLights=${ri.visiblePracticalWindowLights}  transparent=${ri.visibleTransparentMeshes}`,
    `        fr${hdrNote}:  plates=${ri.frustumFloorPlates}  unitInterior=${ri.frustumUnitInteriorMeshes}  props=${ri.frustumApartmentPropMeshes}  decorShadows=${ri.frustumApartmentDecorFloorShadowMeshes}  decorLights=${ri.frustumPracticalDecorLights}  windowLights=${ri.frustumPracticalWindowLights}  transparent=${ri.frustumTransparentMeshes}`,
    `Decor kinds${hdrNote} vis: ${ri.practicalDecorLightBreakdownVis}  (active only: intensity > 0)`,
    `Decor kinds${hdrNote} fr:  ${ri.practicalDecorLightBreakdownFr}`,
    (ri.decorInstancedBatchesVisible ?? 0) > 0 || (ri.decorInstancedHiddenPlacements ?? 0) > 0
      ? `Decor instancing${hdrNote}: ${ri.decorInstancedBatchesVisible} batches (${ri.decorInstancedInstancesVisible} inst)  hidden=${ri.decorInstancedHiddenPlacements}  est.saved≈${ri.decorInstancedEstDrawSavings} dc  fr=${ri.decorInstancedBatchesFrustum}/${ri.decorInstancedInstancesFrustum}`
      : "Decor instancing: (none active — need ≥3 identical props per scope)",
    ...((ri.decorInstancingLastRebuild ?? "").length > 0
      ? [`Last decor instancing rebuild: ${ri.decorInstancingLastRebuild}`]
      : []),
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
    `  decorShadows vis ${sceneCounts.visibleApartmentDecorFloorShadowMeshes.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumApartmentDecorFloorShadowMeshes.toFixed(1).padStart(6)}`,
    `  decorLights  vis ${sceneCounts.visiblePracticalDecorLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalDecorLights.toFixed(1).padStart(6)}`,
    `  windowLights vis ${sceneCounts.visiblePracticalWindowLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalWindowLights.toFixed(1).padStart(6)}`,
    `  decorTv       vis ${sceneCounts.visiblePracticalDecorTvLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalDecorTvLights.toFixed(1).padStart(6)}`,
    `  decorComputer vis ${sceneCounts.visiblePracticalDecorComputerLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalDecorComputerLights.toFixed(1).padStart(6)}`,
    `  decorCeiling  vis ${sceneCounts.visiblePracticalDecorCeilingLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalDecorCeilingLights.toFixed(1).padStart(6)}`,
    `  decorChandelier vis ${sceneCounts.visiblePracticalDecorChandelierLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalDecorChandelierLights.toFixed(1).padStart(6)}`,
    `  decorStanding vis ${sceneCounts.visiblePracticalDecorStandingLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalDecorStandingLights.toFixed(1).padStart(6)}`,
    `  decorGrowOp   vis ${sceneCounts.visiblePracticalDecorGrowOpLights.toFixed(1).padStart(6)}  fr ${sceneCounts.frustumPracticalDecorGrowOpLights.toFixed(1).padStart(6)}`,
    `  decorInst     vis ${sceneCounts.decorInstancedBatchesVisible.toFixed(1).padStart(6)} batches  ${sceneCounts.decorInstancedInstancesVisible.toFixed(1).padStart(6)} inst  hidden ${sceneCounts.decorInstancedHiddenPlacements.toFixed(1).padStart(6)}`,
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
    ...(opts?.timelineSamples && opts.timelineSamples.length > 0
      ? [...formatFpPerfSpikeCorrelationReport(opts.timelineSamples).split("\n"), ""]
      : []),
    `Generated: ${new Date().toISOString()}`,
  ];
  return lines.join("\n");
}

export function exportFpPerfReport(nowMs: number, windowSec: number): string {
  const s = computeFpPerfStats(nowMs, windowSec);
  if (!s) return "No profiler data available yet.";
  const timelineSamples = getFpPerfTimeline(nowMs, windowSec);
  return formatFpPerfReportMarkdown(s, getLastRendererInfo(), {
    reportNowMs: nowMs,
    timelineSamples,
  });
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
    timelineSamples: samples,
  });
  const dump = exportFpPerfTimelineDump(samples);
  return `${summary}\n\n=== Timeline (${samples.length} samples · ${nominalWindowSec}s window) ===\n${dump}\n`;
}
