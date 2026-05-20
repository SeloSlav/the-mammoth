import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { syncOwnedApartmentWallSurfaceTextureRepeats } from "./ownedApartmentWallSurfaceMaterial.js";
import {
  addWallConstantZWithHoles,
  applyWorldMetricUvsToAxisAlignedBoxMesh,
  MAMMOTH_WORLD_METRIC_WALL_UVS_UD,
  WALL_SEGMENT_UV_METERS_PER_TILE,
} from "./wallWithDoorCutout.js";
import {
  defaultOwnedApartmentWallDoorOpening,
  wallOpeningToHoleXY,
} from "./ownedApartmentPartitionWallMesh.js";

describe("syncOwnedApartmentWallSurfaceTextureRepeats", () => {
  it("keeps repeat at 1×1 when geometry already uses world-metric UVs", () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.5, 0.08),
      new THREE.MeshStandardMaterial(),
    );
    mesh.position.set(0, 2.35, 0);
    applyWorldMetricUvsToAxisAlignedBoxMesh(mesh);
    mesh.userData[MAMMOTH_WORLD_METRIC_WALL_UVS_UD] = true;

    const std = mesh.material as THREE.MeshStandardMaterial;
    const tex = new THREE.Texture();
    tex.repeat.set(9, 9);
    std.map = tex;

    syncOwnedApartmentWallSurfaceTextureRepeats(
      mesh,
      std,
      WALL_SEGMENT_UV_METERS_PER_TILE,
    );
    expect(tex.repeat.x).toBe(1);
    expect(tex.repeat.y).toBe(1);
  });

  it("tags every holed apartment wall fragment with metric UV userdata", () => {
    const visual = new THREE.Group();
    addWallConstantZWithHoles(
      visual,
      new THREE.MeshStandardMaterial(),
      0,
      0.08,
      -1.5,
      1.5,
      0,
      2.6,
      [wallOpeningToHoleXY(defaultOwnedApartmentWallDoorOpening("door_a"))],
      "apt_wall",
    );
    const meshes = visual.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBeGreaterThan(1);
    expect(
      meshes.every((m) => m.userData[MAMMOTH_WORLD_METRIC_WALL_UVS_UD] === true),
    ).toBe(true);
  });
});
