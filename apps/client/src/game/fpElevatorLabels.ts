import * as THREE from "three";
import type { ElevatorShaftLayout } from "@the-mammoth/world";

export type ElevatorDoorFace = ElevatorShaftLayout["doorFace"];

/** Level 1 = prizemlje (ground); in-car buttons use “PR”. */
export function floorButtonLabel(levelIndex: number): string {
  if (levelIndex <= 1) return "PR";
  return String(levelIndex);
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
