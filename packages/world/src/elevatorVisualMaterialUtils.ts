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

function canLoadAuthorTextures(): boolean {
  return typeof document !== "undefined" && typeof Image !== "undefined";
}

function beginAuthorColorMapLoad(url: string, tex: THREE.Texture): void {
  if (authorColorMapLoadInFlight.has(url)) return;
  const pending = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const width = Math.max(1, img.naturalWidth || img.width || 1);
        const height = Math.max(1, img.naturalHeight || img.height || 1);
        const canvas =
          tex.image instanceof HTMLCanvasElement ? tex.image : document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve();
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        tex.image = canvas;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
      } finally {
        resolve();
      }
    };
    img.onerror = () => {
      resolve();
    };
    img.src = url;
  }).finally(() => {
    authorColorMapLoadInFlight.delete(url);
  });
  authorColorMapLoadInFlight.set(url, pending);
}

function beginAuthorDataMapLoad(url: string, tex: THREE.Texture): void {
  if (authorDataMapLoadInFlight.has(url)) return;
  const pending = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const width = Math.max(1, img.naturalWidth || img.width || 1);
        const height = Math.max(1, img.naturalHeight || img.height || 1);
        const canvas =
          tex.image instanceof HTMLCanvasElement ? tex.image : document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve();
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        tex.image = canvas;
        tex.colorSpace = THREE.NoColorSpace;
        tex.needsUpdate = true;
      } finally {
        resolve();
      }
    };
    img.onerror = () => {
      resolve();
    };
    img.src = url;
  }).finally(() => {
    authorDataMapLoadInFlight.delete(url);
  });
  authorDataMapLoadInFlight.set(url, pending);
}

function loadAuthorColorMap(mapUrl: string | undefined): THREE.Texture | null {
  const url = mapUrl?.trim();
  if (!url || !canLoadAuthorTextures()) return null;
  const cached = authorColorMapCache.get(url);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  authorColorMapCache.set(url, tex);
  beginAuthorColorMapLoad(url, tex);
  return tex;
}

function loadAuthorDataMap(mapUrl: string | undefined): THREE.Texture | null {
  const url = mapUrl?.trim();
  if (!url || !canLoadAuthorTextures()) return null;
  const cached = authorDataMapCache.get(url);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#8080ff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  authorDataMapCache.set(url, tex);
  beginAuthorDataMapLoad(url, tex);
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
