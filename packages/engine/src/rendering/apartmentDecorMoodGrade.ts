import * as THREE from "three";
import { mammothSpecularReadabilityWeight } from "./bindMammothMetallicReadableEnv.js";

const APARTMENT_DECOR_ALBEDO_MOOD = new THREE.Color(0.58, 0.56, 0.52);
const APARTMENT_DECOR_BASIC_ALBEDO_MOOD = new THREE.Color(0.5, 0.49, 0.46);
const APARTMENT_DECOR_DIELECTRIC_ROUGHNESS_MIN = 0.78;
const APARTMENT_DECOR_METALLIC_ROUGHNESS_MIN = 0.38;
const APARTMENT_DECOR_EMISSIVE_SCALE = 0.18;

export function moodGradeMammothApartmentDecorMaterial(
  material: THREE.Material,
): THREE.Material {
  const m = material.clone();
  if (m instanceof THREE.MeshStandardMaterial) {
    m.color.multiply(APARTMENT_DECOR_ALBEDO_MOOD);
    m.emissive.multiplyScalar(APARTMENT_DECOR_EMISSIVE_SCALE);
    m.emissiveIntensity *= APARTMENT_DECOR_EMISSIVE_SCALE;
    const metalWeight = mammothSpecularReadabilityWeight(m.metalness, m.roughness);
    m.roughness = Math.max(
      m.roughness,
      metalWeight > 0.18
        ? APARTMENT_DECOR_METALLIC_ROUGHNESS_MIN
        : APARTMENT_DECOR_DIELECTRIC_ROUGHNESS_MIN,
    );
    m.needsUpdate = true;
    return m;
  }
  if (m instanceof THREE.MeshBasicMaterial) {
    m.color.multiply(APARTMENT_DECOR_BASIC_ALBEDO_MOOD);
    m.needsUpdate = true;
  }
  return m;
}

export function moodGradeMammothApartmentDecorMesh(mesh: THREE.Mesh): void {
  const material = mesh.material;
  mesh.material = Array.isArray(material)
    ? material.map(moodGradeMammothApartmentDecorMaterial)
    : moodGradeMammothApartmentDecorMaterial(material);
}
