import { describe, expect, it } from "vitest";
import { analyzeFpPerfSpikeCorrelation } from "./fpSessionPerfSpikeCorrelation";
import type { FpPerfTimelineSample } from "./fpSessionPerfStore";
import { emptyFpPracticalDecorLightKindFields } from "./fpSessionPracticalLightPerfKinds";

const baseSample = (
  overrides: Partial<FpPerfTimelineSample>,
): FpPerfTimelineSample => ({
  tMs: 0,
  totalMs: 16,
  physicsMs: 0.3,
  elevatorMs: 0,
  presentMs: 8,
  renderMs: 7,
  renderFloorPlateVisMs: 0,
  renderFpEnvironmentMs: 0,
  renderFpEnvironmentSkyMs: 0,
  renderFpEnvironmentLightingMs: 0,
  renderSetupMs: 0,
  renderThreeMs: 6,
  renderThreeGpuMs: 4,
  drawCalls: 200,
  triangles: 200_000,
  sceneGraphVisibleTriangles: 250_000,
  sceneGraphBreakdown: "",
  visibleFloorPlates: 1,
  visibleUnitInteriorMeshes: 120,
  visibleApartmentPropMeshes: 80,
  visibleApartmentDecorFloorShadowMeshes: 6,
  visibleResidentialShellMeshes: 3,
  visibleAnonymousInteriorMeshes: 50,
  visibleGenericInteriorMeshes: 0,
  visibleExteriorGlassMeshes: 1,
  visibleTransparentMeshes: 40,
  visibleTransparentExteriorGlassMeshes: 1,
  frustumFloorPlates: 1,
  frustumUnitInteriorMeshes: 90,
  frustumApartmentPropMeshes: 55,
  frustumApartmentDecorFloorShadowMeshes: 6,
  frustumResidentialShellMeshes: 2,
  frustumAnonymousInteriorMeshes: 30,
  frustumGenericInteriorMeshes: 0,
  frustumExteriorGlassMeshes: 1,
  frustumTransparentMeshes: 30,
  frustumTransparentExteriorGlassMeshes: 1,
  visiblePracticalDecorLights: 10,
  frustumPracticalDecorLights: 5,
  visiblePracticalWindowLights: 0,
  frustumPracticalWindowLights: 0,
  cameraYawRad: 0,
  ...emptyFpPracticalDecorLightKindFields(),
  ...overrides,
});

describe("analyzeFpPerfSpikeCorrelation", () => {
  it("classifies props-only vs lights+props spikes", () => {
    const samples = [
      ...Array.from({ length: 20 }, (_, idx) =>
        baseSample({
          tMs: 1000 + idx * 20,
          totalMs: 16,
          frustumApartmentPropMeshes: 50,
          frustumPracticalDecorLights: 5,
        }),
      ),
      baseSample({
        tMs: 2000,
        totalMs: 80,
        frustumApartmentPropMeshes: 130,
        frustumPracticalDecorLights: 5,
      }),
      baseSample({
        tMs: 2020,
        totalMs: 85,
        frustumApartmentPropMeshes: 125,
        frustumPracticalDecorLights: 10,
        frustumPracticalDecorCeilingLights: 6,
      }),
    ];

    const result = analyzeFpPerfSpikeCorrelation(samples);
    expect(result.spikes.length).toBeGreaterThan(0);
    expect(result.spikes.some((s) => s.classification === "props-only")).toBe(true);
    expect(result.spikes.some((s) => s.classification === "lights+props")).toBe(true);
    expect(result.summaryLines.join("\n")).toContain("Spike correlation");
  });
});
