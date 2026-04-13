# Building content and server walk collision

Authoritative player grounding on the SpaceTimeDB module uses **baked axis-aligned boxes** emitted into Rust, not runtime mesh loading.

## When to regenerate

Run from the **repository root** after you change any of:

- `content/building/mammoth.json` (including `worldOrigin` or floor refs)
- Any floor document under `content/building/floors/*.json`
- Walk-surface or floor-mesh rules in `@the-mammoth/world` (for example `packages/world/src/walkSurfaceAABBs.ts` or the floor builder pipeline)

```bash
pnpm content:gen-walk-aabbs
```

This runs `scripts/gen-walk-aabbs.ts` and updates `apps/server/src/generated_walk_surfaces.rs` plus shard files `apps/server/src/generated_walk_surfaces/part_*.rs` (each shard is a `static PART_…` slice). **Do not hand-edit** generated output; fix the generator or the source JSON instead.

Commit the regenerated Rust under `apps/server/src/generated_walk_surfaces*` together with the content changes so server movement stays aligned with what the client and editor show.

## Related scripts

- `pnpm content:gen-mamutica-floor` — some Mamutica floor JSON is produced by `scripts/gen-mamutica-floor-doc.mjs`; `content/building/mammoth.json` reminds you to run walk AABB generation after floor work.
