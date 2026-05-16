import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveMyApartmentDecorCommittedDy } from "./editorSceneCommitAttachedTransform.js";

describe("resolveMyApartmentDecorCommittedDy", () => {
  it("preserves dy during pure pitch rotation", () => {
    const root = new THREE.Group();
    root.position.set(0, 1.75, 0);
    root.rotation.order = "YXZ";
    root.rotation.x = Math.PI / 6;
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentDecorCommittedDy({
        gesture: {
          object: root,
          startRootWorldY: 1.75,
          startDy: 0.42,
        },
        targetRoot: root,
        fallbackDy: 0.1,
      }),
    ).toBeCloseTo(0.42, 6);
  });

  it("applies world-space root Y translation delta on top of the starting dy", () => {
    const root = new THREE.Group();
    root.position.set(0, 2.1, 0);
    root.rotation.order = "YXZ";
    root.rotation.x = Math.PI / 6;
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentDecorCommittedDy({
        gesture: {
          object: root,
          startRootWorldY: 1.6,
          startDy: 0.35,
        },
        targetRoot: root,
        fallbackDy: 0.1,
      }),
    ).toBeCloseTo(0.85, 6);
  });

  it("falls back to the existing dy outside an active decor gesture", () => {
    const root = new THREE.Group();
    root.position.set(0, 3, 0);
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentDecorCommittedDy({
        gesture: null,
        targetRoot: root,
        fallbackDy: 1.25,
      }),
    ).toBeCloseTo(1.25, 6);
  });
});
