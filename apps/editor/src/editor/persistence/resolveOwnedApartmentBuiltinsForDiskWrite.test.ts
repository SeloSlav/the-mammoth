import { describe, expect, it } from "vitest";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  ownedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import {
  isDestructiveOwnedApartmentBuiltinsOverwrite,
  resolveOwnedApartmentBuiltinsForDiskWrite,
} from "./resolveOwnedApartmentBuiltinsForDiskWrite.js";

const richLayout = ownedApartmentBuiltinsDoc({
  ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  placedItems: [
    ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
    {
      id: "decor_extra",
      modelRelPath: "static/models/objects/chair.glb",
      fx: 0.5,
      fz: 0.5,
      dy: 0,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: 1,
      itemKind: "plain",
    },
  ],
});

describe("resolveOwnedApartmentBuiltinsForDiskWrite", () => {
  it("prefers live ownedApartmentBuiltins while authoring owned default", () => {
    const resolved = resolveOwnedApartmentBuiltinsForDiskWrite({
      mode: "my_apartment_layout",
      activeApartmentLayoutSource: "owned_default",
      ownedApartmentBuiltins: richLayout,
      ownedApartmentDefaultBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
    });
    expect(resolved.placedItems).toHaveLength(richLayout.placedItems.length);
  });

  it("uses default snapshot for cross-workspace flush when live is not richer", () => {
    const resolved = resolveOwnedApartmentBuiltinsForDiskWrite({
      mode: "floor",
      activeApartmentLayoutSource: "owned_default",
      ownedApartmentBuiltins: richLayout,
      ownedApartmentDefaultBuiltins: richLayout,
    });
    expect(resolved).toBe(richLayout);
  });

  it("falls back to live owned default when snapshot still looks like built-in default", () => {
    const resolved = resolveOwnedApartmentBuiltinsForDiskWrite({
      mode: "floor",
      activeApartmentLayoutSource: "owned_default",
      ownedApartmentBuiltins: richLayout,
      ownedApartmentDefaultBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
    });
    expect(resolved.placedItems).toHaveLength(richLayout.placedItems.length);
  });
});

describe("isDestructiveOwnedApartmentBuiltinsOverwrite", () => {
  it("blocks replacing a large layout with the built-in default doc", () => {
    expect(
      isDestructiveOwnedApartmentBuiltinsOverwrite({
        existingPlacedCount: 90,
        nextPlacedCount: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems.length,
      }),
    ).toBe(true);
  });

  it("allows saving a small layout over another small layout", () => {
    expect(
      isDestructiveOwnedApartmentBuiltinsOverwrite({
        existingPlacedCount: 5,
        nextPlacedCount: 5,
      }),
    ).toBe(false);
  });
});
