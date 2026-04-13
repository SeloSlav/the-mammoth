import { describe, expect, it } from "vitest";
import { classifyPrefab } from "./floorPlaceholderMeshes.js";

describe("classifyPrefab", () => {
  it("classifies corridor and lobby prefabs", () => {
    expect(classifyPrefab("corridor_main")).toBe("corridor");
    expect(classifyPrefab("Lobby_A")).toBe("corridor");
    expect(classifyPrefab("hall_central")).toBe("corridor");
  });

  it("classifies residential units", () => {
    expect(classifyPrefab("apartment_1a")).toBe("unit");
    expect(classifyPrefab("UNIT_br")).toBe("unit");
  });

  it("classifies stair and elevator cores", () => {
    expect(classifyPrefab("stair_core")).toBe("core");
    expect(classifyPrefab("elevator_bank")).toBe("core");
  });

  it("defaults to misc", () => {
    expect(classifyPrefab("props_crate")).toBe("misc");
  });
});
