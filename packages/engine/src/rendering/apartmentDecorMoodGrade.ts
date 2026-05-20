import * as THREE from "three";
import { MAMMOTH_APARTMENT_DECOR_PROP_LAYER } from "./apartmentInteriorLayers.js";
import { applyCeilingFixtureLensGlow } from "./apartmentCeilingFixtureLensGlow.js";
import { apartmentStandingLampShadeBulbWorldPosition } from "./apartmentStandingLampShadeBulb.js";
import { mammothSpecularReadabilityWeight } from "./bindMammothMetallicReadableEnv.js";
import { upgradeApartmentDecorMaterialToStandard } from "./apartmentDecorMaterialUpgrade.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorEmitterKindFromModelPath,
  apartmentDecorWarmLightFixtureKind,
} from "./apartmentInteriorVisualProfile.js";

const _lumaScratch = new THREE.Color();
const _bulbBoxScratch = new THREE.Box3();
const _bulbSizeScratch = new THREE.Vector3();
const _bulbWorldScratch = new THREE.Vector3();

export const MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD = "mammothApartmentFixtureBulbGlow";
export const MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD =
  "mammothApartmentFixtureBulbGlowAttached";
/** @deprecated Use {@link MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD}. */
export const MAMMOTH_APARTMENT_CEILING_BULB_GLOW_ATTACHED_UD =
  MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD;

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
      if (m.emissiveMap) {
        /** Authored emissive masks carry bulb/shade glow — keep hot white, don't wash with lerp. */
        m.emissive.setRGB(1, 0.99, 0.94);
        m.emissiveIntensity *=
          emitterKind === "standing"
            ? 3.1
            : emitterKind === "ceiling"
              ? 2.35
              : 1.75;
      } else {
        m.emissive.lerp(
          new THREE.Color(0xffe8c8),
          emitterKind === "standing" ? 0.42 : 0.35,
        );
        if (emitterKind === "standing") {
          m.emissiveIntensity *= 1.35;
        }
      }
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
  if (m.normalMap) {
    m.normalScale.set(cfg.normalScale, cfg.normalScale);
  }
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

/**
 * Visible lit read for warm fixtures: ceiling lens emissive split, standing-lamp shade orb.
 * Call after mesh mood grading (and after FP material merge, if any).
 */
export function attachApartmentWarmFixtureBulbGlow(
  root: THREE.Object3D,
  modelRelPath: string,
): void {
  const kind = apartmentDecorEmitterKindFromModelPath(modelRelPath);
  if (kind === "ceiling") {
    applyCeilingFixtureLensGlow(root);
    return;
  }
  if (kind !== "standing") return;
  if (root.userData[MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD] === true) return;

  root.updateMatrixWorld(true);
  _bulbBoxScratch.setFromObject(root);
  if (_bulbBoxScratch.isEmpty()) return;

  _bulbBoxScratch.getSize(_bulbSizeScratch);

  const bulbRadius = THREE.MathUtils.clamp(
    Math.min(_bulbSizeScratch.x, _bulbSizeScratch.z) * 0.19,
    0.05,
    0.13,
  );
  apartmentStandingLampShadeBulbWorldPosition(
    _bulbBoxScratch,
    _bulbSizeScratch,
    _bulbWorldScratch,
  );

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(bulbRadius, 14, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfff8f2,
      emissive: 0xfff6ee,
      emissiveIntensity: 3.8,
      roughness: 0.26,
      metalness: 0,
      toneMapped: false,
    }),
  );
  glow.name = "apt_standing_shade_bulb_glow";
  glow.userData[MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD] = true;
  glow.userData.mammothSkipFloorGeometryMerge = true;
  glow.userData.mammothUnitInterior = true;
  glow.castShadow = false;
  glow.receiveShadow = false;
  glow.layers.set(MAMMOTH_APARTMENT_DECOR_PROP_LAYER);

  root.worldToLocal(_bulbWorldScratch);
  glow.position.copy(_bulbWorldScratch);
  root.add(glow);
  root.userData[MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD] = true;
}

export function moodGradeMammothApartmentShellMaterial(
  material: THREE.Material,
  slot: "wallCeil" | "floor",
): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const shell = APARTMENT_INTERIOR_VISUAL_PROFILE.shell;
  const tint = slot === "floor" ? shell.floorColor : shell.wallCeilColor;
  material.color.multiply(tint);
  if (material.normalMap) {
    const scale = slot === "floor" ? shell.floorNormalScale : shell.wallCeilNormalScale;
    material.normalScale.set(scale, scale);
  }
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
