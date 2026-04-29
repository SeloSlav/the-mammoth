import * as THREE from "three";
import type {
  ElevatorCabMaterialSlot,
  LandingKitMaterialSlot,
} from "@the-mammoth/schemas";
import {
  PBR_DEFAULT_ROUGHNESS_SCALAR,
  baseColorSpecFromConfig,
  heightSpecFromConfig,
  metalnessSpecFromConfig,
  normalSpecFromConfig,
  resolvePbrTextureRepeat,
  roughnessSpecFromConfig,
  type PbrMaterialConfig,
  aoSpecFromConfig,
} from "./pbrMaterialConfig.js";
import {
  authorImportedPbrTexturesState,
  beginHydrateTextureFromSpec,
  loadTextureFromSpec,
} from "./pbrTextureSystem.js";

export type { PbrMaterialConfig };
/** Legacy alias — same shape as {@link PbrMaterialConfig}. */
export type StandardAuthoringSlot = PbrMaterialConfig;

/** @deprecated Prefer {@link StandardAuthoringSlot} / {@link PbrMaterialConfig}. */
export type ElevatorLikeAuthoringSlot = PbrMaterialConfig;

function canLoadAuthorTextures(): boolean {
  return typeof document !== "undefined" && typeof Image !== "undefined";
}

/**
 * WebGPU: tiny `DataTexture` uploads can fail for 1×1 layouts on some backends. Use canvas-backed
 * placeholders until the real map resolves.
 */
function makeAuthorMapPlaceholder(r: number, g: number, b: number, colorSpace: THREE.ColorSpace): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Shared placeholders / resolved maps — one GPU texture shared across clones. */
const authorColorMapCache = new Map<string, THREE.Texture>();
const authorRoughnessResolved = new Map<string, THREE.Texture>();

function resolveWrap(cfg: PbrMaterialConfig): {
  wrapS: THREE.Texture["wrapS"];
  wrapT: THREE.Texture["wrapT"];
} {
  const tiled = cfg.tiled !== false;
  const w = (tiled ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping) as THREE.Texture["wrapS"];
  return { wrapS: w, wrapT: w };
}

function scalarRoughnessFromSlot(slot: PbrMaterialConfig): number {
  if (slot.roughness != null) return slot.roughness;
  if (slot.roughnessFallback != null) return slot.roughnessFallback;
  return PBR_DEFAULT_ROUGHNESS_SCALAR;
}

function scalarMetalnessFromSlot(slot: PbrMaterialConfig): number {
  return slot.metalness ?? 0;
}

async function acquireSharedRoughnessResolved(
  spec: string,
  wrapS: THREE.Texture["wrapS"],
  wrapT: THREE.Texture["wrapT"],
): Promise<THREE.Texture | null> {
  const key = spec.trim();
  const hit = authorRoughnessResolved.get(key);
  if (hit) return hit;
  const tex = await loadTextureFromSpec(spec, THREE.NoColorSpace, wrapS, wrapT);
  if (tex) authorRoughnessResolved.set(key, tex);
  return tex;
}

/**
 * Applies PBR authoring: basecolor + optional normal + optional roughness + optional AO + opt-in metal/height maps.
 *
 * Missing optional maps leave the shader path empty (scalar fallbacks instead of placeholders).
 *
 * Legacy paths with explicit `.png`/`.jpg` filenames keep working.
 */
export function applyStandardAuthoringSlot(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  slot: PbrMaterialConfig | undefined,
): void {
  if (!slot) return;

  mat.metalness = scalarMetalnessFromSlot(slot);

  const baseSpec = baseColorSpecFromConfig(slot);

  /** Scalar roughness is always defined; multiplied with grayscale roughness maps when loaded. */
  const roughSpec = roughnessSpecFromConfig(slot);
  mat.roughness = scalarRoughnessFromSlot(slot);

  const { wrapS, wrapT } = resolveWrap(slot);

  if (slot.colorHex) mat.color.setHex(parseAuthorColorHex(slot.colorHex));

  const useMetalTex = slot.useMetalnessMap === true;
  const useBump = slot.useHeightMap === true;

  mat.metalnessMap = null;
  mat.bumpMap = null;
  mat.bumpScale = 0;
  mat.normalMap = null;
  mat.roughnessMap = null;
  mat.aoMap = null;
  mat.aoMapIntensity = 1;

  /** Albedo — keep shared cache when path present (heavy merged shells reuse one upload). */
  if (baseSpec?.trim() && canLoadAuthorTextures() && authorImportedPbrTexturesState.enabled) {
    const trimmed = baseSpec.trim();
    let tex = authorColorMapCache.get(trimmed);
    if (!tex) {
      tex = makeAuthorMapPlaceholder(255, 255, 255, THREE.SRGBColorSpace);
      tex.wrapS = wrapS;
      tex.wrapT = wrapT;
      tex.repeat.set(1, 1);
      authorColorMapCache.set(trimmed, tex);
      beginHydrateTextureFromSpec(tex, trimmed, THREE.SRGBColorSpace, wrapS, wrapT);
    }
    mat.map = tex;
  } else {
    mat.map = null;
  }

  /** Normal map — optional, no bogus placeholder tint. */
  const nSpec = normalSpecFromConfig(slot);
  if (nSpec?.trim()) {
    void loadTextureFromSpec(nSpec.trim(), THREE.NoColorSpace, wrapS, wrapT).then((tex) => {
      mat.normalMap = tex;
      mat.needsUpdate = true;
    });
  }

  /** Roughness — optional grayscale map baked per shell; shared GPU texture per URL stack. */
  if (roughSpec?.trim()) {
    void acquireSharedRoughnessResolved(roughSpec.trim(), wrapS, wrapT).then((tex) => {
      mat.roughnessMap = tex;
      mat.needsUpdate = true;
    });
  }

  /** Ambient occlusion — uses UV2 where authors provide meshes with a second UV set. */
  const aoSpec = aoSpecFromConfig(slot);
  if (aoSpec?.trim()) {
    void loadTextureFromSpec(aoSpec.trim(), THREE.NoColorSpace, wrapS, wrapT).then((tex) => {
      mat.aoMap = tex;
      mat.needsUpdate = true;
    });
  }

  if (useMetalTex) {
    const mSpec = metalnessSpecFromConfig(slot);
    if (mSpec?.trim()) {
      void loadTextureFromSpec(mSpec.trim(), THREE.NoColorSpace, wrapS, wrapT).then((tex) => {
        mat.metalnessMap = tex;
        mat.needsUpdate = true;
      });
    }
  }

  if (useBump) {
    const hSpec = heightSpecFromConfig(slot);
    if (hSpec?.trim()) {
      void loadTextureFromSpec(hSpec.trim(), THREE.NoColorSpace, wrapS, wrapT).then((tex) => {
        mat.bumpMap = tex;
        mat.bumpScale = tex ? 0.02 : 0;
        mat.needsUpdate = true;
      });
    }
  }

  const rep = resolvePbrTextureRepeat(slot);
  /**
   * When `textureRepeat` / `uvScale` set on authoring, apply after slot maps resolve.
   * Callers usually override repeat per-shell from mesh UV norms — handled by follow-up traversal.
   */
  if (
    slot.uvScale != null ||
    slot.textureRepeat != null ||
    slot.textureRepeatU != null ||
    slot.textureRepeatV != null
  ) {
    for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "bumpMap"] as const) {
      const t = mat[key];
      if (t instanceof THREE.Texture) {
        t.wrapS = wrapS;
        t.wrapT = wrapT;
        t.repeat.set(rep.u, rep.v);
        t.needsUpdate = true;
      }
    }
  }

  mat.needsUpdate = true;
}

/**
 * Architectural concrete / plaster / vinyl shells rarely benefit from separate height bumps and
 * non-metal surfaces should not bind Patina noise metalness. Clears maps to lower fragment fetches on
 * large merged meshes.
 *
 * Prefer omitting `{ metalnessMapUrl, bumpMapUrl }` in JSON so GPUs never allocate them — flags
 * `useMetalnessMap` / `useHeightMap` also gate uploads.
 */
export function stripArchitecturalDetailMaps(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  opts?: { metalness?: number; stripRoughnessMap?: boolean },
): void {
  mat.bumpMap = null;
  mat.bumpScale = 0;
  mat.metalnessMap = null;
  if (opts?.metalness != null) mat.metalness = opts.metalness;
  if (opts?.stripRoughnessMap) mat.roughnessMap = null;
  mat.needsUpdate = true;
}

/** Parse `0xRRGGBB`, `#RRGGBB`, or `RRGGBB`. */
export function parseAuthorColorHex(hex: string): number {
  const t = hex.trim();
  const n = t.startsWith("#") ? t.slice(1) : t.startsWith("0x") ? t.slice(2) : t;
  const v = parseInt(n, 16);
  return Number.isFinite(v) ? v : 0xffffff;
}

export function applyCabMaterialSlot(mat: THREE.MeshStandardMaterial, slot: ElevatorCabMaterialSlot | undefined): void {
  applyStandardAuthoringSlot(mat, slot as unknown as PbrMaterialConfig | undefined);
}

export function applyLandingFrameSlot(mat: THREE.MeshStandardMaterial, slot: LandingKitMaterialSlot | undefined): void {
  applyStandardAuthoringSlot(mat, slot as unknown as PbrMaterialConfig | undefined);
}

export function applyLandingGlassSlot(mat: THREE.MeshPhysicalMaterial, slot: LandingKitMaterialSlot | undefined): void {
  applyStandardAuthoringSlot(mat, slot as unknown as PbrMaterialConfig | undefined);
  if (!slot) return;
  if (slot.transmission != null) mat.transmission = slot.transmission;
}
