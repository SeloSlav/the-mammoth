import * as THREE from "three";

export type EditorSceneLighting = {
  hemi: THREE.HemisphereLight;
  dir: THREE.DirectionalLight;
  grid: THREE.GridHelper;
};

export function addEditorSceneLighting(scene: THREE.Scene): EditorSceneLighting {
  const hemi = new THREE.HemisphereLight(0xb8c4ff, 0x2a2a30, 0.55);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(40, 80, 30);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 400;
  dir.shadow.camera.left = -120;
  dir.shadow.camera.right = 120;
  dir.shadow.camera.top = 120;
  dir.shadow.camera.bottom = -120;
  scene.add(dir);

  const grid = new THREE.GridHelper(400, 80, 0x444455, 0x33333d);
  grid.position.y = 0;
  scene.add(grid);

  return { hemi, dir, grid };
}
