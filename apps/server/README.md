# Mammoth SpaceTimeDB module

Rust module (`mammoth-module`) published as a database on your SpacetimeDB host.

## Local run

1. Install the [SpacetimeDB CLI](https://spacetimedb.com/).
2. **Keep a local node running** in its own terminal (from any directory). Publishing the WASM module does **not** start the server.

   ```bash
   spacetime start
   ```

3. Publish this module (from repo root):

   ```bash
   spacetime publish mammoth-local --project-path apps/server
   ```

   The name `mammoth-local` must match the game client’s `VITE_SPACETIME_DATABASE` (see `apps/client/.env.example`).

4. Regenerate TypeScript bindings after changing tables or reducers:

   ```bash
   pnpm client:generate
   ```

5. **Walk / floor content:** if you (or another workflow) changed `content/building/` floor JSON, `mammoth.json`, or walk-surface logic in `@the-mammoth/world`, regenerate server grounding data:

   ```bash
   pnpm content:gen-walk-aabbs
   ```

   See [docs/content-building.md](../../docs/content-building.md).

## Auth

The browser can connect to SpacetimeDB either with a JWT from `apps/auth` (OpenAuth) or as an anonymous guest token for local/dev play. Configure your SpacetimeDB node to trust the auth issuer’s JWKS (`/.well-known/jwks.json`) so registered sign-in works.

- **`user` table** — one row per `Identity`; `username` is `None` until the client calls `set_username`.
- **`client_connected`** — inserts a `user` row if missing.
- **`set_username`** — validates with `auth::is_valid_username` (same rules as the client copy).
- **`ping_world`** — example reducer that calls `auth::ensure_gameplay_unlocked` (username must be set).
- **Apartment claim flag** — set `MAMMOTH_REQUIRE_REGISTERED_APARTMENT_CLAIMS=true` when publishing to require OIDC/JWT-backed accounts for wardrobe claims. Default is off, so named guests can claim apartments.