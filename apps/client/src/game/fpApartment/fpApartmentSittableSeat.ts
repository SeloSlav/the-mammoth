import * as THREE from "three";
import type { ApartmentSittableSpec } from "@the-mammoth/schemas";

const _localPoint = new THREE.Vector3();
const _localBounds = new THREE.Box3();
const _meshBounds = new THREE.Box3();
const _invGroupWorld = new THREE.Matrix4();

/** Decor-group axis-aligned bounds in root-local space (handles rotation). */
export function computeDecorGroupLocalBounds(group: THREE.Object3D, out: THREE.Box3): THREE.Box3 {
  out.makeEmpty();
  group.updateMatrixWorld(true);
  _invGroupWorld.copy(group.matrixWorld).invert();
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;
    _meshBounds.copy(geom.boundingBox).applyMatrix4(obj.matrixWorld).applyMatrix4(_invGroupWorld);
    out.union(_meshBounds);
  });
  return out;
}

export function apartmentSittableLateralSeatCount(spec: ApartmentSittableSpec): number {
  const n = spec.lateralSeatCount ?? 1;
  return n < 1 ? 1 : Math.floor(n);
}

/** Map a world-space aim/click point to a lateral seat index along decor local +X. */
export function resolveApartmentSittableLateralSeatIndex(
  group: THREE.Object3D,
  worldPoint: THREE.Vector3,
  seatCount: number,
): number {
  if (seatCount <= 1) return 0;
  computeDecorGroupLocalBounds(group, _localBounds);
  const width = _localBounds.max.x - _localBounds.min.x;
  if (width < 1e-4) return Math.floor((seatCount - 1) / 2);
  _localPoint.copy(worldPoint);
  group.worldToLocal(_localPoint);
  const t = (_localPoint.x - _localBounds.min.x) / width;
  const idx = Math.floor(t * seatCount);
  return Math.max(0, Math.min(seatCount - 1, idx));
}

/** Center of each lateral seat band in decor-local space. */
export function apartmentSittableLateralSeatLocalX(
  localBounds: THREE.Box3,
  seatIndex: number,
  seatCount: number,
): number {
  if (seatCount <= 1) return (localBounds.min.x + localBounds.max.x) * 0.5;
  const width = localBounds.max.x - localBounds.min.x;
  const slot = (seatIndex + 0.5) / seatCount;
  return localBounds.min.x + width * slot;
}

export function resolveApartmentSittableSeatIndexForSpec(
  group: THREE.Object3D,
  spec: ApartmentSittableSpec,
  worldPoint: THREE.Vector3,
): number {
  return resolveApartmentSittableLateralSeatIndex(
    group,
    worldPoint,
    apartmentSittableLateralSeatCount(spec),
  );
}
