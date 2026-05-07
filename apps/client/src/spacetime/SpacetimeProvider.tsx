import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ensureFpLoadingDebugGlobalObservers } from "../game/fpSession/fpLoadingDebug.js";
import { useSpacetimeConnection } from "./useSpacetimeConnection";
import type { SpacetimeSession, ProfileSubmitArgs } from "./useSpacetimeConnection";

export type { SpacetimeSession, ProfileSubmitArgs };

const SpacetimeContext = createContext<SpacetimeSession | null>(null);

/**
 * Holds the SpaceTimeDB connection **outside** `<StrictMode>` so React dev
 * does not mount → disconnect → remount the WebSocket (noisy + confusing).
 */
export function SpacetimeProvider({ children }: { children: ReactNode }) {
  const session = useSpacetimeConnection();
  useEffect(() => ensureFpLoadingDebugGlobalObservers(), []);
  return (
    <SpacetimeContext.Provider value={session}>
      {children}
    </SpacetimeContext.Provider>
  );
}

export function useSpacetimeSession(): SpacetimeSession {
  const ctx = useContext(SpacetimeContext);
  if (!ctx) {
    throw new Error("useSpacetimeSession must be used within <SpacetimeProvider>");
  }
  return ctx;
}
