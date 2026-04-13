import * as THREE from "three";
import type { PrimitiveSwingKeyframe } from "@the-mammoth/engine";

export type SwingStrokeClientPoint = { clientX: number; clientY: number };

const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function dedupeClientStroke(pts: readonly SwingStrokeClientPoint[]): SwingStrokeClientPoint[] {
  const out: SwingStrokeClientPoint[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.clientX - last.clientX, p.clientY - last.clientY) >= 2) out.push(p);
  }
  return out;
}

function clientToRay(
  p: SwingStrokeClientPoint,
  rect: DOMRectReadOnly,
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
): void {
  const nx = ((p.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((p.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
}

/**
 * Intersect each screen ray with the plane through `rigWorld` (normal = camera forward).
 * Returns **world-space** hit points (meters).
 */
export function projectViewportStrokeToWorldHits(opts: {
  clientPoints: readonly SwingStrokeClientPoint[];
  canvasRect: DOMRectReadOnly;
  pickCamera: THREE.Camera;
  fpRoot: THREE.Object3D;
  rigRestPositionLocal: THREE.Vector3;
}): THREE.Vector3[] {
  const pts = dedupeClientStroke(opts.clientPoints);
  if (pts.length < 2) {
    throw new Error("Stroke too short — drag a bit farther across the view.");
  }

  opts.fpRoot.updateMatrixWorld(true);
  const rigWorld = opts.rigRestPositionLocal.clone().applyMatrix4(opts.fpRoot.matrixWorld);
  opts.pickCamera.getWorldDirection(_fwd);

  const raycaster = new THREE.Raycaster();
  const hits: THREE.Vector3[] = [];

  for (const p of pts) {
    clientToRay(p, opts.canvasRect, raycaster, opts.pickCamera);
    _plane.setFromNormalAndCoplanarPoint(_fwd, rigWorld);
    const ok = raycaster.ray.intersectPlane(_plane, _hit);
    if (ok === null) continue;
    hits.push(_hit.clone());
  }

  if (hits.length < 2) {
    throw new Error("Could not project the stroke — try Gameplay camera or a longer drag.");
  }
  return hits;
}

/**
 * Map world-space deltas along the view plane into **fpRoot-local** swing translation offsets
 * (same space as `firstPerson.meleeSwing[].translationM`). Uses only world rotation of `fpRoot`
 * so the on-screen stroke shape matches the additive path under head pitch.
 */
export function worldPlaneDeltasToFpRootSwingOffsets(
  hitWorlds: readonly THREE.Vector3[],
  fpRoot: THREE.Object3D,
): THREE.Vector3[] {
  if (hitWorlds.length < 2) {
    throw new Error("Stroke too short — need at least two projected points.");
  }
  fpRoot.updateMatrixWorld(true);
  fpRoot.getWorldQuaternion(_q);
  const inv = _q.clone().invert();
  const base = hitWorlds[0]!.clone();
  return hitWorlds.map((h) => h.clone().sub(base).applyQuaternion(inv));
}

export function scaleOffsetsToMaxTranslationM(
  offsets: readonly THREE.Vector3[],
  maxAbsM: number,
): THREE.Vector3[] {
  let m = 0;
  for (const v of offsets) {
    m = Math.max(m, Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
  }
  if (m < 1e-6) {
    throw new Error("Stroke has almost no motion in viewmodel space — drag a longer arc.");
  }
  const s = m > maxAbsM ? maxAbsM / m : 1;
  return offsets.map((v) => v.clone().multiplyScalar(s));
}

export function resamplePolylineByArcLength(
  poly: readonly THREE.Vector3[],
  sampleCount: number,
): THREE.Vector3[] {
  if (sampleCount < 2) throw new Error("sampleCount must be >= 2");
  if (poly.length < 2) throw new Error("poly must have at least two points");

  const lens: number[] = [0];
  for (let i = 1; i < poly.length; i++) {
    lens.push(lens[i - 1]! + poly[i]!.distanceTo(poly[i - 1]!));
  }
  const total = lens[lens.length - 1]!;
  if (total < 1e-5) {
    throw new Error("Path has no length — try a longer drag.");
  }

  const out: THREE.Vector3[] = [];
  for (let k = 0; k < sampleCount; k++) {
    const s = (k / (sampleCount - 1)) * total;
    let j = 0;
    while (j < lens.length - 2 && lens[j + 1]! < s) j++;
    const segStart = lens[j]!;
    const segEnd = lens[j + 1]!;
    const u = segEnd > segStart ? (s - segStart) / (segEnd - segStart) : 0;
    out.push(
      new THREE.Vector3().lerpVectors(poly[j]!, poly[j + 1]!, THREE.MathUtils.clamp(u, 0, 1)),
    );
  }
  return out;
}

const zeroRot = { x: 0, y: 0, z: 0 };

/**
 * Builds keyframes from an offset polyline in fpRoot space. **Rotation is always zero** so the
 * painted path reads as pure motion; tune twist with the gizmo + Capture at a scrub time.
 */
export function swingKeyframesFromOffsetPolyline(
  relativeOffsets: readonly THREE.Vector3[],
  opts?: { sampleCount?: number; approachT?: number; maxTranslationAbsM?: number },
): PrimitiveSwingKeyframe[] {
  const approachT = opts?.approachT ?? 0.88;
  const sampleCount = THREE.MathUtils.clamp(opts?.sampleCount ?? 9, 4, 18);
  const maxM = opts?.maxTranslationAbsM ?? 0.58;

  const scaled = scaleOffsetsToMaxTranslationM(relativeOffsets, maxM);
  const resampled = resamplePolylineByArcLength(scaled, sampleCount);

  const keys: PrimitiveSwingKeyframe[] = [];
  const n = resampled.length;
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? (k / (n - 1)) * approachT : 0;
    const tr = resampled[k]!;
    keys.push({
      t: r4(t),
      translationM: { x: r4(tr.x), y: r4(tr.y), z: r4(tr.z) },
      rotationRad: { ...zeroRot },
    });
  }

  keys.push({
    t: 1,
    translationM: { x: 0, y: 0, z: 0 },
    rotationRad: { ...zeroRot },
  });

  return keys;
}

export function buildMeleeSwingKeyframesFromViewportStroke(opts: {
  clientPoints: readonly SwingStrokeClientPoint[];
  canvasRect: DOMRectReadOnly;
  pickCamera: THREE.Camera;
  fpRoot: THREE.Object3D;
  rigRestPositionLocal: THREE.Vector3;
  sampleCount?: number;
}): PrimitiveSwingKeyframe[] {
  const hitsW = projectViewportStrokeToWorldHits({
    clientPoints: opts.clientPoints,
    canvasRect: opts.canvasRect,
    pickCamera: opts.pickCamera,
    fpRoot: opts.fpRoot,
    rigRestPositionLocal: opts.rigRestPositionLocal,
  });
  const rel = worldPlaneDeltasToFpRootSwingOffsets(hitsW, opts.fpRoot);
  return swingKeyframesFromOffsetPolyline(rel, { sampleCount: opts.sampleCount });
}
