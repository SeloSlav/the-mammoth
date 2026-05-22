import { useEditorStore } from "../../state/editorStore.js";
import { editorKeyboardTargetIsFormField } from "./editorSceneTransformModeHotkeys.js";

export function editorHistoryUndoFromKeyboardEvent(
  ev: Pick<
    KeyboardEvent,
    "code" | "key" | "repeat" | "target" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
): boolean {
  if (ev.repeat) return false;
  if (editorKeyboardTargetIsFormField(ev.target)) return false;
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;
  if (ev.shiftKey) return false;
  if (ev.code !== "KeyZ" && ev.key.toLowerCase() !== "z") return false;

  const st = useEditorStore.getState();
  if (st.historyPast.length === 0) return false;
  st.undo();
  return true;
}

export function editorHistoryRedoFromKeyboardEvent(
  ev: Pick<
    KeyboardEvent,
    "code" | "key" | "repeat" | "target" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
): boolean {
  if (ev.repeat) return false;
  if (editorKeyboardTargetIsFormField(ev.target)) return false;
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return false;

  const isCtrlY = ev.code === "KeyY" || ev.key.toLowerCase() === "y";
  const isCtrlShiftZ =
    ev.shiftKey && (ev.code === "KeyZ" || ev.key.toLowerCase() === "z");
  if (!isCtrlY && !isCtrlShiftZ) return false;
  if (isCtrlY && ev.shiftKey) return false;

  const st = useEditorStore.getState();
  if (st.historyFuture.length === 0) return false;
  st.redo();
  return true;
}

export function registerEditorHistoryHotkeys(opts: {
  getTransformControlsDragging: () => boolean;
}): () => void {
  const { getTransformControlsDragging } = opts;

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (getTransformControlsDragging()) return;
    const handled =
      editorHistoryUndoFromKeyboardEvent(ev) || editorHistoryRedoFromKeyboardEvent(ev);
    if (!handled) return;
    ev.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}
