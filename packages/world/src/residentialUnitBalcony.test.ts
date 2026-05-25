import { describe, expect, it } from "vitest";
import {
  contractResidentialBoundsXZForBalcony,
  extendResidentialBoundsXZForBalcony,
  livingPlayableSpanX,
  mapOwnedApartmentLayoutFractionToWorldX,
  mapOwnedApartmentWorldXToLayoutFraction,
  RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
  residentialBalconyPartitionFace,
  residentialBalconyInteriorAdjoinFace,
  residentialUnitBalconyExteriorEdge,
  residentialUnitHasBalconyBay,
} from "./residentialUnitBalcony.js";
import {
  addResidentialBalconyBayShell,
  residentialBalconyBayFrame,
  residentialBalconyExtensionRectXZ,
} from "./residentialUnitBalconyShell.js";
import { unitExteriorBrickWallMaterial } from "./floorPlaceholderMeshMaterials.js";
import * as THREE from "three";

const box = { minX: 0, maxX: 10, minZ: -3, maxZ: 3 };

describe("residentialUnitBalcony", () => {
  it("extends east units on +X and west units on −X", () => {
    expect(extendResidentialBoundsXZForBalcony(box, "unit_e_003").maxX).toBe(
      box.maxX + RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
    );
    expect(extendResidentialBoundsXZForBalcony(box, "unit_w_003").minX).toBe(
      box.minX - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M,
    );
  });

  it("contracts living volume and maps layout fractions over living depth only", () => {
    const east = extendResidentialBoundsXZForBalcony(box, "unit_e_003");
    const living = contractResidentialBoundsXZForBalcony(east, "unit_e_003");
    expect(living.maxX).toBe(box.maxX);
    expect(living.minX).toBe(box.minX);

    expect(livingPlayableSpanX(east.maxX - east.minX, "unit_e_003")).toBeCloseTo(
      box.maxX - box.minX,
      6,
    );

    expect(
      mapOwnedApartmentLayoutFractionToWorldX(
        east.minX,
        east.maxX,
        "unit_e_003",
        1,
      ),
    ).toBeCloseTo(box.maxX, 6);
    expect(
      mapOwnedApartmentLayoutFractionToWorldX(
        east.minX,
        east.maxX,
        "unit_e_003",
        0,
      ),
    ).toBeCloseTo(box.minX, 6);

    const west = extendResidentialBoundsXZForBalcony(box, "unit_w_003");
    expect(
      mapOwnedApartmentLayoutFractionToWorldX(
        west.minX,
        west.maxX,
        "unit_w_003",
        0,
      ),
    ).toBeCloseTo(box.minX, 6);
    expect(
      mapOwnedApartmentLayoutFractionToWorldX(
        west.minX,
        west.maxX,
        "unit_w_003",
        1,
      ),
    ).toBeCloseTo(box.maxX, 6);
  });

  it("round-trips world X ↔ layout fraction for balcony units", () => {
    for (const unitId of ["unit_e_014", "unit_w_014"] as const) {
      const edge = residentialUnitBalconyExteriorEdge(unitId);
      expect(edge).not.toBeNull();
      const extended = extendResidentialBoundsXZForBalcony(box, unitId);
      const fx = 0.37;
      const wx = mapOwnedApartmentLayoutFractionToWorldX(
        extended.minX,
        extended.maxX,
        unitId,
        fx,
      );
      expect(
        mapOwnedApartmentWorldXToLayoutFraction(
          extended.minX,
          extended.maxX,
          unitId,
          wx,
        ),
      ).toBeCloseTo(fx, 6);
    }
  });

  it("bay frame and slab extension are flush with the 9 m living shell (no gap)", () => {
    const sx = 9;
    const sz = 7.1;
    const livingHx = sx * 0.5;
    const east = residentialBalconyBayFrame("unit_e_003", sx, sz)!;
    expect(east.x0).toBeCloseTo(livingHx, 6);
    expect(east.x1).toBeCloseTo(livingHx + RESIDENTIAL_UNIT_BALCONY_OVERHANG_M, 6);

    const west = residentialBalconyBayFrame("unit_w_003", sx, sz)!;
    expect(west.x1).toBeCloseTo(-livingHx, 6);
    expect(west.x0).toBeCloseTo(-livingHx - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M, 6);

    const extE = residentialBalconyExtensionRectXZ("unit_e_003", sx, sz)!;
    expect(extE.x0).toBeCloseTo(east.x0, 6);
    expect(extE.x1).toBeCloseTo(east.x1, 6);

    expect(residentialBalconyInteriorAdjoinFace("unit_e_003")).toBe("w");
    expect(residentialBalconyInteriorAdjoinFace("unit_w_003")).toBe("e");
  });

  it("tags partition face and ignores non-residential ids", () => {
    expect(residentialUnitHasBalconyBay("unit_e_003")).toBe(true);
    expect(residentialBalconyPartitionFace("unit_e_003")).toBe("e");
    expect(residentialBalconyPartitionFace("unit_w_003")).toBe("w");
    expect(residentialUnitHasBalconyBay("stair_n_1")).toBe(false);
    expect(extendResidentialBoundsXZForBalcony(box, "stair_n_1")).toEqual(box);
  });

  it("adds brick N/S cheeks on balcony bays when the bar ends are interior", () => {
    const group = new THREE.Group();
    addResidentialBalconyBayShell(group, 9, 3.05, 7.1, "unit_e_003", {
      storyLevelIndex: 20,
      floorDocId: "test_floor",
      facadeSalt: 1,
      unitExteriorFaces: ["e"],
    });
    const sideClad: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (
        !obj.name.startsWith("shell_exterior_cladding_n") &&
        !obj.name.startsWith("shell_exterior_cladding_s")
      ) {
        return;
      }
      sideClad.push(obj);
    });
    expect(sideClad).toHaveLength(2);
    for (const mesh of sideClad) {
      expect(mesh.material).toBe(unitExteriorBrickWallMaterial);
    }
  });

  it("does not duplicate balcony bay N/S brick when unit bar ends are exterior", () => {
    const group = new THREE.Group();
    addResidentialBalconyBayShell(group, 9, 3.05, 7.1, "unit_e_003", {
      storyLevelIndex: 20,
      floorDocId: "test_floor",
      facadeSalt: 1,
      unitExteriorFaces: ["e", "n", "s"],
    });
    let sideCladCount = 0;
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (
        obj.name.startsWith("shell_exterior_cladding_n") ||
        obj.name.startsWith("shell_exterior_cladding_s")
      ) {
        sideCladCount += 1;
      }
    });
    expect(sideCladCount).toBe(0);
  });
});
