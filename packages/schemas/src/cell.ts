import { z } from "zod";
import {
  CellPlacementSchema,
  CellPortalToInteriorSchema,
  DecalInstanceSchema,
} from "./placements.js";

/** One horizontal world cell (grid chunk) in global coordinates. */
export const CellDocSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  district: z.string(),
  coord: z.tuple([z.number(), z.number()]),
  placements: z.array(CellPlacementSchema).default([]),
  portals: z.array(CellPortalToInteriorSchema).default([]),
  decals: z.array(DecalInstanceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CellDoc = z.infer<typeof CellDocSchema>;
