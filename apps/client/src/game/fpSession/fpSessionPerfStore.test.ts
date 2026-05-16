import { afterEach, describe, expect, it } from "vitest";
import {
  computeFpPerfStats,
  exportFpPerfReport,
  pushFpPerfFrame,
  resetFpPerfStore,
} from "./fpSessionPerfStore";

afterEach(() => {
  resetFpPerfStore();
});

describe("fpSessionPerfStore", () => {
  it("tracks nested render sub-sections for the profiler UI", () => {
    pushFpPerfFrame(
      1000,
      16,
      {
        physicsMs: 1,
        elevatorMs: 2,
        presentMs: 3,
        renderMs: 10,
        renderFloorPlateVisMs: 1.5,
        renderFpEnvironmentMs: 2.5,
        renderFpEnvironmentSkyMs: 0.75,
        renderFpEnvironmentLightingMs: 1.75,
        renderSetupMs: 0.5,
        renderThreeMs: 5.5,
      },
      {
        drawCalls: 321,
        triangles: 654_321,
        visibleFloorPlates: 3,
        visibleUnitInteriorMeshes: 120,
        visibleApartmentPropMeshes: 18,
        visibleTransparentMeshes: 44,
        visibleExteriorTreeRoots: 0,
        frustumFloorPlates: 1,
        frustumUnitInteriorMeshes: 36,
        frustumApartmentPropMeshes: 7,
        frustumTransparentMeshes: 12,
        frustumExteriorTreeRoots: 0,
      },
    );

    const stats = computeFpPerfStats(1000, 5);
    expect(stats).not.toBeNull();
    expect(stats!.fps).toBe(62.5);
    expect(stats?.sections.renderFloorPlateVisMs).toBe(1.5);
    expect(stats?.sections.renderFpEnvironmentMs).toBe(2.5);
    expect(stats?.sections.renderFpEnvironmentSkyMs).toBe(0.75);
    expect(stats?.sections.renderFpEnvironmentLightingMs).toBe(1.75);
    expect(stats?.sections.renderSetupMs).toBe(0.5);
    expect(stats?.sections.renderThreeMs).toBe(5.5);
    expect(stats?.sceneCounts.visibleFloorPlates).toBe(3);
    expect(stats?.sceneCounts.visibleUnitInteriorMeshes).toBe(120);
    expect(stats?.sceneCounts.visibleApartmentPropMeshes).toBe(18);
    expect(stats?.sceneCounts.visibleTransparentMeshes).toBe(44);
    expect(stats?.sceneCounts.visibleExteriorTreeRoots).toBe(0);
    expect(stats?.sceneCounts.frustumFloorPlates).toBe(1);
    expect(stats?.sceneCounts.frustumUnitInteriorMeshes).toBe(36);
    expect(stats?.sceneCounts.frustumApartmentPropMeshes).toBe(7);
    expect(stats?.sceneCounts.frustumTransparentMeshes).toBe(12);
    expect(stats?.sceneCounts.frustumExteriorTreeRoots).toBe(0);

    const report = exportFpPerfReport(1000, 5);
    expect(report).toContain("sky");
    expect(report).toContain("light");
    expect(report).toContain("setup");
    expect(report).toContain("Scene content");
    expect(report).toContain("transparent");
    expect(report).toContain("fr");
  });
});
