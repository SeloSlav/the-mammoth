import { describe, expect, it } from "vitest";
import { buildFloorShortLabelMap, shortFloorLabelForLevel } from "./buildingFloorLabels.js";

describe("buildingFloorLabels", () => {
  it("prefers authored short labels and falls back to the raw level index", () => {
    const labels = buildFloorShortLabelMap({
      floorRefs: [
        { levelIndex: 1, floorDocId: "g", shortLabel: "PR" },
        { levelIndex: 2, floorDocId: "t", shortLabel: "1" },
        { levelIndex: 3, floorDocId: "t" },
      ],
    });

    expect(shortFloorLabelForLevel(1, labels)).toBe("PR");
    expect(shortFloorLabelForLevel(2, labels)).toBe("1");
    expect(shortFloorLabelForLevel(3, labels)).toBe("3");
    expect(shortFloorLabelForLevel(9, labels)).toBe("9");
  });
});
