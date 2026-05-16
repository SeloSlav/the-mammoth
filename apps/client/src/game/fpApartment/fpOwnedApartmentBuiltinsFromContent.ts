/**
 * Optional `content/apartment/owned_apartment_builtins.json` overrides placements for **your**
 * visible claimed unit props (fractions within each hull — works for every unit geometry).
 */
import type { ApartmentUnit } from "../../module_bindings/types";
import {
  OwnedApartmentBuiltinsDocSchema,
  type OwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";

let cached: OwnedApartmentBuiltinsDoc | null | undefined;

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
  x: number;
  y: number;
  z: number;
  yaw: number;
  uniformScale: number;
};

/**
 * Resolves world-space furniture pose for one unit, merging authoritative `ApartmentUnit` rows with
 * optional content JSON overrides.
 */
export function resolveApartmentFurniturePose(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): ApartmentFurniturePose {
  if (!doc) {
    const fy = u.footY;
    const yw = u.bedYaw;
    return {
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
  }
  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;
  const wardrobeSnap = bminy + doc.wardrobeDy;
  const footSnap = bminy + doc.footDy;
  const stoveSnap = bminy + doc.stoveDy;
  return {
    bed: {
      x: bminx + doc.bedFx * sx,
      y: bminy + doc.bedDy,
      z: bminz + doc.bedFz * sz,
      yaw: doc.bedYawRad,
      uniformScale: doc.bedUniformScale,
    },
    wardrobe: {
      x: bminx + doc.wardrobeFx * sx,
      z: bminz + doc.wardrobeFz * sz,
      yaw: doc.wardrobeYawRad,
      snapFloorY: wardrobeSnap,
      uniformScale: doc.wardrobeUniformScale,
    },
    footlocker: {
      x: bminx + doc.footFx * sx,
      z: bminz + doc.footFz * sz,
      yaw: doc.footYawRad,
      snapFloorY: footSnap,
      uniformScale: doc.footUniformScale,
    },
    stove: {
      x: bminx + doc.stoveFx * sx,
      z: bminz + doc.stoveFz * sz,
      yaw: doc.stoveYawRad,
      snapFloorY: stoveSnap,
      uniformScale: doc.stoveUniformScale,
    },
  };
}

/**
 * Resolves imported decor authored in `owned_apartment_builtins.json` into world space for one unit.
 */
export function resolveApartmentDecorPoses(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): ApartmentDecorPose[] {
  if (!doc || doc.decorItems.length === 0) return [];
  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;
  return doc.decorItems.map((item) => ({
    id: item.id,
    modelRelPath: item.modelRelPath,
    x: bminx + item.fx * sx,
    y: bminy + item.dy,
    z: bminz + item.fz * sz,
    yaw: item.yawRad,
    uniformScale: item.uniformScale,
  }));
}
