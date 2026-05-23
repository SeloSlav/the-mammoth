export { spacetimeDatabase, spacetimeUri } from "@the-mammoth/spacetime-client";

/** When false (default), the client connects as guest immediately and hides OIDC UI. */
export function readEnableAccountAuth(): boolean {
  return import.meta.env.VITE_ENABLE_ACCOUNT_AUTH === "true";
}
