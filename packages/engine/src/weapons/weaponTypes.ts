import type { AnimationActionName, HeldItemId } from "@the-mammoth/game";
import type { ModelRef } from "@the-mammoth/assets";
import type { WeaponPrimitivePresentationDoc } from "./weaponPrimitiveAuthoring.js";

/** Where a weapon presenter parents its root — drives attachment rules. */
export type WeaponPresentationRole = "local_first_person" | "remote_third_person";

/**
 * Maps logical gameplay actions to clip identifiers for GLTF pipelines.
 * Primitive drivers ignore this; GLTF drivers resolve clip names per skeleton.
 */
export type WeaponAnimationSet = Partial<Record<AnimationActionName, string>>;

export type WeaponDefinition = {
  id: Exclude<HeldItemId, "unarmed">;
  displayName: string;
  /** Asset reference for async upgrade path. */
  modelRef: ModelRef;
  animationSet: WeaponAnimationSet;
  /** Seconds for primitive swing; GLTF uses clip duration when wired. */
  primitiveSwingDurationS: number;
  /**
   * Optional mount + procedural swing for placeholder meshes.
   * When omitted, `WeaponPresenter` uses built-in defaults for the role.
   */
  primitivePresentation?: WeaponPrimitivePresentationDoc;
};
