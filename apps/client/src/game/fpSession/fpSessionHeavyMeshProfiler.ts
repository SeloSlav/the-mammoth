import * as THREE from "three";
import { MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD, MAMMOTH_FP_WORLD_NPC_UD } from "@the-mammoth/engine";
import {
  recordFpPerfHeavyMeshes,
  type FpPerfHeavyMeshRecord,
} from "./fpSessionPerfStore.js";
import { meshTriangleCount } from "./fpSessionSceneTriangleCount.js";

const HEAVY_FRAME_TRIANGLE_THRESHOLD = 250_000;
const HEAVY_MESH_SAMPLE_MIN_INTERVAL_MS = 80;
const HEAVY_MESH_TOP_N = 10;

type HeavyMeshCandidate = {
  mesh: THREE.Mesh;
  triangles: number;
  kind: string;
  label: string;
  unitKey: string | null;
  placedObjectId: string | null;
};

const _heavyMeshViewProjection = new THREE.Matrix4();
const _heavyMeshFrustum = new THREE.Frustum();
const _heavyMeshCandidates: HeavyMeshCandidate[] = [];

function objectVisibleInHierarchy(obj: THREE.Object3D, camera: THREE.Camera): boolean {
  if (!obj.layers.test(camera.layers)) return false;
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

function nearestTaggedAncestor(
  obj: THREE.Object3D,
  predicate: (obj: THREE.Object3D) => boolean,
): THREE.Object3D | null {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (predicate(cur)) return cur;
  }
  return null;
}

function stringUserDataInAncestors(obj: THREE.Object3D, key: string): string | null {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    const value = cur.userData[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function bigintUserDataInAncestors(obj: THREE.Object3D, key: string): string | null {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    const value = cur.userData[key];
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
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

function classifyMesh(mesh: THREE.Mesh): string {
  if (hasTaggedAncestor(mesh, MAMMOTH_FP_WORLD_NPC_UD)) return "worldNpc";
  if (isDroppedItemMesh(mesh)) return "droppedItem";
  if (mesh.userData.isSkyCloudMesh === true) return "environmentSky";
  if (mesh.userData[MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD] === true) {
    return "apartmentDecorFloorShadow";
  }
  if (nearestTaggedAncestor(mesh, (obj) => obj.userData.mammothApartmentDecorProp === true)) {
    return "apartmentDecor";
  }
  if (mesh.userData.mammothUnitInterior === true) return "unitInterior";
  if (nearestTaggedAncestor(mesh, (obj) => typeof obj.userData.mammothPlateLevelIndex === "number")) {
    return "floorPlate";
  }
  return "building";
}

function objectPath(obj: THREE.Object3D, stop: THREE.Object3D): string {
  const names: string[] = [];
  for (let cur: THREE.Object3D | null = obj; cur && cur !== stop.parent; cur = cur.parent) {
    const name = cur.name || cur.type;
    names.push(name);
    if (cur === stop) break;
  }
  return names.reverse().slice(-5).join("/");
}

function describeMesh(mesh: THREE.Mesh, buildingRoot: THREE.Object3D): HeavyMeshCandidate {
  const decorId = bigintUserDataInAncestors(mesh, "mammothApartmentDecorId");
  const unitKey = stringUserDataInAncestors(mesh, "mammothApartmentUnitKey");
  const placedObjectId = stringUserDataInAncestors(mesh, "mammothPlacedObjectId");
  const kind = classifyMesh(mesh);
  const labelParts = [
    kind,
    decorId ? `decor:${decorId}` : "",
    unitKey ? `unit:${unitKey}` : "",
    placedObjectId ? `placed:${placedObjectId}` : "",
    objectPath(mesh, buildingRoot),
  ].filter(Boolean);
  return {
    mesh,
    triangles: meshTriangleCount(mesh),
    kind,
    label: labelParts.join(" | "),
    unitKey,
    placedObjectId,
  };
}

function materialName(mesh: THREE.Mesh): string | null {
  const material = mesh.material;
  if (Array.isArray(material)) {
    const names = material.map((m) => m.name).filter((name) => name.length > 0);
    return names.length > 0 ? names.join(",") : "multi-material";
  }
  return material.name || null;
}

function isDescendantOf(obj: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (cur === ancestor) return true;
  }
  return false;
}

export function createFpSessionHeavyMeshProfiler(input: {
  sceneRoot: THREE.Object3D;
  buildingRoot: THREE.Object3D;
  camera: THREE.Camera;
}): (nowMs: number, frameTriangles: number, frameMs: number, cameraYawRad: number | null) => void {
  let lastSampleMs = -Infinity;
  return (nowMs, frameTriangles, frameMs, cameraYawRad) => {
    if (frameTriangles < HEAVY_FRAME_TRIANGLE_THRESHOLD) return;
    if (nowMs - lastSampleMs < HEAVY_MESH_SAMPLE_MIN_INTERVAL_MS) return;
    lastSampleMs = nowMs;

    input.camera.updateMatrixWorld();
    _heavyMeshViewProjection.multiplyMatrices(
      input.camera.projectionMatrix,
      input.camera.matrixWorldInverse,
    );
    _heavyMeshFrustum.setFromProjectionMatrix(_heavyMeshViewProjection);
    _heavyMeshCandidates.length = 0;

    input.buildingRoot.traverse((obj) => {
      if (!isRenderableMesh(obj)) return;
      if (hasTaggedAncestor(obj, MAMMOTH_FP_WORLD_NPC_UD)) return;
      if (!objectVisibleInHierarchy(obj, input.camera)) return;
      if (!_heavyMeshFrustum.intersectsObject(obj)) return;
      const triangles = meshTriangleCount(obj);
      if (triangles <= 0) return;
      const candidate = describeMesh(obj, input.buildingRoot);
      candidate.triangles = triangles;
      _heavyMeshCandidates.push(candidate);
    });

    input.sceneRoot.traverse((obj) => {
      if (!isRenderableMesh(obj)) return;
      if (input.buildingRoot === obj || isDescendantOf(obj, input.buildingRoot)) return;
      if (!objectVisibleInHierarchy(obj, input.camera)) return;
      if (!_heavyMeshFrustum.intersectsObject(obj)) return;
      const triangles = meshTriangleCount(obj);
      if (triangles <= 0) return;
      const kind = classifyMesh(obj);
      _heavyMeshCandidates.push({
        mesh: obj,
        triangles,
        kind,
        label: [kind, obj.name || obj.type].filter(Boolean).join(" | "),
        unitKey: null,
        placedObjectId: null,
      });
    });

    _heavyMeshCandidates.sort((a, b) => b.triangles - a.triangles);
    const out: FpPerfHeavyMeshRecord[] = [];
    const n = Math.min(HEAVY_MESH_TOP_N, _heavyMeshCandidates.length);
    for (let i = 0; i < n; i++) {
      const candidate = _heavyMeshCandidates[i]!;
      const mesh = candidate.mesh;
      out.push({
        tMs: nowMs,
        frameTriangles,
        frameMs,
        cameraYawRad,
        meshTriangles: candidate.triangles,
        label: candidate.label,
        kind: candidate.kind,
        unitKey: candidate.unitKey,
        placedObjectId: candidate.placedObjectId,
        materialName: materialName(mesh),
        geometryName: mesh.geometry.name || null,
        frustumCulled: mesh.frustumCulled,
      });
    }
    recordFpPerfHeavyMeshes(out);
  };
}
