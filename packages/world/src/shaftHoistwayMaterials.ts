import * as THREE from "three";
import { concreteMaterial, interiorConcreteFloorShellMaterial } from "./floorPlaceholderMeshMaterials.js";

/** Hoistway inner shell for **stair** shafts (and door-frame trim reference); brick-red concrete. */
export const shaftWall = concreteMaterial(0xd5a19b);
/** Pit / landing slab at hoistway bottom (world slab is open here — must not read as outdoor grass). */
export const hoistwayFloor = interiorConcreteFloorShellMaterial;
export const shaftCeil = new THREE.MeshStandardMaterial({
  color: 0xe0e6ee,
  roughness: 0.88,
  metalness: 0.03,
});
/** Reuse hoistway wall concrete so door cutout trim is not a separate dark metallic band. */
export const doorFrameMat = shaftWall;
