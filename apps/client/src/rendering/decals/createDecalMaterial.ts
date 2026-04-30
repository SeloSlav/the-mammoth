import * as THREE from "three";
import type { DecalManifestEntry } from "./decalTypes.js";
import type { DecalMaterialOpts } from "./decalTypes.js";

export type MaterialCacheKey = string;

/** Share GPU materials whenever manifest entries reuse the same source texture URL (e.g. blok47_a…h → blok47.png). */
export function decalMaterialCacheKeyForEntry(
  entry: Pick<DecalManifestEntry, "url" | "category" | "roughness" | "metalness">,
  opts: Pick<
    DecalMaterialOpts,
    "opacity" | "alphaTest" | "transparent" | "depthWrite" | "polygonOffsetFactor"
  >,
): MaterialCacheKey {
  return [
    entry.category,
    entry.url,
    (entry.roughness ?? "").toString(),
    (entry.metalness ?? "").toString(),
    opts.opacity.toFixed(3),
    opts.alphaTest.toFixed(3),
    opts.transparent ? 1 : 0,
    opts.depthWrite ? 1 : 0,
    opts.polygonOffsetFactor.toFixed(2),
  ].join("|");
}

export function decalMaterialCacheKey(
  manifestId: string,
  opts: Pick<
    DecalMaterialOpts,
    "opacity" | "alphaTest" | "transparent" | "depthWrite" | "polygonOffsetFactor"
  >,
): MaterialCacheKey {
  return [
    manifestId,
    opts.opacity.toFixed(3),
    opts.alphaTest.toFixed(3),
    opts.transparent ? 1 : 0,
    opts.depthWrite ? 1 : 0,
    opts.polygonOffsetFactor.toFixed(2),
  ].join("|");
}

export function graffitiDecalMaterialOpts(opacity: number): DecalMaterialOpts {
  return {
    roughness: 0.92,
    metalness: 0,
    transparent: opacity < 0.999,
    opacity,
    alphaTest: 0.08,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  };
}

export function stickerDecalMaterialOpts(opacity: number): DecalMaterialOpts {
  return {
    roughness: 0.88,
    metalness: 0,
    transparent: opacity < 0.999,
    opacity,
    alphaTest: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -1.5,
  };
}

export function grimeDecalMaterialOpts(opacity: number): DecalMaterialOpts {
  return {
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity,
    alphaTest: 0.05,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2.5,
    polygonOffsetUnits: -2.5,
  };
}

export function createDecalMaterial(
  manifestEntry: DecalManifestEntry,
  texture: THREE.Texture,
  opts: DecalMaterialOpts,
): THREE.MeshBasicMaterial | THREE.MeshStandardMaterial {
  if (manifestEntry.category === "grime") {
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: opts.transparent,
      opacity: opts.opacity,
      alphaTest: opts.alphaTest,
      depthWrite: opts.depthWrite,
      polygonOffset: opts.polygonOffset,
      polygonOffsetFactor: opts.polygonOffsetFactor,
      polygonOffsetUnits: opts.polygonOffsetUnits,
      roughness: manifestEntry.roughness ?? opts.roughness,
      metalness: manifestEntry.metalness ?? opts.metalness,
    });
    mat.needsUpdate = true;
    return mat;
  }

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: opts.transparent,
    opacity: opts.opacity,
    alphaTest: opts.alphaTest,
    depthWrite: opts.depthWrite,
    polygonOffset: opts.polygonOffset,
    polygonOffsetFactor: opts.polygonOffsetFactor,
    polygonOffsetUnits: opts.polygonOffsetUnits,
  });
  mat.needsUpdate = true;
  return mat;
}
