import * as THREE from "three";
import type { DroppedItem } from "../../module_bindings/types";
import type { DropMeshLayer } from "./droppedItemWorldMesh.js";

const _dropInstPos = new THREE.Matrix4();
const _dropInstYaw = new THREE.Matrix4();
const _dropInstOut = new THREE.Matrix4();
const _swapMatrix = new THREE.Matrix4();

export function composeDropInstanceMatrix(
  row: DroppedItem,
  localMatrix: THREE.Matrix4,
  out: THREE.Matrix4,
): THREE.Matrix4 {
  _dropInstPos.makeTranslation(row.x, row.y, row.z);
  _dropInstYaw.makeRotationY(row.yaw);
  out.multiplyMatrices(_dropInstPos, _dropInstYaw);
  out.multiply(localMatrix);
  return out;
}

function detachInstancedMesh(inst: THREE.InstancedMesh): void {
  inst.removeFromParent();
}

function resizeInstancedMesh(
  parent: THREE.Object3D,
  prev: THREE.InstancedMesh | null,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  needed: number,
  name: string,
): { mesh: THREE.InstancedMesh; capacity: number } {
  const capacity = Math.max(needed, prev ? prev.instanceMatrix.count : 0, 8);
  if (
    prev &&
    prev.instanceMatrix.count >= needed &&
    prev.geometry === geometry &&
    prev.material === material
  ) {
    prev.count = needed;
    prev.visible = needed > 0;
    return { mesh: prev, capacity: prev.instanceMatrix.count };
  }
  if (prev) {
    detachInstancedMesh(prev);
  }
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = needed;
  mesh.visible = needed > 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  parent.add(mesh);
  return { mesh, capacity };
}

export type DefInstancedPool = {
  layers: DropMeshLayer[];
  meshes: THREE.InstancedMesh[];
  capacity: number;
  rows: DroppedItem[];
  rowKeys: string[];
  slotByKey: Map<string, number>;
};

export type FallbackInstancedPool = {
  mesh: THREE.InstancedMesh;
  capacity: number;
  rows: DroppedItem[];
  rowKeys: string[];
  slotByKey: Map<string, number>;
};

function writeRowMatrices(pool: DefInstancedPool, slot: number, row: DroppedItem): void {
  for (let li = 0; li < pool.layers.length; li++) {
    const layer = pool.layers[li]!;
    const mesh = pool.meshes[li];
    if (!mesh) continue;
    composeDropInstanceMatrix(row, layer.localMatrix, _dropInstOut);
    mesh.setMatrixAt(slot, _dropInstOut);
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function ensureDefPoolCapacity(
  root: THREE.Object3D,
  pool: DefInstancedPool,
  defId: string,
  needed: number,
): void {
  for (let li = 0; li < pool.layers.length; li++) {
    const layer = pool.layers[li]!;
    const prev = pool.meshes[li] ?? null;
    const resized = resizeInstancedMesh(
      root,
      prev,
      layer.geometry,
      layer.material,
      needed,
      `drop_inst:${defId}:${li}`,
    );
    pool.meshes[li] = resized.mesh;
    pool.capacity = resized.capacity;
  }
}

export function createDefInstancedPool(layers: DropMeshLayer[]): DefInstancedPool {
  return {
    layers,
    meshes: [],
    capacity: 0,
    rows: [],
    rowKeys: [],
    slotByKey: new Map(),
  };
}

export function createFallbackPool(mesh: THREE.InstancedMesh, capacity: number): FallbackInstancedPool {
  return {
    mesh,
    capacity,
    rows: [],
    rowKeys: [],
    slotByKey: new Map(),
  };
}

export function clearDefInstancedPool(pool: DefInstancedPool): void {
  for (const mesh of pool.meshes) {
    mesh.count = 0;
    mesh.visible = false;
  }
  pool.rows.length = 0;
  pool.rowKeys.length = 0;
  pool.slotByKey.clear();
}

export function clearFallbackPool(pool: FallbackInstancedPool): void {
  pool.mesh.count = 0;
  pool.mesh.visible = false;
  pool.rows.length = 0;
  pool.rowKeys.length = 0;
  pool.slotByKey.clear();
}

export function addRowToDefPool(
  root: THREE.Object3D,
  pool: DefInstancedPool,
  defId: string,
  rowKey: string,
  row: DroppedItem,
): void {
  if (pool.slotByKey.has(rowKey)) return;
  const slot = pool.rows.length;
  pool.rows.push(row);
  pool.rowKeys.push(rowKey);
  pool.slotByKey.set(rowKey, slot);
  ensureDefPoolCapacity(root, pool, defId, slot + 1);
  writeRowMatrices(pool, slot, row);
  for (const mesh of pool.meshes) {
    mesh.count = pool.rows.length;
    mesh.visible = pool.rows.length > 0;
  }
}

export function removeRowFromDefPool(pool: DefInstancedPool, rowKey: string): void {
  const slot = pool.slotByKey.get(rowKey);
  if (slot === undefined) return;
  const last = pool.rows.length - 1;
  if (slot !== last) {
    const movedRow = pool.rows[last]!;
    const movedKey = pool.rowKeys[last]!;
    pool.rows[slot] = movedRow;
    pool.rowKeys[slot] = movedKey;
    pool.slotByKey.set(movedKey, slot);
    writeRowMatrices(pool, slot, movedRow);
  }
  pool.rows.pop();
  pool.rowKeys.pop();
  pool.slotByKey.delete(rowKey);
  const count = pool.rows.length;
  for (const mesh of pool.meshes) {
    mesh.count = count;
    mesh.visible = count > 0;
  }
}

export function rebuildDefPoolFromRows(
  root: THREE.Object3D,
  pool: DefInstancedPool,
  defId: string,
  rows: readonly DroppedItem[],
  rowKeys: readonly string[],
): void {
  clearDefInstancedPool(pool);
  if (rows.length === 0) return;
  ensureDefPoolCapacity(root, pool, defId, rows.length);
  for (let i = 0; i < rows.length; i++) {
    pool.rows.push(rows[i]!);
    pool.rowKeys.push(rowKeys[i]!);
    pool.slotByKey.set(rowKeys[i]!, i);
    writeRowMatrices(pool, i, rows[i]!);
  }
  for (const mesh of pool.meshes) {
    mesh.count = rows.length;
    mesh.visible = rows.length > 0;
  }
}

export function addRowToFallbackPool(
  root: THREE.Object3D,
  pool: FallbackInstancedPool,
  rowKey: string,
  row: DroppedItem,
  localMatrix: THREE.Matrix4,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): void {
  if (pool.slotByKey.has(rowKey)) return;
  const slot = pool.rows.length;
  const needed = slot + 1;
  const resized = resizeInstancedMesh(root, pool.mesh, geometry, material, needed, "drop_inst:fallback");
  pool.mesh = resized.mesh;
  pool.capacity = resized.capacity;
  pool.rows.push(row);
  pool.rowKeys.push(rowKey);
  pool.slotByKey.set(rowKey, slot);
  composeDropInstanceMatrix(row, localMatrix, _dropInstOut);
  pool.mesh.setMatrixAt(slot, _dropInstOut);
  pool.mesh.instanceMatrix.needsUpdate = true;
  pool.mesh.count = needed;
  pool.mesh.visible = true;
}

export function removeRowFromFallbackPool(pool: FallbackInstancedPool, rowKey: string): void {
  const slot = pool.slotByKey.get(rowKey);
  if (slot === undefined) return;
  const last = pool.rows.length - 1;
  if (slot !== last) {
    const movedRow = pool.rows[last]!;
    const movedKey = pool.rowKeys[last]!;
    pool.rows[slot] = movedRow;
    pool.rowKeys[slot] = movedKey;
    pool.slotByKey.set(movedKey, slot);
    pool.mesh.getMatrixAt(last, _swapMatrix);
    pool.mesh.setMatrixAt(slot, _swapMatrix);
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
  pool.rows.pop();
  pool.rowKeys.pop();
  pool.slotByKey.delete(rowKey);
  pool.mesh.count = pool.rows.length;
  pool.mesh.visible = pool.rows.length > 0;
}

export function rebuildFallbackPoolFromRows(
  root: THREE.Object3D,
  pool: FallbackInstancedPool,
  rows: readonly DroppedItem[],
  rowKeys: readonly string[],
  localMatrixForRow: (row: DroppedItem) => THREE.Matrix4,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): void {
  clearFallbackPool(pool);
  if (rows.length === 0) return;
  const resized = resizeInstancedMesh(root, pool.mesh, geometry, material, rows.length, "drop_inst:fallback");
  pool.mesh = resized.mesh;
  pool.capacity = resized.capacity;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    pool.rows.push(row);
    pool.rowKeys.push(rowKeys[i]!);
    pool.slotByKey.set(rowKeys[i]!, i);
    composeDropInstanceMatrix(row, localMatrixForRow(row), _dropInstOut);
    pool.mesh.setMatrixAt(i, _dropInstOut);
  }
  pool.mesh.instanceMatrix.needsUpdate = true;
  pool.mesh.count = rows.length;
  pool.mesh.visible = true;
}

export function disposeDefInstancedPools(pools: Iterable<DefInstancedPool>): void {
  for (const pool of pools) {
    for (const mesh of pool.meshes) {
      detachInstancedMesh(mesh);
    }
  }
}

export function detachFallbackMesh(pool: FallbackInstancedPool | null): void {
  if (pool?.mesh) detachInstancedMesh(pool.mesh);
}
