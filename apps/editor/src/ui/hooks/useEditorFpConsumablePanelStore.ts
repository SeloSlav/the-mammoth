import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "../../state/editorStore.js";

/** FP consumable panel: shallow slice of editor store (keeps EditorChromeFpConsumable mostly JSX). */
export function useEditorFpConsumablePanelStore() {
  return useEditorStore(
    useShallow((s) => ({
      fpAuthorCamera: s.fpAuthorCamera,
      fpAuthorTargetId: s.fpAuthorTargetId,
      fpAuthorPitchRad: s.fpAuthorPitchRad,
      fpAuthorInitMessage: s.fpAuthorInitMessage,
      fpAuthorPickList: s.fpAuthorPickList,
      fpAuthorConsumableId: s.fpAuthorConsumableId,
      setFpAuthorConsumableId: s.setFpAuthorConsumableId,
      setFpAuthorCamera: s.setFpAuthorCamera,
      pickFpAuthorTarget: s.pickFpAuthorTarget,
      setFpAuthorPitchRad: s.setFpAuthorPitchRad,
      fpAuthorToast: s.fpAuthorToast,
      showFpAuthorToast: s.showFpAuthorToast,
    })),
  );
}
