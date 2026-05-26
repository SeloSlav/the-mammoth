import * as THREE from "three";
import { MAMMOTH_FP_WORLD_NPC_UD } from "@the-mammoth/engine";

export function geometryTriangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.index;
  if (index) return Math.floor(index.count / 3);
  const position = geometry.getAttribute("position");
  return position ? Math.floor(position.count / 3) : 0;
}

export function meshTriangleCount(mesh: THREE.Mesh): number {
  const base = geometryTriangleCount(mesh.geometry as THREE.BufferGeometry);
  const instanceCount = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
  return base * Math.max(1, instanceCount);
}

export type FpSceneTriangleBucket = {
  label: string;
  visibleTriangles: number;
  meshCount: number;
};

export function formatFpSceneTriangleBuckets(buckets: readonly FpSceneTriangleBucket[]): string {
  return buckets
    .slice(0, 5)
    .map((b) => `${b.label}=${(b.visibleTriangles / 1000).toFixed(1)}k`)
    .join("  ");
}

function objectVisibleInHierarchy(obj: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

function isRenderableMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (obj as THREE.Mesh).isMesh === true;
}

function hasTaggedAncestor(obj: THREE.Object3D, key: string): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (cur.userData[key] === true) return true;
  }
  return false;
}

function isDroppedItemMesh(mesh: THREE.Mesh): boolean {
  if (mesh.name.startsWith("drop_inst:")) return true;
  for (let cur: THREE.Object3D | null = mesh; cur; cur = cur.parent) {
    if (cur.name === "dropped_items") return true;
  }
  return false;
}

function classifySceneMesh(mesh: THREE.Mesh): string {
  if (hasTaggedAncestor(mesh, MAMMOTH_FP_WORLD_NPC_UD)) return "worldNpc";
  if (isDroppedItemMesh(mesh)) return "droppedItem";
  if (mesh.userData.isSkyCloudMesh === true) return "environmentSky";
  if (mesh.name.includes("combat_sim")) return "combatArena";
  if (mesh.name === "fp_session_ground_plane") return "outdoorGround";
  if (
    mesh instanceof THREE.InstancedMesh &&
    typeof mesh.userData.mammothApartmentDecorInstancedBatch === "string"
  ) {
    return "decorInstanced";
  }
  if (mesh.userData.mammothUnitInterior === true) return "unitInterior";
  if (mesh.userData.mammothApartmentDecorProp === true) return "apartmentDecor";
  return "other";
}

/** Sum visible mesh triangles in the scene graph (not GPU submit count). */
export function summarizeFpSessionSceneTriangles(scene: THREE.Object3D): {
  totalVisibleTriangles: number;
  buckets: FpSceneTriangleBucket[];
} {
  const bucketMap = new Map<string, FpSceneTriangleBucket>();
  let totalVisibleTriangles = 0;

  scene.traverse((obj) => {
    if (!isRenderableMesh(obj)) return;
    if (!objectVisibleInHierarchy(obj)) return;
    const triangles = meshTriangleCount(obj);
    if (triangles <= 0) return;
    totalVisibleTriangles += triangles;
    const label = classifySceneMesh(obj);
    const bucket = bucketMap.get(label) ?? { label, visibleTriangles: 0, meshCount: 0 };
    bucket.visibleTriangles += triangles;
    bucket.meshCount += 1;
    bucketMap.set(label, bucket);
  });

  const buckets = [...bucketMap.values()].sort((a, b) => b.visibleTriangles - a.visibleTriangles);
  return { totalVisibleTriangles, buckets };
}
