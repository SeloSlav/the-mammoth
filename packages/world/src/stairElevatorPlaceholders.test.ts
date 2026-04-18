import { describe, expect, it } from "vitest";
import { parseStairWellDef } from "./index.js";
import { resolveStairWellGroundDoor } from "./stairElevatorPlaceholders.js";

describe("resolveStairWellGroundDoor", () => {
  it("keeps typical stairwell door thresholds flush with the floor", () => {
    const sy = 60 / 19;
    const door = resolveStairWellGroundDoor({
      sx: 8.35,
      sy,
      sz: 13.95,
      authoringScope: "typical",
      def: parseStairWellDef({
        id: "stairs",
        version: 1,
        entryOpening: {
          face: "w",
          tangentOffsetAlongWallM: -5.177351451279119,
          widthM: 2.469149911172827,
          heightM: 2.6678947368421055,
          centerYM: -0.06499999999999995,
        },
      }),
    });

    expect(door).not.toBeNull();
    expect(door?.y0Local).toBeCloseTo(-sy * 0.5 + 0.11, 5);
  });

  it("keeps ground stairwell door thresholds flush with the floor", () => {
    const sy = 60 / 19;
    const door = resolveStairWellGroundDoor({
      sx: 8.35,
      sy,
      sz: 13.95,
      authoringScope: "ground",
      def: parseStairWellDef({
        id: "stairs",
        version: 1,
        groundEntryOpening: {
          face: "w",
          tangentOffsetAlongWallM: -1.894676484676825,
          widthM: 1.86,
          heightM: 2.2,
          centerYM: -0.3189473684210524,
        },
      }),
    });

    expect(door).not.toBeNull();
    expect(door?.y0Local).toBeCloseTo(-sy * 0.5 + 0.11, 5);
  });
});
