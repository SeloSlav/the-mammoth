import { describe, expect, it } from "vitest";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  mammothApartmentInteriorBlend01,
} from "./apartmentInteriorVisualProfile.js";

describe("APARTMENT_INTERIOR_VISUAL_PROFILE", () => {
  it("fades layer-0 sun to zero inside units", () => {
    const { interiorAmbient } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(interiorAmbient.hemiIntensity).toBe(0);
    expect(interiorAmbient.fillIntensity).toBe(0);
    expect(interiorAmbient.dirIntensity).toBe(0);
  });

  it("uses neutral hemisphere ground (same as sky) to avoid brown vertical walls", () => {
    const { interiorAmbient, interiorBounce } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(interiorAmbient.hemiSky).toBe(interiorAmbient.hemiGround);
    expect(interiorBounce.hemiSky).toBe(interiorBounce.hemiGround);
    expect(interiorBounce.hemiIntensity).toBeGreaterThan(0);
    expect(interiorBounce.fillIntensity).toBeGreaterThan(0);
  });

  it("gives shells PMREM fill comparable to decor so plaster is not void-black", () => {
    const { shell, decor } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(shell.indirectEnvIntensity).toBeGreaterThan(0);
    expect(shell.indirectEnvIntensity).toBeGreaterThanOrEqual(decor.indirectEnvIntensity);
  });

  it("keeps practical pools tighter than corridor-scale washes", () => {
    const { practical } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(practical.window.distance).toBeLessThan(10);
    expect(practical.chandelier.distance).toBeLessThan(6.5);
    expect(practical.standing.distance).toBeLessThan(6);
    expect(practical.standing.decay).toBeGreaterThan(0);
    expect(practical.ceiling.angle).toBeGreaterThan(0);
    expect(practical.tv.distance).toBeLessThan(14);
    expect(practical.computer.distance).toBeLessThan(12);
    expect(practical.computer.color).toBe(practical.tv.color);
  });

  it("keeps interior bounce dimmer than practical hero lights for moody contrast", () => {
    const { interiorBounce, practical, exposure } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    const bounceLift =
      interiorBounce.hemiIntensity +
      interiorBounce.fillIntensity +
      interiorBounce.dirIntensity;
    expect(bounceLift).toBeLessThan(0.12);
    expect(practical.standing.intensity).toBeGreaterThan(bounceLift * 10);
    expect(practical.chandelier.intensity).toBeGreaterThan(bounceLift * 10);
    expect(exposure.interior).toBeLessThan(exposure.exterior);
  });
});

describe("mammothApartmentInteriorBlend01", () => {
  it("reaches full interior at proximity 1", () => {
    expect(mammothApartmentInteriorBlend01(1)).toBe(1);
  });

  it("eases in with doorway exponent from profile", () => {
    const { scene } = APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(mammothApartmentInteriorBlend01(0.5)).toBeCloseTo(
      Math.pow(0.5, scene.doorwayBlendExponent),
      6,
    );
  });
});
