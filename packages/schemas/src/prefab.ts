import { z } from "zod";
import { QuatSchema, Vec3Schema } from "./vectors.js";

export const PrefabSocketSchema = z.object({
  id: z.string(),
  position: Vec3Schema.default([0, 0, 0]),
  rotation: QuatSchema.optional(),
  tags: z.array(z.string()).default([]),
});

export type PrefabSocket = z.infer<typeof PrefabSocketSchema>;

export const PrefabComponentSchema = z
  .object({
    id: z.string(),
    displayName: z.string().optional(),
    prefabId: z.string().optional(),
    assetId: z.string().optional(),
    position: Vec3Schema.default([0, 0, 0]),
    rotation: QuatSchema.optional(),
    scale: Vec3Schema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).default([]),
    sockets: z.array(PrefabSocketSchema).default([]),
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

export type PrefabComponent = z.infer<typeof PrefabComponentSchema>;

export const PrefabDefSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  displayName: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sockets: z.array(PrefabSocketSchema).default([]),
  components: z.array(PrefabComponentSchema).default([]),
});

export type PrefabDef = z.infer<typeof PrefabDefSchema>;
