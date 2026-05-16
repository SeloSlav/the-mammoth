import * as THREE from "three";
import type { DbConnection } from "../module_bindings";
import type { PlayerPose, PlayerVitals } from "../module_bindings/types";
import {
  bumpGuestFeetAutosaveIfDue,
  persistActiveGuestLastWorldPose,
  readActiveGuestLastWorldPose,
} from "../spacetime/guestSavedWorldPose.js";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
  createFPRig,
  createFpLocomotionState,
  equippedHeldItemIdFromDefId,
  fpLocomotionConstants,
  queueFpJump,
  PlayerPresentationManager,
  REMOTE_PLAYER_BODY_URI_FEMALE,
  REMOTE_PLAYER_BODY_URI_MALE,
  type FpLocomotionInput,
} from "@the-mammoth/engine";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  ENABLE_STAIRWELL_GRAFFITI_DECALS,
  ensureStairwellCigaretteMeshReady,
  maxBuildingLevelIndex,
  parseFloorDoc,
} from "@the-mammoth/world";
import {
  collectFpSessionUnitInteriorMeshEntries,
  collectFpSessionTopFloorResidentialUnitShellMeshes,
} from "./fpSession/fpSessionUnitInteriorShellMeshes.js";
import { installFpSessionTransientDebugConsole } from "./fpSession/fpSessionTransientDebugConsole.js";
import { createFpSessionFloorPlateVisibility } from "./fpSession/fpSessionFloorPlateVisibility.js";
import { createFpSessionMoveIntentChannel } from "./fpSession/fpSessionMoveIntentChannel.js";
import {
  createFpSessionMainRafFrame,
  type FpSessionMainRafState,
} from "./fpSession/fpSessionMainRafFrame.js";
import { createFpFirearmImpactDecals } from "./fpSession/fpFirearmImpactDecals.js";
import { createFpPlayerDamageBloodSquirt } from "./fpSession/fpPlayerDamageBloodSquirt.js";
import {
  wireFpSessionLocomotionPrediction,
} from "./fpSession/fpSessionLocomotionPredictionWiring.js";
import {
  type FpSessionMoveIntentQueue,
} from "./fpSession/fpSessionLocalPrediction.js";
import { installFpSessionDevDebugApis } from "./fpSession/fpSessionDevDebugApis.js";
import {
  registerFpDebugMenuSessionSnapshot,
  unregisterFpDebugMenuSessionSnapshot,
} from "./fpDebugMenuSessionBridge.js";
import { installMmWallProbeLoadingStub } from "./fpSession/fpSessionWallProbeStub.js";
import { disposeStaticWorldObjectTree } from "./fpSession/fpSessionStaticWorldDispose.js";
import {
  forgetMegablockStaticWorldMeshCache,
  waitMegablockStaticWorldMeshReady,
} from "./fpSession/fpSessionStaticWorldMeshCache.js";
import { floorPayloadByDocId } from "./fpSession/fpSessionContentLoad.js";
import { effectiveDevGameplayEquippedPrimary } from "./fpDev/devGameplayWeaponOverride.js";
import {
  fpHotbarDigitKeySuppressedByDebounce,
  HOTBAR_SLOT_COUNT,
  hotbarSlotHasInstantConsume,
} from "./fpHotbar/fpHotbarActivate.js";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "./fpHotbar/fpHotbarSelection.js";
import {
  ACTIVE_HOTBAR_SLOT_CLEARED,
  getHotbarSlotInventoryItem,
} from "./fpHotbar/fpHotbarResolve.js";
import {
  apartmentFurnitureInteriorsPreferOverUnitDoor,
  apartmentUnitContainingFeetSlack,
  getApartmentSystemPrompt,
} from "./fpApartment/fpApartmentGameplay.js";
import { APARTMENT_CLAIM_UI_ENABLED } from "../featureFlags";
import {
  attachFpSessionEnvironment,
  FP_SESSION_SKY_CAMERA_FAR,
} from "./fpSession/fpSessionEnvironment.js";
import { resetFpSessionCompassHeading } from "./fpSession/fpSessionCompassHeading.js";
import { resetFpSessionFpsDisplay } from "./fpSession/fpSessionFpsDisplay.js";
import {
  resetFpSessionGameUiHidden,
  toggleFpSessionGameUiHidden,
} from "./fpSession/fpSessionGameUiHidden.js";
import { createFpSessionPerfDebugPostRenderHook } from "./fpSession/fpSessionPerfDebug.js";
import { mountFpApartmentDoors } from "./fpApartment/fpApartmentDoors.js";
import {
  isApartmentUnitBoundsDebugEnabled,
  mountFpApartmentFurniture,
} from "./fpApartment/fpApartmentFurniture.js";
import { mountFpApartmentDecorMeshes } from "./fpApartment/fpApartmentDecorMeshes.js";
import { tagMergedResidentialShellMeshes } from "./fpApartment/fpResidentialUnitInteriorLayer.js";
import { ElevatorCabMotionAudio } from "./audio/elevatorCabMotionAudio.js";
import { mountFpElevatorWorld } from "./fpElevator/fpElevatorWorld.js";
import { mountFpViewmodelAuthoringDevOnly } from "./fpDev/fpViewmodelAuthoringOverlay.js";
import { mountWeaponPresentationDevHotReload } from "./fpDev/weaponPresentationDevHotReload.js";
import { mountWorldContentDevReload } from "./fpDev/fpWorldContentDevReload.js";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import { LocalGameAudio } from "./audio/localGameAudio.js";
import {
  primeHotbarConsumeAudio,
  registerHotbarConsumeLocalPlayback,
  registerHotbarConsumePrimeAudio,
  unregisterHotbarConsumeLocalAudio,
} from "./fpHotbar/hotbarConsumeLocalAudio.js";
import { registerGameAudioPrime } from "./audio/gameAudioPrime.js";
import { FpBackgroundMusic } from "./audio/fpBackgroundMusic.js";
import {
  getFpBackgroundMusicEnabled,
  subscribeFpBackgroundMusicEnabled,
} from "./audio/fpBackgroundMusicState.js";
import { runFpHotbarInstantConsume } from "./fpHotbar/fpHotbarConsume.js";
import {
  droppedItemIsWorldAnchor,
  findNearestDroppedPickup,
  MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
  MAMMOTH_PICKUP_RADIUS_M,
  mountDroppedItemsWorld,
} from "./worldRuntime/droppedItemWorldRuntime.js";
import { setFpActiveStashPanel } from "./fpInteraction/fpActiveStashPanel.js";
import { requestMammothInventoryOpenFromFp } from "./fpInteraction/fpInventoryOpenRequest.js";
import { setFpPickupPrompt } from "./fpInteraction/fpPickupPrompt.js";
import { WorldProximityAudio } from "./audio/worldProximityAudio.js";
import { ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS } from "./fpElevator/fpElevatorConstants.js";
import { poseSeqAsBigint } from "./fpSession/fpSessionPoseSeq.js";
import { resolveAuthoritativeInteractionPose } from "./fpInteraction/fpInteractionAuthority.js";
import { deliverFpSessionGpuRenderMs, resetFpPerfStore } from "./fpSession/fpSessionPerfStore.js";
import { FpHotbarConsumableVisual } from "./fpHotbar/fpHotbarConsumableVisual.js";
import { createFpCollisionDebugOverlay } from "./fpSession/fpSessionCollisionDebug.js";
import { createFpPlanarMirrorFromPlaceholder, type FpPlanarMirror } from "./fpRendering/fpPlanarMirror.js";
import {
  FP_MIRROR_SELF_RENDER_LAYER,
  FP_RESIDENTIAL_UNIT_INTERIOR_LAYER,
  FP_SESSION_MAX_PIXEL_RATIO,
  FP_SESSION_WEBGPU_ANTIALIAS,
  FP_VIEWMODEL_RENDER_LAYER,
  FREE_LOOK_YAW_MAX,
  MOUSE_SENS,
  NET_DT_SEC,
  PITCH_LIMIT,
  DROPPED_ITEM_SUBSCRIBE_HALF_M,
  POSE_AOI_HALF,
  WORLD_SOUND_AOI_HALF,
} from "./fpSession/fpSessionConstants.js";
import type { DecalManager } from "../rendering/decals/DecalManager.js";
import { isTextInputFocused } from "./isTextInputFocused.js";
import {
  fpLoadingDbgCheckRafGap,
  fpLoadingDbgMark,
  fpLoadingDbgTimed,
  fpLoadingDbgPopPhase,
  fpLoadingDbgPushPhase,
  isFpLoadingDebugEnabled,
} from "./fpSession/fpLoadingDebug.js";

function localMirrorBodyUriForConn(conn: DbConnection): string {
  const id = conn.identity;
  if (!id) return REMOTE_PLAYER_BODY_URI_MALE;
  const row = conn.db.user.identity.find(id);
  const raw = row?.avatarBody;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
  return n === 1 ? REMOTE_PLAYER_BODY_URI_FEMALE : REMOTE_PLAYER_BODY_URI_MALE;
}

/**
 * First-person session: mammoth `BuildingDoc` floor stack + slim cell, SpaceTimeDB `player_pose` sync.
 * Client simulation owns locomotion + collision; snapshots persist on SpacetimeDB for interactions,
 * audio AOI, and reconnect — no server-side movement reconciliation.
 */
export async function mountFpSession(
  canvas: HTMLCanvasElement,
  conn: DbConnection,
  opts: { apartmentClaimsAllowed?: boolean } = {},
): Promise<() => void> {
  const loadDbg = isFpLoadingDebugEnabled();
  const mountWallClock0 = performance.now();
  if (loadDbg) fpLoadingDbgMark("mount_fp_session:begin");

  installMmWallProbeLoadingStub();

  const [world] = await Promise.all([
    fpLoadingDbgTimed("fp_static_world_create", async () => waitMegablockStaticWorldMeshReady()),
    fpLoadingDbgTimed("webgpu_adapter_assert", () => assertWebGpuAdapterOrThrow()),
  ]);
  const {
    building,
    buildingRoot,
    buildingBodyWorldBounds,
    cellRoot,
    staticCollisionIndex,
    sampleWalkTopBase,
    stairShaftInteriorLightBounds,
    stairShaftSpecs,
  } = world;

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: FP_SESSION_WEBGPU_ANTIALIAS,
    forceWebGL: false,
    trackTimestamp: true,
  });
  await fpLoadingDbgTimed("webgpu_renderer_init", () => renderer.init());
  assertWebGpuRendererBackend(renderer);
  const rendererShadowMap = renderer.shadowMap as typeof renderer.shadowMap & {
    autoUpdate: boolean;
    needsUpdate: boolean;
  };
  rendererShadowMap.enabled = true;
  rendererShadowMap.autoUpdate = false;
  rendererShadowMap.needsUpdate = false;
  rendererShadowMap.type = THREE.PCFSoftShadowMap;
  const scheduleGpuTimestampResolve = (): void => {
    const backend = (renderer as unknown as { backend?: { trackTimestamp?: boolean } }).backend;
    if (!backend?.trackTimestamp) return;
    void renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER).then((ms) => {
      deliverFpSessionGpuRenderMs(ms);
    });
  };
  resetFpSessionFpsDisplay();
  resetFpSessionCompassHeading();
  resetFpSessionGameUiHidden();
  const logFpPerf = createFpSessionPerfDebugPostRenderHook(renderer);
  const fpEnvironment = attachFpSessionEnvironment(scene, renderer);

  const { rig: playerRig, headPivot, headPitch, headCameraPitch, headFreeLook, camera } =
    createFPRig(fpLocomotionConstants.eyeStand);
  /** Skydome is a large inner sphere; default rig `far` (900) clips it to black. */
  camera.far = FP_SESSION_SKY_CAMERA_FAR;
  scene.add(playerRig);
  void ensureStairwellCigaretteMeshReady();

  scene.add(buildingRoot);
  scene.add(cellRoot);
  buildingRoot.updateMatrixWorld(true);
  tagMergedResidentialShellMeshes(buildingRoot);
  cellRoot.updateMatrixWorld(true);
  const buildingWorldBounds = buildingBodyWorldBounds.clone();
  const maxBuildingLevel = maxBuildingLevelIndex(building);

  /**
   * Must match `elevator_layout::BUILDING_ORIGIN_Y` (0) — server `mammoth_pickup_vertical_band` does not
   * use `BuildingDoc.worldOrigin`; using the doc origin desyncs bands vs `pickup_dropped_item`.
   */
  const mammothDropPickupBands = {
    buildingWorldOriginY: 0,
    floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
  } as const;

  const renderBootstrapFrame = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, FP_SESSION_MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  fpLoadingDbgMark("fp_bootstrap_preview_before_webgpu_render");
  renderBootstrapFrame();
  fpLoadingDbgMark("fp_bootstrap_preview_after_webgpu_render");

  /**
   * Redraw once the megablock is parented — warms shaders/pipelines against real static geometry before
   * apartment props/decals/async assets stream in on top of `fp_static_world_create`.
   */
  fpLoadingDbgMark("fp_bootstrap_before_first_webgpu_render");
  renderBootstrapFrame();
  fpLoadingDbgMark("fp_bootstrap_after_first_webgpu_render");

  const fpElevators = mountFpElevatorWorld({
    conn,
    buildingRoot,
    building,
    getFloorDoc: (id) => parseFloorDoc(floorPayloadByDocId(id)),
    floorVisPitchLookaheadWorldBoundsXz: {
      minX: buildingWorldBounds.min.x,
      maxX: buildingWorldBounds.max.x,
      minZ: buildingWorldBounds.min.z,
      maxZ: buildingWorldBounds.max.z,
    },
  });

  const fpApartmentDoors = mountFpApartmentDoors({
    conn,
    buildingRoot,
    building,
  });

  const fpFirearmImpactDecals = createFpFirearmImpactDecals({
    scene,
    staticCollisionIndex,
    visitExtraSolidAabbsInXZ: (x0, x1, z0, z1, visit) => {
      fpApartmentDoors.visitFirearmBarrierAabbsInXZ(x0, x1, z0, z1, visit);
    },
  });

  const fpCollisionDebug = createFpCollisionDebugOverlay({
    staticCollisionIndex,
    visitDynamicCollisionAabbsInXZ: (x0, x1, z0, z1, visit, queryPose) => {
      fpElevators.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
      fpApartmentDoors.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
    },
  });
  scene.add(fpCollisionDebug.group);

  const unitInteriorMeshEntries = collectFpSessionUnitInteriorMeshEntries(buildingRoot);
  const unitInteriorMeshes = unitInteriorMeshEntries.map((entry) => entry.mesh);
  const topFloorResidentialUnitShellMeshes =
    collectFpSessionTopFloorResidentialUnitShellMeshes(buildingRoot);
  const apartmentFurnitureInteriorMeshes: THREE.Mesh[] = [];
  const perfFloorPlateGroups = buildingRoot.children.filter(
    (ch): ch is THREE.Object3D => typeof ch.userData.mammothPlateLevelIndex === "number",
  );
  const transparentBuildingMeshes: THREE.Mesh[] = [];
  const _perfSceneFrustumViewProjection = new THREE.Matrix4();
  const _perfSceneFrustum = new THREE.Frustum();
  const _perfFloorPlateBoundsScratch = new THREE.Box3();
  const PERF_SCENE_COUNTER_SAMPLE_INTERVAL_MS = 250;
  const materialContributesTransparentPass = (material: THREE.Material): boolean =>
    material.transparent === true || material.alphaTest > 0 || material.depthWrite === false;
  const refreshPerfTrackedMeshes = (): void => {
    transparentBuildingMeshes.length = 0;
    buildingRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const material = obj.material;
      const contributesTransparentPass = Array.isArray(material)
        ? material.some(materialContributesTransparentPass)
        : materialContributesTransparentPass(material);
      if (contributesTransparentPass) {
        transparentBuildingMeshes.push(obj);
      }
    });
  };
  /** Apartment rig used analytic spots only — keep merged shells off the shadow pass (no doorway hitch). */
  const disableShadowsOnUnitInteriorMeshes = (): void => {
    for (let i = 0; i < unitInteriorMeshes.length; i++) {
      const mesh = unitInteriorMeshes[i]!;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  };
  const refreshApartmentInteriorMeshes = () => {
    unitInteriorMeshEntries.length = 0;
    unitInteriorMeshEntries.push(...collectFpSessionUnitInteriorMeshEntries(buildingRoot));
    unitInteriorMeshes.length = 0;
    for (let i = 0; i < unitInteriorMeshEntries.length; i++) {
      unitInteriorMeshes.push(unitInteriorMeshEntries[i]!.mesh);
    }
    apartmentFurnitureInteriorMeshes.length = 0;
    for (let i = 0; i < unitInteriorMeshEntries.length; i++) {
      const entry = unitInteriorMeshEntries[i]!;
      if (entry.apartmentUnitKey !== null) {
        apartmentFurnitureInteriorMeshes.push(entry.mesh);
      }
    }
    disableShadowsOnUnitInteriorMeshes();
    refreshPerfTrackedMeshes();
  };
  let lastPerfSceneCounterSampleAtMs = -Infinity;
  let lastPerfSceneCounters = {
    visibleFloorPlates: 0,
    visibleUnitInteriorMeshes: 0,
    visibleApartmentPropMeshes: 0,
    visibleTransparentMeshes: 0,
    visibleExteriorTreeRoots: 0,
    frustumFloorPlates: 0,
    frustumUnitInteriorMeshes: 0,
    frustumApartmentPropMeshes: 0,
    frustumTransparentMeshes: 0,
    frustumExteriorTreeRoots: 0,
  };
  const objectVisibleInHierarchy = (obj: THREE.Object3D): boolean => {
    for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
      if (!cur.visible) return false;
    }
    return true;
  };
  const getFpPerfSceneCounters = () => {
    const now = performance.now();
    if (now - lastPerfSceneCounterSampleAtMs < PERF_SCENE_COUNTER_SAMPLE_INTERVAL_MS) {
      return lastPerfSceneCounters;
    }
    lastPerfSceneCounterSampleAtMs = now;
    camera.updateMatrixWorld();
    _perfSceneFrustumViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _perfSceneFrustum.setFromProjectionMatrix(_perfSceneFrustumViewProjection);

    let visibleFloorPlates = 0;
    let frustumFloorPlates = 0;
    for (const ch of perfFloorPlateGroups) {
      if (ch.visible) {
        visibleFloorPlates += 1;
        _perfFloorPlateBoundsScratch.setFromObject(ch);
        if (_perfSceneFrustum.intersectsBox(_perfFloorPlateBoundsScratch)) {
          frustumFloorPlates += 1;
        }
      }
    }
    let visibleExteriorTreeRoots = 0;
    let frustumExteriorTreeRoots = 0;
    for (const ch of buildingRoot.children) {
      if (ch.userData.mammothExteriorProceduralTrees === true && ch.visible) {
        visibleExteriorTreeRoots += 1;
        _perfFloorPlateBoundsScratch.setFromObject(ch);
        if (_perfSceneFrustum.intersectsBox(_perfFloorPlateBoundsScratch)) {
          frustumExteriorTreeRoots += 1;
        }
      }
    }

    let visibleUnitInteriorMeshes = 0;
    let frustumUnitInteriorMeshes = 0;
    for (let i = 0; i < unitInteriorMeshes.length; i++) {
      const mesh = unitInteriorMeshes[i]!;
      if (!objectVisibleInHierarchy(mesh)) continue;
      visibleUnitInteriorMeshes += 1;
      if (_perfSceneFrustum.intersectsObject(mesh)) frustumUnitInteriorMeshes += 1;
    }

    let visibleApartmentPropMeshes = 0;
    let frustumApartmentPropMeshes = 0;
    for (let i = 0; i < apartmentFurnitureInteriorMeshes.length; i++) {
      const mesh = apartmentFurnitureInteriorMeshes[i]!;
      if (!objectVisibleInHierarchy(mesh)) continue;
      visibleApartmentPropMeshes += 1;
      if (_perfSceneFrustum.intersectsObject(mesh)) frustumApartmentPropMeshes += 1;
    }

    let visibleTransparentMeshes = 0;
    let frustumTransparentMeshes = 0;
    for (let i = 0; i < transparentBuildingMeshes.length; i++) {
      const mesh = transparentBuildingMeshes[i]!;
      if (!objectVisibleInHierarchy(mesh)) continue;
      visibleTransparentMeshes += 1;
      if (_perfSceneFrustum.intersectsObject(mesh)) frustumTransparentMeshes += 1;
    }

    lastPerfSceneCounters = {
      visibleFloorPlates,
      visibleUnitInteriorMeshes,
      visibleApartmentPropMeshes,
      visibleTransparentMeshes,
      visibleExteriorTreeRoots,
      frustumFloorPlates,
      frustumUnitInteriorMeshes,
      frustumApartmentPropMeshes,
      frustumTransparentMeshes,
      frustumExteriorTreeRoots,
    };
    return lastPerfSceneCounters;
  };

  const fpApartmentFurniture = await fpLoadingDbgTimed("fp_mount_apartment_furniture", () =>
    mountFpApartmentFurniture({
      conn,
      buildingRoot,
      showUnitBoundsDebug: isApartmentUnitBoundsDebugEnabled(),
      onRebuilt: refreshApartmentInteriorMeshes,
    }),
  );

  const fpApartmentDecorMeshes = mountFpApartmentDecorMeshes({
    conn,
    buildingRoot,
    onRebuilt: refreshApartmentInteriorMeshes,
  });
  refreshApartmentInteriorMeshes();


  let sessionDisposed = false;
  let decalManager: DecalManager | null = null;

  if (ENABLE_STAIRWELL_GRAFFITI_DECALS) {
    void (async () => {
      try {
        const { DecalManager: DecalManagerCtor, DECAL_MANIFEST, generateStairwellDecalPlacements } =
          await import("../rendering/decals/index.js");
        if (sessionDisposed) return;
        const dm = new DecalManagerCtor(scene, renderer);
        decalManager = dm;
        if (sessionDisposed) {
          dm.dispose();
          decalManager = null;
          return;
        }
        await dm.preloadManifest(DECAL_MANIFEST);
        if (sessionDisposed) return;
        await dm.loadPlacements(
          generateStairwellDecalPlacements(buildingRoot, stairShaftSpecs),
          buildingRoot,
        );
        if (sessionDisposed) return;
        unitInteriorMeshes.push(...dm.getMeshes());
        disableShadowsOnUnitInteriorMeshes();
        refreshPerfTrackedMeshes();
      } catch (err) {
        if (!sessionDisposed) {
          console.warn("[mountFpSession] failed to load stairwell decals", err);
        }
      }
    })();
  }
  installFpSessionTransientDebugConsole({ scene, buildingRoot, cellRoot, renderer });

  const selectedHotbarRow = () => {
    const slot = getFpHotbarSelectedSlot();
    return conn.identity && slot !== null
      ? getHotbarSlotInventoryItem(conn, conn.identity, slot)
      : undefined;
  };
  const initialHeld = conn.identity
    ? effectiveDevGameplayEquippedPrimary(
        equippedHeldItemIdFromDefId(selectedHotbarRow()?.defId ?? "unarmed"),
      )
    : ("unarmed" as const);

  const presentation = await fpLoadingDbgTimed("player_presentation_manager_create", () =>
    PlayerPresentationManager.create({
      scene,
      fpViewModelParent: headPitch,
      localMirrorBodyUri: localMirrorBodyUriForConn(conn),
      initialEquippedPrimary: initialHeld,
      onMeleeVisual: (evt) => {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const origin = new THREE.Vector3();
        camera.getWorldPosition(origin);
        void evt;
        void origin;
        void dir;
        // TODO: hand off to gameplay hit-scan / server validation — placeholder trace only.
      },
    }),
  );
  const cabMirrorPlaceholders: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothCabMirror !== true) return;
    cabMirrorPlaceholders.push(obj);
  });
  const cabMirrors: FpPlanarMirror[] = cabMirrorPlaceholders.map((mesh) =>
    createFpPlanarMirrorFromPlaceholder(mesh),
  );
  headPitch.traverse((obj) => obj.layers.set(FP_VIEWMODEL_RENDER_LAYER));
  camera.layers.enable(FP_VIEWMODEL_RENDER_LAYER);
  camera.layers.enable(FP_RESIDENTIAL_UNIT_INTERIOR_LAYER);
  presentation.setLocalMirrorAvatarLayer(FP_MIRROR_SELF_RENDER_LAYER);
  presentation.setLocalMirrorAvatarVisible(true);

  const fpAuthoringActiveRef = { active: false };

  const disposeFpAuthoring = mountFpViewmodelAuthoringDevOnly({
    scene,
    camera,
    canvas,
    presentation,
    activeRef: fpAuthoringActiveRef,
  });

  const disposeWeaponPresentationHotReload = mountWeaponPresentationDevHotReload(presentation);
  const disposeWorldContentHotReload = mountWorldContentDevReload(() => {
    window.location.reload();
  });
  const hotbarConsumableVisual = new FpHotbarConsumableVisual();

  let lastSentHotbarRail: number | null | undefined = undefined;
  const syncActiveHotbarSlotToServer = () => {
    if (!conn.identity) return;
    const slot = getFpHotbarSelectedSlot();
    if (slot === lastSentHotbarRail) return;
    lastSentHotbarRail = slot;
    const slotIndex = slot === null ? ACTIVE_HOTBAR_SLOT_CLEARED : slot;
    try {
      void conn.reducers.setActiveHotbarSlot({ slotIndex });
    } catch (err) {
      console.warn("[mountFpSession] setActiveHotbarSlot failed", err);
    }
  };
  const unsubHotbarRail = subscribeFpHotbarSelection(syncActiveHotbarSlotToServer);

  /** Initial feet + AOI — guest slots restore last plaza pose; replicated `player_pose` still merges on hydrate. */
  const cachedGuestFeet = readActiveGuestLastWorldPose();
  const pos = new THREE.Vector3(
    cachedGuestFeet?.x ?? 0,
    cachedGuestFeet?.y ?? 1.35,
    cachedGuestFeet?.z ?? 0,
  );
  const poseAoiAnchor = { x: pos.x, y: pos.y, z: pos.z };
  const _floorVisCamWorld = new THREE.Vector3();
  const _floorVisCamDir = new THREE.Vector3();
  const _interactionPos = new THREE.Vector3();
  /** Local pickup probe — pickup publishes this pose before server validation. */
  const _pickupAuthorityFeet = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  /**
   * Blocks `submit_player_locomotion_snapshot` until `ingestPose` has applied the first replicated
   * self row (or a respawn authoritative snap). Without this, RAF can publish default guest feet before
   * `player_pose` arrives and overwrite a server bed / ground spawn on the module.
   */
  const moveSnapshotHydrated = { current: false };

  const fpPlayerDamageBloodSquirt = createFpPlayerDamageBloodSquirt({
    scene,
    conn,
    getLocalFeetWorld: (out) => {
      out.copy(pos);
    },
  });

  /** Pooled audio movement snapshot — mutated each frame, no object literal per frame. */
  const _audioMovement = {
    horizontalSpeed: 0,
    stridePhaseRad: 0,
    grounded: true,
    crouch: false,
    sprint: false,
    freeLook: false,
  };

  /**
   * Smooth display offset — applied to `playerRig.position` on top of locomotion `pos`.
   *
   * Solo Mammoth: replicated pose mirrors client snapshots (no server collision), so reconcile does not
   * tug the camera — offset stays near zero except reconnect/spawn paths that snap `pos`.
   */
  const _displayOffset = new THREE.Vector3();
  const _rigViewScratch = new THREE.Vector3();
  const _aimShotWorldDir = new THREE.Vector3();

  const {
    syncBuildingFloorPlateVisibility,
    isInsideElevatorCabHudForJump,
    isApartmentFurnitureInteriorVisible,
  } =
    createFpSessionFloorPlateVisibility({
      camera,
      buildingRoot,
      buildingWorldBounds,
      maxBuildingLevel,
      storeyOpts: {
        buildingWorldOriginY: building.worldOrigin?.[1] ?? 0,
        floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
        maxLevel: maxBuildingLevel,
      },
      unitInteriorMeshEntries,
      topFloorResidentialUnitShellMeshes,
      apartmentFurnitureInteriorMeshes,
      fpElevators,
      stairShaftInteriorLightBounds,
      stairShaftSpecs,
      feetPos: pos,
      getContainingResidentialUnit: () => {
        const unit = apartmentUnitContainingFeetSlack(conn, pos.x, pos.y, pos.z);
        return unit ? { unitId: unit.unitId, unitKey: unit.unitKey, level: unit.level } : null;
      },
      floorVisCamWorld: _floorVisCamWorld,
      floorVisCamDir: _floorVisCamDir,
    });

  const getInteractionPos = () => {
    const p = resolveAuthoritativeInteractionPose(pos, serverPose);
    _interactionPos.set(p.x, p.y, p.z);
    return _interactionPos;
  };

  const mainRaf: FpSessionMainRafState = {
    bodyYaw: cachedGuestFeet?.yaw ?? 0,
    pitch: 0,
    headLookYaw: 0,
    crouchToggle: false,
    meleePressPending: false,
    primaryAttackHeld: false,
    fpRigViewSmoothedReady: false,
    lastTickElevSupportVyMps: 0,
    lastTickHudCabVyMps: 0,
    lastTickElevVyBlendAbs: 0,
    stairwellInteriorDarkSmoothed: 0,
    meleeAttackSeq: 0,
    firearmShotSeq: 0,
    lastMeleeMs: 0,
    lastRangedMs: 0,
  };
  const moveIntentQueue: FpSessionMoveIntentQueue = { items: [], head: 0 };
  /** Max un-acked intents to retain (1.5 s buffer); older ones are compacted away. */
  const MAX_PENDING_INTENTS = 30;

  const keys = new Set<string>();
  const loco = createFpLocomotionState();

  // ---------------------------------------------------------------------------
  // Object pools — pre-allocated once, mutated in place every frame/tick.
  // Eliminates the GC pressure that causes frame-time spikes near busy geometry.
  // ---------------------------------------------------------------------------

  /** Pre-allocated input state — mutated in the main tick loop (no object literal per frame). */
  const _input: FpLocomotionInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    jumpHeld: false,
  };

  /** Pre-allocated input for reconcile replay (avoid allocating inside the replay loop). */
  const _replayInput: FpLocomotionInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    jumpHeld: false,
  };

  /** Reconcile replay pools — reset in place on every server update (20 Hz); avoid 3× Vec3. */
  const _replayPos = new THREE.Vector3();
  const _replayPrevPos = new THREE.Vector3();
  /** Feet pose before a reconcile nudge — passed to `resolvePlayerCollisions` as `prevPos`. */
  const _reconcilePosBefore = new THREE.Vector3();
  const _replayLoco = createFpLocomotionState();

  const {
    doorDebugState: __mmDoorDebugState,
    wallProbeState: __mmWallProbeState,
    getElevDebugEnabled,
    logDoorDebugFrame,
    logDoorDebugReconcile,
    probeWallHit,
    tickElevDebug: tickFpSessionElevDebug,
    dispose: disposeFpSessionDevDebug,
  } = installFpSessionDevDebugApis({
    playerPos: pos,
    camera,
    buildingRoot,
    building,
    staticCollisionIndex,
    fpApartmentDoors,
    fpElevators,
  });

  registerFpDebugMenuSessionSnapshot(() => ({
    doorDebugEnabled: __mmDoorDebugState.enabled,
    wallProbeEnabled: __mmWallProbeState.enabled,
    elevDebugEnabled: getElevDebugEnabled(),
  }));

  const { _mainStepOpts, _elevSupportEval, simulatePredictedPlayerStep, reconcileLocalPredictionToServer } =
    wireFpSessionLocomotionPrediction({
      pos,
      prevPos,
      loco,
      keys,
      _input,
      _replayInput,
      _replayPos,
      _replayPrevPos,
      _replayLoco,
      _reconcilePosBefore,
      moveIntentQueue,
      mainRaf,
      displayOffset: _displayOffset,
      netDtSec: NET_DT_SEC,
      sampleWalkTopBase,
      fpElevators,
      fpApartmentDoors,
      staticCollisionIndex,
      doorDebugState: __mmDoorDebugState,
      logDoorDebugFrame,
      logDoorDebugReconcile,
      elevatorRiderLockSkipUpwardVyMps: ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS,
    });

  const { intentSeq, sendMoveIntent, maybeSendMoveIntent } = createFpSessionMoveIntentChannel({
    conn,
    mainRaf,
    moveIntentQueue,
    maxPendingIntents: MAX_PENDING_INTENTS,
    samplePose: () => ({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      velX: loco.velocity.x,
      velY: loco.velocity.y,
      velZ: loco.velocity.z,
      grounded: loco.grounded,
    }),
    snapshotPublishAllowed: () => moveSnapshotHydrated.current,
  });

  const flushLocalPickupPoseToServer = (): Promise<void> => {
    const locomotionBlocked = fpLocomotionInputBlocked();
    const pickupInput: FpLocomotionInput = {
      forward: locomotionBlocked ? false : keys.has("KeyW"),
      backward: locomotionBlocked ? false : keys.has("KeyS"),
      left: locomotionBlocked ? false : keys.has("KeyA"),
      right: locomotionBlocked ? false : keys.has("KeyD"),
      sprint: locomotionBlocked ? false : keys.has("ShiftLeft") || keys.has("ShiftRight"),
      crouch: mainRaf.crouchToggle,
      jumpHeld: locomotionBlocked ? false : keys.has("Space"),
    };
    return sendMoveIntent(pickupInput, false, performance.now());
  };

  /** Footsteps: Web Audio, up to six `public/audio/ui/footstep*.wav`; see `audio/localGameAudio.ts`. */
  const localAudio = new LocalGameAudio();
  registerHotbarConsumePrimeAudio(() => localAudio.unlock());
  registerHotbarConsumeLocalPlayback((profile) => localAudio.playHotbarConsumeLocal(profile));
  const worldAudio = new WorldProximityAudio(conn, () => camera);
  let worldAudioReady = false;
  const cabMotionAudio = new ElevatorCabMotionAudio(() => camera);
  let cabMotionAudioReady = false;
  const _backgroundAudioWorldPos = new THREE.Vector3();
  const backgroundMusic = new FpBackgroundMusic(() => {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(_backgroundAudioWorldPos);
    return _backgroundAudioWorldPos;
  });
  backgroundMusic.setEnabled(getFpBackgroundMusicEnabled());
  const unsubscribeBackgroundMusicEnabled = subscribeFpBackgroundMusicEnabled(() => {
    backgroundMusic.setEnabled(getFpBackgroundMusicEnabled());
  });

  /** Subscribes immediately with pose AOI — must not wait for audio unlock: inserts are only replicated for active `world_sound_event` queries. */
  const refreshWorldSoundSubscription = () => {
    worldAudio.subscribeAoi(poseAoiAnchor.x, poseAoiAnchor.z, WORLD_SOUND_AOI_HALF);
  };

  const attachSpatialWorldAudio = async (): Promise<void> => {
    await localAudio.unlock();
    const actx = localAudio.getAudioContext();
    if (!actx) return;
    await worldAudio.attachSharedContext(actx, localAudio.getFootstepBuffers());
    worldAudioReady = true;
    cabMotionAudioReady = await cabMotionAudio.attachSharedContext(actx);
    void backgroundMusic.attachSharedContext(actx);
    refreshWorldSoundSubscription();
  };
  registerGameAudioPrime(attachSpatialWorldAudio);

  /**
   * Browsers often skip `keyup` when the tab/window loses focus — keys (including Alt) stay in
   * `keys`, so free-look stays latched and mouse X only drives `headLookYaw` until Alt “releases”.
   *
   * Before clearing keys, **bake** `headLookYaw` into `bodyYaw` so the horizontal view direction
   * (body + free-look) does not jump when we drop Alt from `keys` or zero out free-look. Intentional
   * Alt key-up still clears head offset without merging — see `onKeyUp`.
   */
  const commitFreeLookIntoBodyYaw = () => {
    if (mainRaf.headLookYaw !== 0) {
      mainRaf.bodyYaw += mainRaf.headLookYaw;
      mainRaf.headLookYaw = 0;
      mainRaf.bodyYaw = Math.atan2(Math.sin(mainRaf.bodyYaw), Math.cos(mainRaf.bodyYaw));
    }
  };

  /** Window hidden / defocused: browsers may omit `keyup` — drop all latched keys. */
  const resetTransientInputState = () => {
    commitFreeLookIntoBodyYaw();
    keys.clear();
    mainRaf.meleePressPending = false;
    mainRaf.primaryAttackHeld = false;
  };

  const onWindowBlur = () => {
    resetTransientInputState();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      resetTransientInputState();
      persistActiveGuestLastWorldPose({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: mainRaf.bodyYaw,
      });
    }
  };

  /**
   * Pointer lock ends while the document can still be focused (Tab inventory, Esc, etc.).
   * Do **not** clear `keys` here — that would cancel held WASD until keys are pressed again.
   * Still fold Alt free-look into body yaw so view direction stays consistent when mouse stops.
   */
  const onPointerLockChange = () => {
    if (document.pointerLockElement !== canvas) {
      commitFreeLookIntoBodyYaw();
      mainRaf.meleePressPending = false;
      mainRaf.primaryAttackHeld = false;
    }
  };

  /** Latest authoritative self pose from `player_pose`. */
  const serverPose = { x: 0, y: 1.35, z: 0, grounded: true, velX: 0, velY: 0, velZ: 0 };
  let spawnSynced = false;
  /**
   * `player_pose` replication lags local prediction; never snap feet by distance (that reads as
   * rubber-banding). Only snap on respawn (`player_vitals` dead → alive) via
   * `applyAuthoritativeFeetSnapFromServerRow` / `pendingRespawnAuthoritativeSnap`.
   */
  let pendingRespawnAuthoritativeSnap = false;

  const getDroppedPickupAuthorityFeet = (): THREE.Vector3 => {
    const p = resolveAuthoritativeInteractionPose(pos, serverPose);
    _pickupAuthorityFeet.set(p.x, p.y, p.z);
    return _pickupAuthorityFeet;
  };

  /**
   * Wired after `mountDroppedItemsWorld`; first authoritative `player_pose` snap must recenter
   * dropped-item AOI even when it arrives only via `syncAllPoses` / handlers (not guest cache).
   */
  let syncSpatialAoiAfterHydratedSpawn: ((cx: number, cy: number, cz: number) => void) | null = null;

  const applyAuthoritativeFeetSnapFromServerRow = (row: PlayerPose) => {
    const serverSeq = poseSeqAsBigint(row.seq);
    pos.set(row.x, row.y, row.z);
    prevPos.copy(pos);
    mainRaf.bodyYaw = row.yaw;
    _displayOffset.set(0, 0, 0);
    mainRaf.fpRigViewSmoothedReady = false;
    loco.velocity.set(row.velX, row.velY, row.velZ);
    loco.grounded = row.grounded !== 0;
    intentSeq.current = serverSeq;
    moveIntentQueue.items.length = 0;
    moveIntentQueue.head = 0;
    syncSpatialAoiFromFeet(row.x, row.y, row.z);
    moveSnapshotHydrated.current = true;
  };

  const ingestPose = (row: PlayerPose) => {
    if (!(conn.identity?.isEqual(row.identity) ?? false)) return;
    serverPose.x = row.x;
    serverPose.y = row.y;
    serverPose.z = row.z;
    serverPose.grounded = row.grounded !== 0;
    serverPose.velX = row.velX;
    serverPose.velY = row.velY;
    serverPose.velZ = row.velZ;
    const serverSeq = poseSeqAsBigint(row.seq);
    if (!spawnSynced) {
      pos.set(row.x, row.y, row.z);
      prevPos.copy(pos);
      mainRaf.bodyYaw = row.yaw;
      _displayOffset.set(0, 0, 0);
      mainRaf.fpRigViewSmoothedReady = false;
      loco.velocity.set(row.velX, row.velY, row.velZ);
      loco.grounded = row.grounded !== 0;
      spawnSynced = true;
      moveSnapshotHydrated.current = true;
      syncSpatialAoiAfterHydratedSpawn?.(row.x, row.y, row.z);
    } else {
      if (pendingRespawnAuthoritativeSnap) {
        applyAuthoritativeFeetSnapFromServerRow(row);
        pendingRespawnAuthoritativeSnap = false;
      }
      reconcileLocalPredictionToServer(row);
    }
    if (serverSeq > intentSeq.current) intentSeq.current = serverSeq;
  };

  const syncAllPoses = () => {
    for (const row of conn.db.player_pose) {
      ingestPose(row as PlayerPose);
    }
  };

  const onPoseInsert = (_ctx: unknown, row: PlayerPose) => {
    ingestPose(row);
  };
  const onPoseUpdate = (_ctx: unknown, _old: PlayerPose, row: PlayerPose) => {
    ingestPose(row);
  };

  const droppedWorld = mountDroppedItemsWorld(scene, conn, DROPPED_ITEM_SUBSCRIBE_HALF_M, {
    pickupBandOpts: mammothDropPickupBands,
    beforePickup: flushLocalPickupPoseToServer,
    onPickupRemoved: async () => {
      await attachSpatialWorldAudio();
      localAudio.playItemPickLocal();
    },
  });

  const syncSpatialAoiFromFeet = (cx: number, cy: number, cz: number) => {
    poseAoiAnchor.x = cx;
    poseAoiAnchor.y = cy;
    poseAoiAnchor.z = cz;
    refreshWorldSoundSubscription();
    droppedWorld.subscribeAoi(cx, cz);
  };

  syncSpatialAoiAfterHydratedSpawn = syncSpatialAoiFromFeet;
  syncAllPoses();
  syncSpatialAoiFromFeet(pos.x, pos.y, pos.z);

  conn.db.player_pose.onInsert(onPoseInsert);
  conn.db.player_pose.onUpdate(onPoseUpdate);

  const onSelfVitalsUpdate = (_ctx: unknown, oldRow: PlayerVitals, row: PlayerVitals) => {
    if (!(conn.identity?.isEqual(row.identity) ?? false)) return;
    const wasDead = oldRow.health <= 0;
    const nowAlive = row.health > 0;
    if (!wasDead || !nowAlive || !spawnSynced) return;
    pendingRespawnAuthoritativeSnap = true;
    const poseRow = conn.db.player_pose.identity.find(row.identity) as PlayerPose | undefined;
    if (poseRow) {
      applyAuthoritativeFeetSnapFromServerRow(poseRow);
      pendingRespawnAuthoritativeSnap = false;
    }
  };
  conn.db.player_vitals.onUpdate(onSelfVitalsUpdate);

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, FP_SESSION_MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(canvas);

  const mammothInventoryOpen = () =>
    document.querySelector('[data-mammoth-inventory="open"]') !== null;

  const mammothCraftingOpen = () =>
    document.querySelector('[data-mammoth-crafting="open"]') !== null;

  const mammothDebugMenuOpen = () =>
    document.querySelector('[data-mammoth-debug-menu="open"]') !== null;

  /** Same `DigitN` / slot within debounce window — ignored unless instant-consume or same-slot unequip. */
  const digitKeyDebounce = { code: "", at: 0, slot: -1 };

  const onWheelHotbar = (e: WheelEvent) => {
    if (mammothInventoryOpen() || mammothCraftingOpen() || mammothDebugMenuOpen() || isTextInputFocused()) return;
    if (document.pointerLockElement !== canvas) return;
    if (e.deltaY === 0) return;
    const target = e.target;
    if (target instanceof Element && target.closest("[data-mammoth-no-hotbar-wheel='true']")) {
      return;
    }
    e.preventDefault();
    const prev = getFpHotbarSelectedSlot();
    const cur = prev === null ? 0 : prev;
    const next =
      e.deltaY < 0
        ? (cur - 1 + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT
        : (cur + 1) % HOTBAR_SLOT_COUNT;
    setFpHotbarSelectedSlot(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTextInputFocused()) keys.add(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      e.preventDefault();
    }
    if (
      e.code === "KeyZ" &&
      e.altKey &&
      !e.repeat &&
      !isTextInputFocused()
    ) {
      e.preventDefault();
      toggleFpSessionGameUiHidden();
    }
    if (!isTextInputFocused() && !mammothInventoryOpen() && !mammothCraftingOpen() && !mammothDebugMenuOpen()) {
      let n = -1;
      if (e.code.startsWith("Digit")) {
        n = Number.parseInt(e.code.slice(5), 10);
      } else if (e.code.startsWith("Numpad") && e.code.length === 7) {
        n = Number.parseInt(e.code.slice(6), 10);
      }
      if (n >= 1 && n <= HOTBAR_SLOT_COUNT) {
        e.preventDefault();
        if (e.repeat) return;
        const newSlot = n - 1;
        const keyCode = e.code;
        const now = performance.now();
        if (!conn.identity) {
          const prev = getFpHotbarSelectedSlot();
          if (
            fpHotbarDigitKeySuppressedByDebounce({
              prevSel: prev,
              newSlot,
              willConsume: false,
              keyCode,
              lastCode: digitKeyDebounce.code,
              lastSlot: digitKeyDebounce.slot,
              lastAtMs: digitKeyDebounce.at,
              nowMs: now,
            })
          ) {
            return;
          }
          digitKeyDebounce.code = keyCode;
          digitKeyDebounce.at = now;
          digitKeyDebounce.slot = newSlot;
          setFpHotbarSelectedSlot(prev === newSlot ? null : newSlot);
          return;
        }
        const prevSel = getFpHotbarSelectedSlot();
        const willConsume =
          prevSel === newSlot && hotbarSlotHasInstantConsume(conn, conn.identity, newSlot);

        if (
          fpHotbarDigitKeySuppressedByDebounce({
            prevSel,
            newSlot,
            willConsume,
            keyCode,
            lastCode: digitKeyDebounce.code,
            lastSlot: digitKeyDebounce.slot,
            lastAtMs: digitKeyDebounce.at,
            nowMs: now,
          })
        ) {
          return;
        }

        digitKeyDebounce.code = keyCode;
        digitKeyDebounce.at = now;
        digitKeyDebounce.slot = newSlot;

        if (willConsume) {
          void runFpHotbarInstantConsume(
            conn,
            conn.identity,
            newSlot,
            primeHotbarConsumeAudio,
            "mountFpSession",
          );
          return;
        }
        setFpHotbarSelectedSlot(prevSel === newSlot ? null : newSlot);
      }
    }
    if (e.code === "Escape") void document.exitPointerLock();
    if (
      e.code === "KeyE" &&
      !e.repeat &&
      !mammothInventoryOpen() &&
      !mammothCraftingOpen() &&
      !mammothDebugMenuOpen() &&
      !isTextInputFocused()
    ) {
      e.preventDefault();
      /** Same blend as RAF pickup prompts ({@link resolveAuthoritativeInteractionPose}). */
      const feet = getInteractionPos();
      if (fpElevators.consumeInteractKey(feet, camera)) return;
      const suppressElevPickup = fpElevators.shouldSuppressEpickup(feet, camera);
      const lookedAtStash = conn.identity
        ? fpApartmentFurniture.getStashPrompt(feet, camera)
        : null;
      const lookedAtWardrobeUnitKey =
        conn.identity && APARTMENT_CLAIM_UI_ENABLED
          ? fpApartmentFurniture.getWardrobeClaimLookAtUnitKey(feet, camera)
          : null;
      const aptKey = conn.identity
        ? getApartmentSystemPrompt(conn, feet, {
            ...(lookedAtStash?.stashKey != null ? { lookedAtStashKey: lookedAtStash.stashKey } : {}),
            lookedAtWardrobeUnitKey,
          })
        : null;
      /** Wardrobe/stash HUD must win overlaps with hoistway/corridor elevator volumes (parity with RAF). */
      const interiorBeatElevPickup =
        aptKey !== null && apartmentFurnitureInteriorsPreferOverUnitDoor(aptKey);
      if (suppressElevPickup && !interiorBeatElevPickup) return;
      const feetPick = getDroppedPickupAuthorityFeet();
      if (!conn.identity) {
        droppedWorld.tryPickupNearest(feetPick.x, feetPick.y, feetPick.z);
        return;
      }

      if (
        aptKey?.kind === "apartment_claim" ||
        aptKey?.kind === "apartment_claim_blocked_gear"
      ) {
        // Hold-to-claim uses RAF pulses; do not let a nearby world-anchor drop steal this keypress.
        return;
      }

      if (fpApartmentDoors.consumeInteractKey(feet, camera)) return;
      if (fpApartmentDoors.shouldSuppressEpickup(feet, camera)) return;

      if (aptKey?.kind === "apartment_stash") {
        setFpActiveStashPanel({
          stashKey: aptKey.stashKey,
          stashLabel: aptKey.stashLabel,
        });
        requestMammothInventoryOpenFromFp();
        if (document.pointerLockElement) void document.exitPointerLock();
        return;
      }

      const nearWorld = findNearestDroppedPickup(
        conn,
        feetPick.x,
        feetPick.y,
        feetPick.z,
        MAMMOTH_PICKUP_RADIUS_M,
        droppedItemIsWorldAnchor,
        MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
        mammothDropPickupBands,
      );
      if (nearWorld) {
        void (async () => {
          try {
            await flushLocalPickupPoseToServer();
            await conn.reducers.pickupDroppedItem({ droppedItemId: nearWorld.droppedItemId });
          } catch {
            return;
          }
        })();
        return;
      }

      droppedWorld.tryPickupNearest(feetPick.x, feetPick.y, feetPick.z);
    }
    if (e.code === "KeyC" && !e.repeat && !isTextInputFocused()) {
      mainRaf.crouchToggle = !mainRaf.crouchToggle;
    }
    if (e.code === "Space" && !e.repeat && !isTextInputFocused()) {
      if (isInsideElevatorCabHudForJump()) {
        e.preventDefault();
        return;
      }
      queueFpJump(loco);
      // Build a one-shot input snapshot for the jump intent; _input may not be current yet
      // (tick hasn't run), so read keys directly here.
      const jumpInput: FpLocomotionInput = {
        forward: keys.has("KeyW"),
        backward: keys.has("KeyS"),
        left: keys.has("KeyA"),
        right: keys.has("KeyD"),
        sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        crouch: mainRaf.crouchToggle,
        jumpHeld: keys.has("Space"),
      };
      void sendMoveIntent(jumpInput, true, performance.now());
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      mainRaf.headLookYaw = 0;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    if (freeLook) {
      mainRaf.headLookYaw -= e.movementX * MOUSE_SENS;
      mainRaf.headLookYaw = Math.max(
        -FREE_LOOK_YAW_MAX,
        Math.min(FREE_LOOK_YAW_MAX, mainRaf.headLookYaw),
      );
    } else {
      mainRaf.bodyYaw -= e.movementX * MOUSE_SENS;
    }
    mainRaf.pitch -= e.movementY * MOUSE_SENS;
    mainRaf.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, mainRaf.pitch));
  };

  const onClick = () => {
    void attachSpatialWorldAudio();
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };

  /** HUD layers use `pointer-events: none` in gaps; suppress the browser menu on the world view. */
  const onCanvasContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    // Match server combat rail (`player_active_hotbar`) to HUD selection before enqueueing attack.
    syncActiveHotbarSlotToServer();
    if (e.button === 2) {
      if (__mmWallProbeState.enabled) {
        e.preventDefault();
        probeWallHit();
      }
      return;
    }
    if (!e.isPrimary || e.button !== 0) return;
    const nowMs = performance.now();
    if (fpElevators.tryRaycastFloorPick(camera, pos, nowMs)) return;
    if (conn.identity && fpApartmentDoors.consumeInteractKey(getInteractionPos(), camera)) return;
    const selectedHotbarSlot = getFpHotbarSelectedSlot();
    if (
      conn.identity &&
      selectedHotbarSlot !== null &&
      hotbarSlotHasInstantConsume(conn, conn.identity, selectedHotbarSlot)
    ) {
      void runFpHotbarInstantConsume(
        conn,
        conn.identity,
        selectedHotbarSlot,
        primeHotbarConsumeAudio,
        "mountFpSession",
      );
      return;
    }
    mainRaf.meleePressPending = true;
    mainRaf.primaryAttackHeld = true;
  };

  const onPrimaryPointerUpOrCancel = (e: PointerEvent) => {
    if (e.type === "pointercancel" || (e.isPrimary && e.button === 0)) {
      mainRaf.primaryAttackHeld = false;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", onWheelHotbar, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("pointerup", onPrimaryPointerUpOrCancel);
  window.addEventListener("pointercancel", onPrimaryPointerUpOrCancel);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", onCanvasContextMenu);

  const fpInteractInputBlocked = () =>
    mammothInventoryOpen() || mammothCraftingOpen() || mammothDebugMenuOpen() || isTextInputFocused();

  const fpLocomotionInputBlocked = () =>
    mammothCraftingOpen() || mammothDebugMenuOpen() || isTextInputFocused();

  const { runFrame } = createFpSessionMainRafFrame({
    mainRaf,
    canvas,
    scene,
    renderer,
    camera,
    conn,
    keys,
    loco,
    pos,
    prevPos,
    _input,
    _mainStepOpts,
    simulatePredictedPlayerStep,
    fpCollisionDebug,
    fpElevators,
    fpApartmentDoors,
    fpApartmentFurniture,
    fpApartmentDecorMeshes,
    sampleWalkTopBase,
    _elevSupportEval,
    _displayOffset,
    _rigViewScratch,
    _aimShotWorldDir,
    _audioMovement,
    playerRig,
    headPivot,
    headPitch,
    headCameraPitch,
    headFreeLook,
    worldAudio,
    getWorldAudioReady: () => worldAudioReady,
    cabMotionAudio,
    getCabMotionAudioReady: () => cabMotionAudioReady,
    localAudio,
    presentation,
    hotbarConsumableVisual,
    cabMirrors,
    fpEnvironment,
    stairShaftInteriorLightBounds,
    _floorVisCamWorld,
    _floorVisCamDir,
    poseAoiAnchor,
    droppedPickupHudBands: mammothDropPickupBands,
    syncSpatialAoiFromFeet,
    syncActiveHotbarSlotToServer,
    maybeSendMoveIntent,
    sendMoveIntent,
    syncBuildingFloorPlateVisibility,
    isInsideElevatorCabHudForJump,
    isApartmentFurnitureInteriorVisible,
    selectedHotbarRow,
    logFpPerf,
    tickFpSessionElevDebug,
    fpInteractInputBlocked,
    fpLocomotionInputBlocked,
    apartmentClaimsAllowed: opts.apartmentClaimsAllowed !== false,
    fpInteractionFeet: getInteractionPos,
    fpDroppedPickupFeet: getDroppedPickupAuthorityFeet,
    fpFirearmImpactDecals,
    fpPlayerDamageBloodSquirt,
    getFpPerfSceneCounters,
    scheduleGpuTimestampResolve,
  });

  let raf = 0;
  let lastFrameMs = performance.now();
  let rafDiagFrames = 0;

  if (loadDbg) fpLoadingDbgMark("mount_fp_session:start_main_raf_loop");

  /**
   * Single RAF driver for the whole FP session. Chrome’s “[Violation] requestAnimationFrame
   * handler took N ms” points at an **early line inside this function** (often the first
   * `performance.now()`), not the line that consumed the time — the whole body from input
   * through `renderer.render` is attributed to that handler.
   */
  const tick = () => {
    raf = requestAnimationFrame(tick);
    // Single performance.now() for the whole tick — avoids redundant syscalls and keeps
    // sub-systems consistent with the same timestamp.
    const nowMs = performance.now();
    if (loadDbg && rafDiagFrames > 12) {
      fpLoadingDbgCheckRafGap(lastFrameMs, nowMs);
    }
    if (loadDbg) rafDiagFrames += 1;
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
    lastFrameMs = nowMs;
    if (loadDbg) fpLoadingDbgPushPhase("fp.raf.tick");
    try {
      runFrame(nowMs, dt);
      bumpGuestFeetAutosaveIfDue(nowMs, {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: mainRaf.bodyYaw,
      });
    } finally {
      if (loadDbg) fpLoadingDbgPopPhase();
    }
  };
  tick();

  if (loadDbg) {
    fpLoadingDbgMark("mount_fp_session:mount_async_returning_disposer", {
      totalElapsedMsSinceMountEntered: Math.round(performance.now() - mountWallClock0),
    });
  }

  return () => {
    sessionDisposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheelHotbar);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("pointerup", onPrimaryPointerUpOrCancel);
    window.removeEventListener("pointercancel", onPrimaryPointerUpOrCancel);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("contextmenu", onCanvasContextMenu);
    setFpPickupPrompt(null);
    fpElevators.dispose();
    fpApartmentDecorMeshes.dispose();
    fpApartmentFurniture.dispose();
    fpApartmentDoors.dispose();
    unregisterFpDebugMenuSessionSnapshot();
    setFpActiveStashPanel(null);
    disposeFpSessionDevDebug();
    droppedWorld.dispose();
    conn.db.player_pose.removeOnInsert(onPoseInsert);
    conn.db.player_pose.removeOnUpdate(onPoseUpdate);
    conn.db.player_vitals.removeOnUpdate(onSelfVitalsUpdate);
    fpEnvironment.dispose();
    decalManager?.dispose();
    disposeStaticWorldObjectTree(buildingRoot);
    disposeStaticWorldObjectTree(cellRoot);
    forgetMegablockStaticWorldMeshCache();
    disposeFpAuthoring();
    disposeWeaponPresentationHotReload();
    disposeWorldContentHotReload();
    unsubHotbarRail();
    cabMotionAudio.dispose();
    cabMotionAudioReady = false;
    backgroundMusic.dispose();
    unsubscribeBackgroundMusicEnabled();
    worldAudio.dispose();
    worldAudioReady = false;
    registerGameAudioPrime(null);
    unregisterHotbarConsumeLocalAudio();
    localAudio.dispose();
    fpPlayerDamageBloodSquirt.dispose();
    fpFirearmImpactDecals.dispose();
    hotbarConsumableVisual.dispose();
    for (const mirror of cabMirrors) mirror.dispose();
    presentation.dispose();
    renderer.dispose();
    scene.clear();
    resetFpSessionFpsDisplay();
    resetFpSessionCompassHeading();
    resetFpSessionGameUiHidden();
    resetFpPerfStore();
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
  };
}
