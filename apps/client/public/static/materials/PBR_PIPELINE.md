# PBR texture pipeline (WebGPU)

Default dielectric shell materials use **basecolor + optional normal + optional roughness (+ optional AO)**. **Height** and **metalness** textures are **opt-in** only (`useHeightMap` / `useMetalnessMap` on material slots).

**KTX2 / BasisU** is preferred when you provide `*.ktx2` next to authored stems and copy the [Basis transcoder](https://threejs.org/docs/#examples/en/loaders/KTX2Loader) into `apps/client/public/basis/` (`ensurePbrKtx2Support` in the FP session). Otherwise the loader falls back to `.webp` → `.png` → `.jpeg`.

See `packages/world/src/pbrMaterialConfig.ts` and `elevatorVisualMaterialUtils.ts`.
