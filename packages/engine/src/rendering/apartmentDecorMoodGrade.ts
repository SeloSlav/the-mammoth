import * as THREE from "three";
import { mammothSpecularReadabilityWeight } from "./bindMammothMetallicReadableEnv.js";

const APARTMENT_DECOR_ALBEDO_MOOD = new THREE.Color(0.86, 0.84, 0.8);
const APARTMENT_DECOR_BASIC_ALBEDO_MOOD = new THREE.Color(0.82, 0.8, 0.76);
const APARTMENT_DECOR_DIELECTRIC_ROUGHNESS_MIN = 0.62;
const APARTMENT_DECOR_METALLIC_ROUGHNESS_MIN = 0.32;
const APARTMENT_DECOR_EMISSIVE_SCALE = 0.45;

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
