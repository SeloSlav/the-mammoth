import { describe, expect, it } from "vitest";
import { FloorDocSchema, OwnedApartmentBuiltinsDocSchema } from "@the-mammoth/schemas";
import floorTypical from "../../../../../content/building/floors/floor_mamutica_typical.json";
import corridorBuiltins from "../../../../../content/apartment/floor_19_corridor_builtins.json";
import {
  FLOOR_19_GAMEPLAY_LEVEL_INDEX,
  resolveFloor19CorridorAuthoringFootprint,
} from "@the-mammoth/world";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
import { resolveFpFloor19CorridorDecorPlacements } from "./fpFloor19CorridorBuiltinsFromContent.js";

describe("resolveFpFloor19CorridorDecorPlacements", () => {
  const floorDoc = FloorDocSchema.parse(floorTypical);
  const doc = OwnedApartmentBuiltinsDocSchema.parse(corridorBuiltins);
  const footprint = resolveFloor19CorridorAuthoringFootprint(floorDoc);

  it("authors equally spaced ceiling fixtures down the floor 19 corridor from disk JSON", () => {
    const placements = resolveFpFloor19CorridorDecorPlacements({ doc, footprint });

    expect(placements).toHaveLength(13);
    const plateWorldY = (FLOOR_19_GAMEPLAY_LEVEL_INDEX - 1) * DEFAULT_BUILDING_FLOOR_SPACING_M;
    expect(placements[0]?.position[0]).toBeCloseTo(0, 3);
    expect(placements[0]?.position[1]).toBeCloseTo(
      plateWorldY + footprint!.floorY + 2.722639751374543,
      3,
    );
    expect(placements[0]?.position[2]).toBeCloseTo(-72, 3);
    expect(placements.at(-1)?.position[2]).toBeCloseTo(72, 1);

    for (let i = 1; i < placements.length; i++) {
      const prev = placements[i - 1]!;
      const next = placements[i]!;
      expect(next.position[2] - prev.position[2]).toBeCloseTo(12, 2);
      expect(next.position[0]).toBeCloseTo(prev.position[0]!, 3);
      expect(next.position[1]).toBeCloseTo(prev.position[1]!, 3);
    }
  });
});
