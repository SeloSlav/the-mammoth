/** Typings for `sync-owned-apartment-decor-default-scale-core.mjs`. */

export const OWNED_APARTMENT_BUILTINS_REL: string;
export const OWNED_APARTMENT_DECOR_DEFAULT_SCALE_REL: string;

export function buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems(
  placedItems: ReadonlyArray<{
    modelRelPath: string;
    uniformScale: number;
    verticalScaleMul?: number;
  }>,
): Record<string, { uniformScale: number; verticalScaleMul: number }>;

export function formatOwnedApartmentDecorDefaultScaleTsFile(
  byModel: Record<string, { uniformScale: number; verticalScaleMul: number }>,
): string;

export function syncOwnedApartmentDecorDefaultScaleFromRepoRoot(
  repoRoot: string,
  opts?: {
    placedItems?: ReadonlyArray<{
      modelRelPath: string;
      uniformScale: number;
      verticalScaleMul?: number;
    }>;
    builtinsPath?: string;
    outPath?: string;
  },
): {
  ok: true;
  source: "editor" | "disk";
  modelCount: number;
  placementCount: number;
  builtinsPath: string;
  outPath: string;
};
