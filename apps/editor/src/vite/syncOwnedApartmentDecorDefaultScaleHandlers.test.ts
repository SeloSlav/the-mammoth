import { describe, expect, it } from "vitest";
import { buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems } from "../../../../scripts/lib/sync-owned-apartment-decor-default-scale-core.mjs";
import { parseSyncOwnedApartmentDecorDefaultScaleBody } from "./syncOwnedApartmentDecorDefaultScaleHandlers.js";

describe("parseSyncOwnedApartmentDecorDefaultScaleBody", () => {
  it("accepts empty body for disk sync", () => {
    expect(parseSyncOwnedApartmentDecorDefaultScaleBody({})).toEqual({});
  });

  it("accepts placedItems from the editor", () => {
    expect(
      parseSyncOwnedApartmentDecorDefaultScaleBody({
        placedItems: [{ modelRelPath: "static/models/objects/chair.glb", uniformScale: 0.5 }],
      }),
    ).toEqual({
      placedItems: [{ modelRelPath: "static/models/objects/chair.glb", uniformScale: 0.5 }],
    });
  });

  it("rejects non-array placedItems", () => {
    expect(
      parseSyncOwnedApartmentDecorDefaultScaleBody({
        placedItems: "nope" as unknown as [],
      }),
    ).toEqual({ error: "placedItems must be an array when provided" });
  });
});

describe("buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems (core)", () => {
  it("keeps first placement per modelRelPath", () => {
    const map = buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems([
      { modelRelPath: "static/models/objects/chair.glb", uniformScale: 0.64 },
      { modelRelPath: "static/models/objects/chair.glb", uniformScale: 0.99 },
      { modelRelPath: "/static/models/objects/desk.glb", uniformScale: 1.08, verticalScaleMul: 1.1 },
    ]);
    expect(map["static/models/objects/chair.glb"]).toEqual({
      uniformScale: 0.64,
      verticalScaleMul: 1,
    });
    expect(map["static/models/objects/desk.glb"]).toEqual({
      uniformScale: 1.08,
      verticalScaleMul: 1.1,
    });
  });
});
