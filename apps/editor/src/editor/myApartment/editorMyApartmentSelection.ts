import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";

const PIECE_PREFIX = "mammoth_editor_my_apartment_piece:";
const DECOR_PREFIX = "mammoth_editor_my_apartment_decor:";
const WALL_PREFIX = "mammoth_editor_my_apartment_wall:";

export function editorMyApartmentSelectedIdForPiece(
  piece: MyApartmentLayoutPiece,
): string {
  return `${PIECE_PREFIX}${piece}`;
}

export function editorMyApartmentSelectedIdForDecor(
  decorId: string,
): string {
  return `${DECOR_PREFIX}${decorId}`;
}

export function editorMyApartmentSelectedIdForWall(wallId: string): string {
  return `${WALL_PREFIX}${wallId}`;
}

export function parseMyApartmentLayoutWallSelectedId(id: string | null): string | null {
  if (!id || !id.startsWith(WALL_PREFIX)) return null;
  const rest = id.slice(WALL_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

export function parseMyApartmentLayoutPieceSelectedId(
  id: string | null,
): MyApartmentLayoutPiece | null {
  if (!id || !id.startsWith(PIECE_PREFIX)) return null;
  const rest = id.slice(PIECE_PREFIX.length);
  if (
    rest === "bed" ||
    rest === "wardrobe" ||
    rest === "footlocker" ||
    rest === "stove"
  ) {
    return rest;
  }
  return null;
}

export function parseMyApartmentLayoutDecorSelectedId(
  id: string | null,
): string | null {
  if (!id || !id.startsWith(DECOR_PREFIX)) return null;
  const rest = id.slice(DECOR_PREFIX.length);
  return rest.length > 0 ? rest : null;
}
