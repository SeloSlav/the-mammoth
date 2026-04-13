import * as THREE from "three";

/**
 * Shared materials so massive generated floors do not allocate thousands of materials.
 * Palette: very light pastel blue-gray (mass-panel / cast shell), B slightly above R≈G.
 */
export const floorPlaceholderMeshMaterials = {
  corridorFloor: new THREE.MeshStandardMaterial({
    color: 0xe2e7ee,
    roughness: 0.92,
    metalness: 0.02,
  }),
  corridorCeil: new THREE.MeshStandardMaterial({
    color: 0xf1f4f8,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  }),
  corridorWall: new THREE.MeshStandardMaterial({
    color: 0xedf1f6,
    roughness: 0.88,
    metalness: 0.012,
  }),
  unitFloor: new THREE.MeshStandardMaterial({
    color: 0xdee5ec,
    roughness: 0.92,
    metalness: 0.025,
  }),
  unitCeil: new THREE.MeshStandardMaterial({
    color: 0xf0f3f7,
    roughness: 0.88,
    metalness: 0.025,
    side: THREE.DoubleSide,
  }),
  unitWall: new THREE.MeshStandardMaterial({
    color: 0xebf0f5,
    roughness: 0.88,
    metalness: 0.02,
  }),
  coreFloor: new THREE.MeshStandardMaterial({
    color: 0xd4dce4,
    roughness: 0.92,
    metalness: 0.04,
  }),
  coreCeil: new THREE.MeshStandardMaterial({
    color: 0xe8edf3,
    roughness: 0.88,
    metalness: 0.04,
    side: THREE.DoubleSide,
  }),
  coreWall: new THREE.MeshStandardMaterial({
    color: 0xeef2f7,
    roughness: 0.88,
    metalness: 0.03,
  }),
  miscFloor: new THREE.MeshStandardMaterial({
    color: 0xe0e6ed,
    roughness: 0.92,
    metalness: 0.025,
  }),
  miscCeil: new THREE.MeshStandardMaterial({
    color: 0xedf1f6,
    roughness: 0.88,
    metalness: 0.025,
    side: THREE.DoubleSide,
  }),
  miscWall: new THREE.MeshStandardMaterial({
    color: 0xebeef4,
    roughness: 0.88,
    metalness: 0.02,
  }),
  slab: new THREE.MeshStandardMaterial({
    color: 0xdde5ee,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  }),
  lobbyDoorFrame: new THREE.MeshStandardMaterial({
    color: 0x5a5856,
    roughness: 0.5,
    metalness: 0.42,
  }),
} as const;
