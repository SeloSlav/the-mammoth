Khronos Basis Universal transcoder for Three.js `KTX2Loader` (files here are served as `/basis/`).

Automatically synced from `node_modules/three/examples/jsm/libs/basis/` when you:

- Run `pnpm install` (via `postinstall` on `@the-mammoth/client`), or
- Run `pnpm --filter @the-mammoth/client sync:basis-transcoder`, or
- Run `pnpm run build` in the client (runs sync before `vite build`).

`ensurePbrKtx2Support(renderer)` in `mountFpSession` uses `/basis/` by default. Without wasm/js here,
PNG/WebP/JPEG textures still load; `.ktx2` will not decode until this folder is populated.
