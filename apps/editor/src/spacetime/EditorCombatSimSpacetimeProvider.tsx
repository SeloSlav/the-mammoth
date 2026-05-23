import { useCombatSimSpacetimeConnection } from "@the-mammoth/client/spacetime/useCombatSimSpacetimeConnection";
import type { CombatSimSpacetimeSession } from "@the-mammoth/client/spacetime/useCombatSimSpacetimeConnection";
import { createContext, useContext, type ReactNode } from "react";
import { useEditorStore } from "../state/editorStore.js";

const EditorCombatSimSpacetimeContext = createContext<CombatSimSpacetimeSession | null>(null);

/**
 * Holds the combat-sim SpacetimeDB socket **outside** `<StrictMode>` so React dev
 * does not mount → disconnect → remount the WebSocket mid-handshake.
 */
export function EditorCombatSimSpacetimeProvider({ children }: { children: ReactNode }) {
  const enabled = useEditorStore((s) => s.combatSimPlayActive);
  const session = useCombatSimSpacetimeConnection({ enabled });
  return (
    <EditorCombatSimSpacetimeContext.Provider value={session}>
      {children}
    </EditorCombatSimSpacetimeContext.Provider>
  );
}

export function useEditorCombatSimSpacetimeSession(): CombatSimSpacetimeSession {
  const ctx = useContext(EditorCombatSimSpacetimeContext);
  if (!ctx) {
    throw new Error(
      "useEditorCombatSimSpacetimeSession must be used within <EditorCombatSimSpacetimeProvider>",
    );
  }
  return ctx;
}
