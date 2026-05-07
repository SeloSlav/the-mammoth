import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";

const PREFIX = "mammoth_editor_my_apartment_piece:";

export function editorMyApartmentSelectedIdForPiece(
  piece: MyApartmentLayoutPiece,
): string {
  return `${PREFIX}${piece}`;
}

export function parseMyApartmentLayoutPieceSelectedId(
  id: string | null,
): MyApartmentLayoutPiece | null {
  if (!id || !id.startsWith(PREFIX)) return null;
  const rest = id.slice(PREFIX.length);
  if (
    rest === "bed" ||
    rest === "wardrobe" ||
    rest === "footlocker"
  ) {
    return rest;
  }
  return null;
}
