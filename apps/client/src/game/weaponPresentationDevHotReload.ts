import {
  ALL_WEAPON_DEFINITIONS,
  applyWeaponPrimitivePresentationDoc,
  parseWeaponPrimitivePresentationDoc,
  type PlayerPresentationManager,
} from "@the-mammoth/engine";

/**
 * Dev-only: poll `content/weapons/*.presentation.json` (served by Vite) and apply layout
 * so editor saves show up in the running game without restarting.
 */
export function mountWeaponPresentationDevHotReload(
  presentation: PlayerPresentationManager,
): () => void {
  /* eslint-disable turbo/no-undeclared-env-vars -- Vite-injected */
  if (!import.meta.env.DEV) return () => {};
  /* eslint-enable turbo/no-undeclared-env-vars */

  const pollWeaponIds = ALL_WEAPON_DEFINITIONS.map((d) => d.id);
  const lastText = new Map<string, string>();

  const pull = async () => {
    for (const weaponId of pollWeaponIds) {
      try {
        const res = await fetch(`/content/weapons/${weaponId}.presentation.json`, {
          cache: "no-store",
        });
        if (!res.ok) continue;
        const text = await res.text();
        if (text === lastText.get(weaponId)) continue;
        lastText.set(weaponId, text);
        const doc = parseWeaponPrimitivePresentationDoc(JSON.parse(text));
        applyWeaponPrimitivePresentationDoc(weaponId, doc);
        presentation.reloadLocalWeaponPresentationLayoutForWeapon(weaponId);
      } catch {
        /* ignore partial writes / transient parse errors */
      }
    }
  };
  void pull();
  const id = window.setInterval(() => void pull(), 600);

  return () => clearInterval(id);
}
