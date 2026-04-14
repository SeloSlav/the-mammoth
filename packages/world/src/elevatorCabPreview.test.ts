import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ElevatorCabDefSchema } from "@the-mammoth/schemas";
import { applyElevatorCabPartTransforms } from "./elevatorCabPreview.js";

describe("applyElevatorCabPartTransforms", () => {
  it("applies partTransforms to tagged meshes", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh();
    mesh.userData.editorCabPartId = "cab_floor";
    mesh.position.set(0, 0, 0);
    root.add(mesh);

    const def = ElevatorCabDefSchema.parse({
      id: "t",
      version: 1,
      partTransforms: {
        cab_floor: { position: [1, 2, 3], scale: [2, 1, 1] },
      },
    });

    applyElevatorCabPartTransforms(root, def);
    expect(mesh.position.x).toBe(1);
    expect(mesh.position.y).toBe(2);
    expect(mesh.position.z).toBe(3);
    expect(mesh.scale.x).toBe(2);
  });
});
