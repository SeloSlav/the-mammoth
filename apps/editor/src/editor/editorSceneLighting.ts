import * as THREE from "three";

export type EditorSceneLighting = {
  hemi: THREE.HemisphereLight;
  fill: THREE.AmbientLight;
  dir: THREE.DirectionalLight;
  grid: THREE.GridHelper;
};

export function addEditorSceneLighting(scene: THREE.Scene): EditorSceneLighting {
  const hemi = new THREE.HemisphereLight(0xf2f6fb, 0xd0d8e2, 0.88);
  scene.add(hemi);

  const fill = new THREE.AmbientLight(0xe8eef4, 0.14);
  scene.add(fill);

  const sunDir = new THREE.Vector3();
  sunDir.setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - 58),
    THREE.MathUtils.degToRad(218),
  );
  const dir = new THREE.DirectionalLight(0xfff8f2, 1.42);
  dir.position.copy(sunDir.multiplyScalar(120));
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 400;
  dir.shadow.camera.left = -120;
  dir.shadow.camera.right = 120;
  dir.shadow.camera.top = 120;
  dir.shadow.camera.bottom = -120;
  scene.add(dir);

  const grid = new THREE.GridHelper(400, 80, 0x6b7480, 0x8a949f);
  grid.position.y = 0;
  scene.add(grid);

  return { hemi, fill, dir, grid };
}
