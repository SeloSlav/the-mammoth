import * as THREE from "three";

export type AnchoredScaleAxis = "X" | "Y" | "Z" | "XY" | "XZ" | "YZ";

export function anchoredScaleAxisFromTransformAxis(
  axis: string | null | undefined,
): AnchoredScaleAxis | null {
  if (axis === "X" || axis === "Y" || axis === "Z") return axis;
  if (axis === "XY" || axis === "XZ" || axis === "YZ") return axis;
  return null;
}

export function anchoredScaleAnchorLocalPoint(args: {
  axis: AnchoredScaleAxis;
  localBounds: THREE.Box3;
}): THREE.Vector3 {
  const { axis, localBounds } = args;
  const center = localBounds.getCenter(new THREE.Vector3());
  return new THREE.Vector3(
    axis.includes("X") ? localBounds.min.x : center.x,
    axis.includes("Y") ? localBounds.min.y : center.y,
    axis.includes("Z") ? localBounds.min.z : center.z,
  );
}

export function computeAnchoredScalePosition(args: {
  startPosition: THREE.Vector3;
  startScale: THREE.Vector3;
  currentScale: THREE.Vector3;
  rotation: THREE.Quaternion;
  anchorLocalPoint: THREE.Vector3;
}): THREE.Vector3 {
  const { startPosition, startScale, currentScale, rotation, anchorLocalPoint } = args;
  const localDelta = new THREE.Vector3(
    anchorLocalPoint.x * (startScale.x - currentScale.x),
    anchorLocalPoint.y * (startScale.y - currentScale.y),
    anchorLocalPoint.z * (startScale.z - currentScale.z),
  );
  return startPosition.clone().add(localDelta.applyQuaternion(rotation));
}
