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
    expect(interiorBounce.hemiIntensity).toBeLessThan(0.4);
    const groundLuma =
      ((interiorBounce.hemiGround >> 16) & 0xff) * 0.2126 +
      ((interiorBounce.hemiGround >> 8) & 0xff) * 0.7152 +
      (interiorBounce.hemiGround & 0xff) * 0.0722;
    expect(groundLuma / 255).toBeGreaterThan(0.28);
  });

  it("uses a weak interior directional for wall gradients", () => {
    expect(APARTMENT_INTERIOR_VISUAL_PROFILE.interiorDirectional.intensity).toBeGreaterThan(
      0,
    );
    expect(APARTMENT_INTERIOR_VISUAL_PROFILE.interiorDirectional.intensity).toBeLessThan(
      0.2,
    );
  });

  it("gives shells PMREM fill comparable to decor so plaster is not void-black", () => {
    const { shell, decor } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(shell.indirectEnvIntensity).toBeGreaterThan(0);
    expect(shell.indirectEnvIntensity).toBeGreaterThanOrEqual(decor.indirectEnvIntensity);
    expect(shell.shadowAlbedoLuminanceMin).toBeGreaterThan(0);
    expect(shell.shadowAlbedoLuminanceMin).toBeLessThan(decor.albedoLuminanceMin);
  });

  it("keeps practical pools tighter than corridor-scale washes", () => {
    const { practical } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(practical.window.distance).toBeLessThan(10);
    expect(practical.chandelier.distance).toBeLessThan(6.5);
    expect(practical.standing.distance).toBeLessThan(5);
    expect(practical.tv.distance).toBeLessThan(14);
  });
});
