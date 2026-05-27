import * as path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MALE_GLB = path.resolve(
  __dirname,
  "../../../../apps/client/public/static/models/players/male.glb",
);

beforeAll(() => {
  Object.assign(globalThis, { self: globalThis });
});

describe("male.glb integration", () => {
  it("resolves RightHand after SkeletonUtils clone (same path as RemotePlayerPresenter)", async () => {
    const THREE = await import("three");
    const { ensureConfiguredGltfLoaderKtx2Support, getConfiguredGltfLoader } = await import(
      "../loaders/createConfiguredGltfLoader.js"
    );
    const { nodeGltfDracoDecoderPath, nodeGltfKtx2TranscoderPath } = await import(
      "../loaders/gltfLoaderNodeTestPaths.js"
    );
    const { clone: cloneSkeleton } = await import("three/addons/utils/SkeletonUtils.js");
    const { resolveSkinnedHumanoidHandBone } = await import("./humanoidAttachmentBones.js");

    await ensureConfiguredGltfLoaderKtx2Support(
      {
        isWebGPURenderer: true,wh
        hasFeature: () => false,
      },
      nodeGltfKtx2TranscoderPath(),
    );
    const loader = getConfiguredGltfLoader(nodeGltfDracoDecoderPath());
    const buf = readFileSync(MALE_GLB);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      path.dirname(MALE_GLB) + path.sep,
    );
    const modelRoot = cloneSkeleton(gltf.scene);
    modelRoot.name = "remote_player_model";
    const box = new THREE.Box3().setFromObject(modelRoot);
    const center = box.getCenter(new THREE.Vector3());
    modelRoot.position.set(-center.x, -box.min.y, -center.z);
    modelRoot.updateMatrixWorld(true);
    const bone = resolveSkinnedHumanoidHandBone(modelRoot, "right");
    expect(bone, "RightHand bone must resolve for mirror / third-person weapon attach").not.toBeNull();
    expect(bone!.name).toBe("RightHand");
  });
});
