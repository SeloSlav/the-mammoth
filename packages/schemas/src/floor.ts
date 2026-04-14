import { z } from "zod";
import { QuatSchema, Vec3Schema } from "./vectors.js";

/** Baseline authored object in a floor / section chunk (legacy shape: `id` + `prefabId`). */
export const PlacedObjectSchema = z.object({
  id: z.string(),
  prefabId: z.string(),
  position: Vec3Schema,
  rotation: QuatSchema.optional(),
  scale: Vec3Schema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlacedObject = z.infer<typeof PlacedObjectSchema>;

export const FloorDocSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  objects: z.array(PlacedObjectSchema).default([]),
});

export type FloorDoc = z.infer<typeof FloorDocSchema>;
