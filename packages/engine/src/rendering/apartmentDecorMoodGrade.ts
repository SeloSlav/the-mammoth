import * as THREE from "three";
import { mammothSpecularReadabilityWeight } from "./bindMammothMetallicReadableEnv.js";
import { upgradeApartmentDecorMaterialToStandard } from "./apartmentDecorMaterialUpgrade.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorEmitterKindFromModelPath,
  apartmentDecorWarmLightFixtureKind,
} from "./apartmentInteriorVisualProfile.js";

const _lumaScratch = new THREE.Color();

function albedoLuminance(color: THREE.Color): number {
  return _lumaScratch.copy(color).r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

function normalizeAlbedoLuminance(
  color: THREE.Color,
  min: number,
  max?: number,
): void {
  const luma = albedoLuminance(color);
  if (luma <= 1e-6) return;
  if (luma < min) {
    color.multiplyScalar(min / luma);
  } else if (max != null && luma > max) {
    color.multiplyScalar(max / luma);
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
  const isScreenGlow = emitterKind === "tv" || emitterKind === "computer";

  const standard = upgradeApartmentDecorMaterialToStandard(material);
  const m = standard.clone();
  if (standard !== material) {
    standard.dispose();
  }
  m.color.multiply(cfg.albedoMood);
  normalizeAlbedoLuminance(m.color, cfg.albedoLuminanceMin, cfg.albedoLuminanceMax);
  if (isWarmFixture || isScreenGlow) {
    m.emissive.multiplyScalar(cfg.fixtureEmissiveScale);
    m.emissiveIntensity *= cfg.fixtureEmissiveScale;
    if (isWarmFixture) {
      m.emissive.lerp(new THREE.Color(0xffe8c8), 0.35);
    } else if (isScreenGlow) {
      m.emissive.lerp(new THREE.Color(0x5a9cff), 0.62);
      m.emissiveIntensity *= 1.25;
    }
  } else {
    /** Scene lights + PMREM carry non-fixture props — exporter emissive reads as flat/unlit. */
    m.emissive.setHex(0x000000);
    m.emissiveIntensity = 1;
  }
  const metalWeight = mammothSpecularReadabilityWeight(m.metalness, m.roughness);
  m.roughness = Math.max(
    m.roughness,
    metalWeight > 0.18 ? cfg.metallicRoughnessMin : cfg.dielectricRoughnessMin,
  );
  m.needsUpdate = true;
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
