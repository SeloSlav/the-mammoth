import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
} from "@the-mammoth/schemas";
import type { ApartmentUnit } from "../../module_bindings/types";
import { buildApartmentWallAuthoringGroup } from "./fpApartmentWallAuthoringGroup";

function apartmentUnit(overrides: Partial<ApartmentUnit> = {}): ApartmentUnit {
  return {
    unitKey: "floor_a|18|unit_w_001",
    floorDocId: "floor_a",
    level: 18,
    unitId: "unit_w_001",
    state: 1,
    owner: null,
    claimProgressSecs: 0,
    claimStartedBy: null,
    lastClaimPulseMicros: 0n,
    reinforceProgressSecs: 0,
    reinforceBy: null,
    reinforced: 0,
    bedX: 1,
    bedY: 10,
    bedZ: 2,
    bedYaw: 0.5,
    footX: 3,
    footY: 10,
    footZ: 4,
    wardrobeX: 5,
    wardrobeZ: 6,
    stoveX: 2,
    stoveZ: 3,
    boundMinX: 100,
    boundMaxX: 112,
    boundMinZ: 200,
    boundMaxZ: 208,
    boundMinY: 30,
    boundMaxY: 33,
    ...overrides,
  } as ApartmentUnit;
}

/** Strict-hull AABB clamp removed from runtime wall mount — kept here to guard parity regressions. */
function legacyStrictHullXZClamp(root: THREE.Object3D, unit: ApartmentUnit): void {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  const spanX = unit.boundMaxX - unit.boundMinX;
  const spanZ = unit.boundMaxZ - unit.boundMinZ;
  const minX = unit.boundMinX + spanX * OWNED_APARTMENT_LAYOUT_FRACTION_MIN;
  const maxX = unit.boundMinX + spanX * OWNED_APARTMENT_LAYOUT_FRACTION_MAX;
  const minZ = unit.boundMinZ + spanZ * OWNED_APARTMENT_LAYOUT_FRACTION_MIN;
  const maxZ = unit.boundMinZ + spanZ * OWNED_APARTMENT_LAYOUT_FRACTION_MAX;

  let dx = 0;
  if (size.x > maxX - minX) {
    dx = (minX + maxX) * 0.5 - center.x;
  } else if (bounds.min.x < minX) {
    dx = minX - bounds.min.x;
  } else if (bounds.max.x > maxX) {
    dx = maxX - bounds.max.x;
  }

  let dz = 0;
  if (size.z > maxZ - minZ) {
    dz = (minZ + maxZ) * 0.5 - center.z;
  } else if (bounds.min.z < minZ) {
    dz = minZ - bounds.min.z;
  } else if (bounds.max.z > maxZ) {
    dz = maxZ - bounds.max.z;
  }

  if (dx !== 0 || dz !== 0) {
    root.position.x += dx;
    root.position.z += dz;
  }
}

describe("buildApartmentWallAuthoringGroup", () => {
  it("preserves authored XZ after floor snap", () => {
    const g = buildApartmentWallAuthoringGroup({
      posX: 106,
      posY: 30.05,
      posZ: 202,
      yawRad: 0.1,
      pitchRad: -0.05,
      sizeX: 1.6,
      sizeY: 0.71,
      sizeZ: 0.07,
    });

    expect(g.position.x).toBeCloseTo(106, 5);
    expect(g.position.z).toBeCloseTo(202, 5);
  });

  it("does not apply strict-hull XZ reclamp that shifts south-placed slabs", () => {
    const unit = apartmentUnit({
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0.88,
      boundMaxZ: 7.48,
      boundMinY: 30,
      boundMaxY: 33,
    });
    const authoredZ = 0.11;
    const g = buildApartmentWallAuthoringGroup({
      posX: 3,
      posY: 30,
      posZ: authoredZ,
      yawRad: Math.PI / 2,
      pitchRad: 0,
      sizeX: 1.6,
      sizeY: 0.71,
      sizeZ: 0.07,
    });

    expect(g.position.z).toBeCloseTo(authoredZ, 5);

    const shifted = buildApartmentWallAuthoringGroup({
      posX: 3,
      posY: 30,
      posZ: authoredZ,
      yawRad: Math.PI / 2,
      pitchRad: 0,
      sizeX: 1.6,
      sizeY: 0.71,
      sizeZ: 0.07,
    });
    legacyStrictHullXZClamp(shifted, unit);
    expect(shifted.position.z).toBeGreaterThan(authoredZ + 0.05);
  });
});
