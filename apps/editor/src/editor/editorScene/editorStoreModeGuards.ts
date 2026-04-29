import { useEditorStore } from "../../state/editorStore.js";

export type EditorStoreSnapshot = ReturnType<typeof useEditorStore.getState>;

export function isFpMode(mode: EditorStoreSnapshot["mode"]): boolean {
  return mode === "fp_viewmodel" || mode === "fp_consumable";
}

export function isSharedPreviewMode(
  mode: EditorStoreSnapshot["mode"],
): boolean {
  return (
    mode === "cab" ||
    mode === "landing_preview" ||
    mode === "stairwell_preview"
  );
}

export function getFpAuthorSubjectKind(
  s: EditorStoreSnapshot,
): "consumable" | "weapon" {
  return s.fpAuthorSubjectKind === "consumable" ? "consumable" : "weapon";
}

export function isWeaponFpAuthoringState(s: EditorStoreSnapshot): boolean {
  return s.mode === "fp_viewmodel" && getFpAuthorSubjectKind(s) === "weapon";
}

export function isConsumableFpAuthoringState(s: EditorStoreSnapshot): boolean {
  return (
    s.mode === "fp_consumable" ||
    (s.mode === "fp_viewmodel" && getFpAuthorSubjectKind(s) === "consumable")
  );
}
