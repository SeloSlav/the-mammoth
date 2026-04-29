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
  normalMapUrl: z.string().optional(),
  roughnessMapUrl: z.string().optional(),
  metalnessMapUrl: z.string().optional(),
  bumpMapUrl: z.string().optional(),
  aoMapUrl: z.string().optional(),
  useMetalnessMap: z.boolean().optional(),
  useHeightMap: z.boolean().optional(),
});

export type LandingKitMaterialSlot = z.infer<typeof LandingKitMaterialSlotSchema>;

/**
 * Shared swing-door kit. The same schema drives:
 *
 * - `content/elevator/landing_kit.json` (elevator landing exterior swing — the "corridor door").
 * - `content/door/apartment_unit_kit.json` (per-unit apartment swing door, opaque/solid).
 *
 * Both feed into the shared mesh path in `packages/world/src/swingDoorMesh.ts`. Per-variant
 * differences are expressed via the optional fields below (size overrides, `solid` flag).
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
  /**
   * When true the leaf renders as an opaque solid panel: the glass lite is replaced with a filled
   * rectangle painted with the frame material. Used by the apartment door kit. Defaults to false
   * (legacy elevator landing door keeps its glazed lite).
   */
  solid: z.boolean().optional(),
  /**
   * Per-variant override for the leaf panel width (hinge-to-tip, meters). When omitted the call
   * site supplies a default — the elevator landing uses `EXTERIOR_DOOR_W_M`, apartment doors use
   * the override.
   */
  panelWidthM: z.number().positive().max(3.0).optional(),
  /** Per-variant override for the leaf panel height (meters). Same convention as `panelWidthM`. */
  panelHeightM: z.number().positive().max(3.5).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type LandingKitDef = z.infer<typeof LandingKitDefSchema>;
