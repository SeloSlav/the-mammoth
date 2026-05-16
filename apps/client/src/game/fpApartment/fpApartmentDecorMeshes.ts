/**
 * Apartment decor placements from two sources:
 * - authoritative replica rows (`add_apartment_unit_decor`)
 * - local content authoring fallback (`content/apartment/owned_apartment_builtins.json`)
 *
 * Live replica rows win for a unit when present; otherwise the saved content layout is projected into
 * the viewer-owned claimed unit, matching the standalone editor flow.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { applyOwnedApartmentWallSurfaceMaterial } from "@the-mammoth/world";
import {
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
  type OwnedApartmentWallMaterial,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import { tagResidentialUnitInteriorMeshesUnder } from "./fpResidentialUnitInteriorLayer.js";
import type { ApartmentUnit, ApartmentUnitDecor } from "../../module_bindings/types";
import {
  apartmentUnitOwnerEqual,
  residentInteriorPropsVisibleForViewer,
} from "./fpApartmentGameplay.js";
import {
  apartmentDecorFetchPath,
  apartmentDecorModelExtension,
} from "./fpApartmentDecorAssets.js";
import {
  loadOwnedApartmentBuiltinsDocFromContent,
  resolveApartmentDecorPoses,
  resolveApartmentWallPoses,
} from "./fpOwnedApartmentBuiltinsFromContent.js";
import { yieldToMain } from "../fpSession/yieldToMain.js";

const FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M = 1.5;
/**
 * Content-authored decor/walls should preserve editor placement exactly, including flush placement
 * against windowed exterior faces. Keep the strict hull as a hard stop, but do not reserve extra
 * inset inside it.
 */
const AUTHORING_DECOR_BOUNDARY_SLACK_M = 0;
const _decorCenterBoundsScratch = new THREE.Box3();
const _decorCenterWorldScratch = new THREE.Vector3();
const _decorCenterLocalScratch = new THREE.Vector3();

type VisibleDecorPlacement = {
  renderKey: string;
  decorId: bigint | null;
  unit: ApartmentUnit;
  modelRelPath: string;
  posX: number;
  posY: number;
  posZ: number;
  yawRad: number;
  pitchRad: number;
  uniformScale: number;
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
    const dbRows = dbRowsByUnitKey.get(unit.unitKey);
    if (dbRows && dbRows.length > 0) {
      dbRows.sort((a, b) => Number(a.decorId - b.decorId));
      for (const decor of dbRows) {
        out.push({
          renderKey: `db:${decor.decorId.toString()}`,
          decorId: decor.decorId,
          unit,
          modelRelPath: decor.modelRelPath,
          posX: decor.posX,
          posY: decor.posY,
          posZ: decor.posZ,
          yawRad: decor.yawRad,
          pitchRad: decor.pitchRad,
          uniformScale: decor.uniformScale,
          source: "db",
        });
      }
      continue;
    }

    for (const decor of resolveApartmentDecorPoses(unit, builtinsFromContent)) {
      out.push({
        renderKey: `content:${unit.unitKey}:${decor.id}`,
        decorId: null,
        unit,
        modelRelPath: decor.modelRelPath,
        posX: decor.x,
        posY: decor.y,
        posZ: decor.z,
        yawRad: decor.yaw,
        pitchRad: decor.pitch,
        uniformScale: decor.uniformScale,
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
      });
    }
  }
  return out;
}

type AuthoringBuildEntry =
  | { kind: "decor"; decor: VisibleDecorPlacement }
  | { kind: "wall"; wall: VisibleWallPlacement };

function compareAuthoringBuildEntries(a: AuthoringBuildEntry, b: AuthoringBuildEntry): number {
  const ka = a.kind === "decor" ? a.decor.renderKey : a.wall.renderKey;
  const kb = b.kind === "decor" ? b.decor.renderKey : b.wall.renderKey;
  return ka.localeCompare(kb);
}

export type MountFpApartmentDecorMeshesResult = {
  dispose: () => void;
  syncVisibility: (camera: THREE.PerspectiveCamera, allowDemand?: boolean) => void;
  getDecorObject: (decorId: bigint) => THREE.Object3D | undefined;
};

export function mountFpApartmentDecorMeshes(opts: {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  onRebuilt?: () => void;
}): MountFpApartmentDecorMeshesResult {
  const root = new THREE.Group();
  root.name = "apartment_unit_decor_root";
  root.userData.mammothApartmentFurnitureProp = true;
  opts.buildingRoot.add(root);

  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();
  const templateByUrl = new Map<string, THREE.Object3D>();
  const groupByRenderKey = new Map<string, THREE.Group>();
  const groupByDecorId = new Map<bigint, THREE.Group>();
  const _decorBoundsScratch = new THREE.Box3();
  const _decorSizeScratch = new THREE.Vector3();
  const _decorCenterScratch = new THREE.Vector3();

  let disposed = false;
  let buildEpoch = 0;
  let buildRaf = 0;

  const disposeGroupDeep = (g: THREE.Group) => {
    g.traverse((ch) => {
      if (!(ch instanceof THREE.Mesh)) return;
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

  const clearAll = () => {
    for (const g of groupByRenderKey.values()) disposeGroupDeep(g);
    groupByRenderKey.clear();
    groupByDecorId.clear();
  };

  const _furnitureVisibilityViewProjection = new THREE.Matrix4();
  const _furnitureVisibilityFrustum = new THREE.Frustum();

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
    const rows: AuthoringBuildEntry[] = [
      ...decorRows.map((decor) => ({ kind: "decor" as const, decor })),
      ...wallRows.map((wall) => ({ kind: "wall" as const, wall })),
    ].sort(compareAuthoringBuildEntries);
    clearAll();

    for (const entry of rows) {
      await yieldToMain();
      if (disposed || epoch !== buildEpoch) return;

      if (entry.kind === "wall") {
        const w = entry.wall;
        const g = new THREE.Group();
        g.name = `apartment_wall:${w.wallId}`;
        g.userData.mammothApartmentWallAuthoring = true;
        g.userData.mammothApartmentFurnitureProp = true;
        g.userData.mammothApartmentUnitKey = w.unit.unitKey;
        g.userData.mammothPlateLevelIndex = w.unit.level;
        g.position.set(w.posX, w.posY, w.posZ);
        g.rotation.order = "YXZ";
        g.rotation.y = w.yawRad;
        g.rotation.x = w.pitchRad;
        g.rotation.z = 0;

        const geom = new THREE.BoxGeometry(1, 1, 1);
        const mesh = new THREE.Mesh(
          geom,
          new THREE.MeshStandardMaterial({ color: 0xc9c4bc }),
        );
        mesh.scale.set(w.sizeX, w.sizeY, w.sizeZ);
        mesh.position.y = w.sizeY / 2;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        mesh.userData.mammothUnitInterior = true;
        mesh.userData.mammothPlateLevelIndex = w.unit.level;
        g.add(mesh);
        snapCloneBottomToWorldFloor(g, w.posY);
        keepCloneInsideUnitXZ(g, w.unit, {
          insetM: AUTHORING_DECOR_BOUNDARY_SLACK_M,
          fractionMin: OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
          fractionMax: OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
        });
        applyOwnedApartmentWallSurfaceMaterial(mesh, w.material);
        g.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(g);
        bbox.expandByScalar(FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M);
        g.userData.mammothApartmentDecorWorldBounds = bbox;
        tagResidentialUnitInteriorMeshesUnder(g);
        root.add(g);
        groupByRenderKey.set(w.renderKey, g);
        continue;
      }

      const d = entry.decor;

      const url = apartmentDecorFetchPath(d.modelRelPath);
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
      g.userData.mammothApartmentFurnitureProp = true;
      g.userData.mammothPlateLevelIndex = d.unit.level;
      g.position.set(d.posX, d.posY, d.posZ);
      g.rotation.order = "YXZ";
      g.rotation.y = d.yawRad;
      g.rotation.x = d.pitchRad;
      g.rotation.z = 0;
      const us = Number.isFinite(d.uniformScale) && d.uniformScale > 0 ? d.uniformScale : 1;
      g.scale.setScalar(us);

      const vis = template!.clone(true);
      vis.userData.mammothApartmentDecorProp = true;
      vis.userData.mammothApartmentDecorId = d.decorId;
      vis.userData.mammothApartmentUnitKey = d.unit.unitKey;
      vis.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = true;
          o.userData.mammothUnitInterior = true;
          o.userData.mammothPlateLevelIndex = d.unit.level;
        }
      });

      vis.position.set(0, 0, 0);
      vis.rotation.set(0, 0, 0);
      vis.scale.set(1, 1, 1);
      vis.updateMatrixWorld(true);

      g.add(vis);
      if (d.source === "content") {
        centerVisualBoundsOnRoot(g);
      }
      root.add(g);
      g.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(g);
      bbox.expandByScalar(FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M);
      g.userData.mammothApartmentDecorWorldBounds = bbox;
      tagResidentialUnitInteriorMeshesUnder(g);

      groupByRenderKey.set(d.renderKey, g);
      if (d.decorId !== null) groupByDecorId.set(d.decorId, g);
    }

    opts.buildingRoot.updateMatrixWorld(true);
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
    syncVisibility: (camera, allowDemand = true) => {
      camera.updateMatrixWorld();
      _furnitureVisibilityViewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      _furnitureVisibilityFrustum.setFromProjectionMatrix(_furnitureVisibilityViewProjection);
      for (const g of groupByRenderKey.values()) {
        if (!allowDemand) {
          g.visible = false;
          continue;
        }
        const bb = g.userData.mammothApartmentDecorWorldBounds;
        g.visible =
          bb instanceof THREE.Box3 ? _furnitureVisibilityFrustum.intersectsBox(bb) : true;
      }
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
      opts.buildingRoot.remove(root);
    },
  };
}
