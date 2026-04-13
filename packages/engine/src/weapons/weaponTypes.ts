import type { AnimationActionName, HeldItemId } from "@the-mammoth/game";
import type { ModelRef } from "@the-mammoth/assets";
import type { WeaponPrimitivePresentationDoc } from "./weaponPrimitiveAuthoring.js";

/** Where a weapon presenter parents its root — drives attachment rules. */
export type WeaponPresentationRole = "local_first_person" | "remote_third_person";

/**
 * Maps logical gameplay actions to clip identifiers for GLTF pipelines.
 * `PrimitiveAnimationDriver` ignores this; future GLTF drivers resolve clip names per skeleton.
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
  /**
   * First-person only: the stock hand GLB is hidden so a “gloved” / hand-replacement weapon mesh
   * can stand in (e.g. srbosjek). Weapon stays parented under the usual grip anchor.
   */
  fpHidesHandMesh?: boolean;
};
