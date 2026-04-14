import { z } from "zod";
import { QuatSchema, Vec3Schema } from "./vectors.js";

const LandingKitPartTransformEntrySchema = z
  .object({
    position: Vec3Schema.optional(),
    scale: Vec3Schema.optional(),
    rotation: QuatSchema.optional(),
  })
  .optional();

export const LandingKitMaterialSlotSchema = z.object({
  colorHex: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  transmission: z.number().min(0).max(1).optional(),
  mapUrl: z.string().optional(),
});

export type LandingKitMaterialSlot = z.infer<typeof LandingKitMaterialSlotSchema>;

/**
 * Shared exterior landing door kit (one definition, repeated per level per shaft).
 */
export const LandingKitDefSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  displayName: z.string().optional(),
  materials: z
    .object({
      frame: LandingKitMaterialSlotSchema.optional(),
      glass: LandingKitMaterialSlotSchema.optional(),
    })
    .optional(),
  /** Max swing in radians at full open (default matches client `EXTERIOR_DOOR_SWING_MAX_RAD`). */
  exteriorSwingMaxRad: z.number().positive().optional(),
  /**
   * Rectangular glass lite / framed hole on the swing door (meters in door-panel space).
   * Rails and stiles rebuild around this; glass is always sized to the opening.
   */
  glassOpening: z
    .object({
      widthM: z.number().positive().max(1.65).optional(),
      heightM: z.number().positive().max(1.85).optional(),
      /** Vertical center of the opening in swing local Y (same convention as legacy `0.46` default). */
      centerYM: z.number().min(-1.2).max(1.2).optional(),
    })
    .optional(),
  /**
   * Optional overrides for non-opening parts only (glass is driven by `glassOpening`).
   */
  partTransforms: z.record(z.string(), LandingKitPartTransformEntrySchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type LandingKitDef = z.infer<typeof LandingKitDefSchema>;
