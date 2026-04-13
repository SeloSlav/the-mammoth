import * as THREE from "three";
import type { PrimitiveSwingKeyframe } from "@the-mammoth/engine";

export type SwingStrokeClientPoint = { clientX: number; clientY: number };

const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();
const _fwd = new THREE.Vector3();

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
 * Project each screen point onto the plane through `rigWorld` with normal = camera forward
 * (screen-parallel at the hand). Returns positions in **fpRoot local space**.
 */
export function projectViewportStrokeToFpRootLocals(opts: {
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
  const locals: THREE.Vector3[] = [];

  for (const p of pts) {
    clientToRay(p, opts.canvasRect, raycaster, opts.pickCamera);
    _plane.setFromNormalAndCoplanarPoint(_fwd, rigWorld);
    const ok = raycaster.ray.intersectPlane(_plane, _hit);
    if (ok === null) continue;
    const local = _hit.clone();
    opts.fpRoot.worldToLocal(local);
    locals.push(local);
  }

  if (locals.length < 2) {
    throw new Error("Could not project the stroke — try Gameplay camera or a longer drag.");
  }
  return locals;
}

/** Offsets from rig rest: first sample is zeroed so t=0 matches rest pose. */
export function offsetsFromStrokeLocals(
  locals: readonly THREE.Vector3[],
  rigRestPositionLocal: THREE.Vector3,
): THREE.Vector3[] {
  const off = locals.map((h) => h.clone().sub(rigRestPositionLocal));
  const base = off[0]!.clone();
  return off.map((v) => v.sub(base));
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

/** Yaw (Y) + pitch (X) in fpRoot-local space so the rig tends to "face" along motion. */
export function eulerRadFromTangentLocal(tan: THREE.Vector3): {
  x: number;
  y: number;
  z: number;
} {
  if (tan.lengthSq() < 1e-10) {
    return { x: 0, y: 0, z: 0 };
  }
  tan.normalize();
  const xz = Math.hypot(tan.x, tan.z);
  const yaw = Math.atan2(tan.x, tan.z);
  const pitch = Math.atan2(-tan.y, xz);
  return { x: r4(pitch), y: r4(yaw), z: 0 };
}

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
    const prev = resampled[Math.max(0, k - 1)]!;
    const next = resampled[Math.min(n - 1, k + 1)]!;
    const tan = new THREE.Vector3().subVectors(next, prev);
    const rot = k === 0 ? { x: 0, y: 0, z: 0 } : eulerRadFromTangentLocal(tan);
    const tr = resampled[k]!;
    keys.push({
      t: r4(t),
      translationM: { x: r4(tr.x), y: r4(tr.y), z: r4(tr.z) },
      rotationRad: rot,
    });
  }

  keys.push({
    t: 1,
    translationM: { x: 0, y: 0, z: 0 },
    rotationRad: { x: 0, y: 0, z: 0 },
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
  const locals = projectViewportStrokeToFpRootLocals({
    clientPoints: opts.clientPoints,
    canvasRect: opts.canvasRect,
    pickCamera: opts.pickCamera,
    fpRoot: opts.fpRoot,
    rigRestPositionLocal: opts.rigRestPositionLocal,
  });
  const rel = offsetsFromStrokeLocals(locals, opts.rigRestPositionLocal);
  return swingKeyframesFromOffsetPolyline(rel, { sampleCount: opts.sampleCount });
}
