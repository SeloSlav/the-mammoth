import * as THREE from "three";

/** Approximate Phong shininess → Standard roughness for legacy OBJ/GLB exports. */
function phongShininessToRoughness(shininess: number): number {
  const s = Math.max(0, shininess);
  return THREE.MathUtils.clamp(1 - Math.sqrt(2 / (s + 2)), 0.35, 0.95);
}

/**
 * GLB/OBJ exports often ship Lambert/Phong/Basic materials that do not shade under WebGPU.
 * Upgrade to {@link THREE.MeshStandardMaterial} before apartment mood grading.
 */
export function upgradeApartmentDecorMaterialToStandard(
  material: THREE.Material,
): THREE.MeshStandardMaterial {
  if (material instanceof THREE.MeshStandardMaterial) {
    return material;
  }

  const m = new THREE.MeshStandardMaterial();

  if (material instanceof THREE.MeshPhongMaterial) {
    m.name = material.name;
    m.color.copy(material.color);
    m.map = material.map;
    m.alphaMap = material.alphaMap;
    m.emissive.copy(material.emissive);
    m.emissiveMap = material.emissiveMap;
    m.emissiveIntensity = material.emissiveIntensity;
    m.normalMap = material.normalMap;
    m.normalScale.copy(material.normalScale);
    m.aoMap = material.aoMap;
    m.roughness = phongShininessToRoughness(material.shininess);
    m.metalness = 0;
    m.transparent = material.transparent;
    m.opacity = material.opacity;
    m.side = material.side;
    m.depthWrite = material.depthWrite;
    m.depthTest = material.depthTest;
  } else if (material instanceof THREE.MeshLambertMaterial) {
    m.name = material.name;
    m.color.copy(material.color);
    m.map = material.map;
    m.alphaMap = material.alphaMap;
    m.emissive.copy(material.emissive);
    m.emissiveMap = material.emissiveMap;
    m.emissiveIntensity = material.emissiveIntensity;
    m.normalMap = material.normalMap;
    m.normalScale.copy(material.normalScale);
    m.aoMap = material.aoMap;
    m.roughness = 0.72;
    m.metalness = 0;
    m.transparent = material.transparent;
    m.opacity = material.opacity;
    m.side = material.side;
    m.depthWrite = material.depthWrite;
    m.depthTest = material.depthTest;
  } else if (material instanceof THREE.MeshBasicMaterial) {
    m.name = material.name;
    m.color.copy(material.color);
    m.map = material.map;
    m.alphaMap = material.alphaMap;
    m.transparent = material.transparent;
    m.opacity = material.opacity;
    m.side = material.side;
    m.roughness = 0.78;
    m.metalness = 0;
  } else {
    m.color.set(0x888880);
    m.roughness = 0.75;
  }

  material.dispose();
  return m;
}
