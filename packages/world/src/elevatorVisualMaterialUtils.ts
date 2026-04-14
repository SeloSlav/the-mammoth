import * as THREE from "three";
import type {
  ElevatorCabMaterialSlot,
  LandingKitMaterialSlot,
} from "@the-mammoth/schemas";

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
  if (!slot) return;
  if (slot.colorHex) mat.color.setHex(parseAuthorColorHex(slot.colorHex));
  if (slot.roughness != null) mat.roughness = slot.roughness;
  if (slot.metalness != null) mat.metalness = slot.metalness;
}

export function applyLandingFrameSlot(
  mat: THREE.MeshStandardMaterial,
  slot: LandingKitMaterialSlot | undefined,
): void {
  if (!slot) return;
  if (slot.colorHex) mat.color.setHex(parseAuthorColorHex(slot.colorHex));
  if (slot.roughness != null) mat.roughness = slot.roughness;
  if (slot.metalness != null) mat.metalness = slot.metalness;
}

export function applyLandingGlassSlot(
  mat: THREE.MeshPhysicalMaterial,
  slot: LandingKitMaterialSlot | undefined,
): void {
  if (!slot) return;
  if (slot.colorHex) mat.color.setHex(parseAuthorColorHex(slot.colorHex));
  if (slot.roughness != null) mat.roughness = slot.roughness;
  if (slot.metalness != null) mat.metalness = slot.metalness;
  if (slot.transmission != null) mat.transmission = slot.transmission;
}
