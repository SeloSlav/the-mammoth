import type { FpConsumableEditorSession } from "./fpConsumableEditorSession.js";

/**
 * Module-level reference to the live consumable session set by editorSceneRuntime when
 * fp_consumable mode is active. Cleared on teardown.
 */
let getSession: (() => FpConsumableEditorSession | null) | null = null;

export function registerFpConsumableAuthoringBridge(
  handlers: { getSession: () => FpConsumableEditorSession | null } | null,
): void {
  getSession = handlers?.getSession ?? null;
}

export function getFpConsumableSession(): FpConsumableEditorSession | null {
  return getSession?.() ?? null;
}
