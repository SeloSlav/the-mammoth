/** Mirrors `APARTMENT_LAYOUT_PIECE_*` reducers (`apps/server/src/apartments.rs`). */
export const APARTMENT_LAYOUT_PIECE_BED = 0 as const;
export const APARTMENT_LAYOUT_PIECE_WARDROBE = 1 as const;
export const APARTMENT_LAYOUT_PIECE_FOOTLOCKER = 2 as const;

export type ApartmentLayoutBuiltinPiece =
  | typeof APARTMENT_LAYOUT_PIECE_BED
  | typeof APARTMENT_LAYOUT_PIECE_WARDROBE
  | typeof APARTMENT_LAYOUT_PIECE_FOOTLOCKER;
