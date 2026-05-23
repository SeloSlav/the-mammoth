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
  /** TransformControls pointer-down position in the scale plane (for proportional drags). */
  pointerStart: THREE.Vector3;
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

/** Side handles — stretch one axis only. */
export function isMyApartmentDecorSingleAxisScaleAxis(
  axis: string | null | undefined,
): axis is "X" | "Y" | "Z" {
  return axis === "X" || axis === "Y" || axis === "Z";
}

/** Same distance-ratio model TransformControls uses for the center cube. */
export function myApartmentDecorPointerDistanceScaleFactor(
  pointerStart: THREE.Vector3,
  pointerEnd: THREE.Vector3,
): number {
  const startLen = pointerStart.length();
  if (startLen < 1e-9) return 1;
  let factor = pointerEnd.length() / startLen;
  if (pointerEnd.dot(pointerStart) < 0) factor *= -1;
  return factor;
}

function clampScaleComponents(root: THREE.Object3D): void {
  root.scale.x = clampOwnedApartmentDecorUniformScale(root.scale.x);
  root.scale.y = clampOwnedApartmentDecorUniformScale(root.scale.y);
  root.scale.z = clampOwnedApartmentDecorUniformScale(root.scale.z);
}

/** Apply proportional scale from the center cube (all axes equal). */
export function applyMyApartmentDecorUniformScaleFromGesture(
  root: THREE.Object3D,
  startScale: THREE.Vector3,
  pointerStart: THREE.Vector3,
  pointerEnd: THREE.Vector3,
): void {
  const factor = myApartmentDecorPointerDistanceScaleFactor(pointerStart, pointerEnd);
  const base = (startScale.x + startScale.y + startScale.z) / 3;
  const uniform = clampOwnedApartmentDecorUniformScale(base * factor);
  root.scale.setScalar(uniform);
}

/** Collapse plane-square drags to one factor on the active plane, at any drag angle. */
export function applyMyApartmentDecorPlaneUniformScaleFromGesture(
  root: THREE.Object3D,
  axis: string,
  startScale: THREE.Vector3,
  pointerStart: THREE.Vector3,
  pointerEnd: THREE.Vector3,
): void {
  const factor = myApartmentDecorPointerDistanceScaleFactor(pointerStart, pointerEnd);
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

/** Keep only the dragged axis from TransformControls; pin the other two to gesture start. */
export function applyMyApartmentDecorSingleAxisScaleFromGesture(
  root: THREE.Object3D,
  axis: "X" | "Y" | "Z",
  startScale: THREE.Vector3,
): void {
  if (axis === "X") {
    root.scale.x = clampOwnedApartmentDecorUniformScale(root.scale.x);
    root.scale.y = startScale.y;
    root.scale.z = startScale.z;
    return;
  }
  if (axis === "Y") {
    root.scale.x = startScale.x;
    root.scale.y = clampOwnedApartmentDecorUniformScale(root.scale.y);
    root.scale.z = startScale.z;
    return;
  }
  root.scale.x = startScale.x;
  root.scale.y = startScale.y;
  root.scale.z = clampOwnedApartmentDecorUniformScale(root.scale.z);
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
 * During scale drags: side handles stretch one axis; plane squares scale proportionally on
 * their plane at any drag angle; center cube scales uniformly on X/Y/Z.
 */
export function constrainMyApartmentDecorScaleFromGizmo(
  root: THREE.Object3D,
  opts: {
    transformMode: string;
    axis: string | null | undefined;
    dragging: boolean;
    gesturePin: MyApartmentDecorScaleGesturePin | null;
    pointerEnd?: THREE.Vector3 | null;
  },
): void {
  if (opts.transformMode !== "scale" || !opts.dragging || !opts.axis) {
    return;
  }
  const pin = opts.gesturePin;
  if (!pin) {
    clampScaleComponents(root);
    return;
  }

  const pointerEnd = opts.pointerEnd;
  const hasPointer =
    pointerEnd instanceof THREE.Vector3 && pin.pointerStart.lengthSq() > 1e-12;

  if (isMyApartmentDecorUniformScaleAxis(opts.axis)) {
    if (hasPointer) {
      applyMyApartmentDecorUniformScaleFromGesture(
        root,
        pin.startScale,
        pin.pointerStart,
        pointerEnd,
      );
    } else {
      const factor = myApartmentDecorPlaneUniformScaleFactorFromComponents(
        root,
        pin.startScale,
        opts.axis,
      );
      const base = (pin.startScale.x + pin.startScale.y + pin.startScale.z) / 3;
      root.scale.setScalar(clampOwnedApartmentDecorUniformScale(base * factor));
    }
    return;
  }

  if (isMyApartmentDecorPlaneScaleAxis(opts.axis)) {
    if (hasPointer) {
      applyMyApartmentDecorPlaneUniformScaleFromGesture(
        root,
        opts.axis,
        pin.startScale,
        pin.pointerStart,
        pointerEnd,
      );
    } else {
      applyMyApartmentDecorPlaneUniformScaleFromComponents(root, opts.axis, pin.startScale);
    }
    return;
  }

  if (isMyApartmentDecorSingleAxisScaleAxis(opts.axis)) {
    applyMyApartmentDecorSingleAxisScaleFromGesture(root, opts.axis, pin.startScale);
    return;
  }

  clampScaleComponents(root);
}

/** Fallback when pointer samples are unavailable (unit tests, first frame). */
function myApartmentDecorPlaneUniformScaleFactorFromComponents(
  root: THREE.Object3D,
  startScale: THREE.Vector3,
  axis: string,
): number {
  const ratios: number[] = [];
  if (axis.includes("X")) ratios.push(root.scale.x / startScale.x);
  if (axis.includes("Y")) ratios.push(root.scale.y / startScale.y);
  if (axis.includes("Z")) ratios.push(root.scale.z / startScale.z);
  if (ratios.length === 0) return 1;
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

function applyMyApartmentDecorPlaneUniformScaleFromComponents(
  root: THREE.Object3D,
  axis: string,
  startScale: THREE.Vector3,
): void {
  const factor = myApartmentDecorPlaneUniformScaleFactorFromComponents(root, startScale, axis);
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

/** @deprecated Use {@link applyMyApartmentDecorUniformScaleFromGesture} in tests only. */
export function applyMyApartmentDecorUniformScale(root: THREE.Object3D): void {
  const uniform = clampOwnedApartmentDecorUniformScale(
    (root.scale.x + root.scale.y + root.scale.z) / 3,
  );
  root.scale.setScalar(uniform);
}
