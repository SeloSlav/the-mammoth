import type * as THREE from "three";

/** True when `obj` is `root` or a descendant of `root` in the Three.js parent chain. */
export function objectLivesUnderScene(obj: THREE.Object3D, root: THREE.Scene): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur === root) return true;
    cur = cur.parent;
  }
  return false;
}
