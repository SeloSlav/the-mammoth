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
  startScale?: THREE.Vector3;
  currentScale?: THREE.Vector3;
}): THREE.Vector3 {
  const { axis, localBounds, startScale, currentScale } = args;
  const center = localBounds.getCenter(new THREE.Vector3());
  const anchorForAxis = (
    includeAxis: boolean,
    minValue: number,
    maxValue: number,
    startValue: number | undefined,
    currentValue: number | undefined,
    centerValue: number,
  ) => {
    if (!includeAxis) return centerValue;
    if (startValue == null || currentValue == null) return minValue;
    return currentValue >= startValue ? minValue : maxValue;
  };
  return new THREE.Vector3(
    anchorForAxis(
      axis.includes("X"),
      localBounds.min.x,
      localBounds.max.x,
      startScale?.x,
      currentScale?.x,
      center.x,
    ),
    anchorForAxis(
      axis.includes("Y"),
      localBounds.min.y,
      localBounds.max.y,
      startScale?.y,
      currentScale?.y,
      center.y,
    ),
    anchorForAxis(
      axis.includes("Z"),
      localBounds.min.z,
      localBounds.max.z,
      startScale?.z,
      currentScale?.z,
      center.z,
    ),
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
