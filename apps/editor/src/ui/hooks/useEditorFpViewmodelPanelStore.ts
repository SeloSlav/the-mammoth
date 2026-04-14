import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "../../state/editorStore.js";

/** FP viewmodel panel: shallow slice of editor store (keeps `EditorChromeFpViewmodel` mostly JSX). */
export function useEditorFpViewmodelPanelStore() {
  return useEditorStore(
    useShallow((s) => ({
      fpAuthorCamera: s.fpAuthorCamera,
      fpAuthorSubjectKind: s.fpAuthorSubjectKind,
      fpAuthorTargetId: s.fpAuthorTargetId,
      fpAuthorPitchRad: s.fpAuthorPitchRad,
      fpAuthorInitMessage: s.fpAuthorInitMessage,
      fpAuthorPickList: s.fpAuthorPickList,
      fpAuthorWeaponId: s.fpAuthorWeaponId,
      fpAuthorConsumableId: s.fpAuthorConsumableId,
      setFpAuthorWeaponId: s.setFpAuthorWeaponId,
      setFpAuthorConsumableId: s.setFpAuthorConsumableId,
      setFpAuthorCamera: s.setFpAuthorCamera,
      setFpAuthorSubjectKind: s.setFpAuthorSubjectKind,
      pickFpAuthorTarget: s.pickFpAuthorTarget,
      setFpAuthorPitchRad: s.setFpAuthorPitchRad,
      fpAuthorToast: s.fpAuthorToast,
      showFpAuthorToast: s.showFpAuthorToast,
    })),
  );
}
