import { z } from "zod";
import { QuatSchema, Vec3Schema } from "./vectors.js";

/** One material slot for cab surfaces (colors match Three.js hex strings like `"0x6a6f78"` or `"#6a6f78"`). */
export const ElevatorCabMaterialSlotSchema = z.object({
  colorHex: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  /** Albedo / base color map (sRGB). */
  mapUrl: z.string().optional(),
  /** Tangent-space normal map (linear / data). */
  normalMapUrl: z.string().optional(),
  /** Grayscale or packed roughness; multiplied with scalar `roughness`. */
  roughnessMapUrl: z.string().optional(),
  /** Grayscale metalness; multiplied with scalar `metalness`. */
  metalnessMapUrl: z.string().optional(),
  /** Height / displacement-style map used as `bumpMap` (no mesh subdivision). */
  bumpMapUrl: z.string().optional(),
});

export type ElevatorCabMaterialSlot = z.infer<typeof ElevatorCabMaterialSlotSchema>;

/**
 * Shared elevator cab visual definition (one file affects every shaft in-game).
 * Gameplay/collision dimensions stay in server + `fpElevatorConstants`; this is appearance-first.
 */
export const ElevatorCabDefSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  displayName: z.string().optional(),
  materials: z
    .object({
      wall: ElevatorCabMaterialSlotSchema.optional(),
      floor: ElevatorCabMaterialSlotSchema.optional(),
      door: ElevatorCabMaterialSlotSchema.optional(),
      ceiling: ElevatorCabMaterialSlotSchema.optional(),
      panel: ElevatorCabMaterialSlotSchema.optional(),
      button: ElevatorCabMaterialSlotSchema.optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Optional per-mesh overrides in editor cab preview (`editorCabPartId` keys). Game client applies materials only until mesh graph is shared. */
  partTransforms: z
    .record(
      z.string(),
      z
        .object({
          position: Vec3Schema.optional(),
          scale: Vec3Schema.optional(),
          rotation: QuatSchema.optional(),
        })
        .optional(),
    )
    .optional(),
});

export type ElevatorCabDef = z.infer<typeof ElevatorCabDefSchema>;
