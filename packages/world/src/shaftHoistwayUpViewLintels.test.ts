import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { addElevatorShaftPlaceholder } from "./elevatorShaftPlaceholder.js";

describe("addHoistwayUpViewLintelRing (via elevator placeholder)", () => {
  it("adds four tagged lintel boxes at the open top of the hoistway slice", () => {
    const g = new THREE.Group();
    addElevatorShaftPlaceholder(g, 2.2, 3.16, 2.2, {
      groundDoor: { face: "n", bandHeightM: 3.16 },
      includePitFloor: false,
    });
    const lintels: string[] = [];
    g.traverse((o) => {
      if (o.name.startsWith("shaft_hoistway_lintel_")) lintels.push(o.name);
    });
    expect(lintels.sort()).toEqual([
      "shaft_hoistway_lintel_e",
      "shaft_hoistway_lintel_n",
      "shaft_hoistway_lintel_s",
      "shaft_hoistway_lintel_w",
    ]);
    let skipMerge = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.mammothSkipFloorGeometryMerge === true) {
        skipMerge++;
      }
    });
    expect(skipMerge).toBeGreaterThanOrEqual(4);
  });
});
