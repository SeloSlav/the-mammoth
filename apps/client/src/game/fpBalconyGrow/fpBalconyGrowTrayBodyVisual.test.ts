import { describe, expect, it } from "vitest";
import {
  GROW_TRAY_EMPTY_MODEL_PATH,
  GROW_TRAY_FILLED_MODEL_PATH,
  growTrayBodyVariantForFertilizer,
  isGrowTrayModelPath,
} from "./fpBalconyGrowTrayDecor.js";

describe("grow tray body visuals", () => {
  it("recognizes empty and filled tray model paths", () => {
    expect(isGrowTrayModelPath(GROW_TRAY_EMPTY_MODEL_PATH)).toBe(true);
    expect(isGrowTrayModelPath(GROW_TRAY_FILLED_MODEL_PATH)).toBe(true);
    expect(isGrowTrayModelPath("static/models/objects/chair.glb")).toBe(false);
  });

  it("maps compost stash presence to filled body variant", () => {
    expect(growTrayBodyVariantForFertilizer(false)).toBe("empty");
    expect(growTrayBodyVariantForFertilizer(true)).toBe("filled");
  });
});
