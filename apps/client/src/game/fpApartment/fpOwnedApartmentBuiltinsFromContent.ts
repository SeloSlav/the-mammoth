/**
 * Optional `content/apartment/owned_apartment_builtins.json` overrides placements for **your**
 * visible claimed unit props (fractions within each hull — works for every unit geometry).
 */
import type { ApartmentUnit } from "../../module_bindings/types";
import {
  OwnedApartmentBuiltinsDocSchema,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentPlacedItem,
  type OwnedApartmentMirrorItem,
  type OwnedApartmentPlacedItemKind,
  type OwnedApartmentWallMaterial,
} from "@the-mammoth/schemas";

let cached: OwnedApartmentBuiltinsDoc | null | undefined;

/**
 * Sync read of cached authoring JSON after {@link loadOwnedApartmentBuiltinsDocFromContent} resolves.
 * Used so stash proximity matches rendered furniture fractions.
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

export type ApartmentFurniturePose = {
  bed: { x: number; y: number; z: number; yaw: number; uniformScale: number };
  wardrobe: { x: number; z: number; yaw: number; snapFloorY: number; uniformScale: number };
  footlocker: { x: number; z: number; yaw: number; snapFloorY: number; uniformScale: number };
  stove: { x: number; z: number; yaw: number; snapFloorY: number; uniformScale: number };
};

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

function firstPlacedByKind(
  doc: OwnedApartmentBuiltinsDoc,
  kind: OwnedApartmentPlacedItemKind,
): OwnedApartmentPlacedItem | null {
  const items = doc.placedItems
    .filter((p) => p.itemKind === kind)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  return items[0] ?? null;
}

/**
 * Resolves world-space furniture pose for one unit, merging authoritative `ApartmentUnit` rows with
 * optional v2 content (`placedItems`). Missing kinds fall back to replicated `ApartmentUnit` seeds.
 */
export function resolveApartmentFurniturePose(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): ApartmentFurniturePose {
  const fy = u.footY;
  const yw = u.bedYaw;
  const fallback = {
    bed: { x: u.bedX, y: u.bedY, z: u.bedZ, yaw: yw, uniformScale: 1 },
    wardrobe: {
      x: u.wardrobeX,
      z: u.wardrobeZ,
      yaw: yw,
      snapFloorY: fy,
      uniformScale: 1,
    },
    footlocker: { x: u.footX, z: u.footZ, yaw: yw, snapFloorY: fy, uniformScale: 1 },
    stove: { x: u.stoveX, z: u.stoveZ, yaw: yw, snapFloorY: fy, uniformScale: 1 },
  };

  if (!doc) return fallback;

  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;

  const bedP = firstPlacedByKind(doc, "bed");
  const wardrobeP = firstPlacedByKind(doc, "wardrobe");
  const footP = firstPlacedByKind(doc, "footlocker");
  const stoveP = firstPlacedByKind(doc, "stove");

  return {
    bed: bedP
      ? {
          x: bminx + bedP.fx * sx,
          y: bminy + bedP.dy,
          z: bminz + bedP.fz * sz,
          yaw: bedP.yawRad,
          uniformScale: bedP.uniformScale,
        }
      : fallback.bed,
    wardrobe: wardrobeP
      ? {
          x: bminx + wardrobeP.fx * sx,
          z: bminz + wardrobeP.fz * sz,
          yaw: wardrobeP.yawRad,
          snapFloorY: bminy + wardrobeP.dy,
          uniformScale: wardrobeP.uniformScale,
        }
      : fallback.wardrobe,
    footlocker: footP
      ? {
          x: bminx + footP.fx * sx,
          z: bminz + footP.fz * sz,
          yaw: footP.yawRad,
          snapFloorY: bminy + footP.dy,
          uniformScale: footP.uniformScale,
        }
      : fallback.footlocker,
    stove: stoveP
      ? {
          x: bminx + stoveP.fx * sx,
          z: bminz + stoveP.fz * sz,
          yaw: stoveP.yawRad,
          snapFloorY: bminy + stoveP.dy,
          uniformScale: stoveP.uniformScale,
        }
      : fallback.stove,
  };
}

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
  return doc.placedItems.map((item) => ({
    id: item.id,
    modelRelPath: item.modelRelPath,
    itemKind: item.itemKind,
    x: bminx + item.fx * sx,
    y: bminy + item.dy,
    z: bminz + item.fz * sz,
    yaw: item.yawRad,
    pitch: item.pitchRad,
    roll: item.rollRad ?? 0,
    uniformScale: item.uniformScale,
  }));
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
  return doc.wallItems.map((item) => ({
    id: item.id,
    x: bminx + item.fx * sx,
    y: bminy + item.dy,
    z: bminz + item.fz * sz,
    yaw: item.yawRad,
    pitch: item.pitchRad,
    sizeX: item.sizeX,
    sizeY: item.sizeY,
    sizeZ: item.sizeZ,
    material: item.material,
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
  return doc.mirrorItems.map((item: OwnedApartmentMirrorItem) => ({
    id: item.id,
    x: bminx + item.fx * sx,
    y: bminy + item.dy,
    z: bminz + item.fz * sz,
    yaw: item.yawRad,
    pitch: item.pitchRad,
    roll: item.rollRad ?? 0,
    sizeX: item.sizeX,
    sizeY: item.sizeY,
  }));
}

/**
 * True when authoring JSON includes any gameplay-capable placed item (`itemKind !== "plain"`).
 * In that case {@link mountFpApartmentFurniture} defers meshes + stash picks to the decor pipeline.
 */
export function ownedApartmentDocUsesNonPlainPlacedItems(
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): boolean {
  if (!doc) return false;
  return doc.placedItems.some((p) => p.itemKind !== "plain");
}
