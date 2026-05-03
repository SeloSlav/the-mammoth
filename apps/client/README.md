# `@the-mammoth/client`

Three.js first-person client (Vite + React HUD).

## Develop

From monorepo root:

```sh
pnpm dev:client
# same as: pnpm client:dev
```

From `apps/client` you can run the package script directly (`pnpm dev`), which uses the port-helper wrapper — typically **`http://localhost:5173`**.

## Multiplayer / second browser

Easiest: keep **one** dev server and open **two** windows to the same URL (e.g. normal profile + **InPrivate/Incognito** so you get two separate logins).

## Second Vite dev server (another port)

If you really want two front-end origins at once (e.g. side‑by‑side without juggling tabs), run Vite with an explicit port. **`vite` is a devDependency of this package**, so either:

**From `apps/client`:**

```sh
pnpm exec vite -- --port 5175 --host
```

Pick any free port instead of `5175`. `--host` binds beyond localhost only if you need LAN access.

**From monorepo root:**

```sh
pnpm --filter @the-mammoth/client exec vite -- --port 5175 --host
```

The `--` separates pnpm’s arguments from Vite’s; omitting it on Windows often breaks forwarding `--port`.
