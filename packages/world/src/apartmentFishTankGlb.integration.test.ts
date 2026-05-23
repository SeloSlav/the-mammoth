import * as path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FISH_TANK_GLB = path.resolve(
  __dirname,
  "../../../apps/client/public/static/models/objects/fish-tank.glb",
);

beforeAll(() => {
  Object.assign(globalThis, { self: globalThis });
});

describe("fish-tank.glb integration", () => {
  it("contains cleaned opaque geometry and authored transparent glass panels", async () => {
    const loader = new GLTFLoader();
    const buf = readFileSync(FISH_TANK_GLB);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      path.dirname(FISH_TANK_GLB) + path.sep,
    );

    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshes.push(obj);
    });

    const glass = meshes.find((mesh) => {
      const mat = mesh.material;
      return !Array.isArray(mat) && mat.name === "fish_tank_clean_glass";
    });
    const opaque = meshes.find((mesh) => mesh !== glass);
    expect(glass).toBeInstanceOf(THREE.Mesh);
    expect(opaque).toBeInstanceOf(THREE.Mesh);

    const glassMat = (glass as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(glassMat.transparent).toBe(true);
    expect(glassMat.opacity).toBeLessThan(0.5);

    const glassIndex = (glass as THREE.Mesh).geometry.getIndex();
    const opaqueIndex = (opaque as THREE.Mesh).geometry.getIndex();
    expect(glassIndex?.count).toBe(24);
    expect(opaqueIndex?.count).toBeGreaterThan(4300);
    expect(opaqueIndex!.count + glassIndex!.count).toBeLessThan(1909 * 3);
  });
});
