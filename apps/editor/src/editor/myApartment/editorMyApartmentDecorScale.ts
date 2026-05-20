import * as THREE from "three";
import {
  OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN,
  ownedApartmentDecorRootScaleXYZ,
} from "@the-mammoth/schemas";

export const EDITOR_MY_APARTMENT_DECOR_UNIFORM_SCALE_MAX = 5.5 as const;

/** Clamps imported decor uniform scale (`OwnedApartmentDecorItemSchema`). */
export function clampOwnedApartmentDecorUniformScale(s: number): number {
  return THREE.MathUtils.clamp(
    s,
    OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN,
    EDITOR_MY_APARTMENT_DECOR_UNIFORM_SCALE_MAX,
  );
}

export type MyApartmentDecorScaleGesturePin = {
  startScale: THREE.Vector3;
};

/** True when the gizmo center handle drives uniform scale (not a single-axis stretch). */
export function isMyApartmentDecorUniformScaleAxis(axis: string | null | undefined): boolean {
  if (!axis) return true;
  if (axis === "XYZ" || axis.includes("E")) return true;
  return false;
}

/**
 * Apply uniform scale from the average of X/Y/Z (legacy paths, center gizmo handle).
 */
export function applyMyApartmentDecorUniformScale(root: THREE.Object3D): void {
  const uniform = clampOwnedApartmentDecorUniformScale(
    (root.scale.x + root.scale.y + root.scale.z) / 3,
  );
  root.scale.setScalar(uniform);
}

/** Apply authored `uniformScale` + optional vertical stretch for reload / commit. */
export function applyMyApartmentDecorRootScaleFromDoc(
  root: THREE.Object3D,
  uniformScale: number,
  verticalScaleMul = 1,
): void {
  const { x, y, z } = ownedApartmentDecorRootScaleXYZ(
    clampOwnedApartmentDecorUniformScale(uniformScale),
    clampOwnedApartmentDecorUniformScale(verticalScaleMul),
  );
  root.scale.set(x, y, z);
}

/**
 * During scale drags: center handle stays uniform; axis handles stretch one dimension
 * (e.g. green Y handle → taller, X/Z pinned to gesture start).
 */
export function constrainMyApartmentDecorScaleFromGizmo(
  root: THREE.Object3D,
  opts: {
    transformMode: string;
    axis: string | null | undefined;
    dragging: boolean;
    gesturePin: MyApartmentDecorScaleGesturePin | null;
  },
): void {
  if (opts.transformMode !== "scale") {
    applyMyApartmentDecorUniformScale(root);
    return;
  }
  if (isMyApartmentDecorUniformScaleAxis(opts.axis)) {
    applyMyApartmentDecorUniformScale(root);
    return;
  }
  const pin = opts.gesturePin;
  if (pin && opts.dragging) {
    if (opts.axis!.indexOf("X") === -1) root.scale.x = pin.startScale.x;
    if (opts.axis!.indexOf("Y") === -1) root.scale.y = pin.startScale.y;
    if (opts.axis!.indexOf("Z") === -1) root.scale.z = pin.startScale.z;
  }
  root.scale.x = clampOwnedApartmentDecorUniformScale(root.scale.x);
  root.scale.y = clampOwnedApartmentDecorUniformScale(root.scale.y);
  root.scale.z = clampOwnedApartmentDecorUniformScale(root.scale.z);
}

/** Map root scale after a gizmo session into JSON fields. */
export function readMyApartmentDecorCommittedScale(root: THREE.Object3D): {
  uniformScale: number;
  verticalScaleMul: number;
} {
  const sx = root.scale.x;
  const sy = root.scale.y;
  const sz = root.scale.z;
  const nearUniform =
    Math.abs(sx - sy) < 1e-3 && Math.abs(sy - sz) < 1e-3;
  if (nearUniform) {
    const uniformScale = clampOwnedApartmentDecorUniformScale((sx + sy + sz) / 3);
    return { uniformScale, verticalScaleMul: 1 };
  }
  const uniformScale = clampOwnedApartmentDecorUniformScale((sx + sz) * 0.5);
  const verticalScaleMul = clampOwnedApartmentDecorUniformScale(
    sy / Math.max(uniformScale, 1e-9),
  );
  return { uniformScale, verticalScaleMul };
}
