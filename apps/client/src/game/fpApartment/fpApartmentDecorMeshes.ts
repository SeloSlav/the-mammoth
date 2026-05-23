/**
 * Apartment decor placements from two sources:
 * - authoritative replica rows (`add_apartment_unit_decor`)
 * - local content authoring fallback (`content/apartment/owned_apartment_builtins.json`)
 *
 * Replica rows render first; authored `placedItems` from disk are merged in when they are not already
 * covered by a nearby DB row (so JSON-only props like a water tank still appear after claim).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import {
  applyApartmentInteriorFloorReceiveShadowUnder,
  apartmentDecorEmitterKindFromModelPath,
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  syncApartmentDecorShadowRig,
  syncApartmentDecorBakedFloorShadowOverlay,
  syncApartmentInteriorPracticalLighting,
  type ApartmentDecorBakedFloorShadowMount,
  type ApartmentDecorShadowRigMount,
  type ApartmentPracticalLightsMount,
  type ApartmentUnitWorldBounds,
} from "@the-mammoth/engine";
import type { DbConnection } from "../../module_bindings";
import {
  FP_APARTMENT_INTERACT_PICK_MAX_RAY_M,
  FP_INTERACTION_PICK_LAYER,
} from "../fpSession/fpSessionConstants.js";
import type { ApartmentUnit } from "../../module_bindings/types";
import {
  apartmentUnitOwnerEqual,
  clientMayUseApartmentStash,
  type ApartmentStashPrompt,
} from "./fpApartmentGameplay.js";
import { getApartmentSittablePrompt } from "./fpApartmentSittablePrompt.js";
import type { ApartmentSittablePrompt } from "./fpApartmentSittableTypes.js";
import { getApartmentNotebookPrompt } from "./fpApartmentNotebookPrompt.js";
import type { ApartmentNotebookPrompt } from "./fpApartmentNotebookTypes.js";
import type { FpCabMirrorCollection } from "../fpRendering/fpCabMirrorCollection.js";
import { isFpDebugRenderIsolationEnabled, subscribeFpDebugRenderIsolation } from "../fpDebugRenderIsolation.js";
import { yieldToMain } from "../fpSession/yieldToMain.js";
import {
  apartmentStashLabel,
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_WATER_TANK,
  APARTMENT_STASH_KIND_FISH_TANK,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
} from "./fpApartmentStashKey.js";
import {
  createFpApartmentStashRayOcclusion,
  maxRaycastHitDistance,
  type FpApartmentStashRayOcclusion,
} from "./fpApartmentStashRayOcclusion.js";
import { type BalconyGrowTrayPrompt } from "../fpBalconyGrow/fpBalconyGrowPrompt.js";
import { createFpBalconyGrowDecorBridge } from "../fpBalconyGrow/fpBalconyGrowDecorBridge.js";
import { createFpApartmentFishTankDecorBridge } from "./fpApartmentFishTankDecorBridge.js";
import { sortBalconyGrowRaycastHits } from "../fpBalconyGrow/fpBalconyGrowTrayAnchor.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import type { Identity } from "spacetimedb";
import type { BalconyGrowPlant, BalconyGrowTray } from "../../module_bindings/types";
import {
  apartmentPropBoundsForwardDot,
  applyApartmentInteriorPropVisibility,
  clearApartmentInteriorPropVisibilityState,
  createApartmentInteriorPropVisibilityState,
  resolveApartmentInteriorPropGroupVisible,
  resolveApartmentInteriorPropWarmUpVisible,
  syncApartmentInteriorPropVisibilityUnit,
  type ApartmentInteriorPropVisibilityApplyItem,
} from "./fpApartmentInteriorPropVisibility.js";
import { runFpApartmentDecorFullRebuild } from "./fpApartmentDecorRebuild.js";

type FixtureEmissiveBackup = {
  emissive: THREE.Color;
  emissiveIntensity: number;
};

function applyDecorFixtureEmissiveDebugIsolation(
  groups: Iterable<THREE.Object3D>,
  fixtureLightingEnabled: boolean,
): void {
  for (const group of groups) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath !== "string") continue;
    if (apartmentDecorEmitterKindFromModelPath(modelRelPath) === null) continue;

    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const material = obj.material;
      const mats = Array.isArray(material) ? material : [material];
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        if (!fixtureLightingEnabled) {
          const backup = mat.userData.mammothFixtureEmissiveBackup as
            | FixtureEmissiveBackup
            | undefined;
          if (!backup) {
            mat.userData.mammothFixtureEmissiveBackup = {
              emissive: mat.emissive.clone(),
              emissiveIntensity: mat.emissiveIntensity,
            };
          }
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        } else {
          const backup = mat.userData.mammothFixtureEmissiveBackup as
            | FixtureEmissiveBackup
            | undefined;
          if (backup) {
            mat.emissive.copy(backup.emissive);
            mat.emissiveIntensity = backup.emissiveIntensity;
          }
        }
        mat.needsUpdate = true;
      }
    });
  }
}

const _stashRaycaster = new THREE.Raycaster();
const _screenCenterNdc = new THREE.Vector2(0, 0);

export type MountFpApartmentDecorMeshesResult = {
  dispose: () => void;
  syncVisibility: (
    camera: THREE.PerspectiveCamera,
    allowDemand?: boolean,
    containingUnitKey?: string | null,
  ) => void;
  getDecorObject: (decorId: bigint) => THREE.Object3D | undefined;
  getStashPrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => ApartmentStashPrompt | null;
  getWardrobeClaimLookAtUnitKey: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => string | null;
  getSittablePickMeshes: () => readonly THREE.Mesh[];
  getSittablePrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean,
    visiblePickScratch: THREE.Mesh[],
    screenNdc?: THREE.Vector2,
  ) => ApartmentSittablePrompt | null;
  getNotebookPrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean,
    visiblePickScratch: THREE.Mesh[],
    screenNdc?: THREE.Vector2,
  ) => ApartmentNotebookPrompt | null;
  getSittableDecorRoots: () => readonly THREE.Object3D[];
  getGrowTrayPickMeshes: () => readonly THREE.Mesh[];
  getGrowSlotPickMeshes: () => readonly THREE.Mesh[];
  /** Center-screen raycast against owned grow-tray pick volumes near the player. */
  raycastBalconyGrowTrayHits: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    preCollectedVisiblePicks?: readonly THREE.Mesh[],
  ) => readonly THREE.Intersection[];
  getBalconyGrowTrayPrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    conn: DbConnection,
    identity: Identity,
    growState: BalconyGrowOpUnitState,
    hits: readonly THREE.Intersection[],
  ) => BalconyGrowTrayPrompt | null;
  syncBalconyGrowSlotVisuals: (
    plants: readonly BalconyGrowPlant[],
    trays: readonly BalconyGrowTray[],
    traysWithSubstrate: ReadonlySet<string>,
  ) => void;
  syncBalconyGrowTrayDecorVisibility: (
    feet: THREE.Vector3,
    unitKey: string | null,
  ) => void;
  collectBalconyGrowPickMeshesForPlayer: (
    playerPos: THREE.Vector3,
    dst: THREE.Mesh[],
  ) => void;
  rebuildStashRayOcclusion: () => void;
  getStashRayOcclusion: () => FpApartmentStashRayOcclusion;
  updateFishTankFish: (dt: number) => void;
};

export function mountFpApartmentDecorMeshes(opts: {
  scene: THREE.Scene;
  conn: DbConnection;
  buildingRoot: THREE.Group;
  renderer: THREE.WebGPURenderer;
  cabMirrorCollection?: FpCabMirrorCollection;
  onRebuilt?: () => void;
  onRequestShadowMapUpdate?: () => void;
}): MountFpApartmentDecorMeshesResult {
  const root = new THREE.Group();
  root.name = "apartment_unit_decor_root";
  opts.buildingRoot.add(root);

  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();
  const templateByUrl = new Map<string, THREE.Object3D>();
  const groupByRenderKey = new Map<string, THREE.Group>();
  const groupByDecorId = new Map<bigint, THREE.Group>();
  const stashPickMeshes: THREE.Mesh[] = [];
  const wardrobePickMeshes: THREE.Mesh[] = [];
  const sittablePickMeshes: THREE.Mesh[] = [];
  const notebookPickMeshes: THREE.Mesh[] = [];
  const stashRayOcclusion: FpApartmentStashRayOcclusion = createFpApartmentStashRayOcclusion();
  const visibleStashPickMeshes: THREE.Mesh[] = [];
  const visibleWardrobePickMeshes: THREE.Mesh[] = [];
  const stashPickGeometry = new THREE.BoxGeometry(1, 1, 1);
  const stashPickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  stashPickMaterial.colorWrite = false;
  const fishTankBridge = createFpApartmentFishTankDecorBridge();

  const growBridge = createFpBalconyGrowDecorBridge({
    conn: opts.conn,
    stashRayOcclusion,
    pickGeometry: stashPickGeometry,
    pickMaterial: stashPickMaterial,
    raycaster: _stashRaycaster,
    screenCenterNdc: _screenCenterNdc,
  });

  let disposed = false;
  let buildEpoch = 0;
  let buildRaf = 0;
  let practicalLightsMount: ApartmentPracticalLightsMount | null = null;
  let decorShadowRig: ApartmentDecorShadowRigMount | null = null;
  let bakedFloorShadowMount: ApartmentDecorBakedFloorShadowMount | null = null;
  let practicalLightsUnitKey: string | null = null;
  let practicalLightsContextUnitKey: string | null = null;
  let practicalLightsMasterEnabled: boolean | null = null;
  let practicalLightsDecorEnabled: boolean | null = null;

  const metallicReadableEnv = (): THREE.Texture | null => {
    const env = opts.scene.userData.mammothFpMetallicReadableEnv;
    return env instanceof THREE.Texture ? env : (opts.scene.environment ?? null);
  };

  const objectVisibleInHierarchy = (obj: THREE.Object3D): boolean => {
    for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
      if (!cur.visible) return false;
    }
    return true;
  };

  const collectVisiblePickMeshes = (src: readonly THREE.Mesh[], dst: THREE.Mesh[]): void => {
    dst.length = 0;
    for (let i = 0; i < src.length; i++) {
      const mesh = src[i]!;
      if (objectVisibleInHierarchy(mesh)) dst.push(mesh);
    }
  };

  const rebuildStashRayOcclusion = (): void => {
    stashRayOcclusion.rebuildFromBuildingRoot(opts.buildingRoot);
  };

  const configureInteractionPickRaycaster = (): void => {
    _stashRaycaster.layers.disableAll();
    _stashRaycaster.layers.enable(FP_INTERACTION_PICK_LAYER);
  };

  const collectVisibleStashPickMeshes = (
    playerPos: THREE.Vector3,
    dst: THREE.Mesh[],
  ): void => {
    dst.length = 0;
    for (let i = 0; i < stashPickMeshes.length; i++) {
      const mesh = stashPickMeshes[i]!;
      if (objectVisibleInHierarchy(mesh)) dst.push(mesh);
    }
  };

  const raycastBalconyGrowTrayHits = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    preCollectedVisiblePicks?: readonly THREE.Mesh[],
  ): THREE.Intersection[] =>
    growBridge.raycastHits(playerPos, camera, opts.conn.identity, preCollectedVisiblePicks);

  const disposeGroupDeep = (g: THREE.Group) => {
    g.traverse((ch) => {
      if (!(ch instanceof THREE.Mesh)) return;
      if (ch.geometry === stashPickGeometry) return;
      if (ch.material === stashPickMaterial) return;
      if (ch.geometry) ch.geometry.dispose();
      const mat = ch.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else if (mat) {
        mat.dispose();
      }
    });
    g.clear();
    root.remove(g);
  };

  applyApartmentInteriorFloorReceiveShadowUnder(opts.buildingRoot);

  const clearPracticalLightsOnly = (): void => {
    practicalLightsMount?.dispose();
    practicalLightsMount = null;
    practicalLightsUnitKey = null;
    decorShadowRig?.dispose();
    decorShadowRig = null;
  };

  const clearBakedFloorShadowOnly = (): void => {
    bakedFloorShadowMount?.dispose();
    bakedFloorShadowMount = null;
  };

  const clearInteriorLighting = (): void => {
    clearPracticalLightsOnly();
    clearBakedFloorShadowOnly();
  };

  const unitBoundsForKey = (unitKey: string): ApartmentUnitWorldBounds | null => {
    for (const row of opts.conn.db.apartment_unit) {
      const u = row as ApartmentUnit;
      if (u.unitKey !== unitKey) continue;
      return {
        minX: u.boundMinX as number,
        maxX: u.boundMaxX as number,
        minY: u.boundMinY as number,
        maxY: u.boundMaxY as number,
        minZ: u.boundMinZ as number,
        maxZ: u.boundMaxZ as number,
      };
    }
    return null;
  };

  const decorGroupsForUnit = (unitKey: string | null): THREE.Object3D[] => {
    if (!unitKey) return [];
    const out: THREE.Object3D[] = [];
    for (const g of groupByRenderKey.values()) {
      if (g.userData.mammothApartmentUnitKey === unitKey) out.push(g);
    }
    return out;
  };

  const resyncDecorShadowsForUnit = (containingUnitKey: string | null): void => {
    const decorGroups = decorGroupsForUnit(containingUnitKey);
    decorShadowRig = syncApartmentDecorShadowRig({
      lightParent: opts.buildingRoot,
      decorGroups,
      unitBounds: containingUnitKey
        ? (unitBoundsForKey(containingUnitKey) ?? undefined)
        : undefined,
      previous: decorShadowRig,
    });

    const decorVisible = isFpDebugRenderIsolationEnabled("apartmentDecor");
    const floorShadowsVisible = isFpDebugRenderIsolationEnabled("apartmentDecorFloorShadows");
    if (!decorVisible || !floorShadowsVisible || !containingUnitKey) {
      clearBakedFloorShadowOnly();
    } else {
      const bounds = unitBoundsForKey(containingUnitKey);
      try {
        bakedFloorShadowMount = syncApartmentDecorBakedFloorShadowOverlay({
          renderer: opts.renderer,
          parent: opts.buildingRoot,
          decorGroups,
          unitBounds: bounds ?? undefined,
          unitKey: containingUnitKey,
          floorWorldY:
            bounds !== null
              ? bounds.minY + APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.bakedFloorOffsetM
              : undefined,
          previous: bakedFloorShadowMount,
        });
      } catch (err: unknown) {
        clearBakedFloorShadowOnly();
        console.warn("[fp] apartment baked floor shadow failed:", err);
      }
    }

    if (decorShadowRig) {
      opts.onRequestShadowMapUpdate?.();
    }
  };

  const syncPracticalLightsForUnit = (
    containingUnitKey: string | null,
    force = false,
  ): void => {
    const masterEnabled = isFpDebugRenderIsolationEnabled("apartmentPracticalLights");
    const decorFixtureLightsEnabled = isFpDebugRenderIsolationEnabled(
      "apartmentDecorPracticalLights",
    );

    applyDecorFixtureEmissiveDebugIsolation(groupByRenderKey.values(), decorFixtureLightsEnabled);

    if (!masterEnabled || !containingUnitKey) {
      if (practicalLightsMount !== null || practicalLightsUnitKey !== null) {
        clearPracticalLightsOnly();
      }
      practicalLightsUnitKey = containingUnitKey;
      practicalLightsMasterEnabled = masterEnabled;
      practicalLightsDecorEnabled = decorFixtureLightsEnabled;
      resyncDecorShadowsForUnit(containingUnitKey);
      return;
    }

    if (
      !force &&
      containingUnitKey === practicalLightsUnitKey &&
      masterEnabled === practicalLightsMasterEnabled &&
      decorFixtureLightsEnabled === practicalLightsDecorEnabled
    ) {
      return;
    }

    practicalLightsUnitKey = containingUnitKey;
    practicalLightsMasterEnabled = masterEnabled;
    practicalLightsDecorEnabled = decorFixtureLightsEnabled;

    const bounds = unitBoundsForKey(containingUnitKey);
    practicalLightsMount = syncApartmentInteriorPracticalLighting({
      lightParent: root,
      windowScanRoot: opts.buildingRoot,
      maxWindowLights: APARTMENT_INTERIOR_VISUAL_PROFILE.maxWindowPracticalLightsPerUnit,
      unitBounds: bounds ?? undefined,
      decorGroups: decorFixtureLightsEnabled
        ? decorGroupsForUnit(containingUnitKey)
        : [],
      previous: practicalLightsMount,
    });
    resyncDecorShadowsForUnit(containingUnitKey);
  };

  const _furnitureVisibilityViewProjection = new THREE.Matrix4();
  const _furnitureVisibilityFrustum = new THREE.Frustum();
  const _furnitureVisibilityCamPos = new THREE.Vector3();
  const _furnitureVisibilityCamDir = new THREE.Vector3();
  const propVisibilityState = createApartmentInteriorPropVisibilityState();

  const clearAll = () => {
    fishTankBridge.clear();
    stashPickMeshes.length = 0;
    wardrobePickMeshes.length = 0;
    sittablePickMeshes.length = 0;
    notebookPickMeshes.length = 0;
    growBridge.clear();
    for (const g of groupByRenderKey.values()) disposeGroupDeep(g);
    groupByRenderKey.clear();
    groupByDecorId.clear();
    clearApartmentInteriorPropVisibilityState(propVisibilityState);
  };

  const runFullRebuild = async (epoch: number): Promise<void> => {
    await runFpApartmentDecorFullRebuild(
      {
        conn: opts.conn,
        buildingRoot: opts.buildingRoot,
        root,
        gltfLoader,
        objLoader,
        isBuildStale: (e) => disposed || e !== buildEpoch,
        templateByUrl,
        groupByRenderKey,
        groupByDecorId,
        clearAll,
        fishTankBridge,
        growBridge,
        stashPickMeshes,
        wardrobePickMeshes,
        sittablePickMeshes,
        notebookPickMeshes,
        stashPickGeometry,
        stashPickMaterial,
        metallicReadableEnv,
        rebuildStashRayOcclusion,
        syncPracticalLightsForUnit,
        getPracticalLightsContextUnitKey: () => practicalLightsContextUnitKey,
        cabMirrorCollection: opts.cabMirrorCollection,
        onRebuilt: opts.onRebuilt,
        yieldToMain,
      },
      epoch,
    );
  };

  const scheduleRebuild = () => {
    if (disposed) return;
    if (buildRaf !== 0) return;
    buildEpoch++;
    const epoch = buildEpoch;
    buildRaf = requestAnimationFrame(() => {
      buildRaf = 0;
      void runFullRebuild(epoch).catch((err) => {
        console.warn("[mountFpApartmentDecorMeshes] rebuild failed", err);
      });
    });
  };

  const onDecorBump = (): void => {
    scheduleRebuild();
  };

  const onUnitUpdateForDecor = (_ctx: unknown, oldUnit: ApartmentUnit, newUnit: ApartmentUnit): void => {
    if (
      oldUnit.unitKey !== newUnit.unitKey ||
      oldUnit.state !== newUnit.state ||
      !apartmentUnitOwnerEqual(oldUnit.owner, newUnit.owner)
    )
      scheduleRebuild();
  };

  opts.conn.db.apartment_unit_decor.onInsert(onDecorBump);
  opts.conn.db.apartment_unit_decor.onDelete(onDecorBump);
  opts.conn.db.apartment_unit_decor.onUpdate(onDecorBump);
  opts.conn.db.apartment_unit.onUpdate(onUnitUpdateForDecor);

  scheduleRebuild();
  rebuildStashRayOcclusion();

  const unsubRenderIsolation = subscribeFpDebugRenderIsolation(() => {
    if (disposed) return;
    resyncDecorShadowsForUnit(practicalLightsContextUnitKey);
    opts.onRebuilt?.();
  });

  return {
    getDecorObject: (decorId) => groupByDecorId.get(decorId),
    syncVisibility: (camera, allowDemand = true, containingUnitKey = null) => {
      if (!isFpDebugRenderIsolationEnabled("apartmentDecor")) {
        if (root.visible) root.visible = false;
        clearInteriorLighting();
        clearApartmentInteriorPropVisibilityState(propVisibilityState);
        return;
      }
      if (!root.visible) root.visible = true;
      syncApartmentInteriorPropVisibilityUnit(propVisibilityState, containingUnitKey);
      camera.updateMatrixWorld();
      camera.getWorldPosition(_furnitureVisibilityCamPos);
      camera.getWorldDirection(_furnitureVisibilityCamDir);
      _furnitureVisibilityViewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      _furnitureVisibilityFrustum.setFromProjectionMatrix(_furnitureVisibilityViewProjection);
      const useInUnitVisibility = containingUnitKey !== null;
      const budgetItems: ApartmentInteriorPropVisibilityApplyItem[] = [];
      for (const [renderKey, g] of groupByRenderKey.entries()) {
        const bb = g.userData.mammothApartmentDecorWorldBounds;
        const bounds = bb instanceof THREE.Box3 ? bb : undefined;
        const skipInteriorForwardCone =
          g.userData.mammothApartmentWallAuthoring === true ||
          g.userData.mammothApartmentMirrorAuthoring === true;
        const groupUnitKey =
          typeof g.userData.mammothApartmentUnitKey === "string"
            ? g.userData.mammothApartmentUnitKey
            : undefined;
        const needsWarmUp =
          useInUnitVisibility &&
          !skipInteriorForwardCone &&
          !propVisibilityState.warmedKeys.has(renderKey);
        const desiredVisible = needsWarmUp
          ? resolveApartmentInteriorPropWarmUpVisible({
              allowDemand,
              containingUnitKey,
              groupUnitKey,
            })
          : resolveApartmentInteriorPropGroupVisible({
              allowDemand,
              containingUnitKey,
              groupUnitKey,
              propWorldBounds: bounds,
              viewFrustum: _furnitureVisibilityFrustum,
              cameraWorldPos: _furnitureVisibilityCamPos,
              cameraWorldDir: _furnitureVisibilityCamDir,
              skipInteriorForwardCone,
            });
        if (skipInteriorForwardCone) {
          g.visible = desiredVisible;
          continue;
        }
        if (useInUnitVisibility) {
          budgetItems.push({
            key: renderKey,
            object: g,
            desiredVisible,
            forwardDot:
              bounds !== undefined
                ? apartmentPropBoundsForwardDot(
                    bounds,
                    _furnitureVisibilityCamPos,
                    _furnitureVisibilityCamDir,
                  )
                : 1,
          });
        } else {
          g.visible = desiredVisible;
        }
      }
      if (useInUnitVisibility) {
        applyApartmentInteriorPropVisibility(budgetItems, propVisibilityState);
      } else {
        clearApartmentInteriorPropVisibilityState(propVisibilityState);
      }
      practicalLightsContextUnitKey = containingUnitKey;
      syncPracticalLightsForUnit(containingUnitKey);
    },
    getStashPrompt: (playerPos, camera) => {
      if (!opts.conn.identity || stashPickMeshes.length === 0) return null;
      configureInteractionPickRaycaster();
      _stashRaycaster.setFromCamera(_screenCenterNdc, camera);
      _stashRaycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
      collectVisibleStashPickMeshes(playerPos, visibleStashPickMeshes);
      const hits = sortBalconyGrowRaycastHits(
        _stashRaycaster.intersectObjects(visibleStashPickMeshes, false),
      );
      const nearestWallDistance =
        hits.length > 0
          ? stashRayOcclusion.nearestOccluderDistanceAlongViewRay(
              camera,
              maxRaycastHitDistance(hits),
            )
          : null;
      const seen = new Set<string>();
      for (const hit of hits) {
        if (stashRayOcclusion.hitOccluded(hit, nearestWallDistance)) continue;
        const stashKey = hit.object.userData.mammothApartmentStashKey;
        const unitKey = hit.object.userData.mammothApartmentStashPickUnitKey;
        const stashKind = hit.object.userData.mammothApartmentStashKind;
        if (typeof stashKey !== "string" || typeof unitKey !== "string" || seen.has(stashKey)) continue;
        if (
          stashKind !== APARTMENT_STASH_KIND_FOOTLOCKER &&
          stashKind !== APARTMENT_STASH_KIND_WARDROBE &&
          stashKind !== APARTMENT_STASH_KIND_STOVE &&
          stashKind !== APARTMENT_STASH_KIND_FRIDGE &&
          stashKind !== APARTMENT_STASH_KIND_WATER_TANK &&
          stashKind !== APARTMENT_STASH_KIND_FISH_TANK
        ) {
          continue;
        }
        seen.add(stashKey);
        if (!clientMayUseApartmentStash(opts.conn, opts.conn.identity, stashKey, playerPos)) {
          continue;
        }
        return {
          kind: "apartment_stash",
          stashKey,
          unitKey,
          stashKind,
          stashLabel: apartmentStashLabel(stashKind),
        };
      }
      return null;
    },
    getWardrobeClaimLookAtUnitKey: (_playerPos, camera) => {
      if (wardrobePickMeshes.length === 0) return null;
      _stashRaycaster.layers.set(FP_INTERACTION_PICK_LAYER);
      _stashRaycaster.setFromCamera(_screenCenterNdc, camera);
      _stashRaycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
      collectVisiblePickMeshes(wardrobePickMeshes, visibleWardrobePickMeshes);
      const hits = _stashRaycaster.intersectObjects(visibleWardrobePickMeshes, false);
      for (const hit of hits) {
        const unitKey = hit.object.userData.mammothApartmentWardrobePickUnitKey;
        if (typeof unitKey === "string" && unitKey.length > 0) return unitKey;
      }
      return null;
    },
    getSittablePickMeshes: () => sittablePickMeshes,
    getGrowTrayPickMeshes: () => growBridge.getGrowTrayPickMeshes(),
    getGrowSlotPickMeshes: () => growBridge.getGrowSlotPickMeshes(),
    raycastBalconyGrowTrayHits: (playerPos, camera, preCollectedVisiblePicks) =>
      raycastBalconyGrowTrayHits(playerPos, camera, preCollectedVisiblePicks),
    getBalconyGrowTrayPrompt: (playerPos, camera, conn, identity, growState, hits) =>
      growBridge.resolvePrompt(playerPos, camera, conn, identity, growState, hits),
    rebuildStashRayOcclusion,
    getStashRayOcclusion: () => stashRayOcclusion,
    syncBalconyGrowSlotVisuals: (plants, trays, traysWithSubstrate) => {
      growBridge.syncSlotVisuals(plants, trays, traysWithSubstrate);
    },
    syncBalconyGrowTrayDecorVisibility: (feet, unitKey) => {
      growBridge.syncVisibility(feet, unitKey);
    },
    collectBalconyGrowPickMeshesForPlayer: (playerPos, dst) => {
      growBridge.collectPickMeshesForPlayer(playerPos, opts.conn.identity, dst);
    },
    updateFishTankFish: (dt) => {
      fishTankBridge.tick(dt);
    },
    getSittableDecorRoots: () => Array.from(groupByRenderKey.values()),
    getSittablePrompt: (
      playerPos,
      camera,
      objectVisibleInHierarchy,
      visiblePickScratch,
      screenNdc,
    ) => {
      if (!opts.conn.identity) return null;
      return getApartmentSittablePrompt({
        conn: opts.conn,
        playerPos,
        camera,
        decorPickMeshes: sittablePickMeshes,
        decorRoots: Array.from(groupByRenderKey.values()),
        visibleScratch: visiblePickScratch,
        objectVisibleInHierarchy,
        screenNdc,
      });
    },
    getNotebookPrompt: (
      playerPos,
      camera,
      objectVisibleInHierarchy,
      visiblePickScratch,
      screenNdc,
    ) => {
      if (!opts.conn.identity) return null;
      return getApartmentNotebookPrompt({
        conn: opts.conn,
        playerPos,
        camera,
        notebookPickMeshes,
        decorRoots: Array.from(groupByRenderKey.values()),
        visibleScratch: visiblePickScratch,
        objectVisibleInHierarchy,
        screenNdc,
      });
    },
    dispose: () => {
      disposed = true;
      buildEpoch++;
      if (buildRaf !== 0) {
        cancelAnimationFrame(buildRaf);
        buildRaf = 0;
      }
      opts.conn.db.apartment_unit_decor.removeOnInsert(onDecorBump);
      opts.conn.db.apartment_unit_decor.removeOnDelete(onDecorBump);
      opts.conn.db.apartment_unit_decor.removeOnUpdate(onDecorBump);
      opts.conn.db.apartment_unit.removeOnUpdate(onUnitUpdateForDecor);
      clearAll();
      stashPickGeometry.dispose();
      stashPickMaterial.dispose();
      clearInteriorLighting();
      unsubRenderIsolation();
      opts.buildingRoot.remove(root);
    },
  };
}
