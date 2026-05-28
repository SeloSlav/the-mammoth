import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Scratch for {@link reattachPreservedMeshesWithSavedWorld} (avoid alloc per mesh). */
const _mergePreserveParentInv = new THREE.Matrix4();
const _mergePreserveLocal = new THREE.Matrix4();
/** Scratch for world→group-local transform when cloning mesh geometry during merge gather. */
const _mergeGatherLocal = new THREE.Matrix4();

/** Façade glass preserved through floor merge — thin N/S corner panels must stay drawable at auth orbit. */
export function isExteriorWindowGlassPreservedMesh(mesh: THREE.Mesh): boolean {
  return (
    mesh.userData.mammothResidentialUnitExteriorGlass === true ||
    mesh.name.startsWith("unit_exterior_glass_")
  );
}

type MergeBucket = {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  isInterior: boolean;
  genericInteriorVisibleInResidentialUnit: boolean;
  corridorHallwayShell: boolean;
};

function mergeBucketKey(material: THREE.Material, mesh: THREE.Mesh): string {
  const isInterior = mesh.userData.mammothUnitInterior === true ? 1 : 0;
  const genericInteriorVisibleInResidentialUnit =
    mesh.userData.mammothGenericInteriorVisibleInResidentialUnit === true ? 1 : 0;
  const corridorHallwayShell = mesh.userData.mammothCorridorHallwayShell === true ? 1 : 0;
  return `${material.uuid}|interior:${isInterior}|genericInUnit:${genericInteriorVisibleInResidentialUnit}|hallwaySlab:${corridorHallwayShell}`;
}

function createMergeBucket(material: THREE.Material, mesh: THREE.Mesh): MergeBucket {
  return {
    mat: material,
    geos: [],
    isInterior: mesh.userData.mammothUnitInterior === true,
    genericInteriorVisibleInResidentialUnit:
      mesh.userData.mammothGenericInteriorVisibleInResidentialUnit === true,
    corridorHallwayShell: mesh.userData.mammothCorridorHallwayShell === true,
  };
}

function absorbMergeMeshFlags(bucket: MergeBucket, mesh: THREE.Mesh): void {
  if (mesh.userData.mammothUnitInterior === true) bucket.isInterior = true;
  if (mesh.userData.mammothGenericInteriorVisibleInResidentialUnit === true) {
    bucket.genericInteriorVisibleInResidentialUnit = true;
  }
  if (mesh.userData.mammothCorridorHallwayShell === true) bucket.corridorHallwayShell = true;
}

function applyMergedUserData(mesh: THREE.Mesh, bucket: MergeBucket): void {
  if (bucket.isInterior) mesh.userData.mammothUnitInterior = true;
  if (bucket.genericInteriorVisibleInResidentialUnit) {
    mesh.userData.mammothGenericInteriorVisibleInResidentialUnit = true;
  }
  if (bucket.corridorHallwayShell) mesh.userData.mammothCorridorHallwayShell = true;
}

/**
 * `BufferGeometryUtils.mergeGeometries()` requires every geometry in a batch to agree on indexed vs
 * non-indexed layout. Normalize every merge input to **non-indexed** after cloning.
 */
export function cloneGeometryForMerge(
  geometry: THREE.BufferGeometry,
  transform?: THREE.Matrix4,
): THREE.BufferGeometry {
  let g = geometry.clone();
  if (g.index) {
    const nonIndexed = g.toNonIndexed();
    g.dispose();
    g = nonIndexed;
  }
  if (transform) g.applyMatrix4(transform);
  return g;
}

/** Merge one material bucket, or keep separate meshes when mergeGeometries rejects the batch. */
function addMergedOrFallbackMeshes(group: THREE.Group, bucket: MergeBucket): void {
  const { mat, geos } = bucket;
  const merged = mergeGeometries(geos, false);
  if (merged) {
    for (const g of geos) g.dispose();
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = true;
    applyMergedUserData(mesh, bucket);
    group.add(mesh);
    return;
  }
  for (const geo of geos) {
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = true;
    applyMergedUserData(mesh, bucket);
    group.add(mesh);
  }
}

/**
 * Merge all descendant `Mesh` objects inside `group` by material, replacing the group's full
 * subtree with one merged `Mesh` per unique material (plus any preserved meshes reattached).
 * All geometry is transformed to group-local space before merging.
 */
export function mergeGroupDescendantsByMaterial(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const groupWorldInv = new THREE.Matrix4().copy(group.matrixWorld).invert();

  const preserveMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothSkipFloorGeometryMerge === true) preserveMeshes.push(obj);
    /** GLTF multi-material slots need separate draws; skip merge for those meshes. */
    else if (Array.isArray(obj.material)) preserveMeshes.push(obj);
  });

  const preserveWorld = new Map<THREE.Mesh, THREE.Matrix4>();
  for (const m of preserveMeshes) {
    m.updateMatrixWorld(true);
    preserveWorld.set(m, m.matrixWorld.clone());
    m.removeFromParent();
  }

  const geosByMat = new Map<string, MergeBucket>();

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material as THREE.Material;
    obj.updateWorldMatrix(true, false);
    _mergeGatherLocal.multiplyMatrices(groupWorldInv, obj.matrixWorld);
    const geo = cloneGeometryForMerge(
      obj.geometry as THREE.BufferGeometry,
      _mergeGatherLocal,
    );
    const key = mergeBucketKey(material, obj);
    let bucket = geosByMat.get(key);
    if (!bucket) {
      bucket = createMergeBucket(material, obj);
      geosByMat.set(key, bucket);
    }
    absorbMergeMeshFlags(bucket, obj);
    bucket.geos.push(geo);
  });

  if (geosByMat.size === 0) {
    if (preserveMeshes.length === 0) return;
    while (group.children.length > 0) {
      group.remove(group.children[0]!);
    }
    reattachPreservedMeshesWithSavedWorld(group, preserveMeshes, preserveWorld);
    return;
  }

  while (group.children.length > 0) {
    group.remove(group.children[0]!);
  }

  for (const bucket of geosByMat.values()) {
    addMergedOrFallbackMeshes(group, bucket);
  }

  reattachPreservedMeshesWithSavedWorld(group, preserveMeshes, preserveWorld);
}

/**
 * Like {@link mergeGroupDescendantsByMaterial}, but awaits `yieldToMain()` after each merged material
 * batch so large plates / stair stacks do not monopolize one long browser task during login prefetch.
 */
export async function mergeGroupDescendantsByMaterialYielding(
  group: THREE.Group,
  yieldToMain: () => Promise<void>,
): Promise<void> {
  group.updateMatrixWorld(true);
  const groupWorldInv = new THREE.Matrix4().copy(group.matrixWorld).invert();

  const preserveMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothSkipFloorGeometryMerge === true) preserveMeshes.push(obj);
    else if (Array.isArray(obj.material)) preserveMeshes.push(obj);
  });

  const preserveWorld = new Map<THREE.Mesh, THREE.Matrix4>();
  for (const m of preserveMeshes) {
    m.updateMatrixWorld(true);
    preserveWorld.set(m, m.matrixWorld.clone());
    m.removeFromParent();
  }

  const mergeMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothSkipFloorGeometryMerge === true) return;
    if (Array.isArray(obj.material)) return;
    mergeMeshes.push(obj);
  });

  const geosByMat = new Map<string, MergeBucket>();

  const GATHER_BATCH = 72;
  for (let i = 0; i < mergeMeshes.length; i += GATHER_BATCH) {
    const end = Math.min(i + GATHER_BATCH, mergeMeshes.length);
    for (let j = i; j < end; j++) {
      const obj = mergeMeshes[j]!;
      const material = obj.material as THREE.Material;
      obj.updateWorldMatrix(true, false);
      _mergeGatherLocal.multiplyMatrices(groupWorldInv, obj.matrixWorld);
      const geo = cloneGeometryForMerge(
        obj.geometry as THREE.BufferGeometry,
        _mergeGatherLocal,
      );
      const key = mergeBucketKey(material, obj);
      let bucket = geosByMat.get(key);
      if (!bucket) {
        bucket = createMergeBucket(material, obj);
        geosByMat.set(key, bucket);
      }
      absorbMergeMeshFlags(bucket, obj);
      bucket.geos.push(geo);
    }
    if (end < mergeMeshes.length) await yieldToMain();
  }

  if (geosByMat.size === 0) {
    if (preserveMeshes.length === 0) return;
    while (group.children.length > 0) {
      group.remove(group.children[0]!);
    }
    reattachPreservedMeshesWithSavedWorld(group, preserveMeshes, preserveWorld);
    return;
  }

  while (group.children.length > 0) {
    group.remove(group.children[0]!);
  }

  for (const bucket of geosByMat.values()) {
    addMergedOrFallbackMeshes(group, bucket);
    await yieldToMain();
  }

  reattachPreservedMeshesWithSavedWorld(group, preserveMeshes, preserveWorld);
}

function reattachPreservedMeshesWithSavedWorld(
  group: THREE.Group,
  preserveMeshes: THREE.Mesh[],
  preserveWorld: Map<THREE.Mesh, THREE.Matrix4>,
): void {
  group.updateMatrixWorld(true);
  for (const m of preserveMeshes) {
    const world = preserveWorld.get(m);
    if (!world) continue;
    group.add(m);
    _mergePreserveParentInv.copy(group.matrixWorld).invert();
    _mergePreserveLocal.multiplyMatrices(_mergePreserveParentInv, world);
    _mergePreserveLocal.decompose(m.position, m.quaternion, m.scale);
    m.updateMatrix();
    /**
     * All preserved hoistway shells (inner + facade skins) — same failure mode as unit hollow shells:
     * sphere/frustum intersection misses when the eye sits inside the shaft volume and pitches up.
     * Previously only `_exterior` skins disabled culling, which hid inner concrete when looking up
     * the stack (doors from `FpElevatorShaftVisual` stayed on a separate root).
     */
    const isShaftHoistwayPreservedMesh =
      m.name.startsWith("shaft_wall_") ||
      m.name.startsWith("shaft_hoistway_lintel_") ||
      m.name === "shaft_floor" ||
      m.name === "shaft_ceiling";
    m.frustumCulled = !(
      isShaftHoistwayPreservedMesh || isExteriorWindowGlassPreservedMesh(m)
    );
  }
}
