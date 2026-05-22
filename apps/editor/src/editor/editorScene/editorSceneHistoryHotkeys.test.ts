import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../../state/editorStore.js";
import { cloneHistorySlice } from "../../state/editorStoreHistory.js";
import {
  editorHistoryRedoFromKeyboardEvent,
  editorHistoryUndoFromKeyboardEvent,
} from "./editorSceneHistoryHotkeys.js";

describe("editorHistoryHotkeys", () => {
  beforeEach(() => {
    useEditorStore.setState({
      historyPast: [],
      historyFuture: [],
    });
  });

  it("returns true for Ctrl+Z when undo history exists", () => {
    useEditorStore.setState({
      historyPast: [cloneHistorySlice(useEditorStore.getState())],
    });

    expect(
      editorHistoryUndoFromKeyboardEvent({
        code: "KeyZ",
        key: "z",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
  });

  it("returns false for Ctrl+Z when undo history is empty", () => {
    expect(
      editorHistoryUndoFromKeyboardEvent({
        code: "KeyZ",
        key: "z",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(false);
  });

  it("returns true for Ctrl+Y when redo history exists", () => {
    useEditorStore.setState({
      historyFuture: [cloneHistorySlice(useEditorStore.getState())],
    });

    expect(
      editorHistoryRedoFromKeyboardEvent({
        code: "KeyY",
        key: "y",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
  });

  it("returns true for Ctrl+Shift+Z when redo history exists", () => {
    useEditorStore.setState({
      historyFuture: [cloneHistorySlice(useEditorStore.getState())],
    });

    expect(
      editorHistoryRedoFromKeyboardEvent({
        code: "KeyZ",
        key: "Z",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe(true);
  });
});
