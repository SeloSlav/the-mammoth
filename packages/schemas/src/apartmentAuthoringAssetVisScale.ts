import type { OwnedApartmentPlacedItemKind } from "./ownedApartmentBuiltins.js";

/**
 * Uniform scale applied to built-in apartment prop GLBs in authoring + gameplay so oversized assets
 * match unit proportions. Multiplied with per-placement `uniformScale` on the parent group.
 */
export const OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_BED = 1.14 as const;
export const OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_WARDROBE = 0.98 as const;
export const OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_FOOTLOCKER = 0.56 as const;
export const OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_STOVE = 0.88 as const;

export function ownedApartmentPlacedItemAuthoringAssetVisScale(
  kind: OwnedApartmentPlacedItemKind,
): number {
  switch (kind) {
    case "bed":
      return OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_BED;
    case "wardrobe":
      return OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_WARDROBE;
    case "footlocker":
      return OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_FOOTLOCKER;
    case "stove":
      return OWNED_APARTMENT_AUTHORING_ASSET_VIS_SCALE_STOVE;
    default:
      return 1;
  }
}
