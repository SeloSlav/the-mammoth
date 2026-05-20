import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildOwnedApartmentPartitionWallInGroup,
  clampWallOpeningTangentOffsetM,
  defaultOwnedApartmentWallDoorOpening,
  EDITOR_MY_APARTMENT_WALL_VISUAL_UD,
  wallOpeningToHoleXY,
} from "./ownedApartmentPartitionWallMesh.js";

describe("ownedApartmentPartitionWallMesh", () => {
  it("maps a standard door opening to wall-local hole bounds", () => {
    const opening = defaultOwnedApartmentWallDoorOpening("door_a");
    expect(wallOpeningToHoleXY(opening)).toEqual({
      x0: -0.45,
      x1: 0.45,
      y0: 0,
      y1: 2.1,
    });
  });

  it("clamps tangent offset so the opening stays inside the wall span", () => {
    expect(clampWallOpeningTangentOffsetM(2, 0.9, 0.8)).toBeCloseTo(0.53, 2);
    expect(clampWallOpeningTangentOffsetM(2, 0.9, 0)).toBe(0);
  });

  it("builds more than one mesh fragment when a doorway hole is present", () => {
    const parent = new THREE.Group();
    const opening = defaultOwnedApartmentWallDoorOpening("door_a");
    buildOwnedApartmentPartitionWallInGroup({
      parent,
      sizeX: 3,
      sizeY: 2.6,
      sizeZ: 0.08,
      openings: [opening],
      wallMaterial: new THREE.MeshStandardMaterial(),
      opts: { editorWallVisual: true },
    });
    const visuals = parent.children.filter(
      (c) => c.name === "wall_visual",
    )[0] as THREE.Group;
    const fragments = visuals.children.filter(
      (c) => c instanceof THREE.Mesh && c.userData[EDITOR_MY_APARTMENT_WALL_VISUAL_UD] === true,
    );
    expect(fragments.length).toBeGreaterThan(1);
  });
});
