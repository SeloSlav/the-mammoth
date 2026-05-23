import * as THREE from "three";
import {
  OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN,
  ownedApartmentDecorRootScaleFromComponents,
  resolveOwnedApartmentDecorRootScale,
  type OwnedApartmentDecorRootScaleFields,
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

/** Center cube only — proportional scale on all three axes. */
export function isMyApartmentDecorUniformScaleAxis(axis: string | null | undefined): boolean {
  if (!axis) return false;
  return axis === "XYZ" || axis === "E" || axis === "XYZE";
}

/** Sample a uniform scale factor from the center-cube gizmo drag. */
export function myApartmentDecorUniformScaleSampleFromGizmo(
  root: THREE.Object3D,
): number {
  const { x, y, z } = root.scale;
  return (x + y + z) / 3;
}

/** Apply proportional scale from the center cube (all axes equal). */
export function applyMyApartmentDecorUniformScale(root: THREE.Object3D): void {
  const uniform = clampOwnedApartmentDecorUniformScale(
    myApartmentDecorUniformScaleSampleFromGizmo(root),
  );
  root.scale.setScalar(uniform);
}

export type MyApartmentDecorRootScaleSource = {
  uniformScale: number;
  verticalScaleMul?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
};

/** Apply authored decor scale for reload / commit. */
export function applyMyApartmentDecorRootScaleFromDoc(
  root: THREE.Object3D,
  scaleSource: MyApartmentDecorRootScaleSource,
): void {
  const { x, y, z } = resolveOwnedApartmentDecorRootScale(scaleSource);
  root.scale.set(x, y, z);
}

/**
 * During scale drags: axis handles stretch one dimension; plane squares scale their plane;
 * center cube scales proportionally on X/Y/Z.
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
    return;
  }
  if (isMyApartmentDecorUniformScaleAxis(opts.axis)) {
    applyMyApartmentDecorUniformScale(root);
    return;
  }
  const pin = opts.gesturePin;
  if (pin && opts.dragging && opts.axis) {
    if (opts.axis.indexOf("X") === -1) root.scale.x = pin.startScale.x;
    if (opts.axis.indexOf("Y") === -1) root.scale.y = pin.startScale.y;
    if (opts.axis.indexOf("Z") === -1) root.scale.z = pin.startScale.z;
  }
  root.scale.x = clampOwnedApartmentDecorUniformScale(root.scale.x);
  root.scale.y = clampOwnedApartmentDecorUniformScale(root.scale.y);
  root.scale.z = clampOwnedApartmentDecorUniformScale(root.scale.z);
}

/** Map root scale after a gizmo session into JSON fields. */
export function readMyApartmentDecorCommittedScale(
  root: THREE.Object3D,
): OwnedApartmentDecorRootScaleFields {
  return ownedApartmentDecorRootScaleFromComponents(root.scale);
}
