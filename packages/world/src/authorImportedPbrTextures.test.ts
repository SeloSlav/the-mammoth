import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { authorImportedPbrTexturesState, loadTextureFromSpec } from "./pbrTextureSystem.js";

describe("authorImportedPbrTexturesState", () => {
  afterEach(() => {
    authorImportedPbrTexturesState.enabled = true;
  });

  it("short-circuits loadTextureFromSpec when disabled (no resolved texture)", async () => {
    authorImportedPbrTexturesState.enabled = false;
    await expect(
      loadTextureFromSpec(
        "/static/materials/does-not-matter.ktx2",
        THREE.NoColorSpace,
        THREE.RepeatWrapping,
        THREE.RepeatWrapping,
      ),
    ).resolves.toBeNull();
  });
});
