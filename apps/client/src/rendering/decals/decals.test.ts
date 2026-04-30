import * as THREE from "three";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { BuildingStairShaftSpec } from "@the-mammoth/world";
import { DECAL_MANIFEST } from "./decalManifest.js";
import {
  collectMeshesInSegment,
  findStairShaftSegment,
  hashStringToSeed,
  mulberry32,
  resolveDecalHitMesh,
} from "./decalPlacementResolve.js";
import { generateStairwellDecalPlacements } from "./stairwellDecalPlacements.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = resolve(__dirname, "../../..");

function publicAssetPathFromUrl(url: string): string {
  return resolve(CLIENT_ROOT, "public", url.replace(/^\//, ""));
}

describe("decalPlacementResolve", () => {
  it("finds stair segment by shaft id and plate level index", () => {
    const buildingRoot = new THREE.Group();
    const col = new THREE.Group();
    col.name = "stair_shaft:hub_a";
    col.userData.mammothStairColumnRoot = true;
    const seg = new THREE.Group();
    seg.name = "stair_shaft_segment_2";
    seg.userData.mammothPlateLevelIndex = 7;
    col.add(seg);
    buildingRoot.add(col);

    expect(findStairShaftSegment(buildingRoot, "hub_a", 7)).toBe(seg);
    expect(findStairShaftSegment(buildingRoot, "hub_a", 99)).toBeNull();
    expect(findStairShaftSegment(buildingRoot, "missing", 7)).toBeNull();
  });

  it("collectMeshesInSegment excludes decals", () => {
    const seg = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    tag.userData.isDecal = true;
    seg.add(wall, tag);
    const meshes = collectMeshesInSegment(seg);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]).toBe(wall);
  });

  it("resolveDecalHitMesh returns wall mesh for stair-like probe", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.side = THREE.DoubleSide;
    const origin = new THREE.Vector3(0.86, 0, 0);
    const normal = new THREE.Vector3(-1, 0, 0);
    const hit = resolveDecalHitMesh([mesh], origin, normal);
    expect(hit).toBe(mesh);
  });

  it("hashStringToSeed and mulberry32 are stable", () => {
    expect(hashStringToSeed("shaft:0:1")).toBe(514888860);
    const rng = mulberry32(0x12345678);
    expect([rng(), rng(), rng(), rng(), rng()]).toEqual([
      0.10615200875326991,
      0.941276284167543,
      0.9398706152569503,
      0.2338848018553108,
      0.9045877147000283,
    ]);
  });
});

describe("generateStairwellDecalPlacements", () => {
  const spec: BuildingStairShaftSpec = {
    planKey: "1,1",
    id: "unit_test_shaft",
    px: 10,
    pz: -20,
    sx: 2.4,
    syPlate: 3.2,
    sz: 2.2,
    bottomY: 0.5,
    storeyCount: 2,
    storeySpacing: 3.15789473,
    minLevelIndex: 1,
    entryDoorContexts: [],
    exteriorShaftFaces: ["n"],
  };

  function buildWorldWithShaft(): THREE.Group {
    const buildingRoot = new THREE.Group();
    const col = new THREE.Group();
    col.name = "stair_shaft:unit_test_shaft";
    col.userData.mammothStairColumnRoot = true;
    col.position.set(spec.px, 0, spec.pz);
    for (let i = 0; i < spec.storeyCount; i++) {
      const seg = new THREE.Group();
      seg.name = `stair_shaft_segment_${i}`;
      seg.userData.mammothPlateLevelIndex = spec.minLevelIndex + i;
      col.add(seg);
    }
    buildingRoot.add(col);
    buildingRoot.updateMatrixWorld(true);
    return buildingRoot;
  }

  it("is deterministic for unchanged inputs", () => {
    const root = buildWorldWithShaft();
    const a = generateStairwellDecalPlacements(root, [spec]);
    const b = generateStairwellDecalPlacements(root, [spec]);
    expect(a).toEqual(b);
    expect(a.length).toBe(spec.storeyCount * 2);
    for (const p of a) {
      expect(p.stairShaftId).toBe(spec.id);
      expect(p.mode).toBe("projected");
      expect(p.category).toBe("graffiti");
    }
  });
});

describe("DECAL_MANIFEST", () => {
  it("points graffiti entries at public assets that ship with the client", () => {
    for (const entry of DECAL_MANIFEST) {
      if (entry.category !== "graffiti") continue;

      expect(
        existsSync(publicAssetPathFromUrl(entry.url)),
        `missing public decal asset for ${entry.id}: ${entry.url}`,
      ).toBe(true);
    }
  });
});
