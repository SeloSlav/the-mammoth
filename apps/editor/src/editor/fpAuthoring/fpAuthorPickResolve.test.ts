import * as THREE from "three";
import type { FpAuthoringPick } from "@the-mammoth/engine";
import { describe, expect, it } from "vitest";
import { resolveFpAuthorPickId } from "./fpAuthorPickResolve.js";

const box = (): THREE.Mesh =>
  new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());

describe("resolveFpAuthorPickId", () => {
  it("prefers the innermost pick (minimal ancestor depth from hit)", () => {
    const rig = new THREE.Group();
    const hand = new THREE.Group();
    const grip = new THREE.Group();
    const weaponRoot = new THREE.Group();
    const weaponVisual = new THREE.Group();
    const triangle = box();

    rig.add(hand);
    hand.add(grip);
    grip.add(weaponRoot);
    weaponRoot.add(weaponVisual);
    weaponVisual.add(triangle);

    const picks: FpAuthoringPick[] = [
      { id: "rigRoot", label: "", object: rig },
      { id: "hand", label: "", object: hand },
      { id: "weapon", label: "", object: weaponRoot },
    ];

    expect(resolveFpAuthorPickId(triangle, picks)).toBe("weapon");

    const palm = box();
    hand.add(palm);
    expect(resolveFpAuthorPickId(palm, picks)).toBe("hand");
  });

  it("does not wrongly prefer rigRoot over hand when hitting under the weapon branch", () => {
    const rig = new THREE.Group();
    const hand = new THREE.Group();
    rig.add(hand);

    const wMesh = box();
    hand.add(wMesh);

    const picks: FpAuthoringPick[] = [
      { id: "rigRoot", label: "", object: rig },
      { id: "hand", label: "", object: hand },
    ];

    expect(resolveFpAuthorPickId(wMesh, picks)).toBe("hand");
  });
});
