import * as THREE from "three";
import {
  shortFloorLabelForLevel,
  type ElevatorShaftLayout,
  type FloorShortLabelMap,
} from "@the-mammoth/world";

export type ElevatorDoorFace = ElevatorShaftLayout["doorFace"];

/** Returns the authored compact label for a storey, falling back to the raw level index. */
export function floorButtonLabel(
  levelIndex: number,
  floorLabelByLevel?: FloorShortLabelMap,
): string {
  return shortFloorLabelForLevel(levelIndex, floorLabelByLevel);
}

export function doorSlideAxis(face: ElevatorDoorFace): THREE.Vector3 {
  switch (face) {
    case "e":
    case "w":
      return new THREE.Vector3(0, 0, 1);
    case "n":
    case "s":
      return new THREE.Vector3(1, 0, 0);
  }
}
