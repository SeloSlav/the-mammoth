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
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StairWellDef = z.infer<typeof StairWellDefSchema>;
