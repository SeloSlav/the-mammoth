import type { Connect } from "vite";

type ConnectLayer = { route: string; handle: Connect.NextHandleFunction };

/** Inserts middleware at the front of Connect’s stack (before Vite’s built-in handlers). */
export function prependConnectMiddleware(
  app: Connect.Server,
  fn: Connect.NextHandleFunction,
): void {
  const stack = (app as unknown as { stack?: ConnectLayer[] }).stack;
  if (Array.isArray(stack)) {
    stack.unshift({ route: "", handle: fn });
    return;
  }
  app.use(fn);
}
