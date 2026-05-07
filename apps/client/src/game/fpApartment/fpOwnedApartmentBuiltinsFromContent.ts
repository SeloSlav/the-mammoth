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

export function applyOwnedApartmentBuiltinsToViewerUnit(
  u: ApartmentUnit,
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
): ApartmentUnit {
  if (!doc) return u;
  const sx = (u.boundMaxX as number) - (u.boundMinX as number);
  const sz = (u.boundMaxZ as number) - (u.boundMinZ as number);
  const bminx = u.boundMinX as number;
  const bminz = u.boundMinZ as number;
  const bminy = u.boundMinY as number;
  const yw = doc.yawRad;
  return {
    ...u,
    bedX: bminx + doc.bedFx * sx,
    bedZ: bminz + doc.bedFz * sz,
    bedY: bminy + doc.bedDy,
    bedYaw: yw,
    wardrobeX: bminx + doc.wardrobeFx * sx,
    wardrobeZ: bminz + doc.wardrobeFz * sz,
    footX: bminx + doc.footFx * sx,
    footZ: bminz + doc.footFz * sz,
    footY: bminy + doc.furnitureFloorDy,
  };
}
