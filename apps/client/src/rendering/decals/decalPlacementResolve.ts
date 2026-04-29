import * as THREE from "three";

const _ray = new THREE.Raycaster();
const _hitNormal = new THREE.Vector3();
const _normalMatrix3 = new THREE.Matrix3();

/**
 * Deterministic 32-bit seed from a string (FNV-1a style mix).
 */
export function hashStringToSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — stable outputs for a given seed. */
export function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stairShaftColumnName(shaftId: string): string {
  return `stair_shaft:${shaftId}`;
}

/**
 * Resolve the stair segment group for a shaft id and plate level (post-merge safe: uses `userData`).
 */
export function findStairShaftSegment(
  buildingRoot: THREE.Object3D,
  shaftId: string,
  storeyLevelIndex: number,
): THREE.Object3D | null {
  const col = buildingRoot.getObjectByName(stairShaftColumnName(shaftId));
  if (!col) return null;
  for (const ch of col.children) {
    if (typeof ch.userData.mammothPlateLevelIndex === "number" && ch.userData.mammothPlateLevelIndex === storeyLevelIndex) {
      return ch;
    }
  }
  return null;
}

/** All meshes under a segment subtree (merged static geometry lives here). */
export function collectMeshesInSegment(segment: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  segment.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.isDecal !== true) {
      out.push(o);
    }
  });
  return out;
}

/**
 * From world-space **outward** wall normal (into stair volume), build projector euler for {@link THREE.DecalGeometry}.
 */
export function eulerForDecalProjector(worldNormal: THREE.Vector3, rotationAroundNormal: number): THREE.Euler {
  const n = worldNormal.clone().normalize();
  const up = Math.abs(n.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3().crossVectors(up, n);
  if (xAxis.lengthSq() < 1e-8) {
    xAxis.set(1, 0, 0);
  } else {
    xAxis.normalize();
  }
  const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, n);
  const proj = new THREE.Object3D();
  proj.rotation.setFromRotationMatrix(basis);
  proj.rotateOnAxis(n, rotationAroundNormal);
  return proj.rotation.clone();
}

const DEFAULT_PROBE_EPS = 0.04;
const RAY_FAR = 1.25;

/**
 * Raycast along `-normal` from `origin + normal * eps` against `meshes` to pick the wall mesh for decals.
 */
export function resolveDecalHitMesh(
  meshes: readonly THREE.Mesh[],
  originWorld: THREE.Vector3,
  normalWorld: THREE.Vector3,
  eps: number = DEFAULT_PROBE_EPS,
): THREE.Mesh | undefined {
  if (meshes.length === 0) return undefined;
  const n = normalWorld.clone().normalize();
  const rayOrigin = originWorld.clone().addScaledVector(n, eps);
  _ray.set(rayOrigin, n.clone().negate());
  _ray.far = RAY_FAR;
  const hits = _ray.intersectObjects(meshes as THREE.Mesh[], false);
  const hit = hits[0];
  if (!hit || !(hit.object instanceof THREE.Mesh)) return undefined;
  if (hit.face) {
    _hitNormal.copy(hit.face.normal);
    _normalMatrix3.getNormalMatrix(hit.object.matrixWorld);
    _hitNormal.applyNormalMatrix(_normalMatrix3).normalize();
    const align = Math.abs(_hitNormal.dot(n));
    if (align < 0.45) {
      return undefined;
    }
  }
  return hit.object;
}
