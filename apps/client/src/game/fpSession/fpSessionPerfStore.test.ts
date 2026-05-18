import { afterEach, describe, expect, it } from "vitest";
import {
  computeFpPerfStats,
  computeFpPerfStatsFromTimeline,
  exportFpPerfRecordingReport,
  exportFpPerfReport,
  exportFpPerfTimelineDump,
  getFpPerfTimeline,
  pushFpPerfFrame,
  resetFpPerfStore,
} from "./fpSessionPerfStore";

afterEach(() => {
  resetFpPerfStore();
});

const dummySections = {
  physicsMs: 1,
  elevatorMs: 0,
  presentMs: 0,
  renderMs: 8,
  renderFloorPlateVisMs: 1,
  renderFpEnvironmentMs: 1,
  renderFpEnvironmentSkyMs: 0.5,
  renderFpEnvironmentLightingMs: 0.5,
  renderSetupMs: 1,
  renderThreeMs: 4,
} as const;

const dummyRi = {
  drawCalls: 10,
  triangles: 1000,
  visibleFloorPlates: 1,
  visibleUnitInteriorMeshes: 2,
  visibleApartmentPropMeshes: 3,
  visibleResidentialShellMeshes: 4,
  visibleAnonymousInteriorMeshes: 5,
  visibleGenericInteriorMeshes: 6,
  visibleExteriorGlassMeshes: 7,
  visibleTransparentMeshes: 4,
  visibleTransparentExteriorGlassMeshes: 8,
  visibleExteriorTreeRoots: 0,
  frustumFloorPlates: 1,
  frustumUnitInteriorMeshes: 5,
  frustumApartmentPropMeshes: 6,
  frustumResidentialShellMeshes: 7,
  frustumAnonymousInteriorMeshes: 8,
  frustumGenericInteriorMeshes: 9,
  frustumExteriorGlassMeshes: 10,
  frustumTransparentMeshes: 7,
  frustumTransparentExteriorGlassMeshes: 11,
  frustumExteriorTreeRoots: 0,
} as const;

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
        visibleResidentialShellMeshes: 80,
        visibleAnonymousInteriorMeshes: 22,
        visibleGenericInteriorMeshes: 4,
        visibleExteriorGlassMeshes: 12,
        visibleTransparentMeshes: 44,
        visibleTransparentExteriorGlassMeshes: 17,
        visibleExteriorTreeRoots: 0,
        frustumFloorPlates: 1,
        frustumUnitInteriorMeshes: 36,
        frustumApartmentPropMeshes: 7,
        frustumResidentialShellMeshes: 20,
        frustumAnonymousInteriorMeshes: 9,
        frustumGenericInteriorMeshes: 2,
        frustumExteriorGlassMeshes: 6,
        frustumTransparentMeshes: 12,
        frustumTransparentExteriorGlassMeshes: 5,
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
    expect(stats?.sceneCounts.visibleResidentialShellMeshes).toBe(80);
    expect(stats?.sceneCounts.visibleAnonymousInteriorMeshes).toBe(22);
    expect(stats?.sceneCounts.visibleExteriorGlassMeshes).toBe(12);
    expect(stats?.sceneCounts.visibleTransparentMeshes).toBe(44);
    expect(stats?.sceneCounts.visibleTransparentExteriorGlassMeshes).toBe(17);
    expect(stats?.sceneCounts.visibleExteriorTreeRoots).toBe(0);
    expect(stats?.sceneCounts.frustumFloorPlates).toBe(1);
    expect(stats?.sceneCounts.frustumUnitInteriorMeshes).toBe(36);
    expect(stats?.sceneCounts.frustumApartmentPropMeshes).toBe(7);
    expect(stats?.sceneCounts.frustumResidentialShellMeshes).toBe(20);
    expect(stats?.sceneCounts.frustumAnonymousInteriorMeshes).toBe(9);
    expect(stats?.sceneCounts.frustumExteriorGlassMeshes).toBe(6);
    expect(stats?.sceneCounts.frustumTransparentMeshes).toBe(12);
    expect(stats?.sceneCounts.frustumTransparentExteriorGlassMeshes).toBe(5);
    expect(stats?.sceneCounts.frustumExteriorTreeRoots).toBe(0);

    const report = exportFpPerfReport(1000, 5);
    expect(report).toContain("sky");
    expect(report).toContain("light");
    expect(report).toContain("setup");
    expect(report).toContain("Scene content");
    expect(report).toContain("Leak-debug breakdown");
    expect(report).toContain("unitAnon");
    expect(report).toContain("transGlass");
    expect(report).toContain("transparent");
    expect(report).toContain("fr");
  });

  it("getFpPerfTimeline returns oldest-first samples including yaw", () => {
    pushFpPerfFrame(1000, 16, dummySections, dummyRi, 1.2);
    pushFpPerfFrame(1016, 18, dummySections, dummyRi, 1.3);
    pushFpPerfFrame(1032, 14, dummySections, dummyRi, 1.4);

    const tl = getFpPerfTimeline(1032, 5);
    expect(tl.map((s) => s.tMs)).toEqual([1000, 1016, 1032]);
    expect(tl.map((s) => s.totalMs)).toEqual([16, 18, 14]);
    tl.forEach((s, i) => expect(s.cameraYawRad).toBeCloseTo(1.2 + i * 0.1, 5));

    resetFpPerfStore();
    pushFpPerfFrame(2000, 10, dummySections, dummyRi);
    const tlNoYaw = getFpPerfTimeline(2000, 5);
    expect(tlNoYaw).toHaveLength(1);
    expect(tlNoYaw[0]!.cameraYawRad).toBeNull();
  });

  it("computeFpPerfStatsFromTimeline matches rolling stats for the same window", () => {
    for (let i = 0; i < 10; i++) {
      pushFpPerfFrame(3000 + i * 20, 15 + i * 0.1, dummySections, dummyRi, i * 0.05);
    }
    const nowMs = 3000 + 9 * 20;
    const ringStats = computeFpPerfStats(nowMs, 5);
    const tl = getFpPerfTimeline(nowMs, 5);
    const frozen = computeFpPerfStatsFromTimeline(tl, 5);
    expect(ringStats).not.toBeNull();
    expect(frozen).not.toBeNull();
    expect(frozen!.samples).toBe(ringStats!.samples);
    expect(frozen!.fps).toBe(ringStats!.fps);
    expect(frozen!.frameMs.avg).toBe(ringStats!.frameMs.avg);
  });

  it("timeline stays chronological after ring buffer wraps", () => {
    const base = 5_000_000;
    const N = 1850;
    for (let i = 0; i < N; i++) {
      pushFpPerfFrame(base + i * 10, 16, dummySections, dummyRi, i * 0.001);
    }
    const lastT = base + (N - 1) * 10;
    const tl = getFpPerfTimeline(lastT, 99999);
    expect(tl.length).toBe(1800);
    expect(tl[0]!.tMs).toBe(base + (N - 1800) * 10);
    expect(tl[1799]!.tMs).toBe(lastT);
    for (let i = 1; i < tl.length; i++) {
      expect(tl[i]!.tMs).toBeGreaterThan(tl[i - 1]!.tMs);
    }
  });

  it("exportFpPerfTimelineDump and exportFpPerfRecordingReport shape", () => {
    pushFpPerfFrame(4000, 16, dummySections, dummyRi, Math.PI / 2);
    const tl = getFpPerfTimeline(4000, 5);
    const dump = exportFpPerfTimelineDump(tl);
    expect(dump.split("\n")[0]).toContain("yawDeg");
    expect(dump.split("\n")[0]).toContain("uiAnon");
    expect(dump.split("\n")[0]).toContain("trGlass");
    expect(dump.split("\n")[1]).toContain("90"); // deg

    const full = exportFpPerfRecordingReport(tl, 5);
    expect(full).toContain("=== Timeline");
    expect(full).toContain("Performance Report");

    expect(exportFpPerfRecordingReport([], 5)).toBe("No profiler samples in recording.");
  });

  it("recording export header averages timeline samples (not last frame only)", () => {
    resetFpPerfStore();
    const hi = { ...dummyRi, drawCalls: 3000, visibleUnitInteriorMeshes: 1000 };
    const lo = { ...dummyRi, drawCalls: 30, visibleUnitInteriorMeshes: 10 };
    pushFpPerfFrame(6000, 10, dummySections, hi, 0);
    pushFpPerfFrame(6020, 10, dummySections, lo, 0);
    const tl = getFpPerfTimeline(6020, 60);
    const full = exportFpPerfRecordingReport(tl, 60);
    expect(full).toContain("Renderer (avg): 1515 draw calls");
    expect(full).toContain("Scene (avg)");
    expect(full).toContain("unitInterior=505");
  });
});
