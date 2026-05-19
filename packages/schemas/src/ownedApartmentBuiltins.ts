import { z } from "zod";

/** Matches server `APARTMENT_DECOR_PITCH_LIMIT_RAD` — max tilt for imported decor (rad). */
export const OWNED_APARTMENT_DECOR_PITCH_RAD_MAX = 1.4 as const;
/** Matches server `APARTMENT_DECOR_ROLL_LIMIT_RAD` — max roll (`YXZ` euler Z) for imported decor (rad). */
export const OWNED_APARTMENT_DECOR_ROLL_RAD_MAX = 1.4 as const;
/** Minimum uniform scale for generic placed items (`plain`). Sync with server. */
export const OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN = 0.02 as const;
/** Minimum uniform scale for furniture role kinds (bed, wardrobe, …). Sync with server built-in clamps. */
export const OWNED_APARTMENT_FURNITURE_UNIFORM_SCALE_MIN = 0.08 as const;
/**
 * Authoring can extend slightly beyond the replicated gameplay hull so props can reach visible
 * plaster/window edges on end-cap units. Runtime placement still maps linearly from
 * `boundMin* + f * span`; the extended range just permits a small overscan.
 */
export const OWNED_APARTMENT_LAYOUT_FRACTION_MIN = -0.2 as const;
export const OWNED_APARTMENT_LAYOUT_FRACTION_MAX = 1.2 as const;

/** Canonical model paths for gameplay-capable apartment props (editor catalog + server validation). */
export const OWNED_APARTMENT_MODEL_BED = "static/models/objects/bed.glb" as const;
export const OWNED_APARTMENT_MODEL_WARDROBE = "static/models/objects/wardrobe-closet.glb" as const;
export const OWNED_APARTMENT_MODEL_FOOTLOCKER = "static/models/objects/footlocker.glb" as const;
export const OWNED_APARTMENT_MODEL_STOVE = "static/models/objects/stove.glb" as const;

export const OWNED_APARTMENT_PLACED_ITEM_KINDS = [
  "plain",
  "bed",
  "wardrobe",
  "footlocker",
  "stove",
  "fridge",
] as const;

export type OwnedApartmentPlacedItemKind =
  (typeof OWNED_APARTMENT_PLACED_ITEM_KINDS)[number];

export function ownedApartmentPlacedItemKindHasStash(
  k: OwnedApartmentPlacedItemKind,
): boolean {
  return (
    k === "wardrobe" || k === "footlocker" || k === "stove" || k === "fridge"
  );
}

export function ownedApartmentPlacedItemKindHasClaimAnchor(
  k: OwnedApartmentPlacedItemKind,
): boolean {
  return k === "wardrobe";
}

export function ownedApartmentPlacedItemKindHasSpawnAnchor(
  k: OwnedApartmentPlacedItemKind,
): boolean {
  return k === "bed";
}

/** Server `item_kind` column (u8). Keep in sync with `apps/server/src/apartments.rs`. */
export const APARTMENT_UNIT_DECOR_ITEM_KIND_PLAIN = 0 as const;
export const APARTMENT_UNIT_DECOR_ITEM_KIND_BED = 1 as const;
export const APARTMENT_UNIT_DECOR_ITEM_KIND_WARDROBE = 2 as const;
export const APARTMENT_UNIT_DECOR_ITEM_KIND_FOOTLOCKER = 3 as const;
export const APARTMENT_UNIT_DECOR_ITEM_KIND_STOVE = 4 as const;
export const APARTMENT_UNIT_DECOR_ITEM_KIND_FRIDGE = 5 as const;

export function apartmentUnitDecorItemKindFromString(
  k: OwnedApartmentPlacedItemKind,
): number {
  switch (k) {
    case "bed":
      return APARTMENT_UNIT_DECOR_ITEM_KIND_BED;
    case "wardrobe":
      return APARTMENT_UNIT_DECOR_ITEM_KIND_WARDROBE;
    case "footlocker":
      return APARTMENT_UNIT_DECOR_ITEM_KIND_FOOTLOCKER;
    case "stove":
      return APARTMENT_UNIT_DECOR_ITEM_KIND_STOVE;
    case "fridge":
      return APARTMENT_UNIT_DECOR_ITEM_KIND_FRIDGE;
    default:
      return APARTMENT_UNIT_DECOR_ITEM_KIND_PLAIN;
  }
}

export function apartmentPlacedItemKindFromDecorItemKind(
  itemKind: number,
): OwnedApartmentPlacedItemKind {
  switch (itemKind) {
    case APARTMENT_UNIT_DECOR_ITEM_KIND_BED:
      return "bed";
    case APARTMENT_UNIT_DECOR_ITEM_KIND_WARDROBE:
      return "wardrobe";
    case APARTMENT_UNIT_DECOR_ITEM_KIND_FOOTLOCKER:
      return "footlocker";
    case APARTMENT_UNIT_DECOR_ITEM_KIND_STOVE:
      return "stove";
    case APARTMENT_UNIT_DECOR_ITEM_KIND_FRIDGE:
      return "fridge";
    default:
      return "plain";
  }
}

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

const MODEL_REL_PATH_RE =
  /^static\/models\/[a-zA-Z0-9/._-]+\.(glb|obj)$/u;

const OwnedApartmentPlacedItemKindSchema = z.enum([
  "plain",
  "bed",
  "wardrobe",
  "footlocker",
  "stove",
  "fridge",
]);

const OwnedApartmentPlacedItemSchemaCore = z.object({
  id: z.string().min(1).max(120),
  modelRelPath: z
    .string()
    .min(14)
    .max(210)
    .regex(MODEL_REL_PATH_RE),
  /** Slight overscan around the live unit X/Z hull (`boundMin*` → `boundMax*`) for wall-edge authoring. */
  fx: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  fz: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
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
  uniformScale: z.number().min(0.02).max(5.5),
  /** When true, editor translate ignores tabletop/object support surfaces for fine manual placement. */
  ignoreSupportSurfaces: z.boolean().default(false),
  /** Gameplay role for this instance; `plain` is visual-only decor. */
  itemKind: OwnedApartmentPlacedItemKindSchema.default("plain"),
});

export const OwnedApartmentPlacedItemSchema =
  OwnedApartmentPlacedItemSchemaCore.superRefine((val, ctx) => {
    const min =
      val.itemKind === "plain"
        ? OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN
        : OWNED_APARTMENT_FURNITURE_UNIFORM_SCALE_MIN;
    if (val.uniformScale < min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `uniformScale must be >= ${min} for itemKind ${val.itemKind}`,
      });
    }
  });

export type OwnedApartmentPlacedItem = z.infer<typeof OwnedApartmentPlacedItemSchema>;

/** @deprecated Use {@link OwnedApartmentPlacedItem}; name kept for incremental refactors. */
export type OwnedApartmentDecorItem = OwnedApartmentPlacedItem;

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
  fx: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  fz: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
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

/** Authored planar mirror (rectangle glass + optional frame) saved with owned-apartment layout. */
export const OwnedApartmentMirrorItemSchema = z.object({
  id: z.string().min(1).max(120),
  fx: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  fz: z
    .number()
    .min(OWNED_APARTMENT_LAYOUT_FRACTION_MIN)
    .max(OWNED_APARTMENT_LAYOUT_FRACTION_MAX),
  /** Meters above `boundMinY` for the mirror bottom edge. */
  dy: z.number().min(0).max(4),
  yawRad: z.number(),
  pitchRad: z
    .number()
    .min(-OWNED_APARTMENT_DECOR_PITCH_RAD_MAX)
    .max(OWNED_APARTMENT_DECOR_PITCH_RAD_MAX)
    .default(0),
  rollRad: z
    .number()
    .min(-OWNED_APARTMENT_DECOR_ROLL_RAD_MAX)
    .max(OWNED_APARTMENT_DECOR_ROLL_RAD_MAX)
    .default(0),
  /** Mirror rectangle width (local X, meters). */
  sizeX: z.number().min(0.15).max(8),
  /** Mirror rectangle height (local Y, meters). */
  sizeY: z.number().min(0.15).max(8),
});

export type OwnedApartmentMirrorItem = z.infer<typeof OwnedApartmentMirrorItemSchema>;

/** Saved multi-object selection groups for apartment authoring (decor + wall slabs). */
export const OwnedApartmentObjectGroupSchema = z.object({
  /** Stable authoring id — store as opaque string alongside decor/wall UUIDs. */
  id: z.string().min(1).max(120),
  /** Author-facing label shown in editor lists. */
  name: z.string().min(1).max(200),
  /** Full editor selection ids: `mammoth_editor_my_apartment_decor|wall|mirror:<uuid>`. */
  memberSelectedIds: z.array(z.string().min(1).max(200)).min(1).max(200),
});

export type OwnedApartmentObjectGroup = z.infer<
  typeof OwnedApartmentObjectGroupSchema
>;

/**
 * v1 doc shape (singleton builtin fractions + separate decor list), before unification.
 */
const OwnedApartmentBuiltinsDocV1Schema = z.object({
  version: z.literal(1).optional(),
  previewSizeM: z.number().positive().max(80).default(10),
  bedFx: z.number(),
  bedFz: z.number(),
  bedDy: z.number().min(0).max(4),
  wardrobeFx: z.number(),
  wardrobeFz: z.number(),
  footFx: z.number(),
  footFz: z.number(),
  stoveFx: z.number().default(0.08),
  stoveFz: z.number().default(0.08),
  wardrobeDy: z.number().min(0).max(4),
  footDy: z.number().min(0).max(4),
  stoveDy: z.number().min(0).max(4).default(0),
  bedYawRad: z.number(),
  wardrobeYawRad: z.number(),
  footYawRad: z.number(),
  stoveYawRad: z.number().default(-Math.PI / 2),
  bedUniformScale: z.number().min(0.08).max(5.5).default(1),
  wardrobeUniformScale: z.number().min(0.08).max(5.5).default(1),
  footUniformScale: z.number().min(0.08).max(5.5).default(1),
  stoveUniformScale: z.number().min(0.08).max(5.5).default(1),
  decorItems: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        modelRelPath: z.string().min(14).max(210).regex(MODEL_REL_PATH_RE),
        fx: z.number(),
        fz: z.number(),
        dy: z.number().min(0).max(4),
        yawRad: z.number(),
        pitchRad: z.number().optional(),
        rollRad: z.number().optional(),
        uniformScale: z.number().min(0.02).max(5.5),
        ignoreSupportSurfaces: z.boolean().optional(),
        itemKind: OwnedApartmentPlacedItemKindSchema.optional(),
      }),
    )
    .default([]),
  wallItems: z.array(OwnedApartmentWallItemSchema).default([]),
  mirrorItems: z.array(OwnedApartmentMirrorItemSchema).default([]),
  objectGroups: z.array(OwnedApartmentObjectGroupSchema).default([]),
});

const OwnedApartmentBuiltinsDocSchemaCore = z.object({
  version: z.literal(2),
  /** Preview floor fallback (meters) when the mamutica floor plate is unavailable in the editor. */
  previewSizeM: z.number().positive().max(80).default(10),
  /**
   * All placed apartment items (generic decor plus bed / wardrobe / footlocker / stove / fridge).
   * Replaces v1 singleton `bedFx` / `wardrobeFx` / … + separate `decorItems`.
   */
  placedItems: z.array(OwnedApartmentPlacedItemSchema).default([]),
  /** Authored partition walls (thin boxes with PBR materials). */
  wallItems: z.array(OwnedApartmentWallItemSchema).default([]),
  mirrorItems: z.array(OwnedApartmentMirrorItemSchema).default([]),
  /** Named decor/wall groups for editor-only batch transforms (not replicated independently). */
  objectGroups: z.array(OwnedApartmentObjectGroupSchema).default([]),
});

export type OwnedApartmentBuiltinsDoc = z.infer<typeof OwnedApartmentBuiltinsDocSchemaCore>;

function migrateV1RecordToV2PlacedItems(
  v1: z.infer<typeof OwnedApartmentBuiltinsDocV1Schema>,
): OwnedApartmentPlacedItem[] {
  const builtins: OwnedApartmentPlacedItem[] = [
    {
      id: "mammoth_builtin_bed",
      modelRelPath: OWNED_APARTMENT_MODEL_BED,
      fx: v1.bedFx,
      fz: v1.bedFz,
      dy: v1.bedDy,
      yawRad: v1.bedYawRad,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: v1.bedUniformScale,
      ignoreSupportSurfaces: false,
      itemKind: "bed",
    },
    {
      id: "mammoth_builtin_wardrobe",
      modelRelPath: OWNED_APARTMENT_MODEL_WARDROBE,
      fx: v1.wardrobeFx,
      fz: v1.wardrobeFz,
      dy: v1.wardrobeDy,
      yawRad: v1.wardrobeYawRad,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: v1.wardrobeUniformScale,
      ignoreSupportSurfaces: false,
      itemKind: "wardrobe",
    },
    {
      id: "mammoth_builtin_footlocker",
      modelRelPath: OWNED_APARTMENT_MODEL_FOOTLOCKER,
      fx: v1.footFx,
      fz: v1.footFz,
      dy: v1.footDy,
      yawRad: v1.footYawRad,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: v1.footUniformScale,
      ignoreSupportSurfaces: false,
      itemKind: "footlocker",
    },
    {
      id: "mammoth_builtin_stove",
      modelRelPath: OWNED_APARTMENT_MODEL_STOVE,
      fx: v1.stoveFx,
      fz: v1.stoveFz,
      dy: v1.stoveDy,
      yawRad: v1.stoveYawRad,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: v1.stoveUniformScale,
      ignoreSupportSurfaces: false,
      itemKind: "stove",
    },
  ];

  const fromDecor: OwnedApartmentPlacedItem[] = v1.decorItems.map((d) => ({
    id: d.id,
    modelRelPath: d.modelRelPath,
    fx: d.fx,
    fz: d.fz,
    dy: d.dy,
    yawRad: d.yawRad,
    pitchRad: d.pitchRad ?? 0,
    rollRad: d.rollRad ?? 0,
    uniformScale: d.uniformScale,
    ignoreSupportSurfaces: d.ignoreSupportSurfaces ?? false,
    itemKind: d.itemKind ?? "plain",
  }));

  return [...builtins, ...OwnedApartmentPlacedItemSchema.array().parse(fromDecor)];
}

export function migrateOwnedApartmentBuiltinsRawToV2(raw: unknown): unknown {
  const leg = migrateLegacyOwnedApartmentBuiltinsJson(raw);
  if (leg === null || typeof leg !== "object" || Array.isArray(leg)) return leg;
  const o = leg as Record<string, unknown>;

  if (o.version === 2) {
    if (Array.isArray(o.placedItems)) return o;
    if (Array.isArray(o.decorItems)) {
      const decor = o.decorItems as OwnedApartmentPlacedItem[];
      const parsed = decor.map((d) => ({
        ...d,
        itemKind: d.itemKind ?? "plain",
        pitchRad: d.pitchRad ?? 0,
        rollRad: d.rollRad ?? 0,
        ignoreSupportSurfaces: d.ignoreSupportSurfaces ?? false,
      }));
      return {
        ...o,
        placedItems: OwnedApartmentPlacedItemSchema.array().parse(parsed),
        decorItems: undefined,
      };
    }
    return o;
  }

  const parsedV1 = OwnedApartmentBuiltinsDocV1Schema.safeParse(leg);
  if (!parsedV1.success) return leg;

  const v1 = parsedV1.data;
  return {
    version: 2,
    previewSizeM: v1.previewSizeM,
    placedItems: migrateV1RecordToV2PlacedItems(v1),
    wallItems: v1.wallItems,
    mirrorItems: v1.mirrorItems,
    objectGroups: v1.objectGroups,
  };
}

export const OwnedApartmentBuiltinsDocSchema = z.preprocess(
  migrateOwnedApartmentBuiltinsRawToV2,
  OwnedApartmentBuiltinsDocSchemaCore,
);

const DECOR_SELECTION_PREFIX = "mammoth_editor_my_apartment_decor:";
const WALL_SELECTION_PREFIX = "mammoth_editor_my_apartment_wall:";
const MIRROR_SELECTION_PREFIX = "mammoth_editor_my_apartment_mirror:";

/** True if {@link OwnedApartmentObjectGroup.memberSelectedIds} may legally reference this id. */
export function isOwnedApartmentObjectGroupMemberSelectionId(id: string): boolean {
  return (
    (id.startsWith(DECOR_SELECTION_PREFIX) &&
      id.length > DECOR_SELECTION_PREFIX.length) ||
    (id.startsWith(WALL_SELECTION_PREFIX) && id.length > WALL_SELECTION_PREFIX.length) ||
    (id.startsWith(MIRROR_SELECTION_PREFIX) &&
      id.length > MIRROR_SELECTION_PREFIX.length)
  );
}

/**
 * Drop unknown members and groups that end up with fewer than two placements.
 * Call after edits that delete decor/wall instances so groups cannot reference stale ids.
 */
export function finalizeOwnedApartmentBuiltinsDoc(
  doc: OwnedApartmentBuiltinsDoc,
): OwnedApartmentBuiltinsDoc {
  const placedIds = new Set(doc.placedItems.map((d) => d.id));
  const wallIds = new Set(doc.wallItems.map((w) => w.id));
  const mirrorIds = new Set(doc.mirrorItems.map((m) => m.id));

  const objectGroups = doc.objectGroups
    .map((g) => {
      const unique = [
        ...new Set(g.memberSelectedIds.filter(isOwnedApartmentObjectGroupMemberSelectionId)),
      ];
      const kept = unique.filter((selId) => {
        const rest = selId.startsWith(DECOR_SELECTION_PREFIX)
          ? selId.slice(DECOR_SELECTION_PREFIX.length)
          : selId.startsWith(WALL_SELECTION_PREFIX)
            ? selId.slice(WALL_SELECTION_PREFIX.length)
            : "";
        if (!rest) return false;
        if (selId.startsWith(DECOR_SELECTION_PREFIX)) return placedIds.has(rest);
        if (selId.startsWith(WALL_SELECTION_PREFIX)) return wallIds.has(rest);
        if (selId.startsWith(MIRROR_SELECTION_PREFIX)) return mirrorIds.has(rest);
        return false;
      });
      return { ...g, memberSelectedIds: kept };
    })
    .filter((g) => g.memberSelectedIds.length >= 2);

  return { ...doc, objectGroups };
}

/** Editor + client default until `content/apartment/owned_apartment_builtins.json` exists. */
export const DEFAULT_OWNED_APARTMENT_BUILTINS_DOC: OwnedApartmentBuiltinsDoc =
  OwnedApartmentBuiltinsDocSchema.parse({
    version: 2,
    previewSizeM: 10,
    placedItems: [
      {
        id: "mammoth_builtin_bed",
        modelRelPath: OWNED_APARTMENT_MODEL_BED,
        fx: 0.62,
        fz: 0.48,
        dy: 0.01,
        yawRad: -Math.PI / 2,
        pitchRad: 0,
        rollRad: 0,
        uniformScale: 1,
        ignoreSupportSurfaces: false,
        itemKind: "bed",
      },
      {
        id: "mammoth_builtin_wardrobe",
        modelRelPath: OWNED_APARTMENT_MODEL_WARDROBE,
        fx: 0.22,
        fz: 0.72,
        dy: 0,
        yawRad: -Math.PI / 2,
        pitchRad: 0,
        rollRad: 0,
        uniformScale: 1,
        ignoreSupportSurfaces: false,
        itemKind: "wardrobe",
      },
      {
        id: "mammoth_builtin_footlocker",
        modelRelPath: OWNED_APARTMENT_MODEL_FOOTLOCKER,
        fx: 0.42,
        fz: 0.3,
        dy: 0,
        yawRad: -Math.PI / 2,
        pitchRad: 0,
        rollRad: 0,
        uniformScale: 1,
        ignoreSupportSurfaces: false,
        itemKind: "footlocker",
      },
      {
        id: "mammoth_builtin_stove",
        modelRelPath: OWNED_APARTMENT_MODEL_STOVE,
        fx: 0.08,
        fz: 0.08,
        dy: 0,
        yawRad: -Math.PI / 2,
        pitchRad: 0,
        rollRad: 0,
        uniformScale: 1,
        ignoreSupportSurfaces: false,
        itemKind: "stove",
      },
    ],
    wallItems: [],
    mirrorItems: [],
    objectGroups: [],
  });
