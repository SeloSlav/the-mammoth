/** OpenAuth issuer (`apps/auth` ISSUER_URL), e.g. http://localhost:4001 */
export function authIssuerUrl(): string {
  const u = import.meta.env.VITE_AUTH_ISSUER_URL ?? "http://localhost:4001";
  return u.replace(/\/+$/, "");
}

/** OIDC client id — must match `OIDC_CLIENT_ID` on the auth server. */
export function oidcClientId(): string {
  return import.meta.env.VITE_OIDC_CLIENT_ID ?? "the-mammoth-client";
}

/** OAuth redirect (must match what you send to `/authorize`). */
export function oidcRedirectUri(): string {
  const override = import.meta.env.VITE_OIDC_REDIRECT_URI;
  if (override && typeof override === "string" && override.length > 0) {
    return override;
  }
  return `${window.location.origin}/auth/callback`;
}

const ACCESS_STORAGE_KEY = "mammoth:oidc:access_token";

export function readOidcAccessToken(): string | undefined {
  try {
    const t = localStorage.getItem(ACCESS_STORAGE_KEY);
    return t && t.length > 0 ? t : undefined;
  } catch {
    return undefined;
  }
}

export function writeOidcAccessToken(token: string): void {
  try {
    localStorage.setItem(ACCESS_STORAGE_KEY, token);
  } catch {
    /* private mode */
  }
}

export function clearOidcAccessToken(): void {
  try {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
