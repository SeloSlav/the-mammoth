/** Shared SpacetimeDB connection settings (client + editor combat sim). */
export function spacetimeUri(): string {
  return import.meta.env.VITE_SPACETIME_URI ?? "http://127.0.0.1:3000";
}

export function spacetimeDatabase(): string {
  return import.meta.env.VITE_SPACETIME_DATABASE ?? "mammoth-local";
}
