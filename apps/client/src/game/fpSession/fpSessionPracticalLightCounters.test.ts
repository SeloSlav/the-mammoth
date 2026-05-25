import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { countFpSessionPracticalLights } from "./fpSessionPracticalLightCounters";

describe("countFpSessionPracticalLights", () => {
  it("counts visible decor and window practical lights separately", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.name = "apartment_interior_practical_lights";
    scene.add(root);

    const decorSpot = new THREE.SpotLight(0xffffff, 1);
    decorSpot.name = "apt_tv_light_0";
    root.add(decorSpot);

    const windowSpot = new THREE.SpotLight(0xffffff, 1);
    windowSpot.name = "apt_window_light_0";
    windowSpot.position.set(10, 0, 0);
    root.add(windowSpot);

    const hiddenDecor = new THREE.PointLight(0xffffff, 1);
    hiddenDecor.name = "apt_ceiling_light_1";
    hiddenDecor.visible = false;
    root.add(hiddenDecor);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const frustum = new THREE.Frustum();
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(viewProjection);

    const objectVisibleInHierarchy = (obj: THREE.Object3D): boolean => {
      for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
        if (!cur.visible) return false;
      }
      return true;
    };

    const counts = countFpSessionPracticalLights({ scene, frustum, objectVisibleInHierarchy });
    expect(counts.visiblePracticalDecorLights).toBe(1);
    expect(counts.frustumPracticalDecorLights).toBe(1);
    expect(counts.visiblePracticalWindowLights).toBe(1);
    expect(counts.frustumPracticalWindowLights).toBe(0);
    expect(counts.decorByKind.tv.visible).toBe(1);
    expect(counts.decorKindBreakdownVis).toBe("tv:1");
    expect(counts.decorKindBreakdownFr).toBe("tv:1");
  });

  it("ignores zero-intensity mounted lights", () => {
    const scene = new THREE.Scene();
    const off = new THREE.SpotLight(0xffffff, 0);
    off.name = "apt_standing_light_0";
    scene.add(off);
    const on = new THREE.PointLight(0xffffff, 2);
    on.name = "apt_standing_light_1";
    scene.add(on);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );

    const counts = countFpSessionPracticalLights({
      scene,
      frustum,
      objectVisibleInHierarchy: () => true,
    });
    expect(counts.visiblePracticalDecorLights).toBe(1);
    expect(counts.decorByKind.standing.visible).toBe(1);
    expect(counts.decorKindBreakdownVis).toBe("standing:1");
  });
});
