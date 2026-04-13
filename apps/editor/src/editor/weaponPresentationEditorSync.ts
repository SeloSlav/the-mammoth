import type { LocalFirstPersonPresenter } from "@the-mammoth/engine";
import {
  applyWeaponPrimitivePresentationDoc,
  parseWeaponPrimitivePresentationDoc,
  type WeaponDefinition,
} from "@the-mammoth/engine";

const lastPresentationFileTextByWeapon = new Map<string, string>();

export function getLastWeaponPresentationFileText(weaponId: string): string {
  return lastPresentationFileTextByWeapon.get(weaponId) ?? "";
}

export function resetWeaponPresentationEditorSyncStateForTeardown(): void {
  lastPresentationFileTextByWeapon.clear();
  postSaveApply = null;
}

export function applyWeaponPresentationFileTextToPresenter(
  presenter: LocalFirstPersonPresenter,
  weaponId: WeaponDefinition["id"],
  text: string,
): void {
  const doc = parseWeaponPrimitivePresentationDoc(JSON.parse(text));
  applyWeaponPrimitivePresentationDoc(weaponId, doc);
  if (presenter.getWeaponDefinition().id === weaponId) {
    presenter.reloadWeaponPresentationLayout();
  }
}

/** Parse/apply JSON, reload presenter layout, and remember file text so the RAF poll skips unchanged fetches. */
export function adoptWeaponPresentationFileText(
  presenter: LocalFirstPersonPresenter,
  weaponId: WeaponDefinition["id"],
  text: string,
): void {
  applyWeaponPresentationFileTextToPresenter(presenter, weaponId, text);
  lastPresentationFileTextByWeapon.set(weaponId, text);
}

let postSaveApply: ((weaponId: string, json: string) => void) | null = null;

export function registerWeaponPresentationPostSaveApply(
  fn: ((weaponId: string, json: string) => void) | null,
): void {
  postSaveApply = fn;
}

/**
 * After a successful POST to disk: re-apply the same JSON to the live editor presenter
 * and refresh last-known text so a full page reload is not required to see the layout.
 */
export function notifyWeaponPresentationSavedToDisk(weaponId: string, json: string): void {
  if (postSaveApply) {
    postSaveApply(weaponId, json);
  } else {
    lastPresentationFileTextByWeapon.set(weaponId, json);
  }
}
