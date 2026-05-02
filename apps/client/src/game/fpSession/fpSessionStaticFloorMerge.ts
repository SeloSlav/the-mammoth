import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  cloneGeometryForMerge,
  mergeGroupDescendantsByMaterial,
} from "./fpMergeGroupDescendantsByMaterial.js";

/** Scratch for {@link mergeUnitPreservedShellsByPlacedObject} (avoid alloc per mesh). */
const _mergeUnitShellScratch = new THREE.Matrix4();

/**
 * For each static geometry group that is a direct child of `buildingRoot`,
 * collapse all descendant meshes that share the same material into a single merged `Mesh`.
 *
 * Covers:
 *
 * 1. **Floor plates** (`mammothPlateLevelIndex`) — merges per-floor static geometry into ~one mesh/material.
 *
 * 2. **Stair shaft columns** (`mammothStairColumnRoot`; each segment keeps `mammothPlateLevelIndex`) —
 *    merges per-storey segments so FP can hide off-band storeys.
 *
 * Group nodes stay so floor-plate visibility can toggle segments.
 *
 * Lives here so `scripts/gen-exterior-tree-collision.ts` mirrors FP without importing `fpSessionWorldMount`
 * (that module pulls ez-tree textures and requires `document`).
 */
export function mergeStaticFloorGeometries(buildingRoot: THREE.Group): void {
  buildingRoot.updateMatrixWorld(true);

  for (const child of buildingRoot.children) {
    const isFloorPlate = typeof child.userData.mammothPlateLevelIndex === "number";
    const isStairColumn = child.userData.mammothStairColumnRoot === true;
    if (!isFloorPlate && !isStairColumn) continue;

    // Tag stair interior meshes as unit-interior before merge; `_exterior` skins stay visible from outside.
    if (isStairColumn) {
      for (const seg of (child as THREE.Group).children) {
        seg.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (obj.name.includes("_exterior")) return;
          obj.userData.mammothUnitInterior = true;
        });
        mergeGroupDescendantsByMaterial(seg as THREE.Group);
      }
      continue;
    }

    mergeGroupDescendantsByMaterial(child as THREE.Group);
    if (isFloorPlate) mergeUnitPreservedShellsByPlacedObject(child as THREE.Group);
  }
}

function mergeUnitPreservedShellsByPlacedObject(floorPlateGroup: THREE.Group): void {
  floorPlateGroup.updateMatrixWorld(true);
  const floorInv = new THREE.Matrix4().copy(floorPlateGroup.matrixWorld).invert();

  const placedIds = new Set<string>();
  for (const ch of floorPlateGroup.children) {
    if (!(ch instanceof THREE.Mesh)) continue;
    if (ch.userData.mammothSkipFloorGeometryMerge !== true) continue;
    const pid = ch.userData.mammothPlacedObjectId;
    if (typeof pid === "string") placedIds.add(pid);
  }

  for (const placedObjectId of placedIds) {
    const meshes = floorPlateGroup.children.filter(
      (ch): ch is THREE.Mesh =>
        ch instanceof THREE.Mesh &&
        ch.userData.mammothSkipFloorGeometryMerge === true &&
        ch.userData.mammothPlacedObjectId === placedObjectId,
    );

    const byMat = new Map<string, { mat: THREE.Material; list: THREE.Mesh[] }>();
    for (const m of meshes) {
      if (Array.isArray(m.material)) continue;
      const mat = m.material as THREE.Material;
      const key = mat.uuid;
      let bucket = byMat.get(key);
      if (!bucket) {
        bucket = { mat, list: [] };
        byMat.set(key, bucket);
      }
      bucket.list.push(m);
    }

    for (const { mat, list } of byMat.values()) {
      if (list.length <= 1) continue;
      const geos: THREE.BufferGeometry[] = [];
      for (const m of list) {
        m.updateWorldMatrix(true, false);
        _mergeUnitShellScratch.multiplyMatrices(floorInv, m.matrixWorld);
        const g = cloneGeometryForMerge(
          m.geometry as THREE.BufferGeometry,
          _mergeUnitShellScratch,
        );
        geos.push(g);
      }
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      // If merge fails, keep originals — otherwise the apartment shell vanishes (only glass remains).
      if (!merged) continue;
      for (const m of list) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      // Separate culling volumes; corridor-wide frustum hits would submit every shell otherwise.
      mesh.frustumCulled = true;
      mesh.userData.mammothPlacedObjectId = placedObjectId;
      mesh.userData.mammothUnitInterior = true;
      mesh.name = `merged_unit_shell:${placedObjectId}`;
      floorPlateGroup.add(mesh);
    }
  }
}
