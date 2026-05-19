import { useEditorStore } from "../../state/editorStore.js";
import type { TransformMode } from "../../state/editorStoreTypes.js";
import { isFpMode } from "./editorStoreModeGuards.js";

export function editorKeyboardTargetIsFormField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function transformModeFromDigitPhysicalKey(ev: Pick<KeyboardEvent, "code">): TransformMode | null {
  switch (ev.code) {
    case "Digit1":
    case "Numpad1":
      return "translate";
    case "Digit2":
    case "Numpad2":
      return "rotate";
    case "Digit3":
    case "Numpad3":
      return "scale";
    default:
      return null;
  }
}

export function registerEditorTransformModeDigitHotkeys(opts: {
  getTransformControlsDragging: () => boolean;
}): () => void {
  const { getTransformControlsDragging } = opts;

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.repeat) return;
    if (editorKeyboardTargetIsFormField(ev.target)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    const next = transformModeFromDigitPhysicalKey(ev);
    if (!next) return;
    if (getTransformControlsDragging()) return;

    const st = useEditorStore.getState();
    if (isFpMode(st.mode)) {
      if (st.fpAuthorCamera === "gameplay") return;
    } else if (st.selectedId === null) {
      return;
    }

    useEditorStore.getState().setTransformMode(next);
    ev.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}
