import * as THREE from "three";
import type { FpAuthoringPick } from "@the-mammoth/engine";

/**
 * Pick the **innermost** authoring root that contains `hit` (deepest ancestor in the pick list).
 */
export function resolveFpAuthorPickId(hit: THREE.Object3D, picks: FpAuthoringPick[]): string | null {
  let best: { id: string; depth: number } | null = null;
  for (const p of picks) {
    let d: THREE.Object3D | null = hit;
    let depth = 0;
    while (d) {
      if (d === p.object) {
        if (!best || depth > best.depth) best = { id: p.id, depth };
        break;
      }
      d = d.parent;
      depth += 1;
    }
  }
  return best?.id ?? null;
}
