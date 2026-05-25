import { describe, expect, it } from "vitest";
import { FloorDocSchema } from "@the-mammoth/schemas";
import floorTypical from "../../../../../content/building/floors/floor_mamutica_typical.json";
import {
  layoutFractionsFromPreviewWorldPosition,
  previewWorldFromNormalizedPlacement,
} from "./editorMyApartmentDecorClamp.js";
import {
  floor19CorridorFractionMappingForEditor,
  resolveOwnedApartmentAuthoringLayoutForEditor,
} from "./editorMyApartmentAuthoringShell.js";
import { resolveFloor19CorridorAuthoringFootprint } from "@the-mammoth/world";
import { DEFAULT_BUILDING } from "../../state/editorStoreSeedValues.js";

describe("floor19CorridorFractionMappingForEditor", () => {
  const floorDoc = FloorDocSchema.parse(floorTypical);
  const footprint = resolveFloor19CorridorAuthoringFootprint(floorDoc)!;

  it("round-trips corridor centerline fractions through preview space", () => {
    const spans = floor19CorridorFractionMappingForEditor({
      footprint,
      builtinsFallbackPreviewM: 159.5,
    });
    const preview = previewWorldFromNormalizedPlacement({ spans, fx: 0.5, fz: 0.5 });
    const back = layoutFractionsFromPreviewWorldPosition(spans, preview.x, preview.z);
    expect(back.fx).toBeCloseTo(0.5, 4);
    expect(back.fz).toBeCloseTo(0.5, 4);
  });

  it("uses a longer slab than a typical residential unit preview", () => {
    const corridorSpans = floor19CorridorFractionMappingForEditor({
      footprint,
      builtinsFallbackPreviewM: 159.5,
    });
    const unitLayout = resolveOwnedApartmentAuthoringLayoutForEditor({
      floorDoc,
      building: DEFAULT_BUILDING,
      previewUnitId: "unit_e_003",
    });
    expect(corridorSpans.spanZ).toBeGreaterThan(unitLayout!.spanZ * 2);
  });
});
