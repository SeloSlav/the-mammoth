# Apartment decor GLB source backups (legacy)

Pre-optimization Meshy GLBs from an **aborted decimation pass** (2026-05-23). Kept as archival originals only.

Current optimization uses `pnpm content:optimize-glbs:apply` (reorder + WebP, no decimation). New backups go to `content/models/glb-source-backups/`.

To restore a single asset from this tree:

```bash
cp content/apartment/glb-source-backups/static/models/objects/bed.glb apps/client/public/static/models/objects/bed.glb
```

## Texture format (KTX2) — deferred

**Decision (2026-05-23):** Keep decor GLBs on **embedded WebP** (1024–2048 max edge). Do **not** convert decor to KTX2/Basis yet.

| Factor | Rationale |
|--------|-----------|
| Building PBR | Already uses KTX2 via `packages/world/src/pbrTextureSystem.ts` + `ensurePbrKtx2Support`. |
| Decor loading | `GLTFLoader` path in `fpApartmentDecorMeshes.ts` — no KTX2 wiring today. |
| Perf | FP is **geometry-bound**; safe texture compression helps download size without changing triangle counts. |
| Cost | KTX2 pipeline for 50+ decor assets + mood-grade/emissive edge cases is non-trivial for marginal gain right now. |

Revisit if texture memory or decode time shows up in captures, or if decor shares the building PBR loader.
