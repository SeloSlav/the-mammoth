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

/** Plane squares — proportional scale on the active plane (XY / YZ / XZ). */
export function isMyApartmentDecorPlaneScaleAxis(axis: string | null | undefined): boolean {
  if (!axis) return false;
  return axis === "XY" || axis === "YZ" || axis === "XZ";
}

/** Average scale factor across the active plane axes relative to gesture start. */
export function myApartmentDecorPlaneUniformScaleFactorFromGizmo(
  root: THREE.Object3D,
  axis: string,
  startScale: THREE.Vector3,
): number {
  const ratios: number[] = [];
  if (axis.includes("X")) ratios.push(root.scale.x / startScale.x);
  if (axis.includes("Y")) ratios.push(root.scale.y / startScale.y);
  if (axis.includes("Z")) ratios.push(root.scale.z / startScale.z);
  if (ratios.length === 0) return 1;
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

/** Collapse plane-square drags to uniform scale on the active plane; pin the third axis. */
export function applyMyApartmentDecorPlaneUniformScale(
  root: THREE.Object3D,
  axis: string,
  startScale: THREE.Vector3,
): void {
  const factor = myApartmentDecorPlaneUniformScaleFactorFromGizmo(root, axis, startScale);
  if (axis.includes("X")) {
    root.scale.x = clampOwnedApartmentDecorUniformScale(startScale.x * factor);
  } else {
    root.scale.x = startScale.x;
  }
  if (axis.includes("Y")) {
    root.scale.y = clampOwnedApartmentDecorUniformScale(startScale.y * factor);
  } else {
    root.scale.y = startScale.y;
  }
  if (axis.includes("Z")) {
    root.scale.z = clampOwnedApartmentDecorUniformScale(startScale.z * factor);
  } else {
    root.scale.z = startScale.z;
  }
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
    if (isMyApartmentDecorPlaneScaleAxis(opts.axis)) {
      applyMyApartmentDecorPlaneUniformScale(root, opts.axis, pin.startScale);
      return;
    }
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

/**
 * Saved-group manipulators scale a transient parent; bake that delta into each decor
 * child's local scale so commits read the stretched dimensions.
 */
export function bakeMyApartmentGroupManipScaleIntoDecorChildren(
  manip: THREE.Object3D,
  manipStartScale: THREE.Vector3,
  decorStartScalesByUuid: ReadonlyMap<string, THREE.Vector3>,
): void {
  const sx = manip.scale.x / Math.max(Math.abs(manipStartScale.x), 1e-9);
  const sy = manip.scale.y / Math.max(Math.abs(manipStartScale.y), 1e-9);
  const sz = manip.scale.z / Math.max(Math.abs(manipStartScale.z), 1e-9);
  for (const child of manip.children) {
    if (!(child instanceof THREE.Group)) continue;
    if (!child.userData.mammothEditorMyApartmentDecorId) continue;
    const start = decorStartScalesByUuid.get(child.uuid);
    if (!start) continue;
    child.scale.set(
      clampOwnedApartmentDecorUniformScale(start.x * sx),
      clampOwnedApartmentDecorUniformScale(start.y * sy),
      clampOwnedApartmentDecorUniformScale(start.z * sz),
    );
  }
  manip.scale.copy(manipStartScale);
}
