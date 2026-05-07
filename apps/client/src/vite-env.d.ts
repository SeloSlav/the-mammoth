/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIME_URI?: string;
  readonly VITE_SPACETIME_DATABASE?: string;
  readonly VITE_REQUIRE_REGISTERED_APARTMENT_CLAIMS?: string;
  readonly VITE_ENABLE_ACCOUNT_AUTH?: string;
  readonly VITE_AUTH_ISSUER_URL?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OIDC_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
