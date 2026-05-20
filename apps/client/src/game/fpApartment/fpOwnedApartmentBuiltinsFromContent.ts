/**
 * Optional `content/apartment/owned_apartment_builtins.json` overrides placements for **your**
 * visible claimed unit props (fractions within each hull — works for every unit geometry).
 */
import type { ApartmentUnit } from "../../module_bindings/types";
import {
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
  type ApartmentStashKind,
} from "./fpApartmentStashKey.js";
import {
  OwnedApartmentBuiltinsDocSchema,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentPlacedItem,
  type OwnedApartmentMirrorItem,
  type OwnedApartmentPlacedItemKind,
  type OwnedApartmentWallMaterial,
  type OwnedApartmentWallOpening,
} from "@the-mammoth/schemas";
import { mapOwnedApartmentLayoutFractionToWorldX } from "@the-mammoth/world";

let cached: OwnedApartmentBuiltinsDoc | null | undefined;

/**
 * Sync read of cached authoring JSON after {@link loadOwnedApartmentBuiltinsDocFromContent} resolves.
 * Used so stash proximity matches rendered decor placements.
 */
export function peekOwnedApartmentBuiltinsDoc(): OwnedApartmentBuiltinsDoc | null | undefined {
  return cached;
}

export async function loadOwnedApartmentBuiltinsDocFromContent(): Promise<OwnedApartmentBuiltinsDoc | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch("/content/apartment/owned_apartment_builtins.json", {
      cache: "no-store",
    });
    if (!res.ok) {
      cached = null;
      return null;
    }
    const raw = (await res.json()) as unknown;
    cached = OwnedApartmentBuiltinsDocSchema.parse(raw);
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export type ApartmentDecorPose = {
  id: string;
  modelRelPath: string;
  itemKind: OwnedApartmentPlacedItemKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  uniformScale: number;
};

/**
 * Resolves all `placedItems` from authoring JSON into world space for one unit.
 */
export function resolveApartmentDecorPoses(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): ApartmentDecorPose[] {
  if (!doc || doc.placedItems.length === 0) return [];
  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;
  const unitId = u.unitId as string;
  const bmaxx = u.boundMaxX as number;
  return doc.placedItems.map((item) => ({
    id: item.id,
    modelRelPath: item.modelRelPath,
    itemKind: item.itemKind,
    x: mapOwnedApartmentLayoutFractionToWorldX(bminx, bmaxx, unitId, item.fx),
    y: bminy + item.dy,
    z: bminz + item.fz * sz,
    yaw: item.yawRad,
    pitch: item.pitchRad,
    roll: item.rollRad ?? 0,
    uniformScale: item.uniformScale,
  }));
}

/** World XZ anchor for stash proximity — authored decor poses, else replicated `ApartmentUnit` seeds. */
export function resolveApartmentStashAnchorXZ(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
  stashKind: ApartmentStashKind,
): { x: number; z: number } {
  if (doc) {
    const pose = resolveApartmentDecorPoses(u, doc).find((p) => p.itemKind === stashKind);
    if (pose) return { x: pose.x, z: pose.z };
  }
  switch (stashKind) {
    case APARTMENT_STASH_KIND_WARDROBE:
      return { x: u.wardrobeX, z: u.wardrobeZ };
    case APARTMENT_STASH_KIND_STOVE:
      return { x: u.stoveX, z: u.stoveZ };
    case APARTMENT_STASH_KIND_FRIDGE:
      return { x: u.stoveX, z: u.stoveZ };
    default:
      return { x: u.footX, z: u.footZ };
  }
}

export type ApartmentWallPose = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  material: OwnedApartmentWallMaterial;
  openings: OwnedApartmentWallOpening[];
};

/**
 * Resolves authored partition walls from `owned_apartment_builtins.json` into world space for one unit.
 */
export function resolveApartmentWallPoses(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): ApartmentWallPose[] {
  if (!doc || doc.wallItems.length === 0) return [];
  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;
  const unitId = u.unitId as string;
  const bmaxx = u.boundMaxX as number;
  return doc.wallItems.map((item) => ({
    id: item.id,
    x: mapOwnedApartmentLayoutFractionToWorldX(bminx, bmaxx, unitId, item.fx),
    y: bminy + item.dy,
    z: bminz + item.fz * sz,
    yaw: item.yawRad,
    pitch: item.pitchRad,
    sizeX: item.sizeX,
    sizeY: item.sizeY,
    sizeZ: item.sizeZ,
    material: item.material,
    openings: item.openings ?? [],
  }));
}

export type ApartmentMirrorPose = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  sizeX: number;
  sizeY: number;
};

/**
 * Resolves authored planar mirrors from `owned_apartment_builtins.json` into world space for one unit.
 */
export function resolveApartmentMirrorPoses(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): ApartmentMirrorPose[] {
  if (!doc || doc.mirrorItems.length === 0) return [];
  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;
  const unitId = u.unitId as string;
  const bmaxx = u.boundMaxX as number;
  return doc.mirrorItems.map((item: OwnedApartmentMirrorItem) => ({
    id: item.id,
    x: mapOwnedApartmentLayoutFractionToWorldX(bminx, bmaxx, unitId, item.fx),
    y: bminy + item.dy,
    z: bminz + item.fz * sz,
    yaw: item.yawRad,
    pitch: item.pitchRad,
    roll: item.rollRad ?? 0,
    sizeX: item.sizeX,
    sizeY: item.sizeY,
  }));
}

