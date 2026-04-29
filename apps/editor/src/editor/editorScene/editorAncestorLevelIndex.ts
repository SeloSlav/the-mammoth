import * as THREE from "three";

export function editorAncestorPlateLevelIndex(obj: THREE.Object3D | null): number | null {
  let cur = obj;
  while (cur) {
    const raw = cur.userData.mammothPlateLevelIndex;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    cur = cur.parent;
  }
  return null;
}
