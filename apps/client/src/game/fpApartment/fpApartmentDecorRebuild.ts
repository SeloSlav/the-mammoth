import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import {
  applyOwnedApartmentWallSurfaceMaterial,
  applyOwnedApartmentWallSurfaceMaterialToVisuals,
  buildOwnedApartmentPartitionWallInGroup,
  clampOwnedApartmentWallOpeningsForLength,
  buildApartmentPlanarMirrorVisual,
  buildProceduralApartmentDecorVisual,
  isProceduralApartmentDecorModelPath,
  postProcessApartmentDecorGltfScene,
  tagProceduralApartmentDecorMeshesSkipMerge,
  MAMMOTH_FP_INTERIOR_PARTITION_SOLID,
} from "@the-mammoth/world";
import {
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
  apartmentUnitQualifiesForStandardWindowShutters,
  type OwnedApartmentPlacedItemKind,
  type OwnedApartmentWallMaterial,
  type OwnedApartmentWallOpening,
  effectiveOwnedApartmentPlacedKind,
  resolveOwnedApartmentDecorRootScale,
  ownedApartmentPlacedItemKindHasStash,
  ownedApartmentPlacedItemAuthoringAssetVisScale,
  apartmentSittableSpecForPlacedItem,
  isApartmentFishTankModelRelPath,
  isApartmentNotebookModelRelPath,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import { mergeGroupDescendantsByMaterialYielding } from "../fpSession/fpMergeGroupDescendantsByMaterial.js";
import { FP_INTERACTION_PICK_LAYER } from "../fpSession/fpSessionConstants.js";
import {
  tagApartmentDecorPropMeshesForMirrorExclusion,
  tagResidentialUnitInteriorMeshesUnder,
} from "./fpResidentialUnitInteriorLayer.js";
import type { ApartmentUnit, ApartmentUnitDecor } from "../../module_bindings/types";
import { residentInteriorPropsVisibleForViewer } from "./fpApartmentGameplay.js";
import { requestOwnedApartmentStashDecorSync } from "./fpApartmentStashDecorSync.js";
import {
  bindApartmentDecorStashPickUserData,
  contentDecorCoveredByDbRow,
} from "./fpApartmentDecorStashKey.js";
import {
  apartmentDecorFetchPath,
  apartmentDecorModelExtension,
  normalizeApartmentDecorModelRelPath,
} from "./fpApartmentDecorAssets.js";
import {
  fitApartmentInteractionPickToObject,
  fitFishTankStashInteractionPick,
} from "./fpApartmentInteractionPick.js";
import {
  loadApartmentUnitLayoutProfilesDocFromContent,
  loadOwnedApartmentBuiltinsDocFromContent,
  resolveApartmentLayoutDocForUnit,
  resolveApartmentDecorPoses,
  resolveApartmentMirrorPoses,
  resolveApartmentWallPoses,
} from "./fpOwnedApartmentBuiltinsFromContent.js";
import type { FpCabMirrorCollection } from "../fpRendering/fpCabMirrorCollection.js";
import { yieldToMain } from "../fpSession/yieldToMain.js";
import {
  bindMammothApartmentPropReadableEnv,
  moodGradeMammothApartmentDecorMesh,
  attachApartmentWarmFixtureBulbGlow,
  applyApartmentDecorCastShadowFlags,
  resolveStaticModelFetchUrl,
} from "@the-mammoth/engine";
import {
  growTrayIdForPlacement,
  isGrowTrayModelPath,
  resolveGrowTrayDecorModelRelPath,
} from "../fpBalconyGrow/fpBalconyGrowTrayDecor.js";
import type { FpBalconyGrowDecorBridge } from "../fpBalconyGrow/fpBalconyGrowDecorBridge.js";
import {
  APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
  type FpApartmentFishTankDecorBridge,
} from "./fpApartmentFishTankDecorBridge.js";
import { tagApartmentDecorGroupVisibilityMetadata } from "./fpApartmentInteriorPropVisibility.js";

/**
 * Content-authored decor/walls should preserve editor placement exactly, including flush placement
 * against windowed exterior faces. Keep the strict hull as a hard stop, but do not reserve extra
 * inset inside it.
 */
export const AUTHORING_DECOR_BOUNDARY_SLACK_M = 0;

const _decorCenterBoundsScratch = new THREE.Box3();
const _decorCenterWorldScratch = new THREE.Vector3();
const _decorCenterLocalScratch = new THREE.Vector3();
const _decorBoundsScratch = new THREE.Box3();
const _decorSizeScratch = new THREE.Vector3();
const _decorCenterScratch = new THREE.Vector3();

export type VisibleDecorPlacement = {
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
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  source: "db" | "content";
};

export type VisibleWallPlacement = {
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

export type VisibleMirrorPlacement = {
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

export type AuthoringBuildEntry =
  | { kind: "decor"; decor: VisibleDecorPlacement }
  | { kind: "wall"; wall: VisibleWallPlacement }
  | { kind: "mirror"; mirror: VisibleMirrorPlacement };

/** Skip merging a content placement when a DB row already sits on the same prop (XZ). */
export { contentDecorCoveredByDbRow } from "./fpApartmentDecorStashKey.js";

export function centerVisualBoundsOnRoot(root: THREE.Object3D): void {
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

export function visibleDecorPlacements(
  conn: DbConnection,
  builtinsFromContent: Awaited<ReturnType<typeof loadOwnedApartmentBuiltinsDocFromContent>>,
  profilesFromContent: Awaited<ReturnType<typeof loadApartmentUnitLayoutProfilesDocFromContent>>,
): VisibleDecorPlacement[] {
  const visibleUnits: ApartmentUnit[] = [];
  const visibleUnitKeys = new Set<string>();
  const shutterOnlyUnitKeys = new Set<string>();
  for (const row of conn.db.apartment_unit) {
    const unit = row as ApartmentUnit;
    if (residentInteriorPropsVisibleForViewer(conn, unit)) {
      visibleUnits.push(unit);
      visibleUnitKeys.add(unit.unitKey);
      continue;
    }
    if (apartmentUnitQualifiesForStandardWindowShutters(unit.unitKey as string)) {
      visibleUnits.push(unit);
      visibleUnitKeys.add(unit.unitKey);
      shutterOnlyUnitKeys.add(unit.unitKey);
    }
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
    const shutterOnly = shutterOnlyUnitKeys.has(unit.unitKey);
    const dbRows = shutterOnly
      ? []
      : [...(dbRowsByUnitKey.get(unit.unitKey) ?? [])].sort((a, b) =>
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

    const layoutDoc = shutterOnly
      ? null
      : resolveApartmentLayoutDocForUnit(
          unit,
          builtinsFromContent,
          profilesFromContent,
        );
    for (const decor of resolveApartmentDecorPoses(unit, layoutDoc)) {
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
        scaleX: decor.scaleX,
        scaleY: decor.scaleY,
        scaleZ: decor.scaleZ,
        source: "content",
      });
    }
  }

  return out;
}

export function visibleWallPlacements(
  conn: DbConnection,
  builtinsFromContent: Awaited<ReturnType<typeof loadOwnedApartmentBuiltinsDocFromContent>>,
  profilesFromContent: Awaited<ReturnType<typeof loadApartmentUnitLayoutProfilesDocFromContent>>,
): VisibleWallPlacement[] {
  const visibleUnits: ApartmentUnit[] = [];
  for (const row of conn.db.apartment_unit) {
    const unit = row as ApartmentUnit;
    if (!residentInteriorPropsVisibleForViewer(conn, unit)) continue;
    visibleUnits.push(unit);
  }
  const out: VisibleWallPlacement[] = [];
  for (const unit of visibleUnits) {
    const layoutDoc = resolveApartmentLayoutDocForUnit(
      unit,
      builtinsFromContent,
      profilesFromContent,
    );
    for (const wall of resolveApartmentWallPoses(unit, layoutDoc)) {
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

export function visibleMirrorPlacements(
  conn: DbConnection,
  builtinsFromContent: Awaited<ReturnType<typeof loadOwnedApartmentBuiltinsDocFromContent>>,
  profilesFromContent: Awaited<ReturnType<typeof loadApartmentUnitLayoutProfilesDocFromContent>>,
): VisibleMirrorPlacement[] {
  const visibleUnits: ApartmentUnit[] = [];
  for (const row of conn.db.apartment_unit) {
    const unit = row as ApartmentUnit;
    if (!residentInteriorPropsVisibleForViewer(conn, unit)) continue;
    visibleUnits.push(unit);
  }
  const out: VisibleMirrorPlacement[] = [];
  for (const unit of visibleUnits) {
    const layoutDoc = resolveApartmentLayoutDocForUnit(
      unit,
      builtinsFromContent,
      profilesFromContent,
    );
    for (const mirror of resolveApartmentMirrorPoses(unit, layoutDoc)) {
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

export function compareAuthoringBuildEntries(a: AuthoringBuildEntry, b: AuthoringBuildEntry): number {
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

export function snapCloneBottomToWorldFloor(root: THREE.Object3D, floorWorldY: number): void {
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = floorWorldY - box.min.y;
  root.updateMatrixWorld(true);
}

export function keepCloneInsideUnitXZ(
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

export async function loadFpApartmentDecorTemplate(
  gltfLoader: GLTFLoader,
  objLoader: OBJLoader,
  url: string,
  modelRelPath: string,
): Promise<THREE.Object3D> {
  const procedural = buildProceduralApartmentDecorVisual(modelRelPath);
  if (procedural) return procedural;
  switch (apartmentDecorModelExtension(modelRelPath)) {
    case ".glb": {
      const scene = (await gltfLoader.loadAsync(url)).scene;
      postProcessApartmentDecorGltfScene(scene, modelRelPath);
      return scene;
    }
    case ".obj":
      return await objLoader.loadAsync(url);
    default:
      throw new Error(`Unsupported apartment decor asset: ${modelRelPath}`);
  }
}

export type FpApartmentDecorFullRebuildContext = {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  root: THREE.Group;
  gltfLoader: GLTFLoader;
  objLoader: OBJLoader;
  isBuildStale: (epoch: number) => boolean;
  templateByUrl: Map<string, THREE.Object3D>;
  groupByRenderKey: Map<string, THREE.Group>;
  groupByDecorId: Map<bigint, THREE.Group>;
  clearAll: () => void;
  fishTankBridge: FpApartmentFishTankDecorBridge;
  growBridge: FpBalconyGrowDecorBridge;
  stashPickMeshes: THREE.Mesh[];
  wardrobePickMeshes: THREE.Mesh[];
  sittablePickMeshes: THREE.Mesh[];
  notebookPickMeshes: THREE.Mesh[];
  stashPickGeometry: THREE.BufferGeometry;
  stashPickMaterial: THREE.Material;
  metallicReadableEnv: () => THREE.Texture | null;
  rebuildStashRayOcclusion: () => void;
  syncPracticalLightsForUnit: (containingUnitKey: string | null, force?: boolean) => void;
  getPracticalLightsContextUnitKey: () => string | null;
  cabMirrorCollection?: FpCabMirrorCollection;
  onRebuilt?: () => void;
  yieldToMain: typeof yieldToMain;
};

export async function runFpApartmentDecorFullRebuild(
  ctx: FpApartmentDecorFullRebuildContext,
  epoch: number,
): Promise<void> {
  await ctx.yieldToMain();
  if (ctx.isBuildStale(epoch)) return;

  const [builtinsFromContent, profilesFromContent] = await Promise.all([
    loadOwnedApartmentBuiltinsDocFromContent(),
    loadApartmentUnitLayoutProfilesDocFromContent(),
  ]);
  if (ctx.isBuildStale(epoch)) return;

  const decorRows = visibleDecorPlacements(
    ctx.conn,
    builtinsFromContent,
    profilesFromContent,
  );
  const wallRows = visibleWallPlacements(
    ctx.conn,
    builtinsFromContent,
    profilesFromContent,
  );
  const mirrorRows = visibleMirrorPlacements(
    ctx.conn,
    builtinsFromContent,
    profilesFromContent,
  );
  const rows: AuthoringBuildEntry[] = [
    ...decorRows.map((decor) => ({ kind: "decor" as const, decor })),
    ...wallRows.map((wall) => ({ kind: "wall" as const, wall })),
    ...mirrorRows.map((mirror) => ({ kind: "mirror" as const, mirror })),
  ].sort(compareAuthoringBuildEntries);
  ctx.clearAll();

  for (const entry of rows) {
    await ctx.yieldToMain();
    if (ctx.isBuildStale(epoch)) return;

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
      ctx.root.add(g);
      ctx.groupByRenderKey.set(m.renderKey, g);
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
      ctx.root.add(g);
      ctx.groupByRenderKey.set(w.renderKey, g);
      continue;
    }

    const d = entry.decor;
    const effectiveModelRelPath = resolveGrowTrayDecorModelRelPath(d.modelRelPath);

    const templateCacheKey = isProceduralApartmentDecorModelPath(effectiveModelRelPath)
      ? effectiveModelRelPath
      : await resolveStaticModelFetchUrl(apartmentDecorFetchPath(effectiveModelRelPath));
    let template = ctx.templateByUrl.get(templateCacheKey);
    if (!template) {
      try {
        template = await loadFpApartmentDecorTemplate(
          ctx.gltfLoader,
          ctx.objLoader,
          templateCacheKey,
          effectiveModelRelPath,
        );
        if (ctx.isBuildStale(epoch)) return;
        template.userData.mammothApartmentDecorTemplate = templateCacheKey;
        ctx.templateByUrl.set(templateCacheKey, template);
      } catch {
        console.warn(
          "[mountFpApartmentDecorMeshes] failed to load decor asset",
          templateCacheKey,
        );
        continue;
      }
    }
    if (ctx.isBuildStale(epoch)) return;

    try {
      const g = new THREE.Group();
      g.name =
        d.decorId !== null ? `apartment_decor:${d.decorId.toString()}` : `apartment_decor:${d.renderKey}`;
      g.userData.mammothApartmentDecorProp = true;
      if (d.decorId !== null) g.userData.mammothApartmentDecorId = d.decorId;
      g.userData.mammothApartmentUnitKey = d.unit.unitKey;
      g.userData.mammothPlateLevelIndex = d.unit.level;
      g.userData.mammothApartmentDecorModelRelPath = effectiveModelRelPath;
      g.userData.mammothApartmentDecorPlacedKind = d.placedKind;
      g.position.set(d.posX, d.posY, d.posZ);
      g.rotation.order = "YXZ";
      g.rotation.y = d.yawRad;
      g.rotation.x = d.pitchRad;
      g.rotation.z = d.rollRad;
      const s = resolveOwnedApartmentDecorRootScale({
        uniformScale: Number.isFinite(d.uniformScale) && d.uniformScale > 0 ? d.uniformScale : 1,
        verticalScaleMul:
          Number.isFinite(d.verticalScaleMul) && d.verticalScaleMul > 0 ? d.verticalScaleMul : 1,
        scaleX: d.scaleX,
        scaleY: d.scaleY,
        scaleZ: d.scaleZ,
      });
      g.scale.set(s.x, s.y, s.z);

      const vis = template!.clone(true);
      vis.userData.mammothApartmentDecorProp = true;
      vis.userData.mammothApartmentDecorId = d.decorId;
      vis.userData.mammothApartmentUnitKey = d.unit.unitKey;
      vis.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          moodGradeMammothApartmentDecorMesh(o, { modelRelPath: effectiveModelRelPath });
          o.frustumCulled = true;
          o.userData.mammothUnitInterior = true;
          o.userData.mammothPlateLevelIndex = d.unit.level;
        }
      });
      vis.position.set(0, 0, 0);
      vis.rotation.set(0, 0, 0);
      vis.scale.setScalar(ownedApartmentPlacedItemAuthoringAssetVisScale(d.placedKind));
      vis.updateMatrixWorld(true);

      if (isProceduralApartmentDecorModelPath(effectiveModelRelPath)) {
        tagProceduralApartmentDecorMeshesSkipMerge(vis);
      }

      g.add(vis);
      if (d.source === "content" && !ownedApartmentPlacedItemKindHasStash(d.placedKind)) {
        centerVisualBoundsOnRoot(g);
      }
      await mergeGroupDescendantsByMaterialYielding(g, ctx.yieldToMain);
      attachApartmentWarmFixtureBulbGlow(g, d.modelRelPath);
      bindMammothApartmentPropReadableEnv(g, ctx.metallicReadableEnv());

      const fishTankNormalizedPath =
        normalizeApartmentDecorModelRelPath(effectiveModelRelPath) ?? effectiveModelRelPath;
      if (isApartmentFishTankModelRelPath(fishTankNormalizedPath)) {
        // Material merge removes `vis` from the decor root while baking tank meshes onto `g`.
        // Fish swim in GLB-local space — keep the visual root in the scene graph for mounting.
        if (vis.parent !== g) {
          g.add(vis);
        }
        const swimKey =
          d.decorId !== null
            ? `${d.unit.unitKey}:decor:${d.decorId.toString()}`
            : `${d.unit.unitKey}:${d.renderKey}`;
        await ctx.fishTankBridge.tryMountOnTankVisual({
          tankModelRelPath: fishTankNormalizedPath,
          tankVisualRoot: vis,
          stableKey: swimKey,
          isStale: () => ctx.isBuildStale(epoch),
          loadFishTemplate: async () => {
            const ftPath = APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH;
            const ftCacheKey = await resolveStaticModelFetchUrl(apartmentDecorFetchPath(ftPath));
            let tpl = ctx.templateByUrl.get(`__fish_school_tpl:${ftPath}`);
            if (!tpl) {
              tpl = await loadFpApartmentDecorTemplate(
                ctx.gltfLoader,
                ctx.objLoader,
                ftCacheKey,
                ftPath,
              );
              if (!ctx.isBuildStale(epoch)) {
                ctx.templateByUrl.set(`__fish_school_tpl:${ftPath}`, tpl);
              }
            }
            return tpl;
          },
          decorateSwimmerMesh: (mesh) =>
            moodGradeMammothApartmentDecorMesh(mesh, {
              modelRelPath: APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
            }),
        });
      }

      ctx.root.add(g);
      g.updateMatrixWorld(true);
      if (ownedApartmentPlacedItemKindHasStash(d.placedKind)) {
        const pick = new THREE.Mesh(ctx.stashPickGeometry, ctx.stashPickMaterial);
        pick.name = `apartment_decor_stash_pick:${d.renderKey}`;
        if (d.placedKind === "fish_tank") {
          fitFishTankStashInteractionPick(g, pick);
        } else if (d.placedKind === "fish_tank_filter") {
          fitApartmentInteractionPickToObject(g, pick, { x: 0.28, y: 0.32, z: 0.22 });
        } else {
          fitApartmentInteractionPickToObject(g, pick, { x: 0.35, y: 0.25, z: 0.35 });
        }
        bindApartmentDecorStashPickUserData(ctx.conn, pick, {
          unitKey: d.unit.unitKey,
          decorId: d.decorId,
          placedKind: d.placedKind,
          posX: d.posX,
          posZ: d.posZ,
        });
        if (d.placedKind === "wardrobe") {
          pick.userData.mammothApartmentWardrobePickUnitKey = d.unit.unitKey;
          ctx.wardrobePickMeshes.push(pick);
        }
        pick.userData.mammothSkipFloorGeometryMerge = true;
        pick.userData.mammothPlateLevelIndex = d.unit.level;
        pick.layers.set(FP_INTERACTION_PICK_LAYER);
        g.add(pick);
        ctx.stashPickMeshes.push(pick);
        g.updateMatrixWorld(true);
      }
      if (isGrowTrayModelPath(d.modelRelPath)) {
        const trayId = growTrayIdForPlacement(d.renderKey, d.decorId);
        if (trayId) {
          await ctx.growBridge.mountOnGrowTrayDecorGroup({
            decorGroup: g,
            unitKey: d.unit.unitKey,
            trayId,
          });
          g.userData.mammothBalconyGrowTrayDecor = true;
          g.userData.mammothGrowTrayId = trayId;
        }
      }
      const decorModelRelPath =
        normalizeApartmentDecorModelRelPath(d.modelRelPath) ?? d.modelRelPath;
      const sitSpec = apartmentSittableSpecForPlacedItem({
        modelRelPath: decorModelRelPath,
        itemKind: d.placedKind,
      });
      if (sitSpec) {
        const sitPick = new THREE.Mesh(ctx.stashPickGeometry, ctx.stashPickMaterial);
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
        ctx.sittablePickMeshes.push(sitPick);
        g.updateMatrixWorld(true);
      }
      if (isApartmentNotebookModelRelPath(decorModelRelPath)) {
        const notebookPick = new THREE.Mesh(ctx.stashPickGeometry, ctx.stashPickMaterial);
        const notebookKey =
          d.decorId !== null
            ? `decor:${d.decorId.toString()}`
            : `content:${d.unit.unitKey}:${d.renderKey}`;
        notebookPick.name = `apartment_notebook_pick:${notebookKey}`;
        fitApartmentInteractionPickToObject(g, notebookPick, { x: 0.16, y: 0.1, z: 0.16 });
        notebookPick.userData.mammothApartmentNotebookKey = notebookKey;
        notebookPick.userData.mammothApartmentNotebookUnitKey = d.unit.unitKey;
        notebookPick.userData.mammothApartmentNotebookRoot = g;
        notebookPick.userData.mammothSkipFloorGeometryMerge = true;
        notebookPick.userData.mammothApartmentDecorProp = true;
        notebookPick.userData.mammothPlateLevelIndex = d.unit.level;
        notebookPick.layers.set(FP_INTERACTION_PICK_LAYER);
        g.add(notebookPick);
        ctx.notebookPickMeshes.push(notebookPick);
        g.updateMatrixWorld(true);
      }
      tagApartmentDecorGroupVisibilityMetadata(g);
      tagResidentialUnitInteriorMeshesUnder(g);
      tagApartmentDecorPropMeshesForMirrorExclusion(g);
      applyApartmentDecorCastShadowFlags(g, effectiveModelRelPath);

      ctx.groupByRenderKey.set(d.renderKey, g);
      if (d.decorId !== null) ctx.groupByDecorId.set(d.decorId, g);
    } catch (err) {
      console.warn(
        "[mountFpApartmentDecorMeshes] failed to mount decor",
        effectiveModelRelPath,
        err,
      );
    }
  }

  const practicalLightsContextUnitKey = ctx.getPracticalLightsContextUnitKey();
  if (practicalLightsContextUnitKey) {
    ctx.syncPracticalLightsForUnit(practicalLightsContextUnitKey, true);
  }

  ctx.buildingRoot.updateMatrixWorld(true);
  ctx.rebuildStashRayOcclusion();
  ctx.cabMirrorCollection?.syncApartmentDecorRoot(ctx.root);
  requestOwnedApartmentStashDecorSync(ctx.conn);
  ctx.onRebuilt?.();
}
