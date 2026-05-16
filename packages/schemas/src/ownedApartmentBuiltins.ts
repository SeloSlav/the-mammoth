import { z } from "zod";

/**
 * Migrate disk JSON from the old single yaw + shared furniture floor dy.
 *
 * Older files used `yawRad` for all props and `furnitureFloorDy` for both wardrobe and footlocker.
 */
export function migrateLegacyOwnedApartmentBuiltinsJson(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...o };

  const legacyYaw = out.yawRad;
  if (typeof legacyYaw === "number") {
    if (out.bedYawRad === undefined) out.bedYawRad = legacyYaw;
    if (out.wardrobeYawRad === undefined) out.wardrobeYawRad = legacyYaw;
    if (out.footYawRad === undefined) out.footYawRad = legacyYaw;
    if (out.stoveYawRad === undefined) out.stoveYawRad = legacyYaw;
  }

  const legacyFloor = out.furnitureFloorDy;
  if (typeof legacyFloor === "number") {
    if (out.wardrobeDy === undefined) out.wardrobeDy = legacyFloor;
    if (out.footDy === undefined) out.footDy = legacyFloor;
    if (out.stoveDy === undefined) out.stoveDy = legacyFloor;
  }

  if (typeof out.bedUniformScale !== "number") out.bedUniformScale = 1;
  if (typeof out.wardrobeUniformScale !== "number") out.wardrobeUniformScale = 1;
  if (typeof out.footUniformScale !== "number") out.footUniformScale = 1;
  if (typeof out.stoveUniformScale !== "number") out.stoveUniformScale = 1;

  return out;
}

/**
 * Authoring-only layout for built-in resident props (bed, wardrobe, footlocker, stove).
 * Positions are **normalized** to each live `ApartmentUnit` hull at runtime (`boundMin*`, `boundMax*`).
 * The editor previews those fractions on the **prefab slab** (`floor` JSON `scale` X/Z): the slab
 * lines up with hollow-shell walls, while **`fx` / `fz` denominators** stay the strict hull spans.
 */
const OwnedApartmentDecorItemSchema = z.object({
  id: z.string().min(1).max(120),
  modelRelPath: z
    .string()
    .min(14)
    .max(210)
    .regex(/^static\/models\/[a-zA-Z0-9/._-]+\.(glb|obj)$/u),
  /** 0..1 along unit X span (real: `boundMinX` → `boundMaxX`). */
  fx: z.number().min(0).max(1),
  fz: z.number().min(0).max(1),
  /** Meters above `boundMinY` for floor contact / authored placement. */
  dy: z.number().min(0).max(4),
  yawRad: z.number(),
  uniformScale: z.number().min(0.08).max(5.5),
});

const OwnedApartmentBuiltinsDocSchemaCore = z.object({
  version: z.literal(1),
  /** Preview floor fallback (meters) when the mamutica floor plate is unavailable in the editor. */
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
  stoveFx: z.number().min(0).max(1).default(0.08),
  stoveFz: z.number().min(0).max(1).default(0.08),
  /** Meters above `boundMinY` for wardrobe floor snap (replaces legacy shared `furnitureFloorDy`). */
  wardrobeDy: z.number().min(0).max(4),
  /** Meters above `boundMinY` for footlocker floor snap. */
  footDy: z.number().min(0).max(4),
  /** Meters above `boundMinY` for stove floor snap. */
  stoveDy: z.number().min(0).max(4).default(0),
  /** Yaw (rad), bed-only. */
  bedYawRad: z.number(),
  wardrobeYawRad: z.number(),
  footYawRad: z.number(),
  stoveYawRad: z.number().default(-Math.PI / 2),
  /** Uniform multiplier on each GLB preview (same hollow-shell baseline scales as `fpApartmentFurniture`). */
  bedUniformScale: z.number().min(0.08).max(5.5).default(1),
  wardrobeUniformScale: z.number().min(0.08).max(5.5).default(1),
  footUniformScale: z.number().min(0.08).max(5.5).default(1),
  stoveUniformScale: z.number().min(0.08).max(5.5).default(1),
  /** Imported decor previews saved from the editor apartment authoring UI. */
  decorItems: z.array(OwnedApartmentDecorItemSchema).default([]),
});

export const OwnedApartmentBuiltinsDocSchema = z.preprocess(
  migrateLegacyOwnedApartmentBuiltinsJson,
  OwnedApartmentBuiltinsDocSchemaCore,
);

export type OwnedApartmentBuiltinsDoc = z.infer<typeof OwnedApartmentBuiltinsDocSchemaCore>;

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
    stoveFx: 0.08,
    stoveFz: 0.08,
    wardrobeDy: 0,
    footDy: 0,
    stoveDy: 0,
    bedYawRad: -Math.PI / 2,
    wardrobeYawRad: -Math.PI / 2,
    footYawRad: -Math.PI / 2,
    stoveYawRad: -Math.PI / 2,
    bedUniformScale: 1,
    wardrobeUniformScale: 1,
    footUniformScale: 1,
    stoveUniformScale: 1,
    decorItems: [],
  });
