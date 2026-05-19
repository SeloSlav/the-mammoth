import { useEditorStore } from "../../state/editorStore.js";
import { isMyApartmentLayoutDeletionSelection } from "../myApartment/deleteMyApartmentLayoutPlacements.js";
import { editorKeyboardTargetIsFormField } from "./editorSceneTransformModeHotkeys.js";

export function apartmentLayoutDeleteFromKeyboardEvent(
  ev: Pick<KeyboardEvent, "code" | "repeat" | "target" | "ctrlKey" | "metaKey" | "altKey">,
): boolean {
  if (ev.repeat) return false;
  if (editorKeyboardTargetIsFormField(ev.target)) return false;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
  if (ev.code !== "Delete") return false;

  const st = useEditorStore.getState();
  if (st.mode !== "my_apartment_layout") return false;
  if (
    !isMyApartmentLayoutDeletionSelection({
      selectedId: st.selectedId,
      myApartmentMultiselectExtraIds: st.myApartmentMultiselectExtraIds,
    })
  ) {
    return false;
  }

  return st.deleteMyApartmentLayoutSelection();
}

export function registerEditorApartmentLayoutDeleteHotkeys(opts: {
  getTransformControlsDragging: () => boolean;
}): () => void {
  const { getTransformControlsDragging } = opts;

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (getTransformControlsDragging()) return;
    if (!apartmentLayoutDeleteFromKeyboardEvent(ev)) return;
    ev.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}
