import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMyApartmentDecorNeighborSnap,
  EDITOR_MY_APARTMENT_DECOR_SURFACE_SNAP_M,
  inferDecorNeighborGapM,
} from "./editorMyApartmentDecorSnap.js";

function decorBox(
  id: string,
  x: number,
  z: number,
  size = 0.4,
): THREE.Group {
  const g = new THREE.Group();
  g.userData.mammothEditorMyApartmentDecorId = id;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.2, size),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.y = 0.1;
  g.add(mesh);
  g.position.set(x, 0, z);
  g.updateMatrixWorld(true);
  return g;
}

describe("editorMyApartmentDecorSnap", () => {
  it("infers the smallest face gap between separated décor on the same mount", () => {
    const mount = new THREE.Group();
    const a = decorBox("a", 0, 0);
    const b = decorBox("b", 0.5, 0);
    const c = decorBox("c", 0, 0.5);
    mount.add(a, b, c);
    expect(inferDecorNeighborGapM([a, b, c])).toBeCloseTo(0.1, 5);
  });

  it("snaps a fourth pot into a 2×2 grid using inferred spacing", () => {
    const mount = new THREE.Group();
    const gap = 0.08;
    const size = 0.4;
    const half = size * 0.5;
    const a = decorBox("a", 0, 0, size);
    const b = decorBox("b", size + gap, 0, size);
    const c = decorBox("c", 0, size + gap, size);
    mount.add(a, b, c);

    const d = decorBox("d", 0.55, 0.52, size);
    mount.add(d);

    applyMyApartmentDecorNeighborSnap(d, mount, { inferGapFromNeighbors: true });

    d.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(d);
    const bBox = new THREE.Box3().setFromObject(b);
    const cBox = new THREE.Box3().setFromObject(c);
    expect(box.min.x).toBeCloseTo(bBox.min.x, 3);
    expect(box.min.z).toBeCloseTo(cBox.min.z, 3);
  });

  it("aligns flush when gapM is zero", () => {
    const mount = new THREE.Group();
    const a = decorBox("a", 1, 1);
    const b = decorBox("b", 1.55, 1.05);
    mount.add(a, b);

    applyMyApartmentDecorNeighborSnap(b, mount, { gapM: 0 });

    b.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(b);
    const aBox = new THREE.Box3().setFromObject(a);
    expect(box.min.x).toBeCloseTo(aBox.max.x, 3);
  });

  it("does not snap when farther than the surface threshold", () => {
    const mount = new THREE.Group();
    const a = decorBox("a", 0, 0);
    const b = decorBox("b", 2, 0);
    mount.add(a, b);
    const startX = b.position.x;

    applyMyApartmentDecorNeighborSnap(b, mount, { gapM: 0 });
    expect(b.position.x).toBeCloseTo(startX, 5);
    expect(EDITOR_MY_APARTMENT_DECOR_SURFACE_SNAP_M).toBeGreaterThan(0.1);
  });
});
