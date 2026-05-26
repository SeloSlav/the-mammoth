import * as THREE from "three";
import type { DbConnection } from "../module_bindings";
import type { PlayerPose, PlayerVitals } from "../module_bindings/types";
import {
  bumpGuestFeetAutosaveIfDue,
  persistActiveGuestLastWorldPose,
  readActiveGuestLastWorldPose,
} from "../spacetime/guestSavedWorldPose.js";
import { InteriorDocSchema } from "@the-mammoth/schemas";
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
  bindMammothApartmentInteriorViewmodelEnv,
  bindMammothApartmentPropReadableEnv,
  bindMammothResidentialShellIndirectEnv,
  ensureMammothApartmentDecorShadowRenderer,
  MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD,
  MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD,
  prepareMammothApartmentInteriorContentRoots,
  syncMammothStairwellCeilingFixturePresentation,
  ensureMammothStairwellCeilingFixtureVisuals,
  requestWebGpuAdapter,
  webGpuAdapterSupportsTimestampQuery,
  type ApartmentPracticalLightsMount,
  type FpLocomotionInput,
} from "@the-mammoth/engine";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS,
  ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS,
  ENABLE_STAIRWELL_GRAFFITI_DECALS,
  collectStairwellCeilingLightGroups,
  ensureStairwellCigaretteMeshReady,
  subscribeStairwellCeilingPropReady,
  maxBuildingLevelIndex,
  parseFloorDoc,
  buildInteriorMeshes,
} from "@the-mammoth/world";
import {
  collectFpSessionUnitInteriorMeshEntries,
  collectFpSessionTopFloorResidentialUnitShellMeshes,
} from "./fpSession/fpSessionUnitInteriorShellMeshes.js";
import {
  FP_FLOOR_19_CORRIDOR_DECOR_ROOT_NAME,
  mountFpFloor19CorridorCeilingLights,
} from "./fpSession/fpSessionCorridorCeilingLights.js";
import { installFpSessionTransientDebugConsole } from "./fpSession/fpSessionTransientDebugConsole.js";
import { createFpSessionFloorPlateVisibility } from "./fpSession/fpSessionFloorPlateVisibility.js";
import { createFpSessionMoveIntentChannel } from "./fpSession/fpSessionMoveIntentChannel.js";
import {
  createFpSessionMainRafFrame,
  type FpSessionMainRafState,
} from "./fpSession/fpSessionMainRafFrame.js";
import { createFpFirearmImpactDecals } from "./fpSession/fpFirearmImpactDecals.js";
import { createFpPlayerDamageBloodSquirt } from "./fpSession/fpPlayerDamageBloodSquirt.js";
import { createFpPlayerDamageScreenShake } from "./fpSession/fpPlayerDamageScreenShake.js";
import { mountGameTimeDisplaySync } from "./fpSession/gameTimeDisplay.js";
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
import { resetFpDebugRenderIsolationFlags } from "./fpDebugRenderIsolation.js";
import { resetFpDebugEmissiveIsolationState } from "./fpDebugEmissiveIsolation.js";
import { resetFpDebugGameplayFeedbackFlags } from "./fpDebugGameplayFeedback.js";
import { installMmWallProbeLoadingStub } from "./fpSession/fpSessionWallProbeStub.js";
import { disposeStaticWorldObjectTree } from "./fpSession/fpSessionStaticWorldDispose.js";
import {
  forgetMegablockStaticWorldMeshCache,
  waitMegablockStaticWorldMeshReady,
} from "./fpSession/fpSessionStaticWorldMeshCache.js";
import { restoreUnitInteriorMeshVisibilityAfterAuthView } from "../ui/mammothAuthBackdropInteriorVisibility.js";
import {
  disposeStandardApartmentWindowShuttersRoot,
  MAMMOTH_AUTH_STANDARD_WINDOW_SHUTTERS_ROOT_NAME,
} from "@the-mammoth/world";
import { createCombatSimStaticWorld } from "./combatSim/combatSimStaticWorld.js";
import { findOwnedApartmentUnitForIdentity } from "./combatSim/combatSimEnter.js";
import {
  createInertFpApartmentDecorMeshes,
  createInertFpApartmentDoors,
  createInertFpBalconyGrowSession,
  createInertFpElevatorWorld,
} from "./fpSession/fpSessionInertSubsystems.js";
import { floorPayloadByDocId } from "./fpSession/fpSessionContentLoad.js";
import { effectiveDevGameplayEquippedPrimary } from "./fpDev/devGameplayWeaponOverride.js";
import {
  fpHotbarDigitKeySuppressedByDebounce,
  HOTBAR_SLOT_COUNT,
  hotbarSlotHasHotbarUseAction,
} from "./fpHotbar/fpHotbarActivate.js";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "./fpHotbar/fpHotbarSelection.js";
import {
  ACTIVE_HOTBAR_SLOT_CLEARED,
  getHotbarSlotInventoryItem,
  hotbarDefIdSupportsRangedAttack,
} from "./fpHotbar/fpHotbarResolve.js";
import { getLocalFirearmChamberView } from "./fpHotbar/fpFirearmChamber.js";
import {
  apartmentClaimInteriorsPreferOverUnitDoor,
  apartmentUnitContainingFeet,
  apartmentUnitContainingFeetSlack,
  clientOwnsClaimedApartmentUnit,
  getApartmentSystemPrompt,
} from "./fpApartment/fpApartmentGameplay.js";
import { APARTMENT_CLAIM_UI_ENABLED } from "../featureFlags";
import {
  attachFpSessionEnvironment,
  FP_SESSION_SKY_CAMERA_FAR,
} from "./fpSession/fpSessionEnvironment.js";
import { resetFpSessionCompassHeading } from "./fpSession/fpSessionCompassHeading.js";
import {
  FP_COMBAT_HIP_FOV_DEG,
  resetFpSessionCombatAiming,
} from "./fpSession/fpSessionCombatAim.js";
import { detectPointerButtonEdges } from "./fpSession/fpSessionPointerButtons.js";
import { resetFpSessionFpsDisplay } from "./fpSession/fpSessionFpsDisplay.js";
import {
  resetFpSessionGameUiHidden,
  toggleFpSessionGameUiHidden,
} from "./fpSession/fpSessionGameUiHidden.js";
import { createFpSessionPerfDebugPostRenderHook, fpSessionTrackGpuTimestampsEnabled } from "./fpSession/fpSessionPerfDebug.js";
import { createFpSessionHeavyMeshProfiler } from "./fpSession/fpSessionHeavyMeshProfiler.js";
import { mountFpApartmentDoors } from "./fpApartment/fpApartmentDoors.js";
import { mountFpApartmentDecorMeshes } from "./fpApartment/fpApartmentDecorMeshes.js";
import {
  handleBalconyGrowKeyE,
  mountFpBalconyGrowSession,
  runBalconyGrowHarvest,
} from "./fpBalconyGrow/fpBalconyGrowSession.js";
import { balconyGrowInspectBlocksGrowTrayStash } from "./fpBalconyGrow/fpBalconyGrowInspectState.js";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "./fpApartment/fpApartmentStashKey.js";
import { apartmentSittableScreenNdcFromPointer } from "./fpApartment/fpApartmentSittablePrompt.js";
import { tryEnterFpSitFromPrompt } from "./fpApartment/fpSitEnter.js";
import { tryExitFpSitOnMovement } from "./fpApartment/fpSitExit.js";
import { exitFpSit, fpSitSessionIsOnBed, getFpSitSession, isFpSitActive } from "./fpApartment/fpSitSession.js";
import { openFpSleepConfirm, registerFpSleepPoseFlush } from "./fpApartment/fpSleepConfirmState.js";
import {
  closeFpNotebookTipsPanel,
  isFpNotebookTipsPanelOpen,
  openFpNotebookTipsPanel,
} from "./fpApartment/fpNotebookTipsPanelState.js";
import type { ApartmentNotebookPrompt } from "./fpApartment/fpApartmentNotebookTypes.js";
import { tagMergedResidentialShellMeshes } from "./fpApartment/fpResidentialUnitInteriorLayer.js";
import { ElevatorCabMotionAudio } from "./audio/elevatorCabMotionAudio.js";
import { mountFpElevatorWorld } from "./fpElevator/fpElevatorWorld.js";
import { mountFpViewmodelAuthoringDevOnly } from "./fpDev/fpViewmodelAuthoringOverlay.js";
import { mountWeaponPresentationDevHotReload } from "./fpDev/weaponPresentationDevHotReload.js";
import { mountWorldContentDevReload } from "./fpDev/fpWorldContentDevReload.js";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import { LocalGameAudio } from "./audio/localGameAudio.js";
import { createFpSessionCorridorPvsContext } from "./fpSession/fpSessionCorridorPvs.js";
import { createFpNpcSession } from "./npc/fpNpcSession.js";
import { createFpNpcCollisionSource } from "./fpPhysics/fpNpcCollision.js";
import { setFpCombatSimMode } from "./combatSim/fpCombatSimMode.js";
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
import {
  closeApartmentStashAndInventory,
  getFpActiveStashPanel,
  setFpActiveStashPanel,
} from "./fpInteraction/fpActiveStashPanel.js";
import {
  requestMammothInventoryCloseFromFp,
  requestMammothInventoryOpenFromFp,
} from "./fpInteraction/fpInventoryOpenRequest.js";
import { clearFpPickupPrompts } from "./fpInteraction/fpPickupPrompt.js";
import { WorldProximityAudio } from "./audio/worldProximityAudio.js";
import { ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS } from "./fpElevator/fpElevatorConstants.js";
import { poseSeqAsBigint } from "./fpSession/fpSessionPoseSeq.js";
import { resolveAuthoritativeInteractionPose } from "./fpInteraction/fpInteractionAuthority.js";
import {
  formatFpSceneTriangleBuckets,
  summarizeFpSessionSceneTriangles,
} from "./fpSession/fpSessionSceneTriangleCount.js";
import { deliverFpSessionGpuRenderMs, resetFpPerfStore } from "./fpSession/fpSessionPerfStore.js";
import { countFpSessionPracticalLights } from "./fpSession/fpSessionPracticalLightCounters.js";
import {
  emptyFpPracticalDecorLightKindFields,
  fpPracticalDecorLightKindFieldsFromCounter,
} from "./fpSession/fpSessionPracticalLightPerfKinds.js";
import { FpHotbarConsumableVisual } from "./fpHotbar/fpHotbarConsumableVisual.js";
import { createFpCollisionDebugOverlay } from "./fpSession/fpSessionCollisionDebug.js";
import { FpCabMirrorCollection } from "./fpRendering/fpCabMirrorCollection.js";
import {
  FP_APARTMENT_DECOR_PROP_LAYER,
  FP_MIRROR_SELF_RENDER_LAYER,
  FP_RESIDENTIAL_UNIT_INTERIOR_LAYER,
  FP_SESSION_MAX_PIXEL_RATIO,
  FP_SESSION_WEBGPU_ANTIALIAS,
  FP_VIEWMODEL_RENDER_LAYER,
  NET_DT_SEC,
  DROPPED_ITEM_SUBSCRIBE_HALF_M,
  POSE_AOI_HALF,
  WORLD_SOUND_AOI_HALF,
} from "./fpSession/fpSessionConstants.js";
import {
  applyFpRigLookRotations,
  createFpLookInertiaState,
  resetFpLookInertia,
  stepFpFreeLookRecenter,
  stepFpLookInertia,
} from "./fpSession/fpSessionCameraLook.js";
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
import lobbyCentralInteriorAuthoringDoc from "../../../../content/interiors/lobby_central.json";
import { createFpInteriorPartitionSolidCollision } from "./fpPhysics/fpInteriorPartitionSolidCollision.js";
import { visitLocomotionDynamicBlockersInOrder } from "@the-mammoth/game";
import type { FpDynamicLocomotionBlockerHost } from "./fpSession/fpSessionLocalPrediction.js";
import {
  partitionPosesFromWallRows,
  scheduleSyncApartmentPartitionBlockers,
} from "./fpApartment/fpApartmentPartitionBlockerSync.js";
import { apartmentUnitOwnerEqual, UNIT_STATE_CLAIMED } from "./fpApartment/fpApartmentGameplay.js";

/**
 * Visual-only residential containment needs to be wider than gameplay containment: player feet can
 * ride the edge of facade/window hulls while the camera is still clearly inside the unit. Keep this
 * below half the usual cross-hall gap so hallway peeks do not become apartment interiors.
 */
const FP_RESIDENTIAL_VISUAL_CONTAINMENT_SLACK_XZ_M = 0.85;

function localMirrorBodyUriForConn(conn: DbConnection): string {
  const id = conn.identity;
  if (!id) return REMOTE_PLAYER_BODY_URI_MALE;
  const row = conn.db.user.identity.find(id);
  const raw = row?.avatarBody;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
  return n === 1 ? REMOTE_PLAYER_BODY_URI_FEMALE : REMOTE_PLAYER_BODY_URI_MALE;
}

function isPromiseWithCatch(value: unknown): value is Promise<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    "catch" in value &&
    typeof value.catch === "function"
  );
}

function requestCanvasPointerLock(canvas: HTMLCanvasElement): void {
  const result = canvas.requestPointerLock();
  if (!isPromiseWithCatch(result)) return;
  void result.catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "SecurityError") return;
    console.warn("[mountFpSession] requestPointerLock failed", err);
  });
}

function fpGpuTimestampDebugEnabled(): boolean {
  return fpSessionTrackGpuTimestampsEnabled();
}

export async function mountFpSession(
  canvas: HTMLCanvasElement,
  conn: DbConnection,
  /** `combatSimMode`: empty arena world + `fpSessionInertSubsystems` stubs; otherwise full megablock. */
  opts: { apartmentClaimsAllowed?: boolean; combatSimMode?: boolean } = {},
): Promise<() => void> {
  const loadDbg = isFpLoadingDebugEnabled();
  const mountWallClock0 = performance.now();
  if (loadDbg) fpLoadingDbgMark("mount_fp_session:begin");

  const isCombatSim = opts.combatSimMode === true;
  setFpCombatSimMode(isCombatSim);
  canvas.dataset.mammothFpCanvas = "1";

  installMmWallProbeLoadingStub();

  const [world, webGpuAdapter] = await Promise.all([
    fpLoadingDbgTimed("fp_static_world_create", async () =>
      isCombatSim ? createCombatSimStaticWorld(conn) : waitMegablockStaticWorldMeshReady(),
    ),
    fpLoadingDbgTimed("webgpu_adapter_assert", async () => {
      await assertWebGpuAdapterOrThrow();
      return requestWebGpuAdapter();
    }),
    // Must finish before first `player_pose` ingest — combat sim leaves feet at arena center,
    // which hides megablock interiors and reads as a black void in live play.
    !isCombatSim
      ? fpLoadingDbgTimed("leave_combat_sim_before_live_mount", () =>
          conn.reducers.leaveCombatSim({}),
        )
      : Promise.resolve(),
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
  const gpuTimestampRequested = fpGpuTimestampDebugEnabled();
  const gpuTimestampSupported =
    webGpuAdapter !== null && webGpuAdapterSupportsTimestampQuery(webGpuAdapter);
  const trackGpuTimestamps = gpuTimestampRequested && gpuTimestampSupported;
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: FP_SESSION_WEBGPU_ANTIALIAS,
    forceWebGL: false,
    trackTimestamp: trackGpuTimestamps,
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
    if (!trackGpuTimestamps) return;
    const backend = (renderer as unknown as { backend?: { trackTimestamp?: boolean } }).backend;
    if (!backend?.trackTimestamp) return;
    void renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER).then((ms) => {
      deliverFpSessionGpuRenderMs(ms);
    });
  };
  if (gpuTimestampRequested && !gpuTimestampSupported) {
    console.info(
      "[fpSession] GPU timestamp queries unavailable (adapter missing timestamp-query); perf report GPU hw line stays n/a.",
    );
  }
  resetFpSessionFpsDisplay();
  resetFpSessionCompassHeading();
  resetFpSessionGameUiHidden();
  resetFpDebugRenderIsolationFlags();
  resetFpDebugEmissiveIsolationState();
  resetFpDebugGameplayFeedbackFlags();
  const logFpPerf = createFpSessionPerfDebugPostRenderHook(renderer);
  const fpEnvironment = attachFpSessionEnvironment(scene, renderer, {
    skipOutdoorGroundPlane: isCombatSim,
    outdoorCombatArena: isCombatSim,
  });

  const { rig: playerRig, headPivot, headPitch, headCameraPitch, headFreeLook, camera } =
    createFPRig(fpLocomotionConstants.eyeStand);
  const sampleFpPerfHeavyMeshes = createFpSessionHeavyMeshProfiler({ sceneRoot: scene, buildingRoot, camera });
  /** Skydome is a large inner sphere; default rig `far` (900) clips it to black. */
  camera.far = FP_SESSION_SKY_CAMERA_FAR;
  scene.add(playerRig);
  if (!isCombatSim) {
    void ensureStairwellCigaretteMeshReady();
  }

  scene.add(buildingRoot);
  scene.add(cellRoot);
  buildingRoot.updateMatrixWorld(true);
  const floor19CorridorCeilingLights =
    isCombatSim || !ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS
      ? null
      : mountFpFloor19CorridorCeilingLights({ buildingRoot });
  if (!isCombatSim) {
    // Reset any stale shell visibility on the shared megablock cache; FP visibility owns them again.
    restoreUnitInteriorMeshVisibilityAfterAuthView(buildingRoot);
    const authShutterRoot = buildingRoot.getObjectByName(
      MAMMOTH_AUTH_STANDARD_WINDOW_SHUTTERS_ROOT_NAME,
    );
    if (authShutterRoot) {
      disposeStandardApartmentWindowShuttersRoot(authShutterRoot);
    }
    prepareMammothApartmentInteriorContentRoots({ shellRoot: buildingRoot });
  }
  const fpReadableEnv = scene.userData.mammothFpMetallicReadableEnv;
  const fpEnvTex = fpReadableEnv instanceof THREE.Texture ? fpReadableEnv : null;
  const fpShellWarmEnv = scene.userData[MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD];
  const fpShellEnvTex =
    fpShellWarmEnv instanceof THREE.Texture ? fpShellWarmEnv : fpEnvTex;
  if (!isCombatSim) {
    bindMammothResidentialShellIndirectEnv(buildingRoot, fpShellEnvTex);
  }
  cellRoot.updateMatrixWorld(true);
  const buildingWorldBounds = buildingBodyWorldBounds.clone();
  const maxBuildingLevel = isCombatSim ? 0 : maxBuildingLevelIndex(building);

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

  // Combat sim: same FP session — inert apartment subsystems + empty arena (see mountCombatSimSession.ts).
  const fpElevators = isCombatSim
    ? createInertFpElevatorWorld()
    : mountFpElevatorWorld({
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

  const fpApartmentDoors = isCombatSim
    ? createInertFpApartmentDoors()
    : mountFpApartmentDoors({
        conn,
        buildingRoot,
        building,
      });

  let fpLobbyInteriorAuthoringRoot: THREE.Group | null = null;
  if (!isCombatSim) {
    try {
      const lobbyInteriorDoc = InteriorDocSchema.parse(lobbyCentralInteriorAuthoringDoc);
      fpLobbyInteriorAuthoringRoot = buildInteriorMeshes(lobbyInteriorDoc);
      fpLobbyInteriorAuthoringRoot.name = "fp_interior_authoring:lobby_central";
      scene.add(fpLobbyInteriorAuthoringRoot);
    } catch (err) {
      console.warn("[mountFpSession] lobby interior authoring mount failed", err);
    }
  }

  const fpInteriorPartitionSolids = createFpInteriorPartitionSolidCollision();
  const fpNpcCollision = isCombatSim ? createFpNpcCollisionSource() : null;
  const fpDynamicLocomotionBlockers: FpDynamicLocomotionBlockerHost = {
    visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose) {
      visitLocomotionDynamicBlockersInOrder(
        {
          elevators: (ix0, ix1, iz0, iz1, ivisit, iqueryPose) =>
            fpElevators.visitCollisionAabbsInXZ(ix0, ix1, iz0, iz1, ivisit, iqueryPose),
          apartmentDoors: (ix0, ix1, iz0, iz1, ivisit, iqueryPose) =>
            fpApartmentDoors.visitCollisionAabbsInXZ(ix0, ix1, iz0, iz1, ivisit, iqueryPose),
          interiorPartitions: (ix0, ix1, iz0, iz1, ivisit, iqueryPose) =>
            fpInteriorPartitionSolids.visitCollisionAabbsInXZ(
              ix0,
              ix1,
              iz0,
              iz1,
              ivisit,
              iqueryPose,
            ),
          peerNpcCapsules: fpNpcCollision
            ? (ix0, ix1, iz0, iz1, ivisit, iqueryPose) =>
                fpNpcCollision.visitCollisionAabbsInXZ(ix0, ix1, iz0, iz1, ivisit, iqueryPose)
            : undefined,
        },
        x0,
        x1,
        z0,
        z1,
        (aabb) => visit({ min: aabb.min, max: aabb.max }),
        queryPose,
      );
    },
  };
  function rebuildFpInteriorPartitionSolidMeshes(
    wallRows: import("./fpApartment/fpApartmentDecorRebuild.js").VisibleWallPlacement[],
  ): void {
    fpInteriorPartitionSolids.rebuildFromPartitionPoses(partitionPosesFromWallRows(wallRows));
    if (isCombatSim) return;
    const byUnit = new Map<string, typeof wallRows>();
    for (const wall of wallRows) {
      const list = byUnit.get(wall.unit.unitKey) ?? [];
      list.push(wall);
      byUnit.set(wall.unit.unitKey, list);
    }
    for (const [unitKey, rows] of byUnit) {
      const unit = rows[0]?.unit;
      if (!unit || unit.state !== UNIT_STATE_CLAIMED) continue;
      if (!apartmentUnitOwnerEqual(unit.owner, conn.identity)) continue;
      scheduleSyncApartmentPartitionBlockers(
        conn,
        unitKey,
        partitionPosesFromWallRows(rows),
      );
    }
  }

  const fpFirearmImpactDecals = createFpFirearmImpactDecals({
    scene,
    staticCollisionIndex,
    visitExtraSolidAabbsInXZ: (x0, x1, z0, z1, visit) => {
      fpApartmentDoors.visitFirearmBarrierAabbsInXZ(x0, x1, z0, z1, visit);
      fpInteriorPartitionSolids.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit);
      // Combat sim NPCs must not occlude decals — impact marks are wall/ground-only.
    },
  });

  const fpCollisionDebug = createFpCollisionDebugOverlay({
    staticCollisionIndex,
    visitDynamicCollisionAabbsInXZ: (x0, x1, z0, z1, visit, queryPose) => {
      fpDynamicLocomotionBlockers.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
    },
  });
  scene.add(fpCollisionDebug.group);

  const unitInteriorMeshEntries = collectFpSessionUnitInteriorMeshEntries(buildingRoot);
  const unitInteriorMeshes = unitInteriorMeshEntries.map((entry) => entry.mesh);
  const topFloorResidentialUnitShellMeshes =
    collectFpSessionTopFloorResidentialUnitShellMeshes(buildingRoot);
  const apartmentDecorInteriorMeshes: THREE.Mesh[] = [];
  const apartmentDecorFloorShadowMeshes: THREE.Mesh[] = [];
  const perfFloorPlateGroups = buildingRoot.children.filter(
    (ch): ch is THREE.Group =>
      ch instanceof THREE.Group &&
      typeof ch.userData.mammothPlateLevelIndex === "number",
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
    apartmentDecorFloorShadowMeshes.length = 0;
    buildingRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData[MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD] === true) {
        apartmentDecorFloorShadowMeshes.push(obj);
      }
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
  let syncFpViewmodelReadableEnv = (): void => {
    const tex = scene.userData.mammothFpMetallicReadableEnv;
    bindMammothApartmentInteriorViewmodelEnv(
      headPitch,
      tex instanceof THREE.Texture ? tex : null,
    );
  };

  let stairwellCeilingPracticalLights: ApartmentPracticalLightsMount | null = null;
  let stairwellCeilingVisualSyncRaf = 0;
  let stairwellCeilingPracticalLightsActive = false;
  let stairwellCeilingPracticalLightsSignature = "";
  let getIsInsideStairwellShaft: () => boolean = () => false;

  const MAMMOTH_STAIRWELL_FP_INTERIOR_PREPARED_UD = "mammothStairwellFpInteriorPrepared";

  const prepareStairwellCeilingGroupsOnce = (): void => {
    const tex = scene.userData.mammothFpMetallicReadableEnv;
    const envTexture = tex instanceof THREE.Texture ? tex : null;
    for (const group of collectStairwellCeilingLightGroups(buildingRoot)) {
      if (group.userData[MAMMOTH_STAIRWELL_FP_INTERIOR_PREPARED_UD] === true) continue;
      prepareMammothApartmentInteriorContentRoots({
        shellRoot: buildingRoot,
        decorRoot: group,
      });
      bindMammothApartmentPropReadableEnv(group, envTexture);
      group.userData[MAMMOTH_STAIRWELL_FP_INTERIOR_PREPARED_UD] = true;
    }
  };

  const stairwellCeilingPracticalGroupsSignature = (
    groups: readonly THREE.Object3D[],
  ): string =>
    groups
      .map((group) => `${group.uuid}:${group.visible ? 1 : 0}:${group.children.length}`)
      .join("|");

  const syncStairwellCeilingPracticalLights = (): void => {
    if (isCombatSim || !ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS) {
      if (stairwellCeilingPracticalLightsActive) {
        stairwellCeilingPracticalLights?.dispose();
        stairwellCeilingPracticalLights = null;
        stairwellCeilingPracticalLightsActive = false;
        stairwellCeilingPracticalLightsSignature = "";
      }
      return;
    }
    const insideShaft = getIsInsideStairwellShaft();
    if (!insideShaft) {
      if (stairwellCeilingPracticalLightsActive) {
        stairwellCeilingPracticalLights?.dispose();
        stairwellCeilingPracticalLights = null;
        stairwellCeilingPracticalLightsActive = false;
        stairwellCeilingPracticalLightsSignature = "";
      }
      return;
    }

    const decorGroups = collectStairwellCeilingLightGroups(buildingRoot).filter(
      (group) => group.visible && group.children.length > 0,
    );
    const signature = stairwellCeilingPracticalGroupsSignature(decorGroups);
    if (
      stairwellCeilingPracticalLightsActive &&
      signature === stairwellCeilingPracticalLightsSignature
    ) {
      return;
    }

    stairwellCeilingPracticalLights = syncMammothStairwellCeilingFixturePresentation({
      buildingRoot,
      lightParent: scene,
      previous: stairwellCeilingPracticalLights,
      practicalDecorGroups: decorGroups,
      runtimeLightsEnabled: ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS,
    });
    stairwellCeilingPracticalLightsActive = true;
    stairwellCeilingPracticalLightsSignature = signature;
  };

  const scheduleStairwellCeilingVisualSync = (): void => {
    if (!ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS) return;
    if (stairwellCeilingVisualSyncRaf !== 0) return;
    stairwellCeilingVisualSyncRaf = requestAnimationFrame(() => {
      stairwellCeilingVisualSyncRaf = 0;
      if (isCombatSim) return;
      ensureMammothStairwellCeilingFixtureVisuals(buildingRoot);
      prepareStairwellCeilingGroupsOnce();
      syncStairwellCeilingPracticalLights();
    });
  };

  const unsubscribeStairwellCeilingPropReady = ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS
    ? subscribeStairwellCeilingPropReady(() => {
        scheduleStairwellCeilingVisualSync();
      })
    : () => {};

  const refreshApartmentInteriorMeshes = () => {
    const tex = scene.userData.mammothFpMetallicReadableEnv;
    const envTexture = tex instanceof THREE.Texture ? tex : null;
    const decorRoots = [
      scene.getObjectByName("apartment_unit_decor_root"),
      buildingRoot.getObjectByName(FP_FLOOR_19_CORRIDOR_DECOR_ROOT_NAME),
    ].filter((node): node is THREE.Object3D => node != null);
    for (const decorRoot of decorRoots) {
      prepareMammothApartmentInteriorContentRoots({
        shellRoot: buildingRoot,
        decorRoot,
      });
      bindMammothApartmentPropReadableEnv(decorRoot, envTexture);
    }
    syncFpViewmodelReadableEnv();
    unitInteriorMeshEntries.length = 0;
    unitInteriorMeshEntries.push(...collectFpSessionUnitInteriorMeshEntries(buildingRoot));
    unitInteriorMeshes.length = 0;
    for (let i = 0; i < unitInteriorMeshEntries.length; i++) {
      unitInteriorMeshes.push(unitInteriorMeshEntries[i]!.mesh);
    }
    apartmentDecorInteriorMeshes.length = 0;
    for (let i = 0; i < unitInteriorMeshEntries.length; i++) {
      const entry = unitInteriorMeshEntries[i]!;
      if (entry.apartmentUnitKey !== null) {
        apartmentDecorInteriorMeshes.push(entry.mesh);
      }
    }
    disableShadowsOnUnitInteriorMeshes();
    refreshPerfTrackedMeshes();
    fpApartmentDecorMeshes.rebuildStashRayOcclusion();
  };
  let lastPerfSceneCounterSampleAtMs = -Infinity;
  let lastPerfSceneCounters = {
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
    ...emptyFpPracticalDecorLightKindFields(),
  };
  const objectVisibleInHierarchy = (obj: THREE.Object3D): boolean => {
    if (!obj.layers.test(camera.layers)) return false;
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

    let visibleUnitInteriorMeshes = 0;
    let frustumUnitInteriorMeshes = 0;
    let visibleResidentialShellMeshes = 0;
    let frustumResidentialShellMeshes = 0;
    let visibleAnonymousInteriorMeshes = 0;
    let frustumAnonymousInteriorMeshes = 0;
    let visibleGenericInteriorMeshes = 0;
    let frustumGenericInteriorMeshes = 0;
    let visibleExteriorGlassMeshes = 0;
    let frustumExteriorGlassMeshes = 0;
    for (let i = 0; i < unitInteriorMeshEntries.length; i++) {
      const entry = unitInteriorMeshEntries[i]!;
      const mesh = entry.mesh;
      if (!objectVisibleInHierarchy(mesh)) continue;
      visibleUnitInteriorMeshes += 1;
      const inFrustum = _perfSceneFrustum.intersectsObject(mesh);
      if (inFrustum) frustumUnitInteriorMeshes += 1;
      if (entry.apartmentUnitKey === null && entry.residentialUnitId !== null) {
        visibleResidentialShellMeshes += 1;
        if (inFrustum) frustumResidentialShellMeshes += 1;
      }
      if (entry.apartmentUnitKey === null && entry.residentialUnitId === null) {
        visibleAnonymousInteriorMeshes += 1;
        if (inFrustum) frustumAnonymousInteriorMeshes += 1;
      }
      if (entry.genericInteriorVisibleInResidentialUnit) {
        visibleGenericInteriorMeshes += 1;
        if (inFrustum) frustumGenericInteriorMeshes += 1;
      }
      if (entry.residentialExteriorGlass) {
        visibleExteriorGlassMeshes += 1;
        if (inFrustum) frustumExteriorGlassMeshes += 1;
      }
    }

    let visibleApartmentPropMeshes = 0;
    let frustumApartmentPropMeshes = 0;
    let visibleApartmentDecorFloorShadowMeshes = 0;
    let frustumApartmentDecorFloorShadowMeshes = 0;
    for (let i = 0; i < apartmentDecorInteriorMeshes.length; i++) {
      const mesh = apartmentDecorInteriorMeshes[i]!;
      if (!objectVisibleInHierarchy(mesh)) continue;
      visibleApartmentPropMeshes += 1;
      if (_perfSceneFrustum.intersectsObject(mesh)) frustumApartmentPropMeshes += 1;
    }
    for (let i = 0; i < apartmentDecorFloorShadowMeshes.length; i++) {
      const mesh = apartmentDecorFloorShadowMeshes[i]!;
      if (!objectVisibleInHierarchy(mesh)) continue;
      visibleApartmentDecorFloorShadowMeshes += 1;
      if (_perfSceneFrustum.intersectsObject(mesh)) frustumApartmentDecorFloorShadowMeshes += 1;
    }

    let visibleTransparentMeshes = 0;
    let frustumTransparentMeshes = 0;
    let visibleTransparentExteriorGlassMeshes = 0;
    let frustumTransparentExteriorGlassMeshes = 0;
    for (let i = 0; i < transparentBuildingMeshes.length; i++) {
      const mesh = transparentBuildingMeshes[i]!;
      if (!objectVisibleInHierarchy(mesh)) continue;
      visibleTransparentMeshes += 1;
      const inFrustum = _perfSceneFrustum.intersectsObject(mesh);
      if (inFrustum) frustumTransparentMeshes += 1;
      if (mesh.userData.mammothResidentialUnitExteriorGlass === true) {
        visibleTransparentExteriorGlassMeshes += 1;
        if (inFrustum) frustumTransparentExteriorGlassMeshes += 1;
      }
    }

    const practicalLightCounts = countFpSessionPracticalLights({
      scene,
      frustum: _perfSceneFrustum,
      objectVisibleInHierarchy,
    });
    const practicalDecorKindFields = fpPracticalDecorLightKindFieldsFromCounter(
      practicalLightCounts.decorByKind,
    );

    const sceneGraphSummary = summarizeFpSessionSceneTriangles(scene);
    lastPerfSceneCounters = {
      sceneGraphVisibleTriangles: sceneGraphSummary.totalVisibleTriangles,
      sceneGraphBreakdown: formatFpSceneTriangleBuckets(sceneGraphSummary.buckets),
      visibleFloorPlates,
      visibleUnitInteriorMeshes,
      visibleApartmentPropMeshes,
      visibleApartmentDecorFloorShadowMeshes,
      visibleResidentialShellMeshes,
      visibleAnonymousInteriorMeshes,
      visibleGenericInteriorMeshes,
      visibleExteriorGlassMeshes,
      visibleTransparentMeshes,
      visibleTransparentExteriorGlassMeshes,
      frustumFloorPlates,
      frustumUnitInteriorMeshes,
      frustumApartmentPropMeshes,
      frustumApartmentDecorFloorShadowMeshes,
      frustumResidentialShellMeshes,
      frustumAnonymousInteriorMeshes,
      frustumGenericInteriorMeshes,
      frustumExteriorGlassMeshes,
      frustumTransparentMeshes,
      frustumTransparentExteriorGlassMeshes,
      visiblePracticalDecorLights: practicalLightCounts.visiblePracticalDecorLights,
      frustumPracticalDecorLights: practicalLightCounts.frustumPracticalDecorLights,
      visiblePracticalWindowLights: practicalLightCounts.visiblePracticalWindowLights,
      frustumPracticalWindowLights: practicalLightCounts.frustumPracticalWindowLights,
      practicalDecorLightBreakdownVis: practicalLightCounts.decorKindBreakdownVis,
      practicalDecorLightBreakdownFr: practicalLightCounts.decorKindBreakdownFr,
      ...practicalDecorKindFields,
    };
    return lastPerfSceneCounters;
  };

  const cabMirrorCollection = new FpCabMirrorCollection(scene);

  const fpApartmentDecorMeshes = isCombatSim
    ? createInertFpApartmentDecorMeshes()
    : mountFpApartmentDecorMeshes({
        scene,
        conn,
        buildingRoot,
        renderer,
        cabMirrorCollection,
        onRebuilt: refreshApartmentInteriorMeshes,
        onPartitionWallsRebuilt: rebuildFpInteriorPartitionSolidMeshes,
        onRequestShadowMapUpdate: () => {
          ensureMammothApartmentDecorShadowRenderer(renderer);
        },
      });
  if (!isCombatSim) {
    refreshApartmentInteriorMeshes();
    if (ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS) {
      scheduleStairwellCeilingVisualSync();
    }
    if (floor19CorridorCeilingLights) {
      void floor19CorridorCeilingLights.ready.then(() => {
        refreshApartmentInteriorMeshes();
      });
    }
  }

  let sessionDisposed = false;
  let decalManager: DecalManager | null = null;

  if (!isCombatSim && ENABLE_STAIRWELL_GRAFFITI_DECALS) {
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
  headPitch.traverse((obj) => obj.layers.set(FP_VIEWMODEL_RENDER_LAYER));
  syncFpViewmodelReadableEnv();
  camera.layers.enable(FP_VIEWMODEL_RENDER_LAYER);
  camera.layers.enable(FP_RESIDENTIAL_UNIT_INTERIOR_LAYER);
  camera.layers.enable(FP_APARTMENT_DECOR_PROP_LAYER);
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
  const fpPlayerDamageScreenShake = createFpPlayerDamageScreenShake({ conn });

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
  let activeOwnedApartmentDecorUnitKey: string | null = null;

  const feetOnBuildingSlabForApartmentVisuals = (): boolean =>
    pos.x >= buildingWorldBounds.min.x - 0.05 &&
    pos.x <= buildingWorldBounds.max.x + 0.05 &&
    pos.z >= buildingWorldBounds.min.z - 0.05 &&
    pos.z <= buildingWorldBounds.max.z + 0.05;

  const apartmentUnitSummaryForKey = (
    unitKey: string | null,
  ): { unitId: string; unitKey: string; level: number } | null => {
    if (unitKey === null) return null;
    for (const row of conn.db.apartment_unit) {
      if (row.unitKey !== unitKey) continue;
      return { unitId: row.unitId, unitKey: row.unitKey, level: row.level };
    }
    return null;
  };

  const apartmentUnitIdForKey = (unitKey: string | null): string | null =>
    apartmentUnitSummaryForKey(unitKey)?.unitId ?? null;

  const apartmentUnitBoundsForKey = (
    unitKey: string | null,
  ): {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  } | null => {
    if (unitKey === null) return null;
    for (const row of conn.db.apartment_unit) {
      if (row.unitKey !== unitKey) continue;
      return {
        minX: row.boundMinX,
        minY: row.boundMinY,
        minZ: row.boundMinZ,
        maxX: row.boundMaxX,
        maxY: row.boundMaxY,
        maxZ: row.boundMaxZ,
      };
    }
    return null;
  };

  const pointInsideApartmentUnitBounds = (
    b: NonNullable<ReturnType<typeof apartmentUnitBoundsForKey>>,
    x: number,
    y: number,
    z: number,
    opts: { slackXZ: number; slackYBelow: number; slackYAbove: number },
  ): boolean =>
    x >= b.minX - opts.slackXZ &&
    x <= b.maxX + opts.slackXZ &&
    y >= b.minY - opts.slackYBelow &&
    y <= b.maxY + opts.slackYAbove &&
    z >= b.minZ - opts.slackXZ &&
    z <= b.maxZ + opts.slackXZ;

  const updateActiveOwnedApartmentFromContainingUnit = (
    unitKey: string | null,
  ): void => {
    if (
      unitKey !== null &&
      clientOwnsClaimedApartmentUnit(conn, conn.identity ?? undefined, unitKey)
    ) {
      activeOwnedApartmentDecorUnitKey = unitKey;
    }
  };

  const corridorPvsContext = createFpSessionCorridorPvsContext({
    buildingWorldOriginY: building.worldOrigin?.[1] ?? 0,
    floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
    maxLevel: maxBuildingLevel,
    unitIdForKey: apartmentUnitIdForKey,
    collectDoorEntries: () => fpApartmentDoors.collectCorridorPvsDoorEntries(),
  });

  const {
    syncBuildingFloorPlateVisibility: syncBuildingFloorPlateVisibilityBase,
    isInsideElevatorCabHudForJump,
    isInsideResidentialUnit,
    isInsideApartmentInteriorLightingZone,
    isInsideStairwellShaft,
    getContainingResidentialUnitKey,
    isApartmentDecorInteriorVisible,
    getCorridorPvsVisibleUnitKeys,
    getCorridorPvsVisibleUnitIds,
    getActiveFloorPlateBand,
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
      apartmentDecorInteriorMeshes,
      fpElevators,
      stairShaftInteriorLightBounds,
      stairShaftSpecs,
      feetPos: pos,
      getContainingResidentialUnit: () => {
        /**
         * Slack hull — decor retention / owned-unit handoff at thresholds only. Must not drive
         * `insideResidentialUnit`: 0.85 m XZ slack extends unit bounds across the corridor gap
         * beside closed doors and hides anonymous corridor shell meshes in-unit.
         */
        const slackUnit = apartmentUnitContainingFeetSlack(conn, pos.x, pos.y, pos.z, {
          slackXZ: FP_RESIDENTIAL_VISUAL_CONTAINMENT_SLACK_XZ_M,
          slackYBelow: 1.25,
          slackYAbove: 2.85,
        });
        updateActiveOwnedApartmentFromContainingUnit(slackUnit?.unitKey ?? null);

        const strictUnit = apartmentUnitContainingFeet(conn, pos.x, pos.y, pos.z);
        if (strictUnit) {
          return {
            unitId: strictUnit.unitId,
            unitKey: strictUnit.unitKey,
            level: strictUnit.level,
          };
        }
        return null;
      },
      getRetainedResidentialUnitId: () =>
        activeOwnedApartmentDecorUnitKey && feetOnBuildingSlabForApartmentVisuals()
          ? apartmentUnitIdForKey(activeOwnedApartmentDecorUnitKey)
          : null,
      getRetainedResidentialUnitKey: () =>
        activeOwnedApartmentDecorUnitKey && feetOnBuildingSlabForApartmentVisuals()
          ? activeOwnedApartmentDecorUnitKey
          : null,
      resolveCorridorPvsSnapshot: (input) =>
        corridorPvsContext.resolveSnapshot(input).visible,
      floorVisCamWorld: _floorVisCamWorld,
      floorVisCamDir: _floorVisCamDir,
    });
  /** Combat sim arena has no megablock plates — keep shared floor-band logic out of live play. */
  const syncBuildingFloorPlateVisibility = isCombatSim
    ? (_nowMs: number) => {
        camera.getWorldPosition(_floorVisCamWorld);
        camera.getWorldDirection(_floorVisCamDir);
        for (const ch of buildingRoot.children) {
          ch.visible = true;
        }
      }
    : (nowMs: number) => {
        syncBuildingFloorPlateVisibilityBase(nowMs);
        syncStairwellCeilingPracticalLights();
      };

  getIsInsideStairwellShaft = isInsideStairwellShaft;

  const getInteractionPos = () => {
    const p = resolveAuthoritativeInteractionPose(pos, serverPose);
    _interactionPos.set(p.x, p.y, p.z);
    return _interactionPos;
  };
  const getContainingResidentialUnitBounds = () => {
    if (isCombatSim) return null;
    if (activeOwnedApartmentDecorUnitKey && feetOnBuildingSlabForApartmentVisuals()) {
      const activeBounds = apartmentUnitBoundsForKey(activeOwnedApartmentDecorUnitKey);
      if (activeBounds) return activeBounds;
    }
    const unit = apartmentUnitContainingFeetSlack(conn, pos.x, pos.y, pos.z, {
      slackXZ: FP_RESIDENTIAL_VISUAL_CONTAINMENT_SLACK_XZ_M,
      slackYBelow: 1.25,
      slackYAbove: 2.85,
    });
    if (!unit) return null;
    return {
      minX: unit.boundMinX,
      minY: unit.boundMinY,
      minZ: unit.boundMinZ,
      maxX: unit.boundMaxX,
      maxY: unit.boundMaxY,
      maxZ: unit.boundMaxZ,
    };
  };
  const isInsideResidentialUnitForFrame = isCombatSim
    ? () => false
    : isInsideResidentialUnit;
  const isInsideApartmentInteriorLightingZoneForFrame = isCombatSim
    ? () => false
    : isInsideApartmentInteriorLightingZone;
  const isInsideStairwellShaftForFrame = isCombatSim
    ? () => false
    : isInsideStairwellShaft;
  const isApartmentDecorInteriorVisibleForFrame = isCombatSim
    ? () => false
    : isApartmentDecorInteriorVisible;
  const getCorridorPvsVisibleUnitKeysForFrame = isCombatSim
    ? () => new Set<string>() as ReadonlySet<string>
    : getCorridorPvsVisibleUnitKeys;
  const getActiveFloorPlateBandForFrame = isCombatSim
    ? () => ({ lo: 1, hi: maxBuildingLevel })
    : getActiveFloorPlateBand;
  const getContainingResidentialUnitBoundsForFrame = isCombatSim
    ? () => null
    : getContainingResidentialUnitBounds;
  const getActiveApartmentDecorUnitKeyForFrame = (
    containingResidentialUnitKey: string | null,
  ): string | null => {
    const id = conn.identity ?? undefined;
    if (
      !isCombatSim &&
      containingResidentialUnitKey !== null &&
      clientOwnsClaimedApartmentUnit(conn, id, containingResidentialUnitKey)
    ) {
      activeOwnedApartmentDecorUnitKey = containingResidentialUnitKey;
      return containingResidentialUnitKey;
    }
    if (!isInsideApartmentInteriorLightingZoneForFrame()) {
      return null;
    }
    return activeOwnedApartmentDecorUnitKey;
  };

  const visibleSittablePickScratch: THREE.Mesh[] = [];
  const sitPointerNdc = new THREE.Vector2();
  const sittablePickObjectVisible = (obj: THREE.Object3D): boolean => {
    for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
      if (!cur.visible) return false;
    }
    return true;
  };
  const getApartmentSittablePromptForSession = (screenNdc?: THREE.Vector2) =>
    fpApartmentDecorMeshes.getSittablePrompt(
      getInteractionPos(),
      camera,
      sittablePickObjectVisible,
      visibleSittablePickScratch,
      screenNdc,
    );
  const getApartmentNotebookPromptForSession = (screenNdc?: THREE.Vector2) =>
    fpApartmentDecorMeshes.getNotebookPrompt(
      getInteractionPos(),
      camera,
      sittablePickObjectVisible,
      visibleSittablePickScratch,
      screenNdc,
    );
  const tryNotebookInteractFromPrompt = (prompt: ApartmentNotebookPrompt | null): boolean => {
    if (!prompt || isFpNotebookTipsPanelOpen()) return false;
    openFpNotebookTipsPanel();
    if (document.pointerLockElement) void document.exitPointerLock();
    return true;
  };

  const mainRaf: FpSessionMainRafState = {
    bodyYaw: cachedGuestFeet?.yaw ?? 0,
    pitch: 0,
    headLookYaw: 0,
    crouchToggle: false,
    meleePressPending: false,
    primaryAttackHeld: false,
    combatAimHeld: false,
    fpRigViewSmoothedReady: false,
    lastTickElevSupportVyMps: 0,
    lastTickHudCabVyMps: 0,
    lastTickElevVyBlendAbs: 0,
    stairwellInteriorDarkSmoothed: 0,
    apartmentInteriorDarkSmoothed: 0,
    meleeAttackSeq: 0,
    firearmShotSeq: 0,
    lastMeleeMs: 0,
    lastRangedMs: 0,
  };
  const lookInertia = createFpLookInertiaState();
  /** Last seen `PointerEvent.buttons` mask — chorded clicks (RMB then LMB) only update via `pointermove`. */
  let trackedPointerButtons = 0;
  const moveIntentQueue: FpSessionMoveIntentQueue = { items: [], head: 0 };
  /** Max un-acked intents to retain (1.5 s buffer); older ones are compacted away. */
  const MAX_PENDING_INTENTS = 30;

  const keys = new Set<string>();
  const loco = createFpLocomotionState();

  const resolveFpFreeLook = (): boolean =>
    isFpSitActive() || keys.has("AltLeft") || keys.has("AltRight");

  /** Pointer events can arrive while RAF is blocked — apply look immediately, not only on the next tick. */
  const applyLocalFpRigLook = (freeLook: boolean): void => {
    applyFpRigLookRotations(
      { playerRig, headPitch, headCameraPitch, headFreeLook },
      mainRaf,
      freeLook,
    );
    playerRig.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  };

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

  /** Footsteps + NPC voice share one Web Audio context — create before locomotion wiring. */
  const localAudio = new LocalGameAudio();
  const fpNpcSession = isCombatSim
    ? await createFpNpcSession({
        worldParent: scene,
        fxScene: scene,
        conn,
        getAudioContext: () => localAudio.getAudioContext(),
        getCamera: () => camera,
        getReadableEnvTexture: () => {
          const tex = scene.userData.mammothFpMetallicReadableEnv;
          return tex instanceof THREE.Texture ? tex : null;
        },
        npcCollision: fpNpcCollision ?? undefined,
        /** Open arena has no megablock floor plates or corridor door PVS — always draw session NPCs. */
        getRenderPvsGate: () => null,
      })
    : null;

  const { _mainStepOpts, _elevSupportEval, _walkOpts, simulatePredictedPlayerStep, reconcileLocalPredictionToServer } =
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
      fpDynamicLocomotionBlockers,
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

  const disposeGameTimeDisplaySync = mountGameTimeDisplaySync(conn);

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

  registerFpSleepPoseFlush(flushLocalPickupPoseToServer);

  const fpBalconyGrow = isCombatSim
    ? createInertFpBalconyGrowSession()
    : mountFpBalconyGrowSession({
        scene,
        conn,
        canvas,
        onWaterPourRequested: () => {
          void localAudio.unlock();
          localAudio.playWaterPourLocal();
        },
      });
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
    exitFpSit();
    resetFpLookInertia(lookInertia);
    keys.clear();
    mainRaf.meleePressPending = false;
    mainRaf.primaryAttackHeld = false;
    mainRaf.combatAimHeld = false;
    trackedPointerButtons = 0;
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
      resetFpLookInertia(lookInertia);
      mainRaf.meleePressPending = false;
      mainRaf.primaryAttackHeld = false;
      mainRaf.combatAimHeld = false;
      trackedPointerButtons = 0;
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
    resetFpLookInertia(lookInertia);
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
      resetFpLookInertia(lookInertia);
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
    // Combat sim uses the same corridor/same-floor band gate as live FP — do not bypass (renders entire DB).
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
    droppedWorld.subscribeAoi(cx, cy, cz);
  };

  syncSpatialAoiAfterHydratedSpawn = syncSpatialAoiFromFeet;
  syncAllPoses();
  syncSpatialAoiFromFeet(pos.x, pos.y, pos.z);

  conn.db.player_pose.onInsert(onPoseInsert);
  conn.db.player_pose.onUpdate(onPoseUpdate);

  const onSelfVitalsUpdate = (_ctx: unknown, oldRow: PlayerVitals, row: PlayerVitals) => {
    if (!(conn.identity?.isEqual(row.identity) ?? false)) return;
    const wasAlive = oldRow.health > 0;
    const nowDead = row.health <= 0;
    if (wasAlive && nowDead && spawnSynced) {
      const poseRow = conn.db.player_pose.identity.find(row.identity) as PlayerPose | undefined;
      if (poseRow) applyAuthoritativeFeetSnapFromServerRow(poseRow);
    }
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

  const isLocalPlayerDead = (): boolean => {
    const id = conn.identity;
    if (!id) return false;
    const vitals = conn.db.player_vitals.identity.find(id) as PlayerVitals | undefined;
    return (vitals?.health ?? 1) <= 0;
  };

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
          prevSel === newSlot && hotbarSlotHasHotbarUseAction(conn, conn.identity, newSlot);

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
    if (e.code === "KeyE" && !e.repeat && !isTextInputFocused()) {
      if (isFpNotebookTipsPanelOpen()) {
        e.preventDefault();
        closeFpNotebookTipsPanel();
        return;
      }
      if (getFpActiveStashPanel()) {
        e.preventDefault();
        closeApartmentStashAndInventory();
        return;
      }
      if (mammothInventoryOpen()) {
        e.preventDefault();
        requestMammothInventoryCloseFromFp();
        return;
      }
    }
    if (
      e.code === "KeyE" &&
      !e.repeat &&
      !mammothInventoryOpen() &&
      !mammothCraftingOpen() &&
      !mammothDebugMenuOpen() &&
      !isTextInputFocused() &&
      !isLocalPlayerDead()
    ) {
      e.preventDefault();
      /** Same blend as RAF pickup prompts ({@link resolveAuthoritativeInteractionPose}). */
      const feet = getInteractionPos();
      const feetPick = getDroppedPickupAuthorityFeet();
      if (isCombatSim) {
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
        return;
      }
      if (fpElevators.consumeInteractKey(feet, camera)) return;
      const suppressElevPickup = fpElevators.shouldSuppressEpickup(feet, camera);
      const lookedAtStash = conn.identity
        ? fpApartmentDecorMeshes.getStashPrompt(feet, camera)
        : null;
      const lookedAtWardrobeUnitKey =
        conn.identity && APARTMENT_CLAIM_UI_ENABLED
          ? fpApartmentDecorMeshes.getWardrobeClaimLookAtUnitKey(feet, camera)
          : null;
      const aptKey = conn.identity
        ? getApartmentSystemPrompt(conn, feet, {
            ...(lookedAtStash?.stashKey != null ? { lookedAtStashKey: lookedAtStash.stashKey } : {}),
            lookedAtWardrobeUnitKey,
            ...(lookedAtStash?.stashKey == null
              ? {
                  stashLos: {
                    camera,
                    stashRayOcclusion: fpApartmentDecorMeshes.getStashRayOcclusion(),
                  },
                }
              : {}),
          })
        : null;
      /** Wardrobe/stash HUD must win overlaps with hoistway/corridor elevator volumes (parity with RAF). */
      const interiorBeatElevPickup =
        aptKey !== null && apartmentClaimInteriorsPreferOverUnitDoor(aptKey);
      if (suppressElevPickup && !interiorBeatElevPickup) return;
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

      const growPrompt = fpBalconyGrow.getCachedGrowTrayPrompt();
      if (growPrompt?.kind === "balcony_grow_harvest") {
        runBalconyGrowHarvest(conn, growPrompt);
        if (document.pointerLockElement) void document.exitPointerLock();
        return;
      }

      if (growPrompt?.kind === "balcony_grow_tray" && handleBalconyGrowKeyE(conn, growPrompt)) {
        if (document.pointerLockElement) void document.exitPointerLock();
        return;
      }

      const notebookPrompt = getApartmentNotebookPromptForSession();
      if (tryNotebookInteractFromPrompt(notebookPrompt)) return;

      if (!isFpSitActive()) {
        const sitPrompt = getApartmentSittablePromptForSession();
        if (
          sitPrompt &&
          tryEnterFpSitFromPrompt({
            conn,
            prompt: sitPrompt,
            playerPos: feet,
            pos,
            loco,
            mainRaf,
            sendMoveIntent,
            nowMs: performance.now(),
            crouchToggle: mainRaf.crouchToggle,
          })
        ) {
          return;
        }
      } else if (fpSitSessionIsOnBed()) {
        const sit = getFpSitSession();
        if (sit) {
          openFpSleepConfirm({ unitKey: sit.unitKey });
          return;
        }
      }

      if (
        aptKey?.kind === "apartment_stash" &&
        !(
          aptKey.stashKind === APARTMENT_STASH_KIND_GROW_TRAY &&
          balconyGrowInspectBlocksGrowTrayStash()
        )
      ) {
        setFpActiveStashPanel({
          stashKey: aptKey.stashKey,
          stashLabel: aptKey.stashLabel,
          stashKind: aptKey.stashKind,
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
    if (e.code === "KeyR" && !e.repeat && !isTextInputFocused() && conn.identity) {
      syncActiveHotbarSlotToServer();
      const hbReload = selectedHotbarRow();
      if (hbReload && hotbarDefIdSupportsRangedAttack(hbReload.defId)) {
        const view = getLocalFirearmChamberView(conn, conn.identity, hbReload.defId);
        if (
          !view.isReloading &&
          view.chamberCount < view.capacity &&
          view.reserveCount > 0
        ) {
          void conn.reducers.submitFirearmReload({});
        }
      }
    }
    if (e.code === "Space" && !e.repeat && !isTextInputFocused()) {
      if (tryExitFpSitOnMovement({ keys, mainRaf, pos })) {
        e.preventDefault();
        return;
      }
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
      resetFpLookInertia(lookInertia);
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    if (e.movementX === 0 && e.movementY === 0) return;
    const freeLook = resolveFpFreeLook();
    stepFpLookInertia(lookInertia, mainRaf, e.movementX, e.movementY, 0, { freeLook });
    applyLocalFpRigLook(freeLook);
  };

  const onClick = () => {
    void attachSpatialWorldAudio();
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) requestCanvasPointerLock(canvas);
  };

  /** HUD layers use `pointer-events: none` in gaps; suppress the browser menu on the world view. */
  const onCanvasContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const tryEnterCombatAim = (): void => {
    const hbAim = selectedHotbarRow();
    if (
      !fpInteractInputBlocked() &&
      !isLocalPlayerDead() &&
      hbAim &&
      hotbarDefIdSupportsRangedAttack(hbAim.defId) &&
      conn.identity &&
      !getLocalFirearmChamberView(conn, conn.identity, hbAim.defId).isReloading
    ) {
      mainRaf.combatAimHeld = true;
    }
  };

  const tryCommitPrimaryCombatPress = (
    e: PointerEvent,
    nowMs: number,
    combatPriority: boolean,
  ): void => {
    syncActiveHotbarSlotToServer();
    if (!combatPriority) {
      if (fpElevators.tryRaycastFloorPick(camera, pos, nowMs)) return;
      if (conn.identity && fpApartmentDoors.consumeInteractKey(getInteractionPos(), camera)) return;
      if (fpBalconyGrow.tryPrimaryPointerDown(camera, conn, fpApartmentDecorMeshes, getInteractionPos())) {
        return;
      }
      if (!fpInteractInputBlocked() && !isFpSitActive() && conn.identity) {
        apartmentSittableScreenNdcFromPointer(canvas, e, sitPointerNdc);
        const notebookPrompt = getApartmentNotebookPromptForSession(sitPointerNdc);
        if (tryNotebookInteractFromPrompt(notebookPrompt)) {
          e.preventDefault();
          return;
        }
        const sitPrompt = getApartmentSittablePromptForSession(sitPointerNdc);
        if (
          sitPrompt &&
          tryEnterFpSitFromPrompt({
            conn,
            prompt: sitPrompt,
            playerPos: getInteractionPos(),
            pos,
            loco,
            mainRaf,
            sendMoveIntent,
            nowMs,
            crouchToggle: mainRaf.crouchToggle,
          })
        ) {
          e.preventDefault();
          return;
        }
      }
      const selectedHotbarSlot = getFpHotbarSelectedSlot();
      if (
        conn.identity &&
        selectedHotbarSlot !== null &&
        hotbarSlotHasHotbarUseAction(conn, conn.identity, selectedHotbarSlot)
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
    }
    mainRaf.meleePressPending = true;
    mainRaf.primaryAttackHeld = true;
  };

  /**
   * Pointer Events omit chorded `pointerdown` for the second mouse button — pressing LMB while
   * holding RMB only updates `buttons` on `pointermove`. Track edges from the bitmask instead.
   */
  const applyPointerButtonTransitions = (e: PointerEvent, nowMs: number): void => {
    const prevButtons = trackedPointerButtons;
    const nextButtons = e.buttons;
    const edges = detectPointerButtonEdges(prevButtons, nextButtons);
    trackedPointerButtons = nextButtons;

    if (edges.secondaryPress) {
      if (
        fpBalconyGrow.trySecondaryPointerDown(camera, conn, fpApartmentDecorMeshes, getInteractionPos())
      ) {
        e.preventDefault();
        return;
      }
      if (__mmWallProbeState.enabled) {
        e.preventDefault();
        probeWallHit();
        return;
      }
      tryEnterCombatAim();
      e.preventDefault();
    }

    if (edges.secondaryRelease) {
      mainRaf.combatAimHeld = false;
    }

    if (edges.primaryPress) {
      const combatPriority = (prevButtons & 2) !== 0 || mainRaf.combatAimHeld;
      tryCommitPrimaryCombatPress(e, nowMs, combatPriority);
    }

    if (edges.primaryRelease) {
      mainRaf.primaryAttackHeld = false;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    applyPointerButtonTransitions(e, performance.now());
  };

  const onPointerMoveButtons = (e: PointerEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    applyPointerButtonTransitions(e, performance.now());
  };

  const onPointerUpOrCancel = (e: PointerEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas && e.type !== "pointercancel") return;
    applyPointerButtonTransitions(e, performance.now());
    if (e.type === "pointercancel") {
      mainRaf.primaryAttackHeld = false;
      mainRaf.combatAimHeld = false;
      trackedPointerButtons = 0;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", onWheelHotbar, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("pointermove", onPointerMoveButtons);
  window.addEventListener("pointerup", onPointerUpOrCancel);
  window.addEventListener("pointercancel", onPointerUpOrCancel);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", onCanvasContextMenu);

  const fpInteractInputBlocked = () =>
    mammothInventoryOpen() ||
    mammothCraftingOpen() ||
    mammothDebugMenuOpen() ||
    isTextInputFocused() ||
    isLocalPlayerDead();

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
    _walkOpts,
    simulatePredictedPlayerStep,
    fpCollisionDebug,
    fpElevators,
    fpApartmentDoors,
    fpApartmentDecorMeshes,
    fpBalconyGrowSession: fpBalconyGrow,
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
    cabMirrorCollection,
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
    isInsideResidentialUnit: isInsideResidentialUnitForFrame,
    isInsideApartmentInteriorLightingZone: isInsideApartmentInteriorLightingZoneForFrame,
    isInsideStairwellShaft: isInsideStairwellShaftForFrame,
    getContainingResidentialUnitKey,
    getCorridorPvsVisibleUnitKeys: getCorridorPvsVisibleUnitKeysForFrame,
    getActiveApartmentDecorUnitKey: getActiveApartmentDecorUnitKeyForFrame,
    getContainingResidentialUnitBounds: getContainingResidentialUnitBoundsForFrame,
    isApartmentDecorInteriorVisible: isApartmentDecorInteriorVisibleForFrame,
    selectedHotbarRow,
    logFpPerf,
    tickFpSessionElevDebug,
    fpInteractInputBlocked,
    fpLocomotionInputBlocked,
    isLocalPlayerDead,
    apartmentClaimsAllowed: opts.apartmentClaimsAllowed !== false,
    combatSimMode: isCombatSim,
    fpInteractionFeet: getInteractionPos,
    getApartmentSittablePrompt: getApartmentSittablePromptForSession,
    getApartmentNotebookPrompt: getApartmentNotebookPromptForSession,
    fpDroppedPickupFeet: getDroppedPickupAuthorityFeet,
    syncDroppedItemVisualVisibility: droppedWorld.syncDroppedItemVisualVisibility,
    fpFirearmImpactDecals,
    fpPlayerDamageBloodSquirt,
    fpPlayerDamageScreenShake,
    getFpPerfSceneCounters,
    sampleFpPerfHeavyMeshes,
    scheduleGpuTimestampResolve,
    renderIsolationTargets: {
      buildingRoot,
      scene,
      lobbyInteriorRoot: fpLobbyInteriorAuthoringRoot,
      transparentBuildingMeshes,
      localViewmodelRoot: headPitch,
    },
  });

  let raf = 0;
  let lastFrameMs = performance.now();
  let rafDiagFrames = 0;

  if (loadDbg) fpLoadingDbgMark("mount_fp_session:start_main_raf_loop");

  if (!isCombatSim) {
    const ownedUnit = findOwnedApartmentUnitForIdentity(conn);
    await fpLoadingDbgTimed("fp_gameplay_visuals_ready", () =>
      fpApartmentDecorMeshes.waitForGameplayVisualReady({
        unitKey: ownedUnit?.unitKey ?? null,
        camera,
      }),
    );
    playerRig.position.copy(pos);
    playerRig.rotation.y = mainRaf.bodyYaw;
    playerRig.updateMatrixWorld(true);
    if (loadDbg) fpLoadingDbgMark("mount_fp_session:gpu_entry_warmup_renders");
    for (let warmupFrame = 0; warmupFrame < 2; warmupFrame++) {
      renderBootstrapFrame();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
    if (loadDbg) fpLoadingDbgMark("mount_fp_session:gpu_entry_warmup_renders_done");
  }

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
    if (document.pointerLockElement === canvas && !fpAuthoringActiveRef.active) {
      const freeLook = resolveFpFreeLook();
      stepFpLookInertia(lookInertia, mainRaf, 0, 0, dt, { freeLook });
      if (!freeLook && mainRaf.headLookYaw !== 0) {
        stepFpFreeLookRecenter(mainRaf, dt);
      }
      applyLocalFpRigLook(freeLook);
    }
    if (loadDbg) fpLoadingDbgPushPhase("fp.raf.tick");
    try {
      runFrame(nowMs, dt);
      fpNpcSession?.update(dt, nowMs);
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
    setFpCombatSimMode(false);
    sessionDisposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheelHotbar);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("pointermove", onPointerMoveButtons);
    window.removeEventListener("pointerup", onPointerUpOrCancel);
    window.removeEventListener("pointercancel", onPointerUpOrCancel);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("contextmenu", onCanvasContextMenu);
    clearFpPickupPrompts();
    closeFpNotebookTipsPanel();
    exitFpSit();
    registerFpSleepPoseFlush(null);
    fpElevators.dispose();
    fpApartmentDecorMeshes.dispose();
    fpBalconyGrow.dispose();
    fpApartmentDoors.dispose();
    floor19CorridorCeilingLights?.dispose();
    unsubscribeStairwellCeilingPropReady();
    if (stairwellCeilingVisualSyncRaf !== 0) {
      cancelAnimationFrame(stairwellCeilingVisualSyncRaf);
      stairwellCeilingVisualSyncRaf = 0;
    }
    stairwellCeilingPracticalLights?.dispose();
    stairwellCeilingPracticalLights = null;
    unregisterFpDebugMenuSessionSnapshot();
    setFpActiveStashPanel(null);
    disposeFpSessionDevDebug();
    disposeGameTimeDisplaySync();
    droppedWorld.dispose();
    conn.db.player_pose.removeOnInsert(onPoseInsert);
    conn.db.player_pose.removeOnUpdate(onPoseUpdate);
    conn.db.player_vitals.removeOnUpdate(onSelfVitalsUpdate);
    fpEnvironment.dispose();
    decalManager?.dispose();
    disposeStaticWorldObjectTree(buildingRoot);
    disposeStaticWorldObjectTree(cellRoot);
    if (!isCombatSim) {
      forgetMegablockStaticWorldMeshCache();
    }
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
    fpNpcSession?.dispose();
    fpPlayerDamageBloodSquirt.dispose();
    fpPlayerDamageScreenShake.dispose();
    fpFirearmImpactDecals.dispose();
    hotbarConsumableVisual.dispose();
    cabMirrorCollection.dispose();
    presentation.dispose();
    renderer.dispose();
    scene.clear();
    resetFpSessionFpsDisplay();
    resetFpSessionCompassHeading();
    resetFpSessionCombatAiming();
    camera.fov = FP_COMBAT_HIP_FOV_DEG;
    camera.updateProjectionMatrix();
    resetFpSessionGameUiHidden();
    resetFpDebugRenderIsolationFlags();
  resetFpDebugEmissiveIsolationState();
  resetFpDebugGameplayFeedbackFlags();
    resetFpPerfStore();
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
    delete canvas.dataset.mammothFpCanvas;
  };
}
