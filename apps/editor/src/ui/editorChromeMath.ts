import * as THREE from "three";
import type { PlacedObject } from "@the-mammoth/schemas";

export function quatToEulerDeg(
  rot: PlacedObject["rotation"],
): [number, number, number] {
  const q = rot
    ? new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3])
    : new THREE.Quaternion();
  const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ];
}

export function eulerDegToQuat(
  rx: number,
  ry: number,
  rz: number,
): PlacedObject["rotation"] {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(rx),
    THREE.MathUtils.degToRad(ry),
    THREE.MathUtils.degToRad(rz),
    "YXZ",
  );
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}
