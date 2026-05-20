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
  applyOwnedApartmentWallSurfaceMaterial,
  applyOwnedApartmentWallSurfaceMaterialToVisuals,
  buildOwnedApartmentPartitionWallInGroup,
  clampOwnedApartmentWallOpeningsForLength,
  buildApartmentPlanarMirrorVisual,
  MAMMOTH_FP_INTERIOR_PARTITION_SOLID,
} from "@the-mammoth/world";
import {
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
  type OwnedApartmentPlacedItemKind,
  type OwnedApartmentWallMaterial,
  type OwnedApartmentWallOpening,
  effectiveOwnedApartmentPlacedKind,
  ownedApartmentDecorRootScaleXYZ,
  ownedApartmentPlacedItemKindHasStash,
  ownedApartmentPlacedItemAuthoringAssetVisScale,
  apartmentSittableSpecForPlacedItem,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import { mergeGroupDescendantsByMaterialYielding } from "../fpSession/fpMergeGroupDescendantsByMaterial.js";
import {
  FP_APARTMENT_INTERACT_PICK_MAX_RAY_M,
  FP_INTERACTION_PICK_LAYER,
} from "../fpSession/fpSessionConstants.js";
import {
  tagApartmentDecorPropMeshesForMirrorExclusion,
  tagResidentialUnitInteriorMeshesUnder,
} from "./fpResidentialUnitInteriorLayer.js";
import type { ApartmentUnit, ApartmentUnitDecor } from "../../module_bindings/types";
import {
  apartmentUnitOwnerEqual,
  clientMayUseApartmentStash,
  residentInteriorPropsVisibleForViewer,
  type ApartmentStashPrompt,
} from "./fpApartmentGameplay.js";
import {
  apartmentDecorFetchPath,
  apartmentDecorModelExtension,
  normalizeApartmentDecorModelRelPath,
} from "./fpApartmentDecorAssets.js";
import { fitApartmentInteractionPickToObject } from "./fpApartmentInteractionPick.js";
import { getApartmentSittablePrompt } from "./fpApartmentSittablePrompt.js";
import type { ApartmentSittablePrompt } from "./fpApartmentSittableTypes.js";
import {
  loadOwnedApartmentBuiltinsDocFromContent,
  resolveApartmentDecorPoses,
  resolveApartmentMirrorPoses,
  resolveApartmentWallPoses,
} from "./fpOwnedApartmentBuiltinsFromContent.js";
import type { FpCabMirrorCollection } from "../fpRendering/fpCabMirrorCollection.js";
import { yieldToMain } from "../fpSession/yieldToMain.js";
import { isFpDebugRenderIsolationEnabled } from "../fpDebugRenderIsolation.js";
import {
  apartmentDecorEmitterKindFromModelPath,
  bindMammothApartmentPropReadableEnv,
  moodGradeMammothApartmentDecorMesh,
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  resolveStaticModelFetchUrl,
  syncApartmentInteriorPracticalLighting,
  type ApartmentPracticalLightsMount,
  type ApartmentUnitWorldBounds,
} from "@the-mammoth/engine";
import {
  apartmentStashKey,
  apartmentStashKeyDecor,
  apartmentStashLabel,
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_WATER_TANK,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
  type ApartmentStashKind,
} from "./fpApartmentStashKey.js";
import { apartmentStashKindForPlacedKind } from "./fpApartmentStashResolve.js";

import {
  APARTMENT_PROP_FRUSTUM_MARGIN_M,
  apartmentPropBoundsForwardDot,
  applyApartmentInteriorPropVisibilityBudget,
  clearApartmentInteriorPropVisibilityBudgetState,
  createApartmentInteriorPropVisibilityBudgetState,
  resolveApartmentInteriorPropGroupVisible,
  tagApartmentDecorGroupVisibilityMetadata,
  type ApartmentInteriorPropVisibilityApplyItem,
} from "./fpApartmentInteriorPropVisibility.js";

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
/**
 * Content-authored decor/walls should preserve editor placement exactly, including flush placement
 * against windowed exterior faces. Keep the strict hull as a hard stop, but do not reserve extra
 * inset inside it.
 */
const AUTHORING_DECOR_BOUNDARY_SLACK_M = 0;
const _stashRaycaster = new THREE.Raycaster();
const _screenCenterNdc = new THREE.Vector2(0, 0);
const _decorCenterBoundsScratch = new THREE.Box3();
const _decorCenterWorldScratch = new THREE.Vector3();
const _decorCenterLocalScratch = new THREE.Vector3();

type VisibleDecorPlacement = {
  renderKey: string;
  decorId: bigint | null;
  unit: ApartmentUnit;
  modelRelPath: string;
  placedKind: OwnedApartmentPlacedItemKind;
  posX: number;
  posY: number;
  posZ: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  uniformScale: number;
  verticalScaleMul: number;
  source: "db" | "content";
};

function centerVisualBoundsOnRoot(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  _decorCenterBoundsScratch.setFromObject(root);
  if (_decorCenterBoundsScratch.isEmpty()) return;
  _decorCenterBoundsScratch.getCenter(_decorCenterWorldScratch);
  _decorCenterLocalScratch.copy(_decorCenterWorldScratch);
  root.worldToLocal(_decorCenterLocalScratch);
  for (const child of root.children) {
    child.position.sub(_decorCenterLocalScratch);
  }
  root.updateMatrixWorld(true);
}

/** Skip merging a content placement when a DB row already sits on the same prop (XZ). */
const CONTENT_DB_DECOR_DEDUPE_XZ_M = 0.4;

function contentDecorCoveredByDbRow(
  content: { modelRelPath: string; x: number; z: number },
  dbRows: ApartmentUnitDecor[],
): boolean {
  for (const row of dbRows) {
    if (row.modelRelPath !== content.modelRelPath) continue;
    const dx = row.posX - content.x;
    const dz = row.posZ - content.z;
    if (dx * dx + dz * dz <= CONTENT_DB_DECOR_DEDUPE_XZ_M * CONTENT_DB_DECOR_DEDUPE_XZ_M) {
      return true;
    }
  }
  return false;
}

function visibleDecorPlacements(
  conn: DbConnection,
  builtinsFromContent: Awaited<ReturnType<typeof loadOwnedApartmentBuiltinsDocFromContent>>,
): VisibleDecorPlacement[] {
  const visibleUnits: ApartmentUnit[] = [];
  const visibleUnitKeys = new Set<string>();
  for (const row of conn.db.apartment_unit) {
    const unit = row as ApartmentUnit;
    if (!residentInteriorPropsVisibleForViewer(conn, unit)) continue;
    visibleUnits.push(unit);
    visibleUnitKeys.add(unit.unitKey);
  }

  const dbRowsByUnitKey = new Map<string, ApartmentUnitDecor[]>();
  for (const row of conn.db.apartment_unit_decor) {
    const decor = row as ApartmentUnitDecor;
    if (!visibleUnitKeys.has(decor.unitKey)) continue;
    const arr = dbRowsByUnitKey.get(decor.unitKey);
    if (arr) {
      arr.push(decor);
    } else {
      dbRowsByUnitKey.set(decor.unitKey, [decor]);
    }
  }

  const out: VisibleDecorPlacement[] = [];
  for (const unit of visibleUnits) {
    const dbRows = [...(dbRowsByUnitKey.get(unit.unitKey) ?? [])].sort((a, b) =>
      Number(a.decorId - b.decorId),
    );

    for (const decor of dbRows) {
      out.push({
        renderKey: `db:${decor.decorId.toString()}`,
        decorId: decor.decorId,
        unit,
        modelRelPath: decor.modelRelPath,
        placedKind: effectiveOwnedApartmentPlacedKind(decor.itemKind, decor.modelRelPath),
        posX: decor.posX,
        posY: decor.posY,
        posZ: decor.posZ,
        yawRad: decor.yawRad,
        pitchRad: decor.pitchRad,
        rollRad: decor.rollRad,
        uniformScale: decor.uniformScale,
        verticalScaleMul: 1,
        source: "db",
      });
    }

    for (const decor of resolveApartmentDecorPoses(unit, builtinsFromContent)) {
      if (contentDecorCoveredByDbRow(decor, dbRows)) continue;
      out.push({
        renderKey: `content:${unit.unitKey}:${decor.id}`,
        decorId: null,
        unit,
        modelRelPath: decor.modelRelPath,
        placedKind: decor.itemKind,
        posX: decor.x,
        posY: decor.y,
        posZ: decor.z,
        yawRad: decor.yaw,
        pitchRad: decor.pitch,
        rollRad: decor.roll,
        uniformScale: decor.uniformScale,
        verticalScaleMul: decor.verticalScaleMul,
        source: "content",
      });
    }
  }

  return out;
}

type VisibleWallPlacement = {
  renderKey: string;
  unit: ApartmentUnit;
  wallId: string;
  posX: number;
  posY: number;
  posZ: number;
  yawRad: number;
  pitchRad: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  material: OwnedApartmentWallMaterial;
  openings: OwnedApartmentWallOpening[];
};

type VisibleMirrorPlacement = {
  renderKey: string;
  unit: ApartmentUnit;
  mirrorId: string;
  posX: number;
  posY: number;
  posZ: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  sizeX: number;
  sizeY: number;
};

function visibleWallPlacements(
  conn: DbConnection,
  builtinsFromContent: Awaited<ReturnType<typeof loadOwnedApartmentBuiltinsDocFromContent>>,
): VisibleWallPlacement[] {
  const visibleUnits: ApartmentUnit[] = [];
  for (const row of conn.db.apartment_unit) {
    const unit = row as ApartmentUnit;
    if (!residentInteriorPropsVisibleForViewer(conn, unit)) continue;
    visibleUnits.push(unit);
  }
  const out: VisibleWallPlacement[] = [];
  for (const unit of visibleUnits) {
    for (const wall of resolveApartmentWallPoses(unit, builtinsFromContent)) {
      out.push({
        renderKey: `content_wall:${unit.unitKey}:${wall.id}`,
        unit,
        wallId: wall.id,
        posX: wall.x,
        posY: wall.y,
        posZ: wall.z,
        yawRad: wall.yaw,
        pitchRad: wall.pitch,
        sizeX: wall.sizeX,
        sizeY: wall.sizeY,
        sizeZ: wall.sizeZ,
        material: wall.material,
        openings: wall.openings,
      });
    }
  }
  return out;
}

function visibleMirrorPlacements(
  conn: DbConnection,
  builtinsFromContent: Awaited<ReturnType<typeof loadOwnedApartmentBuiltinsDocFromContent>>,
): VisibleMirrorPlacement[] {
  const visibleUnits: ApartmentUnit[] = [];
  for (const row of conn.db.apartment_unit) {
    const unit = row as ApartmentUnit;
    if (!residentInteriorPropsVisibleForViewer(conn, unit)) continue;
    visibleUnits.push(unit);
  }
  const out: VisibleMirrorPlacement[] = [];
  for (const unit of visibleUnits) {
    for (const mirror of resolveApartmentMirrorPoses(unit, builtinsFromContent)) {
      out.push({
        renderKey: `content_mirror:${unit.unitKey}:${mirror.id}`,
        unit,
        mirrorId: mirror.id,
        posX: mirror.x,
        posY: mirror.y,
        posZ: mirror.z,
        yawRad: mirror.yaw,
        pitchRad: mirror.pitch,
        rollRad: mirror.roll,
        sizeX: mirror.sizeX,
        sizeY: mirror.sizeY,
      });
    }
  }
  return out;
}

type AuthoringBuildEntry =
  | { kind: "decor"; decor: VisibleDecorPlacement }
  | { kind: "wall"; wall: VisibleWallPlacement }
  | { kind: "mirror"; mirror: VisibleMirrorPlacement };

function compareAuthoringBuildEntries(a: AuthoringBuildEntry, b: AuthoringBuildEntry): number {
  const ka =
    a.kind === "decor"
      ? a.decor.renderKey
      : a.kind === "wall"
        ? a.wall.renderKey
        : a.mirror.renderKey;
  const kb =
    b.kind === "decor"
      ? b.decor.renderKey
      : b.kind === "wall"
        ? b.wall.renderKey
        : b.mirror.renderKey;
  return ka.localeCompare(kb);
}

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
  ) => ApartmentSittablePrompt | null;
  getSittableDecorRoots: () => readonly THREE.Object3D[];
};

export function mountFpApartmentDecorMeshes(opts: {
  scene: THREE.Scene;
  conn: DbConnection;
  buildingRoot: THREE.Group;
  cabMirrorCollection?: FpCabMirrorCollection;
  onRebuilt?: () => void;
}): MountFpApartmentDecorMeshesResult {
  const root = new THREE.Group();
  root.name = "apartment_unit_decor_root";
  opts.buildingRoot.add(root);

  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();
  const templateByUrl = new Map<string, THREE.Object3D>();
  const groupByRenderKey = new Map<string, THREE.Group>();
  const groupByDecorId = new Map<bigint, THREE.Group>();
  const _decorBoundsScratch = new THREE.Box3();
  const _decorSizeScratch = new THREE.Vector3();
  const _decorCenterScratch = new THREE.Vector3();
  const _stashPickSizeScratch = new THREE.Vector3();
  const _stashPickCenterScratch = new THREE.Vector3();
  const stashPickMeshes: THREE.Mesh[] = [];
  const wardrobePickMeshes: THREE.Mesh[] = [];
  const sittablePickMeshes: THREE.Mesh[] = [];
  const visibleStashPickMeshes: THREE.Mesh[] = [];
  const visibleWardrobePickMeshes: THREE.Mesh[] = [];
  const stashPickGeometry = new THREE.BoxGeometry(1, 1, 1);
  const stashPickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  stashPickMaterial.colorWrite = false;

  let disposed = false;
  let buildEpoch = 0;
  let buildRaf = 0;
  let practicalLightsMount: ApartmentPracticalLightsMount | null = null;
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

  const clearInteriorLighting = (): void => {
    practicalLightsMount?.dispose();
    practicalLightsMount = null;
    practicalLightsUnitKey = null;
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
        clearInteriorLighting();
      }
      practicalLightsUnitKey = containingUnitKey;
      practicalLightsMasterEnabled = masterEnabled;
      practicalLightsDecorEnabled = decorFixtureLightsEnabled;
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
  };

  const clearAll = () => {
    stashPickMeshes.length = 0;
    wardrobePickMeshes.length = 0;
    sittablePickMeshes.length = 0;
    for (const g of groupByRenderKey.values()) disposeGroupDeep(g);
    groupByRenderKey.clear();
    groupByDecorId.clear();
    clearApartmentInteriorPropVisibilityBudgetState(propVisibilityBudget);
  };

  const _furnitureVisibilityViewProjection = new THREE.Matrix4();
  const _furnitureVisibilityFrustum = new THREE.Frustum();
  const _furnitureVisibilityCamPos = new THREE.Vector3();
  const _furnitureVisibilityCamDir = new THREE.Vector3();
  const propVisibilityBudget = createApartmentInteriorPropVisibilityBudgetState();

  function snapCloneBottomToWorldFloor(root: THREE.Object3D, floorWorldY: number): void {
    root.position.y = 0;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    root.position.y = floorWorldY - box.min.y;
    root.updateMatrixWorld(true);
  }

  function keepCloneInsideUnitXZ(
    root: THREE.Object3D,
    unit: ApartmentUnit,
    opts: {
      insetM: number;
      fractionMin?: number;
      fractionMax?: number;
    },
  ): void {
    root.updateMatrixWorld(true);
    _decorBoundsScratch.setFromObject(root);
    _decorBoundsScratch.getSize(_decorSizeScratch);
    _decorBoundsScratch.getCenter(_decorCenterScratch);

    const spanX = unit.boundMaxX - unit.boundMinX;
    const spanZ = unit.boundMaxZ - unit.boundMinZ;
    const fractionMin = opts.fractionMin ?? 0;
    const fractionMax = opts.fractionMax ?? 1;
    const minX = unit.boundMinX + spanX * fractionMin + opts.insetM;
    const maxX = unit.boundMinX + spanX * fractionMax - opts.insetM;
    const minZ = unit.boundMinZ + spanZ * fractionMin + opts.insetM;
    const maxZ = unit.boundMinZ + spanZ * fractionMax - opts.insetM;

    let dx = 0;
    if (_decorSizeScratch.x > maxX - minX) {
      dx = (minX + maxX) * 0.5 - _decorCenterScratch.x;
    } else if (_decorBoundsScratch.min.x < minX) {
      dx = minX - _decorBoundsScratch.min.x;
    } else if (_decorBoundsScratch.max.x > maxX) {
      dx = maxX - _decorBoundsScratch.max.x;
    }

    let dz = 0;
    if (_decorSizeScratch.z > maxZ - minZ) {
      dz = (minZ + maxZ) * 0.5 - _decorCenterScratch.z;
    } else if (_decorBoundsScratch.min.z < minZ) {
      dz = minZ - _decorBoundsScratch.min.z;
    } else if (_decorBoundsScratch.max.z > maxZ) {
      dz = maxZ - _decorBoundsScratch.max.z;
    }

    if (dx !== 0 || dz !== 0) {
      root.position.x += dx;
      root.position.z += dz;
      root.updateMatrixWorld(true);
    }
  }

  async function loadDecorTemplate(
    url: string,
    modelRelPath: string,
  ): Promise<THREE.Object3D> {
    switch (apartmentDecorModelExtension(modelRelPath)) {
      case ".glb":
        return (await gltfLoader.loadAsync(url)).scene;
      case ".obj":
        return await objLoader.loadAsync(url);
      default:
        throw new Error(`Unsupported apartment decor asset: ${modelRelPath}`);
    }
  }

  async function runFullRebuild(epoch: number): Promise<void> {
    await yieldToMain();
    if (disposed || epoch !== buildEpoch) return;

    const builtinsFromContent = await loadOwnedApartmentBuiltinsDocFromContent();
    if (disposed || epoch !== buildEpoch) return;

    const decorRows = visibleDecorPlacements(opts.conn, builtinsFromContent);
    const wallRows = visibleWallPlacements(opts.conn, builtinsFromContent);
    const mirrorRows = visibleMirrorPlacements(opts.conn, builtinsFromContent);
    const rows: AuthoringBuildEntry[] = [
      ...decorRows.map((decor) => ({ kind: "decor" as const, decor })),
      ...wallRows.map((wall) => ({ kind: "wall" as const, wall })),
      ...mirrorRows.map((mirror) => ({ kind: "mirror" as const, mirror })),
    ].sort(compareAuthoringBuildEntries);
    clearAll();

    for (const entry of rows) {
      await yieldToMain();
      if (disposed || epoch !== buildEpoch) return;

      if (entry.kind === "mirror") {
        const m = entry.mirror;
        const g = new THREE.Group();
        g.name = `apartment_mirror:${m.mirrorId}`;
        g.userData.mammothApartmentMirrorAuthoring = true;
        g.userData.mammothApartmentUnitKey = m.unit.unitKey;
        g.userData.mammothPlateLevelIndex = m.unit.level;
        g.position.set(m.posX, m.posY, m.posZ);
        g.rotation.order = "YXZ";
        g.rotation.y = m.yawRad;
        g.rotation.x = m.pitchRad;
        g.rotation.z = m.rollRad;

        const visual = buildApartmentPlanarMirrorVisual({
          widthM: m.sizeX,
          heightM: m.sizeY,
          includeFrame: true,
        });
        g.add(visual);
        snapCloneBottomToWorldFloor(g, m.posY);
        keepCloneInsideUnitXZ(g, m.unit, {
          insetM: AUTHORING_DECOR_BOUNDARY_SLACK_M,
          fractionMin: OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
          fractionMax: OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
        });
        tagApartmentDecorGroupVisibilityMetadata(g);
        tagResidentialUnitInteriorMeshesUnder(g);
        tagApartmentDecorPropMeshesForMirrorExclusion(g);
        root.add(g);
        groupByRenderKey.set(m.renderKey, g);
        continue;
      }

      if (entry.kind === "wall") {
        const w = entry.wall;
        const g = new THREE.Group();
        g.name = `apartment_wall:${w.wallId}`;
        g.userData.mammothApartmentWallAuthoring = true;
        g.userData.mammothApartmentUnitKey = w.unit.unitKey;
        g.userData.mammothPlateLevelIndex = w.unit.level;
        g.position.set(w.posX, w.posY, w.posZ);
        g.rotation.order = "YXZ";
        g.rotation.y = w.yawRad;
        g.rotation.x = w.pitchRad;
        g.rotation.z = 0;

        const openings = clampOwnedApartmentWallOpeningsForLength(
          w.sizeX,
          w.openings ?? [],
        );
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9c4bc });
        if (openings.length === 0) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wallMat);
          mesh.scale.set(w.sizeX, w.sizeY, w.sizeZ);
          mesh.position.y = w.sizeY / 2;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = true;
          mesh.userData.mammothUnitInterior = true;
          mesh.userData.mammothPlateLevelIndex = w.unit.level;
          mesh.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] = true;
          g.add(mesh);
          applyOwnedApartmentWallSurfaceMaterial(mesh, w.material);
        } else {
          buildOwnedApartmentPartitionWallInGroup({
            parent: g,
            sizeX: w.sizeX,
            sizeY: w.sizeY,
            sizeZ: w.sizeZ,
            openings,
            wallMaterial: wallMat,
            opts: { fpInteriorPartitionSolid: true },
          });
          applyOwnedApartmentWallSurfaceMaterialToVisuals(g, (mesh) => {
            applyOwnedApartmentWallSurfaceMaterial(mesh, w.material);
          });
          g.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.castShadow = false;
              obj.receiveShadow = false;
              obj.frustumCulled = true;
              obj.userData.mammothUnitInterior = true;
              obj.userData.mammothPlateLevelIndex = w.unit.level;
            }
          });
        }
        snapCloneBottomToWorldFloor(g, w.posY);
        keepCloneInsideUnitXZ(g, w.unit, {
          insetM: AUTHORING_DECOR_BOUNDARY_SLACK_M,
          fractionMin: OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
          fractionMax: OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
        });
        tagApartmentDecorGroupVisibilityMetadata(g);
        tagResidentialUnitInteriorMeshesUnder(g);
        tagApartmentDecorPropMeshesForMirrorExclusion(g);
        root.add(g);
        groupByRenderKey.set(w.renderKey, g);
        continue;
      }

      const d = entry.decor;

      const url = await resolveStaticModelFetchUrl(apartmentDecorFetchPath(d.modelRelPath));
      let template = templateByUrl.get(url);
      if (!template) {
        try {
          template = await loadDecorTemplate(url, d.modelRelPath);
          if (disposed || epoch !== buildEpoch) return;
          template.userData.mammothApartmentDecorTemplate = url;
          templateByUrl.set(url, template);
        } catch {
          console.warn("[mountFpApartmentDecorMeshes] failed to load decor asset", url);
          continue;
        }
      }
      if (disposed || epoch !== buildEpoch) return;

      const g = new THREE.Group();
      g.name =
        d.decorId !== null ? `apartment_decor:${d.decorId.toString()}` : `apartment_decor:${d.renderKey}`;
      g.userData.mammothApartmentDecorProp = true;
      if (d.decorId !== null) g.userData.mammothApartmentDecorId = d.decorId;
      g.userData.mammothApartmentUnitKey = d.unit.unitKey;
      g.userData.mammothPlateLevelIndex = d.unit.level;
      g.userData.mammothApartmentDecorModelRelPath = d.modelRelPath;
      g.userData.mammothApartmentDecorPlacedKind = d.placedKind;
      g.position.set(d.posX, d.posY, d.posZ);
      g.rotation.order = "YXZ";
      g.rotation.y = d.yawRad;
      g.rotation.x = d.pitchRad;
      g.rotation.z = d.rollRad;
      const us = Number.isFinite(d.uniformScale) && d.uniformScale > 0 ? d.uniformScale : 1;
      const yMul =
        Number.isFinite(d.verticalScaleMul) && d.verticalScaleMul > 0 ? d.verticalScaleMul : 1;
      const s = ownedApartmentDecorRootScaleXYZ(us, yMul);
      g.scale.set(s.x, s.y, s.z);

      const vis = template!.clone(true);
      vis.userData.mammothApartmentDecorProp = true;
      vis.userData.mammothApartmentDecorId = d.decorId;
      vis.userData.mammothApartmentUnitKey = d.unit.unitKey;
      vis.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          moodGradeMammothApartmentDecorMesh(o, { modelRelPath: d.modelRelPath });
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = true;
          o.userData.mammothUnitInterior = true;
          o.userData.mammothPlateLevelIndex = d.unit.level;
        }
      });

      vis.position.set(0, 0, 0);
      vis.rotation.set(0, 0, 0);
      vis.scale.setScalar(ownedApartmentPlacedItemAuthoringAssetVisScale(d.placedKind));
      vis.updateMatrixWorld(true);

      g.add(vis);
      if (d.source === "content" && !ownedApartmentPlacedItemKindHasStash(d.placedKind)) {
        centerVisualBoundsOnRoot(g);
      }
      await mergeGroupDescendantsByMaterialYielding(g, yieldToMain);
      bindMammothApartmentPropReadableEnv(g, metallicReadableEnv());
      root.add(g);
      g.updateMatrixWorld(true);
      if (ownedApartmentPlacedItemKindHasStash(d.placedKind)) {
        const sk = apartmentStashKindForPlacedKind(d.placedKind);
        if (sk) {
          const pick = new THREE.Mesh(stashPickGeometry, stashPickMaterial);
          pick.name = `apartment_decor_stash_pick:${d.renderKey}`;
          fitApartmentInteractionPickToObject(g, pick, { x: 0.35, y: 0.25, z: 0.35 });
          pick.userData.mammothApartmentStashPickUnitKey = d.unit.unitKey;
          pick.userData.mammothApartmentStashKey =
            d.decorId !== null
              ? apartmentStashKeyDecor(d.unit.unitKey, d.decorId)
              : apartmentStashKey(d.unit.unitKey, sk);
          pick.userData.mammothApartmentStashKind = sk;
          if (d.placedKind === "wardrobe") {
            pick.userData.mammothApartmentWardrobePickUnitKey = d.unit.unitKey;
            wardrobePickMeshes.push(pick);
          }
          pick.userData.mammothSkipFloorGeometryMerge = true;
          pick.userData.mammothApartmentDecorProp = true;
          pick.userData.mammothPlateLevelIndex = d.unit.level;
          pick.layers.set(FP_INTERACTION_PICK_LAYER);
          g.add(pick);
          stashPickMeshes.push(pick);
          g.updateMatrixWorld(true);
        }
      }
      const decorModelRelPath =
        normalizeApartmentDecorModelRelPath(d.modelRelPath) ?? d.modelRelPath;
      const sitSpec = apartmentSittableSpecForPlacedItem({
        modelRelPath: decorModelRelPath,
        itemKind: d.placedKind,
      });
      if (sitSpec) {
        const sitPick = new THREE.Mesh(stashPickGeometry, stashPickMaterial);
        const sittableKey =
          d.decorId !== null
            ? `decor:${d.decorId.toString()}`
            : `content:${d.unit.unitKey}:${d.renderKey}`;
        sitPick.name = `apartment_sittable_pick:${sittableKey}`;
        fitApartmentInteractionPickToObject(g, sitPick, { x: 0.35, y: 0.25, z: 0.35 });
        sitPick.userData.mammothApartmentSittableKey = sittableKey;
        sitPick.userData.mammothApartmentSittableUnitKey = d.unit.unitKey;
        sitPick.userData.mammothApartmentSittableModelRelPath = sitSpec.modelRelPath;
        sitPick.userData.mammothApartmentSittablePlacedKind = d.placedKind;
        sitPick.userData.mammothApartmentSittableRoot = g;
        sitPick.userData.mammothSkipFloorGeometryMerge = true;
        sitPick.userData.mammothApartmentDecorProp = true;
        sitPick.userData.mammothPlateLevelIndex = d.unit.level;
        sitPick.layers.set(FP_INTERACTION_PICK_LAYER);
        g.add(sitPick);
        sittablePickMeshes.push(sitPick);
        g.updateMatrixWorld(true);
      }
      tagApartmentDecorGroupVisibilityMetadata(g);
      tagResidentialUnitInteriorMeshesUnder(g);
      tagApartmentDecorPropMeshesForMirrorExclusion(g);

      groupByRenderKey.set(d.renderKey, g);
      if (d.decorId !== null) groupByDecorId.set(d.decorId, g);
    }

    if (practicalLightsContextUnitKey) {
      syncPracticalLightsForUnit(practicalLightsContextUnitKey, true);
    }

    opts.buildingRoot.updateMatrixWorld(true);
    opts.cabMirrorCollection?.syncApartmentDecorRoot(root);
    opts.onRebuilt?.();
  }

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

  return {
    getDecorObject: (decorId) => groupByDecorId.get(decorId),
    syncVisibility: (camera, allowDemand = true, containingUnitKey = null) => {
      if (!isFpDebugRenderIsolationEnabled("apartmentDecor")) {
        if (root.visible) root.visible = false;
        clearInteriorLighting();
        clearApartmentInteriorPropVisibilityBudgetState(propVisibilityBudget);
        return;
      }
      if (!root.visible) root.visible = true;
      camera.updateMatrixWorld();
      camera.getWorldPosition(_furnitureVisibilityCamPos);
      camera.getWorldDirection(_furnitureVisibilityCamDir);
      _furnitureVisibilityViewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      _furnitureVisibilityFrustum.setFromProjectionMatrix(_furnitureVisibilityViewProjection);
      const useInUnitBudget = containingUnitKey !== null;
      const budgetItems: ApartmentInteriorPropVisibilityApplyItem[] = [];
      for (const [renderKey, g] of groupByRenderKey.entries()) {
        const bb = g.userData.mammothApartmentDecorWorldBounds;
        const bounds = bb instanceof THREE.Box3 ? bb : undefined;
        const skipInteriorForwardCone =
          g.userData.mammothApartmentWallAuthoring === true ||
          g.userData.mammothApartmentMirrorAuthoring === true;
        const wasVisible = propVisibilityBudget.visibleKeys.has(renderKey);
        const desiredVisible = resolveApartmentInteriorPropGroupVisible({
          allowDemand,
          containingUnitKey,
          groupUnitKey:
            typeof g.userData.mammothApartmentUnitKey === "string"
              ? g.userData.mammothApartmentUnitKey
              : undefined,
          propWorldBounds: bounds,
          viewFrustum: _furnitureVisibilityFrustum,
          cameraWorldPos: _furnitureVisibilityCamPos,
          cameraWorldDir: _furnitureVisibilityCamDir,
          wasVisible: useInUnitBudget && !skipInteriorForwardCone ? wasVisible : undefined,
          skipInteriorForwardCone,
        });
        if (skipInteriorForwardCone) {
          g.visible = desiredVisible;
          continue;
        }
        if (useInUnitBudget) {
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
      if (useInUnitBudget) {
        applyApartmentInteriorPropVisibilityBudget(budgetItems, propVisibilityBudget);
      } else {
        clearApartmentInteriorPropVisibilityBudgetState(propVisibilityBudget);
      }
      practicalLightsContextUnitKey = containingUnitKey;
      syncPracticalLightsForUnit(containingUnitKey);
    },
    getStashPrompt: (playerPos, camera) => {
      if (!opts.conn.identity || stashPickMeshes.length === 0) return null;
      _stashRaycaster.layers.set(FP_INTERACTION_PICK_LAYER);
      _stashRaycaster.setFromCamera(_screenCenterNdc, camera);
      _stashRaycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
      collectVisiblePickMeshes(stashPickMeshes, visibleStashPickMeshes);
      const hits = _stashRaycaster.intersectObjects(visibleStashPickMeshes, false);
      const seen = new Set<string>();
      for (const hit of hits) {
        const stashKey = hit.object.userData.mammothApartmentStashKey;
        const unitKey = hit.object.userData.mammothApartmentStashPickUnitKey;
        const stashKind = hit.object.userData.mammothApartmentStashKind;
        if (typeof stashKey !== "string" || typeof unitKey !== "string" || seen.has(stashKey)) continue;
        if (
          stashKind !== APARTMENT_STASH_KIND_FOOTLOCKER &&
          stashKind !== APARTMENT_STASH_KIND_WARDROBE &&
          stashKind !== APARTMENT_STASH_KIND_STOVE &&
          stashKind !== APARTMENT_STASH_KIND_FRIDGE &&
          stashKind !== APARTMENT_STASH_KIND_WATER_TANK
        ) {
          continue;
        }
        seen.add(stashKey);
        if (clientMayUseApartmentStash(opts.conn, opts.conn.identity, stashKey, playerPos)) {
          return {
            kind: "apartment_stash",
            stashKey,
            unitKey,
            stashKind,
            stashLabel: apartmentStashLabel(stashKind),
          };
        }
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
    getSittableDecorRoots: () => Array.from(groupByRenderKey.values()),
    getSittablePrompt: (playerPos, camera, objectVisibleInHierarchy, visiblePickScratch) => {
      if (!opts.conn.identity) return null;
      return getApartmentSittablePrompt({
        conn: opts.conn,
        playerPos,
        camera,
        decorPickMeshes: sittablePickMeshes,
        decorRoots: Array.from(groupByRenderKey.values()),
        visibleScratch: visiblePickScratch,
        objectVisibleInHierarchy,
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
      opts.buildingRoot.remove(root);
    },
  };
}
