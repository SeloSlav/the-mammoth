import { z } from "zod";
import { Vec3Schema } from "./vectors.js";

/**
 * Logical address of one residential (or service) slot in a vertical megablock.
 * `floorIndex` is 0-based from the authored ground / podium break (project convention).
 */
export const BuildingUnitAddressSchema = z.object({
  wingId: z.string(),
  floorIndex: z.number().int(),
  unitIndex: z.number().int(),
});

export type BuildingUnitAddress = z.infer<typeof BuildingUnitAddressSchema>;

/** Vertical core (stairs, elevator, riser) that may have its own interior stream. */
export const BuildingCoreRefSchema = z.object({
  id: z.string(),
  kind: z.enum(["stair", "elevator", "service", "utility"]),
  interiorDocId: z.string().optional(),
  notes: z.string().optional(),
});

export type BuildingCoreRef = z.infer<typeof BuildingCoreRefSchema>;

/** One floor plate document (corridor + shells) referenced by level. */
export const BuildingFloorRefSchema = z.object({
  levelIndex: z.number().int(),
  floorDocId: z.string(),
  floorOverrideDocId: z.string().optional(),
  displayLabel: z.string().optional(),
});

export type BuildingFloorRef = z.infer<typeof BuildingFloorRefSchema>;

/** One unit slot: address + which interior template to stream for that slot. */
export const BuildingUnitRefSchema = z.object({
  address: BuildingUnitAddressSchema,
  interiorTemplateId: z.string(),
  shellPrefabId: z.string().optional(),
  notes: z.string().optional(),
});

export type BuildingUnitRef = z.infer<typeof BuildingUnitRefSchema>;

/**
 * Describes a rectangular range of unit addresses sharing one interior template.
 * Used to author ~150 units without listing every row in JSON; runtime may expand to `BuildingUnitRef`.
 */
export const BuildingUnitSlotTemplateSchema = z.object({
  wingId: z.string(),
  floorRange: z.tuple([z.number().int(), z.number().int()]),
  unitIndexRange: z.tuple([z.number().int(), z.number().int()]),
  interiorTemplateId: z.string(),
  shellPrefabId: z.string().optional(),
});

export type BuildingUnitSlotTemplate = z.infer<
  typeof BuildingUnitSlotTemplateSchema
>;

/**
 * Streamable vertical building: cores, floor plates, unit/interior mapping.
 * Complements `CellDoc` (horizontal fabric) and `InteriorDoc` (interior volumes).
 */
export const BuildingDocSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  displayName: z.string().optional(),
  /** World-space origin of this building’s stacked floor plates (same frame as cells / interiors). */
  worldOrigin: Vec3Schema.optional(),
  /** Cell that owns the primary exterior portal into this building (optional until linked). */
  exteriorCellId: z.string().optional(),
  cores: z.array(BuildingCoreRefSchema).default([]),
  floorRefs: z.array(BuildingFloorRefSchema).default([]),
  units: z.array(BuildingUnitRefSchema).default([]),
  slotTemplates: z.array(BuildingUnitSlotTemplateSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type BuildingDoc = z.infer<typeof BuildingDocSchema>;
