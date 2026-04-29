import * as THREE from "three";

export type FpAuthoringPickLike = { id: string; label: string; object: THREE.Object3D };

export function resolveAuthoringOrbitTargetWorld(
  fpRoot: THREE.Object3D,
  picks: readonly FpAuthoringPickLike[],
  authorOrbitFallbackOffset: THREE.Vector3,
  out: THREE.Vector3,
  opts?: { gripSocketForBounds?: THREE.Object3D },
): boolean {
  if (picks.length === 0) return false;
  const box = new THREE.Box3();
  const weaponMount = picks.find(
    (p) => p.id === "weapon" || p.id === "weaponRoot",
  );
  let gripSocket: THREE.Object3D | undefined = picks.find(
    (p) => p.id === "gripAnchor",
  )?.object;
  if (!gripSocket && opts?.gripSocketForBounds) {
    gripSocket = opts.gripSocketForBounds;
  }
  if (weaponMount) {
    box.setFromObject(weaponMount.object);
    if (gripSocket) {
      const gripBox = new THREE.Box3().setFromObject(gripSocket);
      box.union(gripBox);
    }
  } else {
    for (const p of picks) {
      box.expandByObject(p.object);
    }
  }
  if (box.isEmpty() || !Number.isFinite(box.min.x)) {
    fpRoot.getWorldPosition(out);
    out.add(authorOrbitFallbackOffset);
    return true;
  }
  box.getCenter(out);
  return true;
}
