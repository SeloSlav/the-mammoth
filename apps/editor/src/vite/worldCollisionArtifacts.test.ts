import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeWorldCollisionSourceFingerprint } from "../../../../scripts/worldCollisionArtifacts";

function writeRepoFixture(root: string, stairwell: Record<string, unknown>) {
  mkdirSync(join(root, "content/building/floors"), { recursive: true });
  mkdirSync(join(root, "content/building/floor-overrides"), { recursive: true });
  mkdirSync(join(root, "content/elevator"), { recursive: true });
  writeFileSync(
    join(root, "content/building/mammoth.json"),
    JSON.stringify({
      id: "b",
      version: 1,
      floorRefs: [{ levelIndex: 1, floorDocId: "f" }],
    }),
  );
  writeFileSync(
    join(root, "content/building/floors/f.json"),
    JSON.stringify({ id: "f", version: 1, objects: [] }),
  );
  writeFileSync(join(root, "content/elevator/stairwell.json"), JSON.stringify(stairwell));
  writeFileSync(join(root, "content/elevator/cab.json"), JSON.stringify({ id: "cab", version: 1 }));
  writeFileSync(
    join(root, "content/elevator/landing_kit.json"),
    JSON.stringify({ id: "landing", version: 1 }),
  );
}

describe("computeWorldCollisionSourceFingerprint", () => {
  it("ignores stair opening-only edits", () => {
    const root = mkdtempSync(join(tmpdir(), "mammoth-collision-fingerprint-"));
    writeRepoFixture(root, {
      id: "stairs",
      version: 1,
      entryOpening: { face: "e", tangentOffsetAlongWallM: 0, widthM: 1.6, heightM: 2 },
    });
    const before = computeWorldCollisionSourceFingerprint(root);

    writeRepoFixture(root, {
      id: "stairs",
      version: 1,
      entryOpening: { face: "w", tangentOffsetAlongWallM: 1.25, widthM: 2.1, heightM: 2.4 },
      secondaryEntryOpening: { face: "s", tangentOffsetAlongWallM: 0.5, widthM: 1.2, heightM: 2 },
    });
    const afterOpeningOnly = computeWorldCollisionSourceFingerprint(root);
    expect(afterOpeningOnly).toBe(before);

    writeRepoFixture(root, {
      id: "stairs",
      version: 1,
      partTransforms: {
        stair_flight_lower: { position: [0, 0.25, 0] },
      },
      entryOpening: { face: "w", tangentOffsetAlongWallM: 1.25, widthM: 2.1, heightM: 2.4 },
    });
    const afterGeometry = computeWorldCollisionSourceFingerprint(root);
    expect(afterGeometry).not.toBe(before);
  });
});
