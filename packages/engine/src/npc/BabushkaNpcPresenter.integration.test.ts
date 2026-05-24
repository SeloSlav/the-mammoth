import * as path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import * as THREE_NS from "three";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BABUSHKA_GLB = path.resolve(
  __dirname,
  "../../../../apps/client/public/static/models/npcs/babushka.glb",
);

beforeAll(() => {
  Object.assign(globalThis, { self: globalThis });
});

function updateNpcSkinnedMeshesForTest(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const sk = obj as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) sk.skeleton.update();
  });
}

function measureWorldSkinnedBox(model: THREE.Object3D): THREE.Box3 {
  updateNpcSkinnedMeshesForTest(model);
  model.updateWorldMatrix(true, true);
  const box = new THREE_NS.Box3();
  model.traverse((obj) => {
    const sk = obj as THREE.SkinnedMesh;
    if (!sk.isSkinnedMesh) return;
    sk.computeBoundingBox();
    if (!sk.boundingBox) return;
    box.union(sk.boundingBox.clone().applyMatrix4(sk.matrixWorld));
  });
  return box;
}

describe("babushka.glb integration", () => {
  it("walking locomotion stays human-sized with sanitized clips and no root rescale", async () => {
    const THREE = await import("three");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { clone: cloneSkeleton } = await import("three/addons/utils/SkeletonUtils.js");
    const { BabushkaNpcPresenter, seedBabushkaNpcBodyTemplateForTests, snapNpcModelFeetToLocalGround } =
      await import("./BabushkaNpcPresenter.js");

    const loader = new GLTFLoader();
    const buf = readFileSync(BABUSHKA_GLB);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      path.dirname(BABUSHKA_GLB) + path.sep,
    );

    const sanitizedWalk = gltf.animations
      .find((clip) => clip.name === "Walking")
      ?.tracks.filter(
        (track) =>
          !track.name.endsWith(".scale") &&
          !(
            track.name.endsWith(".position") &&
            (track.name.startsWith("Hips") ||
              track.name.startsWith("Armature") ||
              track.name.includes("Hips"))
          ),
      );
    expect(sanitizedWalk?.length).toBeGreaterThan(0);

    seedBabushkaNpcBodyTemplateForTests({
      scene: gltf.scene,
      animations: gltf.animations.map((clip) => {
        const tracks = clip.tracks.filter(
          (track) =>
            !track.name.endsWith(".scale") &&
            !(
              track.name.endsWith(".position") &&
              (() => {
                const bone = track.name.slice(0, -".position".length);
                return bone === "Hips" || bone === "Armature" || bone.endsWith("Hips");
              })()
            ),
        );
        return new THREE.AnimationClip(clip.name, clip.duration, tracks);
      }),
    });
    const presenter = await BabushkaNpcPresenter.create();
    const modelRoot = presenter.root.getObjectByName("babushka_npc_model");
    expect(modelRoot).not.toBeNull();

    updateNpcSkinnedMeshesForTest(modelRoot!);
    modelRoot!.updateWorldMatrix(true, true);
    const groundedBox = measureWorldSkinnedBox(modelRoot!);
    expect(groundedBox.max.y - groundedBox.min.y).toBeGreaterThan(1.2);
    expect(groundedBox.min.y).toBeGreaterThan(-0.08);
    expect(groundedBox.min.y).toBeLessThan(0.08);

    let hips: THREE.Object3D | null = null;
    modelRoot!.traverse((obj) => {
      if (obj.name === "Hips") hips = obj;
    });
    expect(hips).not.toBeNull();

    const hipsWorld = new THREE.Vector3();
    hips!.getWorldPosition(hipsWorld);
    expect(hipsWorld.y).toBeGreaterThan(0.75);
    expect(hipsWorld.y).toBeLessThan(1.45);

    const walkClip = gltf.animations
      .map((clip) => {
        const tracks = clip.tracks.filter(
          (track) =>
            !track.name.endsWith(".scale") &&
            !(
              track.name.endsWith(".position") &&
              (() => {
                const bone = track.name.slice(0, -".position".length);
                return bone === "Hips" || bone === "Armature" || bone.endsWith("Hips");
              })()
            ),
        );
        return new THREE.AnimationClip(clip.name, clip.duration, tracks);
      })
      .find((clip) => clip.name === "Walking")!;
    const mixer = new THREE.AnimationMixer(modelRoot!);
    mixer.clipAction(walkClip).play();

    let maxHipsY = hipsWorld.y;
    for (let i = 0; i < 180; i++) {
      mixer.update(1 / 30);
      modelRoot!.traverse((obj) => {
        const sk = obj as THREE.SkinnedMesh;
        if (sk.isSkinnedMesh) sk.skeleton.update();
      });
      modelRoot!.updateWorldMatrix(true, true);
      hips!.getWorldPosition(hipsWorld);
      maxHipsY = Math.max(maxHipsY, hipsWorld.y);
    }

    expect(maxHipsY).toBeGreaterThan(0.4);
    expect(maxHipsY).toBeLessThan(2.5);

    const resolveClipByLabel = (label: string): THREE.AnimationClip | undefined => {
      const norm = label.toLowerCase().replace(/[\s_]+/g, "");
      return gltf.animations
        .map((c) => {
          const tracks = c.tracks.filter(
            (track) =>
              !track.name.endsWith(".scale") &&
              !(
                track.name.endsWith(".position") &&
                (() => {
                  const bone = track.name.slice(0, -".position".length);
                  return bone === "Hips" || bone === "Armature" || bone.endsWith("Hips");
                })()
              ),
          );
          return new THREE.AnimationClip(c.name, c.duration, tracks);
        })
        .find((c) => c.name.toLowerCase().replace(/[\s_]+/g, "") === norm);
    };

    const assertFeetStayGroundedThroughClip = (clipLabel: string, frameCount: number): void => {
      const clip = resolveClipByLabel(clipLabel);
      expect(clip).toBeDefined();
      const bodyRoot = modelRoot!.parent!;
      expect(bodyRoot).not.toBeNull();
      modelRoot!.position.set(0, 0, 0);
      const clipMixer = new THREE.AnimationMixer(modelRoot!);
      clipMixer.clipAction(clip!).play();
      for (let i = 0; i < frameCount; i++) {
        clipMixer.update(1 / 30);
        updateNpcSkinnedMeshesForTest(modelRoot!);
        snapNpcModelFeetToLocalGround(modelRoot!, bodyRoot);
        const box = measureWorldSkinnedBox(modelRoot!);
        expect(box.min.y).toBeGreaterThan(-0.08);
        expect(box.min.y).toBeLessThan(0.08);
      }
    };

    assertFeetStayGroundedThroughClip("Air Squat", 120);
    assertFeetStayGroundedThroughClip("Dead", 90);
    presenter.dispose();
  });

  it("presenter pool syncs after GLB preload even without ensureReady()", async () => {
    const THREE = await import("three");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { WorldNpcPresenterPool, seedBabushkaNpcBodyTemplateForTests } = await import(
      "./BabushkaNpcPresenter.js"
    );

    const loader = new GLTFLoader();
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
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { WorldNpcPresenterPool, seedBabushkaNpcBodyTemplateForTests } = await import(
      "./BabushkaNpcPresenter.js"
    );

    const loader = new GLTFLoader();
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
