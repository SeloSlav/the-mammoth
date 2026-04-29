/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIME_URI?: string;
  readonly VITE_SPACETIME_DATABASE?: string;
  readonly VITE_REQUIRE_REGISTERED_APARTMENT_CLAIMS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
