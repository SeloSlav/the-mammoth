/**
 * SpaceTimeDB client bridge. The game client connects via generated `DbConnection` in
 * `apps/client/src/module_bindings` (run `pnpm client:generate` after Rust module changes).
 */

/** Default local control plane / WebSocket URL (override with `VITE_SPACETIME_URI` in the client). */
export const defaultSpacetimeUri = "http://127.0.0.1:3000" as const;

/** Default published database name (override with `VITE_SPACETIME_DATABASE`). */
export const defaultSpacetimeDatabase = "mammoth-local" as const;
