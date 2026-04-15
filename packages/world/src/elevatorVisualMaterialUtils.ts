import * as THREE from "three";
import type {
  ElevatorCabMaterialSlot,
  LandingKitMaterialSlot,
} from "@the-mammoth/schemas";

type StandardAuthoringSlot = {
  colorHex?: string;
  roughness?: number;
  metalness?: number;
  mapUrl?: string;
};

const authorColorMapCache = new Map<string, THREE.Texture>();
let authorTextureLoader: THREE.TextureLoader | null = null;

function canLoadAuthorTextures(): boolean {
  return typeof document !== "undefined" || typeof Image !== "undefined";
}

function authorTextureLoaderSingleton(): THREE.TextureLoader {
  authorTextureLoader ??= new THREE.TextureLoader();
  return authorTextureLoader;
}

function loadAuthorColorMap(mapUrl: string | undefined): THREE.Texture | null {
  const url = mapUrl?.trim();
  if (!url || !canLoadAuthorTextures()) return null;
  const cached = authorColorMapCache.get(url);
  if (cached) return cached;
  const tex = authorTextureLoaderSingleton().load(
    url,
    (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
    },
    undefined,
    () => {
      /* ignore texture load failures; authoring should degrade to flat materials */
    },
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  authorColorMapCache.set(url, tex);
  return tex;
}

function applyStandardAuthoringSlot(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  slot: StandardAuthoringSlot | undefined,
): void {
  if (!slot) return;
  if (slot.colorHex) mat.color.setHex(parseAuthorColorHex(slot.colorHex));
  if (slot.roughness != null) mat.roughness = slot.roughness;
  if (slot.metalness != null) mat.metalness = slot.metalness;
  const map = loadAuthorColorMap(slot.mapUrl);
  if (map) {
    mat.map = map;
    mat.needsUpdate = true;
  }
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
