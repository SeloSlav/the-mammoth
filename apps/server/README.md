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

## Auth

- **`user` table** — one row per `Identity`; `username` is `None` until the client calls `set_username`.
- **`client_connected`** — inserts a `user` row if missing.
- **`set_username`** — validates with `auth::is_valid_username` (same rules as the client copy).
- **`ping_world`** — example reducer that calls `auth::ensure_gameplay_unlocked` (username must be set).
