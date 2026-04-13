import type { HeldItemId } from "@the-mammoth/game";

/**
 * **Game client (FP session) only.** Set to `"knife"` / `"crowbar"` / etc. to force the local
 * viewmodel + gameplay state weapon. Leave `null` to use the hotbar selection.
 *
 * Ignored in production builds (`import.meta.env.DEV === false`).
 */
export const DEV_GAMEPLAY_EQUIPPED_PRIMARY: HeldItemId | null = null;

export function effectiveDevGameplayEquippedPrimary(
  productionDefault: HeldItemId,
): HeldItemId {
  /* eslint-disable turbo/no-undeclared-env-vars -- Vite */
  if (!import.meta.env.DEV) return productionDefault;
  /* eslint-enable turbo/no-undeclared-env-vars */
  return DEV_GAMEPLAY_EQUIPPED_PRIMARY ?? productionDefault;
}