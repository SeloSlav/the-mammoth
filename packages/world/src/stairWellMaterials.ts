import * as THREE from "three";
import type { StairWellDef } from "@the-mammoth/schemas";
import { applyCabMaterialSlot, stripArchitecturalDetailMaps } from "./elevatorVisualMaterialUtils.js";
import { floorPlaceholderMeshMaterials, interiorConcreteFloorShellMaterial } from "./floorPlaceholderMeshMaterials.js";

type StairWellMaterialSet = {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  tread: THREE.MeshStandardMaterial;
  landing: THREE.MeshStandardMaterial;
  railing: THREE.MeshStandardMaterial;
};

export function createStairWellMaterials(def: StairWellDef | undefined): StairWellMaterialSet {
  /** Same white plaster PBR as apartment unit interior walls (`matsFor("unit").wall`). */
  const wall = floorPlaceholderMeshMaterials.unitWall.clone();
  const floor = interiorConcreteFloorShellMaterial.clone();
  const tread = new THREE.MeshStandardMaterial({
    color: 0xc5cad2,
    roughness: 0.92,
    metalness: 0.025,
  });
  const landing = new THREE.MeshStandardMaterial({
    color: 0xb8c0ca,
    roughness: 0.92,
    metalness: 0.025,
  });
  const railing = new THREE.MeshStandardMaterial({
    color: 0x5c5a58,
    roughness: 0.35,
    metalness: 0.35,
  });
  applyCabMaterialSlot(wall, def?.materials?.wall);
  applyCabMaterialSlot(floor, def?.materials?.floor);
  applyCabMaterialSlot(tread, def?.materials?.tread);
  applyCabMaterialSlot(landing, def?.materials?.landing);
  applyCabMaterialSlot(railing, def?.materials?.railing);
  stripArchitecturalDetailMaps(wall, { metalness: 0.02 });
  stripArchitecturalDetailMaps(floor, { metalness: 0.02 });
  stripArchitecturalDetailMaps(tread, { metalness: 0.02 });
  stripArchitecturalDetailMaps(landing, { metalness: 0.02 });
  /** Stairwells read too glossy under exterior fill — bias rougher than corridor vinyl / plaster. */
  tread.roughness = Math.min(1, tread.roughness + 0.07);
  landing.roughness = Math.min(1, landing.roughness + 0.06);
  floor.roughness = Math.min(1, floor.roughness + 0.06);
  return { wall, floor, tread, landing, railing };
}
