import { z } from "zod";

/** Matches server `APARTMENT_DECOR_PITCH_LIMIT_RAD` — max tilt for imported decor (rad). */
export const OWNED_APARTMENT_DECOR_PITCH_RAD_MAX = 1.4 as const;
/** Matches server `APARTMENT_DECOR_ROLL_LIMIT_RAD` — max roll (`YXZ` euler Z) for imported decor (rad). */
export const OWNED_APARTMENT_DECOR_ROLL_RAD_MAX = 1.4 as const;
/** Minimum uniform scale for imported decor (furniture built-ins stay at 0.08). Sync with server. */
export const OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN = 0.02 as const;
/**
 * Authoring can extend slightly beyond the replicated gameplay hull so props can reach visible
 * plaster/window edges on end-cap units. Runtime placement still maps linearly from
 * `boundMin* + f * span`; the extended range just permits a small overscan.
 */
export const OWNED_APARTMENT_LAYOUT_FRACTION_MIN = -0.2 as const;
export const OWNED_APARTMENT_LAYOUT_FRACTION_MAX = 1.2 as const;

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
 * Positions are **normalized** to each live `ApartmentUnit` hull at runtime (`boundMin*`, `boundMax*`),
 * with a small overscan beyond `[0,1]` so authored props can still reach visible shell edges where
 * the gameplay hull sits inset from a windowed wall. The editor previews those fractions on the
 * **prefab slab** (`floor` JSON `scale` X/Z): the slab lines up with hollow-shell walls, while
 * **`fx` / `fz` denominators** stay the strict hull spans.
 */
const OwnedApartmentDecorItemSchema = z.object({
  id: z.string().min(1).max(120),
  modelRelPath: z
    .string()
    .min(14)
    .max(210)
    .regex(/^static\/models\/[a-zA-Z0-9/._-]+\.(glb|obj)$/u),
  /** Slight overscan around the live unit X/Z hull (`boundMin*` → `boundMax*`) for wall-edge authoring. */
  fx: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  fz: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  /** Meters above `boundMinY` for floor contact / authored placement. */
  dy: z.number().min(0).max(4),
  yawRad: z.number(),
  /** Tilt around local X after yaw (Three.js `YXZ` root — matches runtime/editor). */
  pitchRad: z
    .number()
    .min(-OWNED_APARTMENT_DECOR_PITCH_RAD_MAX)
    .max(OWNED_APARTMENT_DECOR_PITCH_RAD_MAX)
    .default(0),
  /** Roll around local Z after pitch/yaw (Three.js `YXZ` euler — matches runtime/editor). */
  rollRad: z
    .number()
    .min(-OWNED_APARTMENT_DECOR_ROLL_RAD_MAX)
    .max(OWNED_APARTMENT_DECOR_ROLL_RAD_MAX)
    .default(0),
  uniformScale: z
    .number()
    .min(OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN)
    .max(5.5),
  /** When true, editor translate ignores tabletop/object support surfaces for fine manual placement. */
  ignoreSupportSurfaces: z.boolean().default(false),
});

/** PBR slot for authored wall slabs (editor + client load URLs under `/static/materials/…`). */
export const OwnedApartmentWallMaterialSchema = z.object({
  mapUrl: z.string().optional(),
  normalMapUrl: z.string().optional(),
  roughnessMapUrl: z.string().optional(),
  metalnessMapUrl: z.string().optional(),
  bumpMapUrl: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  useMetalnessMap: z.boolean().default(false),
  useHeightMap: z.boolean().default(false),
});

export type OwnedApartmentWallMaterial = z.infer<typeof OwnedApartmentWallMaterialSchema>;

/** Thin box partition wall saved with owned-apartment authoring (not replica decor rows). */
export const OwnedApartmentWallItemSchema = z.object({
  id: z.string().min(1).max(120),
  /** Slight overscan around the live unit X/Z hull (`boundMin*` → `boundMax*`) for wall-edge authoring. */
  fx: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  fz: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  /** Meters above `boundMinY` for the slab bottom / floor contact line in preview and runtime. */
  dy: z.number().min(0).max(4),
  yawRad: z.number(),
  pitchRad: z
    .number()
    .min(-OWNED_APARTMENT_DECOR_PITCH_RAD_MAX)
    .max(OWNED_APARTMENT_DECOR_PITCH_RAD_MAX)
    .default(0),
  /** Local axis extents after `YXZ` yaw/pitch (meters); mesh is unit cube scaled by these values. */
  sizeX: z.number().min(0.05).max(8),
  sizeY: z.number().min(0.05).max(8),
  sizeZ: z.number().min(0.02).max(2),
  material: OwnedApartmentWallMaterialSchema.default(() => ({
    useMetalnessMap: false,
    useHeightMap: false,
  })),
});

export type OwnedApartmentWallItem = z.infer<typeof OwnedApartmentWallItemSchema>;

const OwnedApartmentBuiltinsDocSchemaCore = z.object({
  version: z.literal(1),
  /** Preview floor fallback (meters) when the mamutica floor plate is unavailable in the editor. */
  previewSizeM: z.number().positive().max(80).default(10),
  /** Slight overscan around the live unit X/Z hull (`boundMin*` → `boundMax*`) for wall-edge authoring. */
  bedFx: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  bedFz: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  /** Meters above `boundMinY` for the bed floor contact (matches `bed_y` slack above slab). */
  bedDy: z.number().min(0).max(4),
  wardrobeFx: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  wardrobeFz: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  footFx: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  footFz: z.number().min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN).max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  stoveFx: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX)
    .default(0.08),
  stoveFz: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX)
    .default(0.08),
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
  /** Authored partition walls (thin boxes with PBR materials). */
  wallItems: z.array(OwnedApartmentWallItemSchema).default([]),
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
    wallItems: [],
  });
