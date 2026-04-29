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
  handleAxisSigns?: THREE.Vector3;
}): THREE.Vector3 {
  const { axis, localBounds, handleAxisSigns } = args;
  const center = localBounds.getCenter(new THREE.Vector3());
  const anchorForAxis = (
    includeAxis: boolean,
    minValue: number,
    maxValue: number,
    handleSign: number | undefined,
    centerValue: number,
  ) => {
    if (!includeAxis) return centerValue;
    if (handleSign == null) return minValue;
    return handleSign < 0 ? maxValue : minValue;
  };
  return new THREE.Vector3(
    anchorForAxis(
      axis.includes("X"),
      localBounds.min.x,
      localBounds.max.x,
      handleAxisSigns?.x,
      center.x,
    ),
    anchorForAxis(
      axis.includes("Y"),
      localBounds.min.y,
      localBounds.max.y,
      handleAxisSigns?.y,
      center.y,
    ),
    anchorForAxis(
      axis.includes("Z"),
      localBounds.min.z,
      localBounds.max.z,
      handleAxisSigns?.z,
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
