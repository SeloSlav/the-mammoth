import * as THREE from "three";
import {
  isApartmentInteriorShellMesh,
  apartmentInteriorShellMoodSlot,
} from "./bindMammothApartmentDecorIndirectEnv.js";
import { mammothSpecularReadabilityWeight } from "./bindMammothMetallicReadableEnv.js";
import { upgradeApartmentDecorMaterialToStandard } from "./apartmentDecorMaterialUpgrade.js";
import { applyGrowOpFixturePanelGlow } from "./apartmentCeilingFixtureLensGlow.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorEmitterKindFromModelPath,
  apartmentDecorWarmLightFixtureKind,
} from "./apartmentInteriorVisualProfile.js";

const _lumaScratch = new THREE.Color();

export const MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD = "mammothApartmentFixtureBulbGlow";
export const MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD =
  "mammothApartmentFixtureBulbGlowAttached";
/** Transparent decor surfaces (fish-tank glass/water) — skip albedo mood darkening. */
export const MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD =
  "mammothApartmentDecorSkipMoodGrade" as const;
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
  const isGrowOpFixture = emitterKind === "growOp";
  const isScreenGlow = emitterKind === "tv" || emitterKind === "computer";

  const standard = upgradeApartmentDecorMaterialToStandard(material);
  const m = standard.clone();
  if (standard !== material) {
    standard.dispose();
  }
  const authoredAlbedoLuma = albedoLuminance(m.color);
  m.color.multiply(cfg.albedoMood);
  normalizeAlbedoLuminance(m.color, cfg.albedoLuminanceMin, cfg.albedoLuminanceMax);
  if (isGrowOpFixture) {
    m.emissive.multiplyScalar(cfg.fixtureEmissiveScale);
    m.emissiveIntensity *= cfg.fixtureEmissiveScale;
    if (m.emissiveMap) {
      /** Authored emissive masks — cool LED panel read, not warm apartment wash. */
      m.emissive.setRGB(0.9, 0.96, 1.0);
      m.emissiveIntensity *= 2.25;
    } else {
      m.emissive.setRGB(0.86, 0.93, 1.0);
      m.emissiveIntensity *= 1.75;
    }
    m.toneMapped = false;
  } else if (isWarmFixture || isScreenGlow) {
    if (emitterKind === "ceiling") {
      if (m.emissiveMap) {
        /** Authored emissive masks (e.g. light-ceiling-2 bulb orbs) — keep hot white, not flat wash. */
        m.emissive.multiplyScalar(cfg.fixtureEmissiveScale);
        m.emissiveIntensity *= cfg.fixtureEmissiveScale;
        m.emissive.setRGB(1, 0.99, 0.94);
        m.emissiveIntensity *= 1.55;
        m.toneMapped = false;
      } else {
        /** Flush mounts without emissive masks — practical lights carry the room read. */
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 1;
        m.emissiveMap = null;
      }
    } else {
      m.emissive.multiplyScalar(cfg.fixtureEmissiveScale);
      m.emissiveIntensity *= cfg.fixtureEmissiveScale;
    }
    if (isWarmFixture && emitterKind !== "ceiling") {
      if (m.emissiveMap) {
        /** Authored emissive masks carry bulb/shade glow — keep hot white, don't wash with lerp. */
        m.emissive.setRGB(1, 0.99, 0.94);
        m.emissiveIntensity *=
          emitterKind === "standing"
            ? 2.15
            : 1.55;
      } else if (emitterKind === "chandelier" && authoredAlbedoLuma > 0.62) {
        /** Chandelier white bulb/glass materials often ship without emissive maps. */
        m.emissive.setRGB(1, 0.98, 0.92);
        m.emissiveIntensity *= 1.35;
        m.toneMapped = false;
      } else if (emitterKind === "chandelier") {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 1;
      } else {
        m.emissive.lerp(
          new THREE.Color(0xffd090),
          emitterKind === "standing" ? 0.42 : 0.35,
        );
        if (emitterKind === "standing") {
          m.emissiveIntensity *= 1.05;
        }
      }
    } else if (isScreenGlow) {
      if (m.emissiveMap) {
        /** Screen mask only — never wash the whole CRT/monitor housing blue. */
        m.emissive.lerp(new THREE.Color(0x5a9cff), 0.62);
        m.emissiveIntensity *= 1.25;
        m.toneMapped = false;
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 1;
        m.emissiveMap = null;
      }
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
  if (mesh.userData[MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD] === true) return;
  const material = mesh.material;
  mesh.material = Array.isArray(material)
    ? material.map((mat) => moodGradeMammothApartmentDecorMaterial(mat, opts))
    : moodGradeMammothApartmentDecorMaterial(material, opts);
}

function decorRootHasAuthoredEmissiveMap(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if (found || !(obj instanceof THREE.Mesh)) return;
    const material = obj.material;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveMap) {
        found = true;
        return;
      }
    }
  });
  return found;
}

/**
 * Visible lit read for warm fixtures.
 * Grow-op panels use authored emissive or a cool lower-panel split when unauthored.
 * Ceiling flush mounts rely on practical lights only (no emissive lens split).
 * Standing lamps rely on authored emissive maps and practical lights, not generated bulb orbs.
 * Call after mesh mood grading (and after FP material merge, if any).
 */
export function attachApartmentWarmFixtureBulbGlow(
  root: THREE.Object3D,
  modelRelPath: string,
): void {
  const kind = apartmentDecorEmitterKindFromModelPath(modelRelPath);
  if (kind === "growOp") {
    if (root.userData[MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD] === true) return;
    if (!decorRootHasAuthoredEmissiveMap(root)) {
      applyGrowOpFixturePanelGlow(root);
    } else {
      root.userData[MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD] = true;
    }
    return;
  }
}

export function moodGradeMammothApartmentShellMaterial(
  material: THREE.Material,
  slot: "wallCeil" | "floor",
): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const shell = APARTMENT_INTERIOR_VISUAL_PROFILE.shell;
  const tint = slot === "floor" ? shell.floorColor : shell.wallCeilColor;
  material.color.multiply(tint);
  if (slot === "wallCeil") {
    material.emissive.copy(shell.wallCeilEmissive);
    material.emissiveIntensity = shell.wallCeilEmissiveIntensity;
  } else {
    material.emissive.setHex(0x000000);
    material.emissiveIntensity = 1;
  }
  if (material.normalMap) {
    const scale = slot === "floor" ? shell.floorNormalScale : shell.wallCeilNormalScale;
    material.normalScale.set(scale, scale);
  }
  material.needsUpdate = true;
}

export function moodGradeMammothApartmentShellMesh(
  mesh: THREE.Mesh,
  slot: "wallCeil" | "floor",
): void {
  const material = mesh.material;
  if (Array.isArray(material)) {
    const graded = material.map((mat) => {
      if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
      const clone = mat.clone();
      moodGradeMammothApartmentShellMaterial(clone, slot);
      return clone;
    });
    mesh.material = graded;
    return;
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    const clone = material.clone();
    moodGradeMammothApartmentShellMaterial(clone, slot);
    mesh.material = clone;
    return;
  }
  moodGradeMammothApartmentShellMaterial(material, slot);
}

export const MAMMOTH_APARTMENT_SHELL_MOOD_GRADED_UD = "mammothApartmentShellMoodGraded";

/** Apply profile shell tint + warm emissive floor once per interior shell mesh. */
export function moodGradeMammothApartmentShellRoot(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!isApartmentInteriorShellMesh(obj)) return;
    if (obj.userData[MAMMOTH_APARTMENT_SHELL_MOOD_GRADED_UD] === true) return;
    const slot = apartmentInteriorShellMoodSlot(obj);
    if (!slot) return;
    moodGradeMammothApartmentShellMesh(obj, slot);
    obj.userData[MAMMOTH_APARTMENT_SHELL_MOOD_GRADED_UD] = true;
  });
}
