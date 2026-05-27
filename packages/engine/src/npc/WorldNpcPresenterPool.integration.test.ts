import * as path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BABUSHKA_GLB = path.resolve(
  __dirname,
  "../../../../apps/client/public/static/models/npcs/babushka.glb",
);

beforeAll(() => {
  Object.assign(globalThis, { self: globalThis });
});

describe("WorldNpcPresenterPool", () => {
  it("syncs after GLB preload even without ensureReady()", async () => {
    const THREE = await import("three");
    const { ensureConfiguredGltfLoaderKtx2Support, getConfiguredGltfLoader } = await import(
      "../loaders/createConfiguredGltfLoader.js"
    );
    const { nodeGltfDracoDecoderPath, nodeGltfKtx2TranscoderPath } = await import(
      "../loaders/gltfLoaderNodeTestPaths.js"
    );
    const { seedBabushkaNpcBodyTemplateForTests } = await import(
      "./archetypes/babushka/BabushkaNpcPresenter.js",
    );
    const { WorldNpcPresenterPool } = await import("./WorldNpcPresenterPool.js");

    await ensureConfiguredGltfLoaderKtx2Support(
      {
        isWebGPURenderer: true,
        hasFeature: () => false,
      },
      nodeGltfKtx2TranscoderPath(),
    );
    const loader = getConfiguredGltfLoader(nodeGltfDracoDecoderPath());
    const buf = readFileSync(BABUSHKA_GLB);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      path.dirname(BABUSHKA_GLB) + path.sep,
    );
    seedBabushkaNpcBodyTemplateForTests({
      scene: gltf.scene,
      animations: gltf.animations,
    });

    const parent = new THREE.Group();
    const pool = new WorldNpcPresenterPool(parent);
    pool.sync(
      [
        {
          npcId: 1n,
          archetype: "babushka",
          worldPosition: { x: 0, y: 0, z: 4 },
          yawRad: 0,
          velocity: { x: 0, y: 0, z: 0 },
          grounded: true,
          locomotion: "idle",
          state: 0,
          health: 120,
          maxHealth: 120,
          meleePresentationSeq: 0,
          hitPresentationSeq: 0,
          observedTimeMs: 0,
        },
      ],
      0,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(parent.children.some((ch) => ch.name === "babushka_npc_root")).toBe(true);
    let skinned = 0;
    parent.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) skinned += 1;
    });
    expect(skinned).toBeGreaterThan(0);
  });

  it("retires despawned presenters without disposing GPU resources during runtime sync", async () => {
    const THREE = await import("three");
    const { ensureConfiguredGltfLoaderKtx2Support, getConfiguredGltfLoader } = await import(
      "../loaders/createConfiguredGltfLoader.js"
    );
    const { nodeGltfDracoDecoderPath, nodeGltfKtx2TranscoderPath } = await import(
      "../loaders/gltfLoaderNodeTestPaths.js"
    );
    const { seedBabushkaNpcBodyTemplateForTests } = await import(
      "./archetypes/babushka/BabushkaNpcPresenter.js",
    );
    const { WorldNpcPresenterPool } = await import("./WorldNpcPresenterPool.js");

    await ensureConfiguredGltfLoaderKtx2Support(
      {
        isWebGPURenderer: true,
        hasFeature: () => false,
      },
      nodeGltfKtx2TranscoderPath(),
    );
    const loader = getConfiguredGltfLoader(nodeGltfDracoDecoderPath());
    const buf = readFileSync(BABUSHKA_GLB);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      path.dirname(BABUSHKA_GLB) + path.sep,
    );
    seedBabushkaNpcBodyTemplateForTests({
      scene: gltf.scene,
      animations: gltf.animations,
    });

    const parent = new THREE.Group();
    const pool = new WorldNpcPresenterPool(parent);
    const snapshot = {
      npcId: 1n,
      archetype: "babushka" as const,
      worldPosition: { x: 0, y: 0, z: 4 },
      yawRad: 0,
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
      locomotion: "idle" as const,
      state: 0,
      health: 120,
      maxHealth: 120,
      meleePresentationSeq: 0,
      hitPresentationSeq: 0,
      observedTimeMs: 0,
    };
    pool.sync([snapshot], 0);

    const presenterRoot = parent.getObjectByName("babushka_npc_root");
    expect(presenterRoot).not.toBeNull();
    let cloneMaterial: THREE.Material | null = null;
    presenterRoot!.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!cloneMaterial && mesh.isMesh) {
        cloneMaterial = Array.isArray(mesh.material) ? mesh.material[0] ?? null : mesh.material;
      }
    });
    expect(cloneMaterial).not.toBeNull();
    const disposeSpy = vi.spyOn(cloneMaterial!, "dispose");

    pool.sync([], 1 / 60);

    expect(parent.children.some((ch) => ch.name === "babushka_npc_root")).toBe(false);
    expect(disposeSpy).not.toHaveBeenCalled();

    pool.dispose();

    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});
