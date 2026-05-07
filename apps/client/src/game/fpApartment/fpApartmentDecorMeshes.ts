/**
 * Replica-driven GLB placements for `/static/models/**` authored via `add_apartment_unit_decor`.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { DbConnection } from "../../module_bindings";
import type { ApartmentUnit, ApartmentUnitDecor } from "../../module_bindings/types";
import {
  apartmentUnitOwnerEqual,
  residentInteriorPropsVisibleForViewer,
} from "./fpApartmentGameplay.js";
import { yieldToMain } from "../fpSession/yieldToMain.js";

export function apartmentDecorFetchPath(modelRelPath: string): string {
  const t = modelRelPath.trim().replace(/^\/+/, "");
  const q = t.startsWith("static/models/") ? t : `static/models/${t}`;
  return `/${q}`;
}

function apartmentUnitByKey(conn: DbConnection, unitKey: string): ApartmentUnit | null {
  for (const row of conn.db.apartment_unit) {
    if (row.unitKey === unitKey) return row as ApartmentUnit;
  }
  return null;
}

function visibleDecorRows(conn: DbConnection): ApartmentUnitDecor[] {
  const out: ApartmentUnitDecor[] = [];
  for (const row of conn.db.apartment_unit_decor) {
    const d = row as ApartmentUnitDecor;
    const unit = apartmentUnitByKey(conn, d.unitKey);
    if (!unit || !residentInteriorPropsVisibleForViewer(conn, unit)) continue;
    out.push(d);
  }
  return out;
}

const FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M = 1.5;

export type MountFpApartmentDecorMeshesResult = {
  dispose: () => void;
  syncVisibility: (camera: THREE.PerspectiveCamera, allowDemand?: boolean) => void;
  getDecorObject: (decorId: bigint) => THREE.Object3D | undefined;
};

export function mountFpApartmentDecorMeshes(opts: {
  conn: DbConnection;
  buildingRoot: THREE.Group;
}): MountFpApartmentDecorMeshesResult {
  const root = new THREE.Group();
  root.name = "apartment_unit_decor_root";
  root.userData.mammothApartmentFurnitureProp = true;
  opts.buildingRoot.add(root);

  const loader = new GLTFLoader();
  const templateByUrl = new Map<string, THREE.Object3D>();
  const groupByDecorId = new Map<bigint, THREE.Group>();

  let disposed = false;
  let buildEpoch = 0;
  let buildRaf = 0;

  const disposeGroupDeep = (g: THREE.Group) => {
    g.traverse((ch) => {
      if (!(ch instanceof THREE.Mesh)) return;
      if (ch.geometry) ch.geometry.dispose();
    });
    g.clear();
    root.remove(g);
  };

  const clearAll = () => {
    for (const g of groupByDecorId.values()) disposeGroupDeep(g);
    groupByDecorId.clear();
  };

  const _furnitureVisibilityViewProjection = new THREE.Matrix4();
  const _furnitureVisibilityFrustum = new THREE.Frustum();

  async function runFullRebuild(epoch: number): Promise<void> {
    await yieldToMain();
    if (disposed || epoch !== buildEpoch) return;

    const rows = visibleDecorRows(opts.conn).sort((a, b) => Number(a.decorId - b.decorId));
    clearAll();

    for (const d of rows) {
      await yieldToMain();
      if (disposed || epoch !== buildEpoch) return;

      const url = apartmentDecorFetchPath(d.modelRelPath);
      let template = templateByUrl.get(url);
      if (!template) {
        try {
          const gltf = await loader.loadAsync(url);
          if (disposed || epoch !== buildEpoch) return;
          template = gltf.scene;
          template.userData.mammothApartmentDecorTemplate = url;
          templateByUrl.set(url, template);
        } catch {
          console.warn("[mountFpApartmentDecorMeshes] failed to load decor glb", url);
          continue;
        }
      }
      if (disposed || epoch !== buildEpoch) return;

      const g = new THREE.Group();
      g.name = `apartment_decor:${d.decorId.toString()}`;
      g.userData.mammothApartmentDecorProp = true;
      g.userData.mammothApartmentDecorId = d.decorId;
      g.userData.mammothApartmentUnitKey = d.unitKey;
      g.position.set(d.posX, d.posY, d.posZ);
      g.rotation.y = d.yawRad;
      const us = Number.isFinite(d.uniformScale) && d.uniformScale > 0 ? d.uniformScale : 1;
      g.scale.setScalar(us);

      const vis = template!.clone(true);
      vis.userData.mammothApartmentDecorProp = true;
      vis.userData.mammothApartmentDecorId = d.decorId;
      vis.userData.mammothApartmentUnitKey = d.unitKey;
      vis.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = true;
        }
      });

      vis.position.set(0, 0, 0);
      vis.rotation.set(0, 0, 0);
      vis.scale.set(1, 1, 1);
      vis.updateMatrixWorld(true);

      g.add(vis);
      root.add(g);
      g.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(g);
      bbox.expandByScalar(FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M);
      g.userData.mammothApartmentDecorWorldBounds = bbox;

      groupByDecorId.set(d.decorId, g);
    }

    opts.buildingRoot.updateMatrixWorld(true);
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
      for (const g of groupByDecorId.values()) {
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
