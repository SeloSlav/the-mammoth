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
  bed: { x: number; y: number; z: number; yaw: number };
  wardrobe: { x: number; z: number; yaw: number; snapFloorY: number };
  footlocker: { x: number; z: number; yaw: number; snapFloorY: number };
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
      bed: { x: u.bedX, y: u.bedY, z: u.bedZ, yaw: yw },
      wardrobe: {
        x: u.wardrobeX,
        z: u.wardrobeZ,
        yaw: yw,
        snapFloorY: fy,
      },
      footlocker: { x: u.footX, z: u.footZ, yaw: yw, snapFloorY: fy },
    };
  }
  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;
  const wardrobeSnap = bminy + doc.wardrobeDy;
  const footSnap = bminy + doc.footDy;
  return {
    bed: {
      x: bminx + doc.bedFx * sx,
      y: bminy + doc.bedDy,
      z: bminz + doc.bedFz * sz,
      yaw: doc.bedYawRad,
    },
    wardrobe: {
      x: bminx + doc.wardrobeFx * sx,
      z: bminz + doc.wardrobeFz * sz,
      yaw: doc.wardrobeYawRad,
      snapFloorY: wardrobeSnap,
    },
    footlocker: {
      x: bminx + doc.footFx * sx,
      z: bminz + doc.footFz * sz,
      yaw: doc.footYawRad,
      snapFloorY: footSnap,
    },
  };
}
