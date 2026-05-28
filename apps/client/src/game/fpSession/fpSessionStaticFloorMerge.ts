import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  cloneGeometryForMerge,
  isExteriorWindowGlassPreservedMesh,
  mergeGroupDescendantsByMaterial,
  mergeGroupDescendantsByMaterialYielding,
} from "./fpMergeGroupDescendantsByMaterial.js";

/** Per-plate / stair-column root — skips duplicate merges during incremental auth builds + final pass. */
export const MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD = "mammothStaticFloorMergeComplete" as const;

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
 */
function mergeStaticFloorDirectChild(child: THREE.Object3D): void {
  if (child.userData[MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD] === true) return;

  const isFloorPlate = typeof child.userData.mammothPlateLevelIndex === "number";
  const isStairColumn = child.userData.mammothStairColumnRoot === true;
  if (!isFloorPlate && !isStairColumn) return;

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
    child.userData[MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD] = true;
    return;
  }

  mergeGroupDescendantsByMaterial(child as THREE.Group);
  if (isFloorPlate) mergeUnitPreservedShellsByPlacedObject(child as THREE.Group);
  child.userData[MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD] = true;
}

async function mergeStaticFloorDirectChildYielding(
  child: THREE.Object3D,
  yieldToMain: () => Promise<void>,
): Promise<void> {
  if (child.userData[MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD] === true) return;

  const isFloorPlate = typeof child.userData.mammothPlateLevelIndex === "number";
  const isStairColumn = child.userData.mammothStairColumnRoot === true;
  if (!isFloorPlate && !isStairColumn) return;

  if (isStairColumn) {
    let stairSegDone = 0;
    for (const seg of (child as THREE.Group).children) {
      seg.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.name.includes("_exterior")) return;
        obj.userData.mammothUnitInterior = true;
      });
      await mergeGroupDescendantsByMaterialYielding(seg as THREE.Group, yieldToMain);
      stairSegDone++;
      /** Inner merge yields often; breathe between shaft segments ~every 5 storeys — avoid timer storms on ≥3 columns. */
      if (stairSegDone % 5 === 0) await yieldToMain();
    }
    child.userData[MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD] = true;
    return;
  }

  await mergeGroupDescendantsByMaterialYielding(child as THREE.Group, yieldToMain);
  if (isFloorPlate) {
    await mergeUnitPreservedShellsByPlacedObjectYielding(child as THREE.Group, yieldToMain);
  }
  child.userData[MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD] = true;
}

/** Merge one newly authored floor plate or stair column root — called incrementally during async stack build. */
export async function mergeMegablockStaticDirectChildYielding(
  child: THREE.Object3D,
  yieldToMain: () => Promise<void>,
): Promise<void> {
  await mergeStaticFloorDirectChildYielding(child, yieldToMain);
}

export function mergeStaticFloorGeometries(buildingRoot: THREE.Group): void {
  buildingRoot.updateMatrixWorld(true);

  for (const child of buildingRoot.children) {
    mergeStaticFloorDirectChild(child);
  }
}

/**
 * Same merges as {@link mergeStaticFloorGeometries}, split across awaits so one floor column / stair
 * root merge does not create a multi-second-long main-thread task during login.
 *
 * Visits **lowest {@link userData.mammothPlateLevelIndex} first**, stair shafts **last**. Floor plates
 * merged incrementally during async stack builds are skipped via {@link MAMMOTH_STATIC_FLOOR_MERGE_COMPLETE_UD}.
 */
export async function mergeStaticFloorGeometriesYielding(
  buildingRoot: THREE.Group,
  yieldToMain: () => Promise<void>,
): Promise<void> {
  buildingRoot.updateMatrixWorld(true);
  const tops = [...buildingRoot.children].sort((a, b) => {
    const stairA = a.userData.mammothStairColumnRoot === true;
    const stairB = b.userData.mammothStairColumnRoot === true;
    if (stairA !== stairB) return stairA ? 1 : -1;
    const la =
      typeof a.userData.mammothPlateLevelIndex === "number"
        ? (a.userData.mammothPlateLevelIndex as number)
        : 0;
    const lb =
      typeof b.userData.mammothPlateLevelIndex === "number"
        ? (b.userData.mammothPlateLevelIndex as number)
        : 0;
    return la - lb;
  });
  for (const child of tops) {
    await mergeStaticFloorDirectChildYielding(child, yieldToMain);
    await yieldToMain();
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
      if (list.length <= 1) {
        const solo = list[0];
        if (solo && isExteriorWindowGlassPreservedMesh(solo)) {
          solo.frustumCulled = false;
        }
        continue;
      }
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
      const allExteriorWindowGlass = list.every(isExteriorWindowGlassPreservedMesh);
      for (const m of list) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      // Thin N/S corner panels sit on end caps — keep them drawable at auth orbit distance.
      mesh.frustumCulled = !allExteriorWindowGlass;
      mesh.userData.mammothPlacedObjectId = placedObjectId;
      mesh.userData.mammothUnitInterior = true;
      if (allExteriorWindowGlass) {
        mesh.userData.mammothResidentialUnitExteriorGlass = true;
      }
      mesh.name = `merged_unit_shell:${placedObjectId}`;
      floorPlateGroup.add(mesh);
    }
  }
}

async function mergeUnitPreservedShellsByPlacedObjectYielding(
  floorPlateGroup: THREE.Group,
  yieldToMain: () => Promise<void>,
): Promise<void> {
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
      if (list.length <= 1) {
        const solo = list[0];
        if (solo && isExteriorWindowGlassPreservedMesh(solo)) {
          solo.frustumCulled = false;
        }
        continue;
      }
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
      if (!merged) continue;
      const allExteriorWindowGlass = list.every(isExteriorWindowGlassPreservedMesh);
      for (const m of list) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.frustumCulled = !allExteriorWindowGlass;
      mesh.userData.mammothPlacedObjectId = placedObjectId;
      mesh.userData.mammothUnitInterior = true;
      if (allExteriorWindowGlass) {
        mesh.userData.mammothResidentialUnitExteriorGlass = true;
      }
      mesh.name = `merged_unit_shell:${placedObjectId}`;
      floorPlateGroup.add(mesh);
      await yieldToMain();
    }
    await yieldToMain();
  }
}
