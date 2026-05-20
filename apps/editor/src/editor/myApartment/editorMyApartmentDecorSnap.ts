import * as THREE from "three";

/** Planar proximity — decor dragged near another piece (grow pots, props, etc.). */
export const EDITOR_MY_APARTMENT_DECOR_SURFACE_SNAP_M = 0.4;

/** Floor props must overlap vertically (or sit on the same slab). */
const DECOR_NEIGHBOR_Y_OVERLAP_EPS_M = 0.02;
const DECOR_INFERRED_GAP_MIN_M = 0.001;
const DECOR_INFERRED_GAP_MAX_M = 2;

const decorSnapBoxScratch = new THREE.Box3();

export type ApplyMyApartmentDecorNeighborSnapOpts = {
  /**
   * Gap between aligned faces when snapping beside/above a neighbor.
   * When omitted and {@link inferGapFromNeighbors} is true, uses the smallest measured gap
   * between existing décor pairs on the mount.
   */
  gapM?: number;
  /** Measure spacing from other décor when `gapM` is not set (default true). */
  inferGapFromNeighbors?: boolean;
  /** Proximity threshold for accepting a snap candidate (default {@link EDITOR_MY_APARTMENT_DECOR_SURFACE_SNAP_M}). */
  snapM?: number;
};

function boxesPlanProximity(a: THREE.Box3, b: THREE.Box3, snapM: number): boolean {
  const dx =
    a.max.x < b.min.x ? b.min.x - a.max.x : b.max.x < a.min.x ? a.min.x - b.max.x : 0;
  const dz =
    a.max.z < b.min.z ? b.min.z - a.max.z : b.max.z < a.min.z ? a.min.z - b.max.z : 0;
  return dx <= snapM && dz <= snapM;
}

function decorYRangesOverlap(a: THREE.Box3, b: THREE.Box3): boolean {
  return a.min.y < b.max.y - DECOR_NEIGHBOR_Y_OVERLAP_EPS_M && a.max.y > b.min.y + DECOR_NEIGHBOR_Y_OVERLAP_EPS_M;
}

function decorNeighborSnapEligible(a: THREE.Box3, b: THREE.Box3, snapM: number): boolean {
  if (!boxesPlanProximity(a, b, snapM)) return false;
  return decorYRangesOverlap(a, b);
}

function translateRootOnAxis(root: THREE.Object3D, axis: "x" | "z", delta: number): void {
  if (Math.abs(delta) < 1e-9) return;
  if (axis === "x") root.position.x += delta;
  else root.position.z += delta;
}

type AxisSnapCandidate = { delta: number; dist: number };

function collectAxisSnapCandidates(args: {
  selfMin: number;
  selfMax: number;
  neighborMin: number;
  neighborMax: number;
  gapM: number;
}): AxisSnapCandidate[] {
  const { selfMin, selfMax, neighborMin, neighborMax, gapM } = args;
  const selfCenter = (selfMin + selfMax) * 0.5;
  const neighborCenter = (neighborMin + neighborMax) * 0.5;
  const pairs: { selfFace: number; plane: number }[] = [
    { selfFace: selfMin, plane: neighborMax + gapM },
    { selfFace: selfMax, plane: neighborMin - gapM },
    { selfFace: selfMin, plane: neighborMin },
    { selfFace: selfMax, plane: neighborMax },
    { selfFace: selfCenter, plane: neighborCenter },
  ];
  const out: AxisSnapCandidate[] = [];
  for (const { selfFace, plane } of pairs) {
    const delta = plane - selfFace;
    out.push({ delta, dist: Math.abs(delta) });
  }
  return out;
}

function pickBestAxisSnapDelta(
  candidates: readonly AxisSnapCandidate[],
  snapM: number,
): number | null {
  let best: AxisSnapCandidate | null = null;
  for (const c of candidates) {
    if (c.dist <= snapM && (!best || c.dist < best.dist)) {
      best = c;
    }
  }
  return best?.delta ?? null;
}

function snapDecorPairToNeighbor(args: {
  root: THREE.Object3D;
  neighbor: THREE.Object3D;
  gapM: number;
  snapM: number;
}): boolean {
  const { root, neighbor, gapM, snapM } = args;
  root.updateMatrixWorld(true);
  neighbor.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const nb = new THREE.Box3().setFromObject(neighbor);
  if (box.isEmpty() || nb.isEmpty()) return false;
  if (!decorNeighborSnapEligible(box, nb, snapM)) return false;

  const xCandidates = collectAxisSnapCandidates({
    selfMin: box.min.x,
    selfMax: box.max.x,
    neighborMin: nb.min.x,
    neighborMax: nb.max.x,
    gapM,
  });
  const zCandidates = collectAxisSnapCandidates({
    selfMin: box.min.z,
    selfMax: box.max.z,
    neighborMin: nb.min.z,
    neighborMax: nb.max.z,
    gapM,
  });

  const dx = pickBestAxisSnapDelta(xCandidates, snapM);
  const dz = pickBestAxisSnapDelta(zCandidates, snapM);
  if (dx === null && dz === null) return false;
  if (dx !== null) translateRootOnAxis(root, "x", dx);
  if (dz !== null) translateRootOnAxis(root, "z", dz);
  return true;
}

/** Smallest face-to-face gap between axis-separated décor on the same mount (e.g. grow-pot grid). */
export function inferDecorNeighborGapM(roots: readonly THREE.Object3D[]): number | undefined {
  const boxes: THREE.Box3[] = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    decorSnapBoxScratch.setFromObject(root);
    if (!decorSnapBoxScratch.isEmpty()) {
      boxes.push(decorSnapBoxScratch.clone());
    }
  }
  const gaps: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      const zOverlap = a.min.z < b.max.z && a.max.z > b.min.z;
      if (zOverlap) {
        if (a.max.x < b.min.x) gaps.push(b.min.x - a.max.x);
        else if (b.max.x < a.min.x) gaps.push(a.min.x - b.max.x);
      }
      const xOverlap = a.min.x < b.max.x && a.max.x > b.min.x;
      if (xOverlap) {
        if (a.max.z < b.min.z) gaps.push(b.min.z - a.max.z);
        else if (b.max.z < a.min.z) gaps.push(a.min.z - b.max.z);
      }
    }
  }
  const valid = gaps.filter(
    (g) => g >= DECOR_INFERRED_GAP_MIN_M && g <= DECOR_INFERRED_GAP_MAX_M,
  );
  if (valid.length === 0) return undefined;
  return Math.min(...valid);
}

export function collectNeighborDecorRoots(
  root: THREE.Object3D,
  excludeDecorId: string | undefined,
  furnitureMount: THREE.Object3D | null,
): THREE.Object3D[] {
  const scanParent = furnitureMount ?? root.parent;
  if (!scanParent) return [];
  const out: THREE.Object3D[] = [];
  for (const child of scanParent.children) {
    if (child === root) continue;
    const id = child.userData.mammothEditorMyApartmentDecorId;
    if (typeof id === "string" && id !== excludeDecorId) {
      out.push(child);
    }
  }
  return out;
}

/**
 * While translating décor, snap bounding-box faces to nearby pieces (grid-style alignment).
 * Uses world-axis AABBs so slight yaw still aligns grow-pot rows.
 */
export function applyMyApartmentDecorNeighborSnap(
  root: THREE.Object3D,
  furnitureMount: THREE.Object3D | null,
  opts?: ApplyMyApartmentDecorNeighborSnapOpts,
): void {
  const snapM = opts?.snapM ?? EDITOR_MY_APARTMENT_DECOR_SURFACE_SNAP_M;
  const excludeDecorId = root.userData.mammothEditorMyApartmentDecorId as string | undefined;
  const neighborRoots = collectNeighborDecorRoots(root, excludeDecorId, furnitureMount);
  if (neighborRoots.length === 0) return;

  let gapM = opts?.gapM;
  if (gapM === undefined && opts?.inferGapFromNeighbors !== false) {
    gapM = inferDecorNeighborGapM(neighborRoots);
  }
  gapM = gapM ?? 0;

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const neighbor of neighborRoots) {
      if (
        snapDecorPairToNeighbor({
          root,
          neighbor,
          gapM,
          snapM,
        })
      ) {
        changed = true;
      }
    }
    if (!changed) break;
  }
}
