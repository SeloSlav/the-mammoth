import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addConcreteSlabWithOptionalShaftHoles } from "./floorSlabPlaceholder.js";

describe("addConcreteSlabWithOptionalShaftHoles", () => {
  it("emits a single placeholder mesh when there are no shaft holes", () => {
    const root = new THREE.Group();
    const min = new THREE.Vector3(0, 2, 0);
    const max = new THREE.Vector3(2, 2, 1);
    const slab = new THREE.MeshStandardMaterial({ color: 0x888888 });

    addConcreteSlabWithOptionalShaftHoles(root, min, max, 0, 0.2, [], slab);

    expect(root.children.length).toBe(1);
    const mesh = root.children[0] as THREE.Mesh;
    expect(mesh.name).toBe("floor_slab_placeholder");
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
  });

  it("splits the pad into multiple named pieces when a hole punches the footprint", () => {
    const root = new THREE.Group();
    const min = new THREE.Vector3(0, 3, 0);
    const max = new THREE.Vector3(4, 3, 2);
    const slab = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const holes = [{ cx: 2, cz: 1, hx: 0.4, hz: 0.4 }];

    addConcreteSlabWithOptionalShaftHoles(root, min, max, 0, 0.16, holes, slab);

    expect(root.children.length).toBeGreaterThanOrEqual(2);
    const names = root.children.map((c) => c.name);
    expect(names.every((n) => /^floor_slab_piece_\d+$/.test(n))).toBe(true);
    expect(names[0]).toBe("floor_slab_piece_0");
  });
});
