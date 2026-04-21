import * as THREE from "three";
import type {
  ElevatorCabMaterialSlot,
  LandingKitMaterialSlot,
} from "@the-mammoth/schemas";

/** Shared PBR fields for cab, stair, landing frame/glass (plus optional `transmission` on landing glass). */
export type StandardAuthoringSlot = {
  colorHex?: string;
  roughness?: number;
  metalness?: number;
  mapUrl?: string;
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  metalnessMapUrl?: string;
  bumpMapUrl?: string;
};

const authorColorMapCache = new Map<string, THREE.Texture>();
const authorColorMapLoadInFlight = new Map<string, Promise<void>>();
const authorDataMapCache = new Map<string, THREE.Texture>();
const authorDataMapLoadInFlight = new Map<string, Promise<void>>();

const authorTextureLoader = new THREE.TextureLoader();

function canLoadAuthorTextures(): boolean {
  return typeof document !== "undefined" && typeof Image !== "undefined";
}

/**
 * WebGPU: tiny `DataTexture` uploads go through `_copyBufferToTexture` / `queue.writeTexture`,
 * which can throw "Overload resolution failed" for 1×1 RGBA (layout / stride rules). Use a
 * small canvas-backed texture so the backend uses the image copy path until real maps load.
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
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function beginAuthorTextureLoad(
  url: string,
  tex: THREE.Texture,
  colorSpace: THREE.ColorSpace,
  inFlight: Map<string, Promise<void>>,
): void {
  if (inFlight.has(url)) return;
  const pending = new Promise<void>((resolve) => {
    authorTextureLoader.load(
      url,
      (loaded) => {
        try {
          tex.image = loaded.image;
          tex.colorSpace = colorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
          loaded.dispose();
        } finally {
          resolve();
        }
      },
      undefined,
      () => resolve(),
    );
  }).finally(() => {
    inFlight.delete(url);
  });
  inFlight.set(url, pending);
}

function loadAuthorColorMap(mapUrl: string | undefined): THREE.Texture | null {
  const url = mapUrl?.trim();
  if (!url || !canLoadAuthorTextures()) return null;
  const cached = authorColorMapCache.get(url);
  if (cached) return cached;
  const tex = makeAuthorMapPlaceholder(255, 255, 255, THREE.SRGBColorSpace);
  authorColorMapCache.set(url, tex);
  beginAuthorTextureLoad(url, tex, THREE.SRGBColorSpace, authorColorMapLoadInFlight);
  return tex;
}

function loadAuthorDataMap(mapUrl: string | undefined): THREE.Texture | null {
  const url = mapUrl?.trim();
  if (!url || !canLoadAuthorTextures()) return null;
  const cached = authorDataMapCache.get(url);
  if (cached) return cached;
  /** Flat normal-ish placeholder until the real map arrives. */
  const tex = makeAuthorMapPlaceholder(128, 128, 255, THREE.NoColorSpace);
  authorDataMapCache.set(url, tex);
  beginAuthorTextureLoad(url, tex, THREE.NoColorSpace, authorDataMapLoadInFlight);
  return tex;
}

export function applyStandardAuthoringSlot(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  slot: StandardAuthoringSlot | undefined,
): void {
  if (!slot) return;
  if (slot.roughness != null) mat.roughness = slot.roughness;
  if (slot.metalness != null) mat.metalness = slot.metalness;

  const map = loadAuthorColorMap(slot.mapUrl);
  if (map) {
    mat.color.setHex(slot.colorHex ? parseAuthorColorHex(slot.colorHex) : 0xffffff);
    mat.map = map;
  } else {
    mat.map = null;
    if (slot.colorHex) mat.color.setHex(parseAuthorColorHex(slot.colorHex));
  }

  mat.normalMap = loadAuthorDataMap(slot.normalMapUrl);
  mat.roughnessMap = loadAuthorDataMap(slot.roughnessMapUrl);
  mat.metalnessMap = loadAuthorDataMap(slot.metalnessMapUrl);
  mat.bumpMap = loadAuthorDataMap(slot.bumpMapUrl);

  mat.needsUpdate = true;
}

/**
 * Architectural concrete / plaster / vinyl materials rarely need both tangent-space normal detail
 * and a separate height bump pass, and a metalness texture on these surfaces is usually noise
 * around an effectively constant non-metal value. Clear those maps to reduce fragment texture
 * fetches on the heaviest repeated surfaces. When `opts.stripRoughnessMap` is true, drops the
 * roughness map (one fewer fetch per fragment on huge merged shells).
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

export function applyCabMaterialSlot(
  mat: THREE.MeshStandardMaterial,
  slot: ElevatorCabMaterialSlot | undefined,
): void {
  applyStandardAuthoringSlot(mat, slot);
}

export function applyLandingFrameSlot(
  mat: THREE.MeshStandardMaterial,
  slot: LandingKitMaterialSlot | undefined,
): void {
  applyStandardAuthoringSlot(mat, slot);
}

export function applyLandingGlassSlot(
  mat: THREE.MeshPhysicalMaterial,
  slot: LandingKitMaterialSlot | undefined,
): void {
  applyStandardAuthoringSlot(mat, slot);
  if (!slot) return;
  if (slot.transmission != null) mat.transmission = slot.transmission;
}
