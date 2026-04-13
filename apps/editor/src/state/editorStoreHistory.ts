import type { EditorState, HistoryEntry } from "./editorStoreTypes.js";

export function cloneHistorySlice(state: EditorState): HistoryEntry {
  return {
    floorDocs: structuredClone(state.floorDocs),
    interiorDocs: structuredClone(state.interiorDocs),
    building: structuredClone(state.building),
    selectedId: state.selectedId,
    dirty: state.dirty,
    contentStructureEpoch: state.contentStructureEpoch ?? 0,
  };
}

let transactionDepth = 0;

export function beginEditorTransactionGroup(
  get: () => EditorState,
  set: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void,
): void {
  transactionDepth += 1;
  if (transactionDepth === 1) {
    const snap = cloneHistorySlice(get());
    set((s) => ({
      historyPast: [...s.historyPast.slice(-49), snap],
      historyFuture: [],
    }));
  }
}

export function commitEditorTransactionGroup(): void {
  transactionDepth = Math.max(0, transactionDepth - 1);
}

export function maybePushHistory(
  get: () => EditorState,
  set: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void,
): void {
  if (transactionDepth > 0) return;
  const snap = cloneHistorySlice(get());
  set((s) => ({
    historyPast: [...s.historyPast.slice(-49), snap],
    historyFuture: [],
  }));
}
