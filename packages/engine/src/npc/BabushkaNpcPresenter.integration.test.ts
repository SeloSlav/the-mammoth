import * as path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type * as THREE from "three";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BABUSHKA_GLB = path.resolve(
  __dirname,
  "../../../../apps/client/public/static/models/npcs/babushka.glb",
);

beforeAll(() => {
  Object.assign(globalThis, { self: globalThis });
});

describe("babushka.glb integration", () => {
  it("walking locomotion stays human-sized when root is not re-scaled", async () => {
    const THREE = await import("three");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { clone: cloneSkeleton } = await import("three/addons/utils/SkeletonUtils.js");

    const loader = new GLTFLoader();
    const buf = readFileSync(BABUSHKA_GLB);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      path.dirname(BABUSHKA_GLB) + path.sep,
    );

    const modelRoot = cloneSkeleton(gltf.scene);
    modelRoot.traverse((obj) => {
      const sk = obj as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) sk.skeleton.update();
    });
    modelRoot.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    const center = box.getCenter(new THREE.Vector3());
    modelRoot.position.set(-center.x, -box.min.y, -center.z);

    let hips: THREE.Object3D | null = null;
    modelRoot.traverse((obj) => {
      if (obj.name === "Hips") hips = obj;
    });
    expect(hips, "Hips bone required for locomotion clip sanity").not.toBeNull();

    const walkClip = gltf.animations.find((clip) => clip.name === "Walking");
    expect(walkClip, "Walking clip required").toBeDefined();

    const mixer = new THREE.AnimationMixer(modelRoot);
    mixer.clipAction(walkClip!).play();

    const hipsWorld = new THREE.Vector3();
    let maxHipsY = 0;
    for (let i = 0; i < 180; i++) {
      mixer.update(1 / 30);
      modelRoot.traverse((obj) => {
        const sk = obj as THREE.SkinnedMesh;
        if (sk.isSkinnedMesh) sk.skeleton.update();
      });
      modelRoot.updateWorldMatrix(true, true);
      hips!.getWorldPosition(hipsWorld);
      maxHipsY = Math.max(maxHipsY, hipsWorld.y);
    }

    expect(maxHipsY).toBeGreaterThan(0.4);
    expect(maxHipsY).toBeLessThan(2.5);
  });
});
