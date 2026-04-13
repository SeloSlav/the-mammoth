import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "../../state/editorStore.js";

/** FP viewmodel panel: shallow slice of editor store (keeps `EditorChromeFpViewmodel` mostly JSX). */
export function useEditorFpViewmodelPanelStore() {
  return useEditorStore(
    useShallow((s) => ({
      fpAuthorCamera: s.fpAuthorCamera,
      fpAuthorTargetId: s.fpAuthorTargetId,
      fpAuthorPitchRad: s.fpAuthorPitchRad,
      fpAuthorInitMessage: s.fpAuthorInitMessage,
      fpAuthorPickList: s.fpAuthorPickList,
      fpAuthorWeaponId: s.fpAuthorWeaponId,
      setFpAuthorWeaponId: s.setFpAuthorWeaponId,
      setFpAuthorCamera: s.setFpAuthorCamera,
      pickFpAuthorTarget: s.pickFpAuthorTarget,
      setFpAuthorPitchRad: s.setFpAuthorPitchRad,
      fpAuthorToast: s.fpAuthorToast,
      showFpAuthorToast: s.showFpAuthorToast,
      fpSwingPreviewPhase01: s.fpSwingPreviewPhase01,
      setFpSwingPreviewPhase01: s.setFpSwingPreviewPhase01,
      fpSwingKeyframesDraft: s.fpSwingKeyframesDraft,
      setFpSwingKeyframesDraft: s.setFpSwingKeyframesDraft,
      fpSwingPlayActive: s.fpSwingPlayActive,
      setFpSwingPlayActive: s.setFpSwingPlayActive,
      fpSwingStrokeArmed: s.fpSwingStrokeArmed,
      setFpSwingStrokeArmed: s.setFpSwingStrokeArmed,
      fpSwingStrokeReviewActive: s.fpSwingStrokeReviewActive,
    })),
  );
}
