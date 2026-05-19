import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  bindMammothResidentialShellIndirectEnv,
  MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD,
} from "./bindMammothApartmentDecorIndirectEnv.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("bindMammothResidentialShellIndirectEnv", () => {
  it("binds PMREM only on merged unit shell meshes", () => {
    const env = new THREE.Texture();
    const root = new THREE.Group();

    const shellSource = new THREE.MeshStandardMaterial({ color: 0xe6e0d8, roughness: 1 });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shellSource);
    shell.userData.mammothPlacedObjectId = "unit_e_001";
    root.add(shell);

    const corridor = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x050505 }),
    );
    root.add(corridor);

    bindMammothResidentialShellIndirectEnv(root, env);

    const shellMat = shell.material as THREE.MeshStandardMaterial;
    expect(shellMat).not.toBe(shellSource);
    expect(shellMat.envMap).toBe(env);
    const corridorMat = corridor.material as THREE.MeshStandardMaterial;
    expect(shellMat.envMap).toBe(env);
    expect(shellMat.envMapIntensity).toBe(
      APARTMENT_INTERIOR_VISUAL_PROFILE.shell.indirectEnvIntensity,
    );
    expect(corridorMat.envMap).toBeNull();
  });

  it("binds editor authoring shell meshes tagged for interior preview", () => {
    const env = new THREE.Texture();
    const root = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x050505 }),
    );
    shell.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] = true;
    root.add(shell);

    bindMammothResidentialShellIndirectEnv(root, env);
    expect((shell.material as THREE.MeshStandardMaterial).envMap).toBe(env);
  });
});
