import { describe, expect, it } from "vitest";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("APARTMENT_INTERIOR_VISUAL_PROFILE", () => {
  it("uses no global layer-0 fill inside units", () => {
    const { interiorAmbient } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(interiorAmbient.hemiIntensity).toBe(0);
    expect(interiorAmbient.fillIntensity).toBe(0);
    expect(interiorAmbient.dirIntensity).toBe(0);
  });

  it("provides subtle layer-scoped bounce for shells and props", () => {
    const { interiorBounce } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(interiorBounce.hemiIntensity).toBeGreaterThan(0);
    expect(interiorBounce.fillIntensity).toBeGreaterThan(0);
    expect(interiorBounce.hemiIntensity).toBeLessThan(0.25);
  });

  it("keeps practical pools tighter than corridor-scale washes", () => {
    const { practical } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(practical.window.distance).toBeLessThan(8);
    expect(practical.chandelier.distance).toBeLessThan(5);
    expect(practical.standing.distance).toBeLessThan(4);
    expect(practical.tv.distance).toBeLessThan(14);
  });
});
