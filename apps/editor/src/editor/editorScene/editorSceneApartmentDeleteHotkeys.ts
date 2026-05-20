import { useEditorStore } from "../../state/editorStore.js";
import { isMyApartmentLayoutDeletionSelection } from "../myApartment/deleteMyApartmentLayoutPlacements.js";
import { editorKeyboardTargetIsFormField } from "./editorSceneTransformModeHotkeys.js";

type ApartmentLayoutHotkeySelection = {
  selectedId: string | null;
  myApartmentMultiselectExtraIds: readonly string[];
};

function apartmentLayoutHotkeySelection(
  st = useEditorStore.getState(),
): ApartmentLayoutHotkeySelection | null {
  if (st.mode !== "my_apartment_layout") return null;
  return {
    selectedId: st.selectedId,
    myApartmentMultiselectExtraIds: st.myApartmentMultiselectExtraIds,
  };
}

function isDeletableApartmentLayoutSelection(
  sel: ApartmentLayoutHotkeySelection | null,
): boolean {
  if (sel === null) return false;
  return isMyApartmentLayoutDeletionSelection({
    selectedId: sel.selectedId,
    myApartmentMultiselectExtraIds: sel.myApartmentMultiselectExtraIds,
  });
}

export function apartmentLayoutDeleteFromKeyboardEvent(
  ev: Pick<KeyboardEvent, "code" | "repeat" | "target" | "ctrlKey" | "metaKey" | "altKey">,
): boolean {
  if (ev.repeat) return false;
  if (editorKeyboardTargetIsFormField(ev.target)) return false;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
  if (ev.code !== "Delete") return false;

  const sel = apartmentLayoutHotkeySelection();
  if (!isDeletableApartmentLayoutSelection(sel)) return false;

  return useEditorStore.getState().deleteMyApartmentLayoutSelection();
}

export function apartmentLayoutCutFromKeyboardEvent(
  ev: Pick<
    KeyboardEvent,
    "code" | "key" | "repeat" | "target" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
): boolean {
  if (ev.repeat) return false;
  if (editorKeyboardTargetIsFormField(ev.target)) return false;
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;
  if (ev.shiftKey) return false;
  if (ev.code !== "KeyX" && ev.key.toLowerCase() !== "x") return false;

  const sel = apartmentLayoutHotkeySelection();
  if (!isDeletableApartmentLayoutSelection(sel)) return false;

  return useEditorStore.getState().deleteMyApartmentLayoutSelection();
}

export function apartmentLayoutCloneFromKeyboardEvent(
  ev: Pick<
    KeyboardEvent,
    "code" | "key" | "repeat" | "target" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
): boolean {
  if (ev.repeat) return false;
  if (editorKeyboardTargetIsFormField(ev.target)) return false;
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;
  if (ev.shiftKey) return false;
  if (ev.code !== "KeyC" && ev.key.toLowerCase() !== "c") return false;

  const sel = apartmentLayoutHotkeySelection();
  if (!isDeletableApartmentLayoutSelection(sel)) return false;

  return useEditorStore.getState().cloneMyApartmentLayoutSelection();
}

export function registerEditorApartmentLayoutDeleteHotkeys(opts: {
  getTransformControlsDragging: () => boolean;
}): () => void {
  const { getTransformControlsDragging } = opts;

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (getTransformControlsDragging()) return;
    const handled =
      apartmentLayoutDeleteFromKeyboardEvent(ev) ||
      apartmentLayoutCutFromKeyboardEvent(ev) ||
      apartmentLayoutCloneFromKeyboardEvent(ev);
    if (!handled) return;
    ev.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}
