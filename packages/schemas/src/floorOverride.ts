import { z } from "zod";
import { PlacedObjectSchema } from "./floor.js";

const FloorPlacedObjectPatchSchema = z.object({
  prefabId: z.string().optional(),
  position: PlacedObjectSchema.shape.position.optional(),
  rotation: PlacedObjectSchema.shape.rotation.optional(),
  scale: PlacedObjectSchema.shape.scale.optional(),
  metadata: PlacedObjectSchema.shape.metadata.optional(),
});

export type FloorPlacedObjectPatch = z.infer<typeof FloorPlacedObjectPatchSchema>;

export const FloorOverrideObjectPatchSchema = z.object({
  targetObjectId: z.string(),
  patch: FloorPlacedObjectPatchSchema,
});

export type FloorOverrideObjectPatch = z.infer<typeof FloorOverrideObjectPatchSchema>;

export const FloorOverrideDocSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  buildingId: z.string(),
  levelIndex: z.number().int(),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  removedObjectIds: z.array(z.string()).default([]),
  objectPatches: z.array(FloorOverrideObjectPatchSchema).default([]),
  addedObjects: z.array(PlacedObjectSchema).default([]),
});

export type FloorOverrideDoc = z.infer<typeof FloorOverrideDocSchema>;
