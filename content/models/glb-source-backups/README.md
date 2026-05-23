# Static model GLB source backups

Pre-optimization originals for every `.glb` under `apps/client/public/static/models/`.

Created by `pnpm content:optimize-glbs:apply` (reorder + WebP textures only — **no mesh decimation**). To restore a single asset:

```bash
cp content/models/glb-source-backups/static/models/weapons/crowbar.glb apps/client/public/static/models/weapons/crowbar.glb
```

These files can be large and are intentionally not required at runtime.
