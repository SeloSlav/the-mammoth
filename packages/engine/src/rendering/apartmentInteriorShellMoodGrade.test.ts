import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  apartmentInteriorShellMoodSlot,
  isApartmentInteriorShellMesh,
} from "./bindMammothApartmentDecorIndirectEnv.js";
import {
  moodGradeMammothApartmentShellRoot,
  MAMMOTH_APARTMENT_SHELL_MOOD_GRADED_UD,
} from "./apartmentDecorMoodGrade.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("apartmentInteriorShellMoodSlot", () => {
  it("classifies floor and wall shell meshes", () => {
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    floor.name = "shell_floor";
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    wall.name = "shell_wall_e";

    expect(apartmentInteriorShellMoodSlot(floor)).toBe("floor");
    expect(apartmentInteriorShellMoodSlot(wall)).toBe("wallCeil");
    expect(isApartmentInteriorShellMesh(floor)).toBe(true);
  });
});

describe("moodGradeMammothApartmentShellRoot", () => {
  it("applies warm wall emissive floor and profile tint once", () => {
    const root = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    wall.name = "shell_wall_n";
    root.add(wall);

    moodGradeMammothApartmentShellRoot(root);
    moodGradeMammothApartmentShellRoot(root);

    expect(wall.userData[MAMMOTH_APARTMENT_SHELL_MOOD_GRADED_UD]).toBe(true);
    const mat = wall.material as THREE.MeshStandardMaterial;
    expect(mat.emissiveIntensity).toBe(
      APARTMENT_INTERIOR_VISUAL_PROFILE.shell.wallCeilEmissiveIntensity,
    );
    expect(mat.color.r).toBeCloseTo(
      APARTMENT_INTERIOR_VISUAL_PROFILE.shell.wallCeilColor.r,
      2,
    );
  });
});
