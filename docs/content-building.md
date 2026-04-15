# Building content and server walk collision

Authoritative player grounding and static world blocking on the SpaceTimeDB module use **baked axis-aligned boxes** emitted into Rust, not runtime mesh loading.

## When to regenerate

Run from the **repository root** after you change any of:

- `content/building/mammoth.json` (including `worldOrigin` or floor refs)
- Any floor document under `content/building/floors/*.json`
- Any floor override document under `content/building/floor-overrides/*.json`
- Shared elevator collision inputs under `content/elevator/*.json` such as `cab.json`, `landing_kit.json`, or `stairwell.json`
- Walk-surface or floor-mesh rules in `@the-mammoth/world` (for example `packages/world/src/walkSurfaceAABBs.ts` or the floor builder pipeline)

```bash
pnpm content:gen-walk-aabbs
```

This runs `scripts/gen-walk-aabbs.ts` and updates:

- `apps/server/src/generated_walk_surfaces.rs` plus shard files under `apps/server/src/generated_walk_surfaces/`
- `apps/server/src/generated_collision_solids.rs` plus shard files under `apps/server/src/generated_collision_solids/`

The generator also writes a stamp file at `content/building/.collision-artifacts-stamp.json` so editor tooling can tell whether authored structural content is newer than the last successful artifact rebuild.

**Do not hand-edit** generated output; fix the generator or the source JSON instead.

Commit the regenerated Rust under `apps/server/src/generated_walk_surfaces*` and `apps/server/src/generated_collision_solids*` together with the content changes so server movement stays aligned with what the client and editor show.

## Related scripts

- `pnpm content:gen-mamutica-floor` — some Mamutica floor JSON is produced by `scripts/gen-mamutica-floor-doc.mjs`; `content/building/mammoth.json` reminds you to run walk AABB generation after floor work.
