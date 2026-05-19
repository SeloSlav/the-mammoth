import { describe, expect, it } from "vitest";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("APARTMENT_INTERIOR_VISUAL_PROFILE", () => {
  it("uses no global layer-0 fill inside units", () => {
    const { interiorAmbient } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(interiorAmbient.hemiIntensity).toBe(0);
    expect(interiorAmbient.fillIntensity).toBe(0);
    expect(interiorAmbient.dirIntensity).toBe(0);
  });

  it("keeps layer-scoped bounce off so only practical lights illuminate units", () => {
    const { interiorBounce } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(interiorBounce.hemiIntensity).toBe(0);
    expect(interiorBounce.fillIntensity).toBe(0);
    expect(interiorBounce.hemiSky).toBe(interiorBounce.hemiGround);
  });

  it("gives shells PMREM fill comparable to decor so plaster is not void-black", () => {
    const { shell, decor } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(shell.indirectEnvIntensity).toBeGreaterThan(0);
    expect(shell.indirectEnvIntensity).toBeGreaterThanOrEqual(decor.indirectEnvIntensity);
    expect(shell.shadowEmissiveIntensity).toBeGreaterThan(0);
    expect(shell.shadowEmissiveIntensity).toBeLessThan(0.12);
  });

  it("keeps practical pools tighter than corridor-scale washes", () => {
    const { practical } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(practical.window.distance).toBeLessThan(10);
    expect(practical.chandelier.distance).toBeLessThan(6.5);
    expect(practical.standing.distance).toBeLessThan(5);
    expect(practical.tv.distance).toBeLessThan(14);
  });
});
