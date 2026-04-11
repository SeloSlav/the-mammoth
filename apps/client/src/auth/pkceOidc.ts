import {
  authIssuerUrl,
  oidcClientId,
  oidcRedirectUri,
  writeOidcAccessToken,
} from "./env";

const PKCE_SESSION_KEY = "mammoth_oidc_pkce";

function randomUrlSafeString(byteLen: number): string {
  const a = new Uint8Array(byteLen);
  crypto.getRandomValues(a);
  let s = "";
  for (let i = 0; i < a.length; i++) {
    s += String.fromCharCode(a[i]!);
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function startPasswordOidcRedirect(): Promise<void> {
  const verifier = randomUrlSafeString(32);
  const state = randomUrlSafeString(16);
  const challenge = await sha256Base64Url(verifier);
  sessionStorage.setItem(
    PKCE_SESSION_KEY,
    JSON.stringify({ verifier, state }),
  );
  const redirectUri = oidcRedirectUri();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: oidcClientId(),
    redirect_uri: redirectUri,
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    acr_values: "pwd",
  });
  window.location.href = `${authIssuerUrl()}/authorize?${params.toString()}`;
}

export async function completeOidcCallbackFromCurrentUrl(): Promise<void> {
  const path = window.location.pathname;
  if (path !== "/auth/callback" && !path.endsWith("/auth/callback")) {
    return;
  }
  const sp = new URLSearchParams(window.location.search);
  const code = sp.get("code");
  const state = sp.get("state");
  const err = sp.get("error");
  if (err) {
    throw new Error(sp.get("error_description") ?? err);
  }
  if (!code || !state) {
    throw new Error("Missing authorization code or state.");
  }
  const raw = sessionStorage.getItem(PKCE_SESSION_KEY);
  if (!raw) {
    throw new Error("Missing PKCE session — start sign-in from the game again.");
  }
  sessionStorage.removeItem(PKCE_SESSION_KEY);
  const { verifier, state: expected } = JSON.parse(raw) as {
    verifier: string;
    state: string;
  };
  if (state !== expected) {
    throw new Error("Login state mismatch — try signing in again.");
  }
  const redirectUri = oidcRedirectUri();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: oidcClientId(),
    code_verifier: verifier,
  });
  const res = await fetch(`${authIssuerUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Token response missing access_token.");
  }
  writeOidcAccessToken(json.access_token);
}

export function stripAuthCallbackFromUrl(): void {
  if (
    window.location.pathname === "/auth/callback" ||
    window.location.pathname.endsWith("/auth/callback")
  ) {
    window.history.replaceState({}, "", "/");
  }
}
