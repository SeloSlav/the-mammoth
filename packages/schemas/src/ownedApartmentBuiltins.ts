import { z } from "zod";

/**
 * Authoring-only layout for the three built-in resident props (bed, wardrobe, footlocker).
 * Positions are **normalized** to each live `ApartmentUnit` hull at runtime (`boundMin*`, `boundMax*`).
 * Editor preview uses a square {@link previewSizeM} meter floor so gizmo space matches linearly.
 */
export const OwnedApartmentBuiltinsDocSchema = z.object({
  version: z.literal(1),
  /** Square preview floor the editor uses (meters). Saved so reopening stays consistent. */
  previewSizeM: z.number().positive().max(80).default(10),
  /** 0..1 along unit X span (real: `boundMinX` → `boundMaxX`). */
  bedFx: z.number().min(0).max(1),
  bedFz: z.number().min(0).max(1),
  /** Meters above `boundMinY` for the bed floor contact (matches `bed_y` slack above slab). */
  bedDy: z.number().min(0).max(4),
  wardrobeFx: z.number().min(0).max(1),
  wardrobeFz: z.number().min(0).max(1),
  footFx: z.number().min(0).max(1),
  footFz: z.number().min(0).max(1),
  /** Meters above `boundMinY` for wardrobe + footlocker floor snap (game `footY` plane). */
  furnitureFloorDy: z.number().min(0).max(4),
  /**
   * Shared yaw (rad) for all three props — matches server coupling where wardrobe/foot updates
   * write `bed_yaw` as well.
   */
  yawRad: z.number(),
});

export type OwnedApartmentBuiltinsDoc = z.infer<typeof OwnedApartmentBuiltinsDocSchema>;

/** Editor + client default until `content/apartment/owned_apartment_builtins.json` exists. */
export const DEFAULT_OWNED_APARTMENT_BUILTINS_DOC: OwnedApartmentBuiltinsDoc =
  OwnedApartmentBuiltinsDocSchema.parse({
    version: 1,
    previewSizeM: 10,
    bedFx: 0.62,
    bedFz: 0.48,
    bedDy: 0.01,
    wardrobeFx: 0.22,
    wardrobeFz: 0.72,
    footFx: 0.42,
    footFz: 0.3,
    furnitureFloorDy: 0,
    yawRad: -Math.PI / 2,
  });
