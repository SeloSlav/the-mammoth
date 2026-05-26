import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getMammothDroppedWorldTargetMaxDimM } from "@the-mammoth/assets";
import { fitDroppedWorldItemModelToCatalog } from "./droppedItemWorldFit.js";

export type DropMeshLayer = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Mesh transform relative to the catalog-fitted drop anchor (yaw + world position applied per instance). */
  localMatrix: THREE.Matrix4;
};

const _identity = new THREE.Matrix4();

function cloneGeometryForMerge(
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

/** Catalog ids that use lightweight procedural piles instead of full GLB triangle counts. */
const PROCEDURAL_DROP_DEF_IDS = new Set([
  "scrap-metal",
  "pistol",
  "shotgun-coach",
  "crowbar",
  "baseball-bat",
  "knife",
  "ammo-9mm",
  "ammo-shotgun-shell",
  "water-bottle",
  "apple",
  "chemical-stock",
  "fish-filter-sponge",
]);

function addProceduralBox(
  group: THREE.Group,
  material: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  px: number,
  py: number,
  pz: number,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(px, py, pz);
  mesh.rotation.set(rx, ry, rz);
  group.add(mesh);
}

export function buildProceduralDropRoot(defId: string): THREE.Group | null {
  if (!PROCEDURAL_DROP_DEF_IDS.has(defId)) return null;

  const group = new THREE.Group();
  const target = getMammothDroppedWorldTargetMaxDimM(defId);

  if (defId === "scrap-metal") {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6b737c,
      metalness: 0.88,
      roughness: 0.48,
    });
    const s = target * 0.22;
    addProceduralBox(group, mat, s * 1.6, s * 0.55, s * 1.1, 0, s * 0.28, 0, 0, 0.12, 0);
    addProceduralBox(group, mat, s * 1.1, s * 0.42, s * 0.95, s * 0.35, s * 0.12, s * 0.18, 0.08, -0.35, 0.05);
    addProceduralBox(group, mat, s * 0.85, s * 0.36, s * 0.7, -s * 0.28, s * 0.08, -s * 0.12, -0.05, 0.22, -0.08);
    addProceduralBox(group, mat, s * 0.55, s * 0.28, s * 0.48, s * 0.08, s * 0.42, -s * 0.22, 0.15, 0.5, 0);
    return group;
  }

  if (defId === "pistol" || defId === "shotgun-coach") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.72, roughness: 0.38 });
    const long = defId === "shotgun-coach" ? target * 0.92 : target * 0.82;
    const thick = target * 0.22;
    const grip = target * 0.28;
    addProceduralBox(group, mat, long, thick * 0.55, thick * 0.75, 0, thick * 0.35, 0);
    addProceduralBox(group, mat, grip * 0.42, grip, grip * 0.32, -long * 0.28, grip * 0.42, 0, 0, 0, 0.18);
    return group;
  }

  if (defId === "crowbar" || defId === "baseball-bat" || defId === "knife") {
    const mat = new THREE.MeshStandardMaterial({
      color: defId === "crowbar" ? 0x7a4f2a : defId === "knife" ? 0xb8bcc4 : 0x5c4030,
      metalness: defId === "knife" ? 0.82 : 0.25,
      roughness: defId === "knife" ? 0.35 : 0.72,
    });
    const long = target * 0.94;
    const thick = target * (defId === "knife" ? 0.08 : 0.14);
    addProceduralBox(group, mat, long, thick, thick * 0.9, 0, thick * 0.5, 0, 0, defId === "crowbar" ? 0.08 : 0, 0);
    return group;
  }

  if (defId === "ammo-9mm" || defId === "ammo-shotgun-shell") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.55, roughness: 0.42 });
    const n = defId === "ammo-9mm" ? 5 : 4;
    const r = target * 0.14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      addProceduralBox(group, mat, r, r * 1.6, r, Math.cos(a) * r * 0.55, r * 0.8, Math.sin(a) * r * 0.55);
    }
    return group;
  }

  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa8b8, metalness: 0.15, roughness: 0.72 });
  addProceduralBox(group, mat, target * 0.55, target * 0.55, target * 0.55, 0, target * 0.28, 0);
  return group;
}

/**
 * Builds one merged mesh layer per material (usually one draw) after catalog fit.
 * Procedural defs skip GLB download entirely.
 */
export function buildDropMeshLayersFromObject(root: THREE.Object3D, defId: string): DropMeshLayer[] {
  fitDroppedWorldItemModelToCatalog(root, defId);
  root.updateWorldMatrix(true, true);

  const buckets = new Map<
    string,
    { material: THREE.Material; geos: THREE.BufferGeometry[] }
  >();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const matRaw = mesh.material;
    const material = (Array.isArray(matRaw) ? matRaw[0] : matRaw) as THREE.Material;
    if (!material) return;
    mesh.updateMatrixWorld(true);
    // Bake post-fit world transforms into geometry. Root-relative baking (rootInv × meshWorld)
    // cancels uniform catalog scale when meshes are direct children of the fitted root.
    const geo = cloneGeometryForMerge(mesh.geometry as THREE.BufferGeometry, mesh.matrixWorld);
    const key = material.uuid;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material, geos: [] };
      buckets.set(key, bucket);
    }
    bucket.geos.push(geo);
  });

  const layers: DropMeshLayer[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.geos.length === 0) continue;
    const merged =
      bucket.geos.length === 1 ? bucket.geos[0]! : mergeGeometries(bucket.geos, false);
    if (!merged) {
      for (const g of bucket.geos) g.dispose();
      continue;
    }
    if (bucket.geos.length > 1) {
      for (const g of bucket.geos) g.dispose();
    }
    layers.push({
      geometry: merged,
      material: bucket.material,
      localMatrix: _identity.clone(),
    });
  }
  return layers;
}

export function buildProceduralDropMeshLayers(defId: string): DropMeshLayer[] | null {
  const root = buildProceduralDropRoot(defId);
  if (!root) return null;
  return buildDropMeshLayersFromObject(root, defId);
}

export function buildDropMeshLayersFromGltf(gltfRoot: THREE.Object3D, defId: string): DropMeshLayer[] {
  return buildDropMeshLayersFromObject(gltfRoot, defId);
}
