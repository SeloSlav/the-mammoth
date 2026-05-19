import * as THREE from "three";
import { mammothSpecularReadabilityWeight } from "./bindMammothMetallicReadableEnv.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorEmitterKindFromModelPath,
  apartmentDecorWarmLightFixtureKind,
} from "./apartmentInteriorVisualProfile.js";

const _lumaScratch = new THREE.Color();

function albedoLuminance(color: THREE.Color): number {
  return _lumaScratch.copy(color).r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

function normalizeAlbedoLuminance(color: THREE.Color): void {
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decor;
  const luma = albedoLuminance(color);
  if (luma <= 1e-6) return;
  if (luma < cfg.albedoLuminanceMin) {
    color.multiplyScalar(cfg.albedoLuminanceMin / luma);
  } else if (luma > cfg.albedoLuminanceMax) {
    color.multiplyScalar(cfg.albedoLuminanceMax / luma);
  }
}

export function moodGradeMammothApartmentDecorMaterial(
  material: THREE.Material,
  opts?: { modelRelPath?: string },
): THREE.Material {
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decor;
  const modelRelPath = opts?.modelRelPath;
  const emitterKind =
    modelRelPath != null ? apartmentDecorEmitterKindFromModelPath(modelRelPath) : null;
  const isWarmFixture =
    modelRelPath != null && apartmentDecorWarmLightFixtureKind(modelRelPath) != null;
  const isTv = emitterKind === "tv";

  const m = material.clone();
  if (m instanceof THREE.MeshStandardMaterial) {
    m.color.multiply(cfg.albedoMood);
    normalizeAlbedoLuminance(m.color);
    const emissiveScale =
      isWarmFixture || isTv ? cfg.fixtureEmissiveScale : cfg.emissiveScale;
    m.emissive.multiplyScalar(emissiveScale);
    m.emissiveIntensity *= emissiveScale;
    if (isWarmFixture) {
      m.emissive.lerp(new THREE.Color(0xffe8c8), 0.35);
    } else if (isTv) {
      m.emissive.lerp(new THREE.Color(0x5a9cff), 0.62);
      m.emissiveIntensity *= 1.25;
    }
    const metalWeight = mammothSpecularReadabilityWeight(m.metalness, m.roughness);
    m.roughness = Math.max(
      m.roughness,
      metalWeight > 0.18 ? cfg.metallicRoughnessMin : cfg.dielectricRoughnessMin,
    );
    m.needsUpdate = true;
    return m;
  }
  if (m instanceof THREE.MeshBasicMaterial) {
    m.color.multiply(cfg.basicAlbedoMood);
    normalizeAlbedoLuminance(m.color);
    m.needsUpdate = true;
  }
  return m;
}

export function moodGradeMammothApartmentDecorMesh(
  mesh: THREE.Mesh,
  opts?: { modelRelPath?: string },
): void {
  const material = mesh.material;
  mesh.material = Array.isArray(material)
    ? material.map((mat) => moodGradeMammothApartmentDecorMaterial(mat, opts))
    : moodGradeMammothApartmentDecorMaterial(material, opts);
}

export function moodGradeMammothApartmentShellMaterial(
  material: THREE.Material,
  slot: "wallCeil" | "floor",
): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const tint =
    slot === "floor"
      ? APARTMENT_INTERIOR_VISUAL_PROFILE.shell.floorColor
      : APARTMENT_INTERIOR_VISUAL_PROFILE.shell.wallCeilColor;
  material.color.multiply(tint);
  material.needsUpdate = true;
}

export function moodGradeMammothApartmentShellMesh(
  mesh: THREE.Mesh,
  slot: "wallCeil" | "floor",
): void {
  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const m of material) moodGradeMammothApartmentShellMaterial(m, slot);
  } else {
    moodGradeMammothApartmentShellMaterial(material, slot);
  }
}
