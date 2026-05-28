import { describe, expect, it } from "vitest";
import {
  apartmentUnitAbandonedHardwoodFloorMaterial,
  floorPlaceholderMeshMaterials,
} from "./floorPlaceholderMeshMaterials.js";
import { matsFor } from "./floorPlaceholderPrefabKind.js";

describe("matsFor unit floors", () => {
  it("uses abandoned hardwood fungus on display floors 16 and below", () => {
    expect(matsFor("unit", 17).floor).toBe(floorPlaceholderMeshMaterials.unitFloorAbandonedHardwood);
    expect(matsFor("unit", 17).floor).toBe(apartmentUnitAbandonedHardwoodFloorMaterial);
  });

  it("keeps basketweave parquet on occupied residential floors", () => {
    expect(matsFor("unit", 18).floor).toBe(floorPlaceholderMeshMaterials.unitFloor);
  });

  it("defaults to parquet when story level is omitted or legacy 99", () => {
    expect(matsFor("unit").floor).toBe(floorPlaceholderMeshMaterials.unitFloor);
    expect(matsFor("unit", 99).floor).toBe(floorPlaceholderMeshMaterials.unitFloor);
  });
});
