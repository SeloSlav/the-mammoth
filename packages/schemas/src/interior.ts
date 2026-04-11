import { z } from "zod";
import {
  CellPlacementSchema,
  DecalInstanceSchema,
  InteriorExitPortalSchema,
} from "./placements.js";

/** One streamable interior (lobby, stairwell, unit shell, basement pocket, …). */
export const InteriorDocSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  displayName: z.string().optional(),
  /** Optional link to the cell that hosts the primary exterior portal into this interior. */
  linkedCellId: z.string().optional(),
  placements: z.array(CellPlacementSchema).default([]),
  portals: z.array(InteriorExitPortalSchema).default([]),
  decals: z.array(DecalInstanceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InteriorDoc = z.infer<typeof InteriorDocSchema>;
