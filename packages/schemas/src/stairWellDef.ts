import { z } from "zod";
import { ElevatorCabMaterialSlotSchema } from "./elevatorCabDef.js";
import { QuatSchema, Vec3Schema } from "./vectors.js";

const StairWellPartTransformEntrySchema = z
  .object({
    /**
     * Delta from the generated local position. Applied additively to every matching part.
     */
    position: Vec3Schema.optional(),
    /**
     * Multiplier relative to the generated local scale. Applied component-wise.
     */
    scale: Vec3Schema.optional(),
    /**
     * Delta from the generated local rotation. Applied after the generated quaternion.
     */
    rotation: QuatSchema.optional(),
  })
  .optional();

const StairWellEntryOpeningSchema = z
  .object({
    /** Wall face carrying the corridor-side opening. */
    face: z.enum(["e", "w", "n", "s"]).optional(),
    /**
     * Hole center offset along the selected wall tangent.
     * E/W walls use local +Z; N/S walls use local +X.
     */
    tangentOffsetAlongWallM: z.number().optional(),
    /** Clear opening width in meters. */
    widthM: z.number().positive().optional(),
    /** Clear opening height in meters. */
    heightM: z.number().positive().optional(),
    /** Opening center in shaft-local Y. */
    centerYM: z.number().optional(),
  })
  .optional();

const StairWellLandingPropCornerSchema = z.enum(["ne", "nw", "se", "sw"]);

/**
 * Resolves which corner landing slab should host a prop (shaft-local, matches racetrack layout).
 * - `opposite_primary_door`: corner pad away from the main stair door (or a stable fallback).
 * - `highest_y`: the topmost corner deck in the segment (e.g. ground floor’s upper landing when the
 *   lobby pad is omitted from the mesh list).
 * - `opposite_entry_opening`: corner pad opposite the authored `entryOpening` wall band, using the
 *   **highest** deck in the segment (roof exit vs. south-façade door used for `opposite_primary_door`
 *   on typical storeys).
 * - `lowest_y`: the bottommost corner deck in the segment (entry level of that storey’s climb).
 */
export const StairWellLandingPropSelectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("opposite_primary_door") }),
  z.object({ kind: z.literal("highest_y") }),
  z.object({ kind: z.literal("lowest_y") }),
  z.object({ kind: z.literal("opposite_entry_opening") }),
]);

export type StairWellLandingPropSelector = z.infer<typeof StairWellLandingPropSelectorSchema>;

export const StairWellLandingPropAnchorSchema = z.object({
  /** Which corner of the landing rectangle (shaft interior: +X east, +Z north). */
  corner: StairWellLandingPropCornerSchema,
  /** Inset from max +X edge toward interior (m). */
  insetXM: z.number().optional(),
  /** Inset from max +Z edge toward interior (m). */
  insetZM: z.number().optional(),
  /** Extra lift above landing slab top (m). */
  liftM: z.number().optional(),
  /** Yaw around +Y in landing-local space. */
  yawRad: z.number().optional(),
  /** Uniform scale applied to the loaded root. */
  uniformScale: z.number().optional(),
});

export type StairWellLandingPropAnchor = z.infer<typeof StairWellLandingPropAnchorSchema>;

/**
 * Optional GLB props parented to a stair corner landing (inherits partTransforms on that slab).
 */
export const StairWellLandingPropSchema = z.object({
  id: z.string(),
  /** Client URL, e.g. `/static/models/objects/stairwell-heater.glb`. */
  modelUrl: z.string(),
  /**
   * If set, only these authoring scopes spawn this prop. When omitted, all scopes except those
   * excluded by {@link skipGroundStorey} are eligible.
   */
  applyToScopes: z.array(z.enum(["typical", "ground"])).optional(),
  /** When true, never spawns on the ground-storey segment (`authoringScope === "ground"`). */
  skipGroundStorey: z.boolean().optional(),
  /**
   * When true, only spawns on the segment that **owns** the roof-exit deck mesh (the storey below
   * the terminal `omitTopLanding` cap).
   */
  onlyOnTopOccupiedStairStorey: z.boolean().optional(),
  /**
   * When true, on that top-occupied segment only, skip this prop if the resolved landing is the
   * **highest-Y** pad (so a separate `opposite_entry_opening` prop can own the roof landing).
   */
  skipIfResolvedIsTopDeckOnTopOccupiedStairStorey: z.boolean().optional(),
  landingSelector: StairWellLandingPropSelectorSchema,
  anchor: StairWellLandingPropAnchorSchema,
  /** Extra offset in landing-local space after corner placement (m). */
  pivotOffsetM: Vec3Schema.optional(),
});

export type StairWellLandingProp = z.infer<typeof StairWellLandingPropSchema>;

/**
 * Shared stairwell visual definition (one file affects every stairwell placeholder / shaft column).
 *
 * Part transforms are stored as deltas relative to the generated procedural mesh so one authored
 * tweak can be applied to repeated treads / walls without collapsing them onto the same transform.
 */
export const StairWellDefSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  displayName: z.string().optional(),
  materials: z
    .object({
      wall: ElevatorCabMaterialSlotSchema.optional(),
      floor: ElevatorCabMaterialSlotSchema.optional(),
      tread: ElevatorCabMaterialSlotSchema.optional(),
      landing: ElevatorCabMaterialSlotSchema.optional(),
      railing: ElevatorCabMaterialSlotSchema.optional(),
    })
    .optional(),
  /**
   * Typical / non-ground stairwell part deltas.
   */
  partTransforms: z.record(z.string(), StairWellPartTransformEntrySchema).optional(),
  /**
   * Ground-storey-only part deltas. Used for the bottom stairwell where geometry differs (for example,
   * the omitted interior corner landing).
   */
  groundPartTransforms: z.record(z.string(), StairWellPartTransformEntrySchema).optional(),
  /**
   * Typical-storey stair entry opening authored relative to the procedural shaft shell.
   * Editor/world/collision all consume the same opening.
   */
  entryOpening: StairWellEntryOpeningSchema,
  /**
   * Ground-storey override for the stair entry opening. Falls back to `entryOpening` when omitted.
   */
  groundEntryOpening: StairWellEntryOpeningSchema,
  /**
   * Optional second typical-storey corridor opening (used by the south-facing stairwell door).
   * Falls back to a derived procedural default when omitted.
   */
  secondaryEntryOpening: StairWellEntryOpeningSchema.optional(),
  /** Props (GLB) placed on corner landings — shaft-relative, scales with stair authoring. */
  landingProps: z.array(StairWellLandingPropSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StairWellDef = z.infer<typeof StairWellDefSchema>;
