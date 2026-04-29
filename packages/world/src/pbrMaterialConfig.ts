/**
 * Authoring-facing PBR description for tiling shell materials, elevator slots, stairwell kits, etc.
 * Maps are URLs; omit the extension to let {@link textureCandidatesFromSpec} resolve .ktx2 → .webp → .png → .jpeg.
 *
 * Defaults: metalness scalar 0, no metalness/height textures unless opted in.
 * Typical dielectric shells: basecolor + normal + roughness only.
 */
export type PbrMaterialConfig = {
  /** Debug / tooling label — not loaded by Three.js. */
  name?: string;
  /** Albedo tint multiplier (three.js color hex conventions). */
  colorHex?: string;
  /** Multiplied with roughness map when present; when the map is missing, this is the surface roughness. */
  roughness?: number;
  /** Default 0 — use for concrete, plaster, paint, vinyl, wood, etc. */
  metalness?: number;
  /**
   * When no roughness map loads, use this scalar (default ~0.8).
   * Ignored when `roughness` is explicitly set unless you rely on loader merge rules.
   */
  roughnessFallback?: number;

  /** sRGB base color/albedo (`map`). Legacy alias: prefer `baseColorMap` in new content. */
  mapUrl?: string;
  /** sRGB base color path or URL — same semantics as `mapUrl`. */
  baseColorMap?: string;

  normalMap?: string;
  /** Legacy field name — same as `normalMap`. */
  normalMapUrl?: string;

  roughnessMap?: string;
  roughnessMapUrl?: string;

  aoMap?: string;
  aoMapUrl?: string;

  metalnessMap?: string;
  metalnessMapUrl?: string;

  /** Height — only sampled when {@link useHeightMap} is true (drives bump only; no mesh displacement). */
  heightMap?: string;
  bumpMap?: string;
  bumpMapUrl?: string;

  /**
   * When true (default): RepeatWrapping on S/T. False: clamp — for unique sheets / atlas regions.
   */
  tiled?: boolean;
  /** Uniform UV scale for every bound map (repeat factor). */
  textureRepeat?: number;
  textureRepeatU?: number;
  textureRepeatV?: number;
  /** Alias: same as two-repeat components. */
  uvScale?: { x: number; y: number };

  /** Patina metalness sheets are usually noise — keep off for architecture. Default false. */
  useMetalnessMap?: boolean;
  /** Parallax/height as bump — opt-in; most interiors ignore height to save VRAM. Default false. */
  useHeightMap?: boolean;
};

export type ResolvedPbrTextureRepeat = { u: number; v: number };

export function resolvePbrTextureRepeat(cfg: PbrMaterialConfig): ResolvedPbrTextureRepeat {
  if (cfg.uvScale) {
    return { u: cfg.uvScale.x, v: cfg.uvScale.y };
  }
  const u = cfg.textureRepeatU ?? cfg.textureRepeat ?? 1;
  const v = cfg.textureRepeatV ?? cfg.textureRepeat ?? 1;
  return { u, v };
}

/** @deprecated Use {@link PbrMaterialConfig} — kept for incremental refactors. */
export type StandardAuthoringSlot = PbrMaterialConfig;

export function baseColorSpecFromConfig(cfg: PbrMaterialConfig): string | undefined {
  const s = (cfg.baseColorMap ?? cfg.mapUrl)?.trim();
  return s && s.length > 0 ? s : undefined;
}

export function normalSpecFromConfig(cfg: PbrMaterialConfig): string | undefined {
  const s = (cfg.normalMap ?? cfg.normalMapUrl)?.trim();
  return s && s.length > 0 ? s : undefined;
}

export function roughnessSpecFromConfig(cfg: PbrMaterialConfig): string | undefined {
  const s = (cfg.roughnessMap ?? cfg.roughnessMapUrl)?.trim();
  return s && s.length > 0 ? s : undefined;
}

export function aoSpecFromConfig(cfg: PbrMaterialConfig): string | undefined {
  const s = (cfg.aoMap ?? cfg.aoMapUrl)?.trim();
  return s && s.length > 0 ? s : undefined;
}

export function metalnessSpecFromConfig(cfg: PbrMaterialConfig): string | undefined {
  const s = (cfg.metalnessMap ?? cfg.metalnessMapUrl)?.trim();
  return s && s.length > 0 ? s : undefined;
}

export function heightSpecFromConfig(cfg: PbrMaterialConfig): string | undefined {
  const s = (cfg.heightMap ?? cfg.bumpMap ?? cfg.bumpMapUrl)?.trim();
  return s && s.length > 0 ? s : undefined;
}

export const PBR_DEFAULT_ROUGHNESS_SCALAR = 0.8;
