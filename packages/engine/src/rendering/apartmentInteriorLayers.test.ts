import { describe, expect, it } from "vitest";
import {
  MAMMOTH_APARTMENT_INTERIOR_FILL_LIGHT_LAYER_MASK,
  MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK,
  MAMMOTH_FP_VIEWMODEL_RENDER_LAYER,
} from "./apartmentInteriorLayers.js";

describe("apartment interior light layers", () => {
  it("includes viewmodel layer on fill rig but not on practical spots", () => {
    const vmBit = 1 << MAMMOTH_FP_VIEWMODEL_RENDER_LAYER;
    expect(MAMMOTH_APARTMENT_INTERIOR_FILL_LIGHT_LAYER_MASK & vmBit).toBe(vmBit);
    expect(MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK & vmBit).toBe(0);
  });
});