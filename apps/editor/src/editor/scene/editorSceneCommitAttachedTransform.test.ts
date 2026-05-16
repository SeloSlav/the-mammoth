import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveMyApartmentDecorCommittedDy } from "./editorSceneCommitAttachedTransform.js";
import { EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y } from "../myApartment/editorMyApartmentMeshes.js";

describe("resolveMyApartmentDecorCommittedDy", () => {
  it("serializes decor dy from the free-space pivot height", () => {
    const root = new THREE.Group();
    root.position.set(0, 1.75, 0);
    root.rotation.order = "YXZ";
    root.rotation.x = Math.PI / 6;
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentDecorCommittedDy({
        targetRoot: root,
      }),
    ).toBeCloseTo(1.75 - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 6);
  });

  it("is unaffected by child bounds moving under pitch rotation", () => {
    const root = new THREE.Group();
    root.position.set(0, 2.1, 0);
    const child = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5));
    child.position.y = -3;
    root.add(child);
    root.rotation.order = "YXZ";
    root.rotation.x = Math.PI / 6;
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentDecorCommittedDy({
        targetRoot: root,
      }),
    ).toBeCloseTo(2.1 - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 6);
  });
});
