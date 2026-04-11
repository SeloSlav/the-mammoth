import { z } from "zod";
import { QuatSchema, Vec3Schema } from "./vectors.js";

/**
 * One authored instance in a cell or interior.
 * Exactly one of `prefabId` or `assetId` must be set (validated below).
 */
export const CellPlacementSchema = z
  .object({
    entityId: z.string(),
    prefabId: z.string().optional(),
    assetId: z.string().optional(),
    position: Vec3Schema,
    rotation: QuatSchema.optional(),
    scale: Vec3Schema.optional(),
    overrides: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((row, ctx) => {
    const refs = (row.prefabId ? 1 : 0) + (row.assetId ? 1 : 0);
    if (refs !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of prefabId or assetId must be set",
        path: ["prefabId"],
      });
    }
  });

export type CellPlacement = z.infer<typeof CellPlacementSchema>;

/** Portal from exterior / cell space into an interior document. */
export const CellPortalToInteriorSchema = z.object({
  id: z.string(),
  position: Vec3Schema,
  interiorId: z.string(),
  entrySpawn: Vec3Schema.optional(),
  entryRotation: QuatSchema.optional(),
});

export type CellPortalToInterior = z.infer<typeof CellPortalToInteriorSchema>;

/** Portal from interior back to a cell (re-entry or exit to world grid). */
export const InteriorExitPortalSchema = z.object({
  id: z.string(),
  position: Vec3Schema,
  targetCellId: z.string(),
  targetPortalId: z.string(),
  rotation: QuatSchema.optional(),
});

export type InteriorExitPortal = z.infer<typeof InteriorExitPortalSchema>;

/** Ground / wall decal stamp (euler rotation in radians, Y-up). */
export const DecalInstanceSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: Vec3Schema,
  rotation: Vec3Schema.optional(),
  scale: Vec3Schema.optional(),
});

export type DecalInstance = z.infer<typeof DecalInstanceSchema>;
