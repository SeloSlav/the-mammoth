import * as THREE from "three";

export type ApartmentWallAuthoringGroupPose = {
  posX: number;
  posY: number;
  posZ: number;
  yawRad: number;
  pitchRad: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
};

function snapAuthoringBottomToWorldFloor(root: THREE.Object3D, floorWorldY: number): void {
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = floorWorldY - box.min.y;
  root.updateMatrixWorld(true);
}

/**
 * Runtime partition wall mesh — matches editor slab layout (unit box centered on root XZ, bottom on floor).
 * Intentionally does **not** re-clamp XZ: fractions already include editor plaster/hull clamping.
 */
export function buildApartmentWallAuthoringGroup(
  pose: ApartmentWallAuthoringGroupPose,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(pose.posX, pose.posY, pose.posZ);
  g.rotation.order = "YXZ";
  g.rotation.y = pose.yawRad;
  g.rotation.x = pose.pitchRad;
  g.rotation.z = 0;

  const geom = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({ color: 0xc9c4bc }),
  );
  mesh.scale.set(pose.sizeX, pose.sizeY, pose.sizeZ);
  mesh.position.y = pose.sizeY / 2;
  g.add(mesh);
  snapAuthoringBottomToWorldFloor(g, pose.posY);
  return g;
}
