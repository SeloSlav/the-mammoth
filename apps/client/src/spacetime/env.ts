/** Local SpaceTimeDB defaults; override with `.env` (see `.env.example`). */
export function spacetimeUri(): string {
  return import.meta.env.VITE_SPACETIME_URI ?? "http://127.0.0.1:3000";
}

/** Published database / module name (`spacetime publish … <name>`). */
export function spacetimeDatabase(): string {
  return import.meta.env.VITE_SPACETIME_DATABASE ?? "mammoth-local";
}
