# FP session performance pipeline

**Status:** Living contract (2026-06-05)
**Profiler:** `?fpdebug=1` or `localStorage mammothFpDebug=1` — see [`fpSessionPerfDebug.ts`](../../apps/client/src/game/fpSession/fpSessionPerfDebug.ts)  
**Ring buffer:** [`fpSessionPerfStore.ts`](../../apps/client/src/game/fpSession/fpSessionPerfStore.ts)

---

## Thread model

| Lane | What runs there |
|------|-----------------|
| **Main thread (RAF)** | Input, prediction, presenters, floor/decor visibility, scene updates, `renderer.render` record/submit |
| **GPU** | WebGPU queues (async); CPU still records on main thread |
| **Server** | Authoritative physics / NPC tick (~20 Hz) via SpacetimeDB |

Chrome’s “`requestAnimationFrame` handler took N ms” attributes the **whole** FP tick to the first line of the RAF callback — use section timers (`physicsMs`, `elevatorMs`, `presentMs`, `renderMs`, `renderThreeMs`) not a single line number.

---

## Profiler buckets (what to blame)

| Field | Meaning |
|-------|---------|
| `physicsMs` | `stepFpLocomotion` / prediction substeps |
| `elevatorMs` | Elevator world + doors + hail UI |
| `presentMs` | Player presentation, HUD scans, floor-vis sync |
| `presentVisibilityMs` | Actual floor/PVS + decor + dropped-item visibility work inside `presentMs` |
| `presentFloorVisibilityMs` | Floor plate, authored-volume, and corridor PVS traversal |
| `presentDecorVisibilityMs` | Apartment decor visibility traversal |
| `presentDroppedItemVisibilityMs` | Dropped-item visibility traversal |
| `presentPlayerPresentationMs` | Player presenter and held-item sync |
| `renderMs` | Floor-vis culling subset + environment + `renderer.render` |
| `renderThreeMs` | GPU submit wall time |
| `drawCalls` / `triangles` | `renderer.info.render` after frame |
| `sceneGraphVisibleTriangles` | Honest visible mesh tris (see breakdown string) |

---

## Subsystem checklist (new features)

Before merging GPU- or RAF-heavy work:

1. **Must it run every frame?** Event-drive or throttle if not.
2. **Draw calls at max density?** Instancing / merge / atlas (drops, doors, litter are references).
3. **LOD tier?** High / mid / low for skinned or dense static props.
4. **Material cache key?** Avoid `clone()` per instance — use `MaterialPool` / decal-style keys.
5. **GPU reveal budget?** `GpuRevealScheduler` for hidden→visible (decor, async PBR).
6. **Spatial queries?** `FpMegablockSpatialContext` — no full-table SpacetimeDB scans per frame.
7. **Loading warmup?** `prepareFpSessionLoadingGpuWarmup` + bootstrap renders.

---

## Spatial services

[`FpMegablockSpatialContext`](../../apps/client/src/game/fpSession/fpMegablockSpatialContext.ts) — unit feet queries, drop HUD cells, walk sample band (feeds walk index subset).

---

## GPU reveal

[`GpuRevealScheduler`](../../../packages/engine/src/rendering/gpuRevealScheduler.ts) — scopes: `loading`, `steady`, `asyncMaterial`. Decor warm-up is the reference consumer.

---

## Feature flags

| Flag | Effect |
|------|--------|
| `?fpdebug=1` / `mammothFpDebug` | Extra **console** perf log once/sec (`[fpSessionPerf]`); the top-right FPS card works without this |
| `?fpnpc=1` / `mammothFpWorldNpcs` | Mount `fpNpcSession` in Mamutica (dev only; see [fp-world-npc-readiness.md](fp-world-npc-readiness.md)) |

**Decor cross-placement instancing** (`applyApartmentDecorCrossPlacementInstancing` in `@the-mammoth/engine`): apartment unit rebuilds, corridor ceiling fixtures, and stairwell ceiling lights. Identical non-pick props are batched only within the same authored apartment unit or floor sector. Unit batches follow the corridor PVS, floor batches preserve floor tags, and every batch computes its own frustum bounds. Exterior facade decor stays on its existing per-placement visibility path. Dev builds log `[apartmentDecorInstancing]`. The **top-right FPS card** (`MammothFpsHud`) shows `Ninst` + expanded **decor inst** lines when batching is active; `?fpdebug=1` is only for console logging.

The transient console helper exposes the existing profiler without adding another capture system:

```js
__fpDebug.perfReport(10)
```

---

## Visibility benchmark routes

The deterministic corridor benchmark covers the same authored-volume transitions used by live play:

```powershell
cd apps/client
.\node_modules\.bin\vitest.CMD bench src/game/fpSession/fpSessionCorridorPvs.bench.ts --run
.\node_modules\.bin\vitest.CMD bench src/game/fpApartment/fpApartmentStashRayOcclusion.bench.ts --run
```

Reference capture on the target development machine, 2026-06-05:

| Route | Before mean | After mean | Improvement |
|-------|-------------|------------|-------------|
| Apartment -> hallway | 1.3409 ms | 0.0671 ms | ~20.0x |
| Hallway -> stairwell | 1.8248 ms | 0.3053 ms | ~6.0x |
| Hallway -> elevator | 1.6826 ms | 0.1987 ms | ~8.5x |
| Elevator -> floor transition | 2.4068 ms | 0.0234 ms | ~102.9x |
| Multi-floor traversal | 5.0744 ms | 0.1566 ms | ~32.4x |
| Stash ray blockers: global -> apartment volume | 0.0474 ms | 0.0022 ms | ~21.2x |

The corridor PVS snapshot is cached inside a conservative 0.75 m movement volume. Door queries and same-storey unit queries are padded by that same radius, so cached visibility cannot reveal geometry late.

---

## PR0 baselines (capture on your machine)

Record with `?fpdebug=1` after a cold load. Replace `TBD` with your numbers + date.

| Scenario | physicsMs | elevatorMs | presentMs | renderThreeMs | drawCalls | sceneGraphVisibleTriangles |
|----------|-----------|------------|-----------|---------------|-----------|----------------------------|
| Lobby idle | TBD | TBD | TBD | TBD | TBD | TBD |
| unit_e_003 wall hold | TBD | TBD | TBD | TBD | TBD | TBD |
| unit_e_003 180° turn | TBD | TBD | TBD | TBD | TBD | TBD |
| Elevator ride | TBD | TBD | TBD | TBD | TBD | TBD |
| Dense drops AOI | TBD | TBD | TBD | TBD | TBD | TBD |

**Reference (2026-05-20, furnished east wall):** p99 total frame ≈ 8.1 ms when stationary — [fp-apartment-interior-performance.md](fp-apartment-interior-performance.md).

---

## Manual capture checklist

- [ ] Lobby: distant elevator shafts do not run full landing loops (`elevatorMs` stable).
- [ ] Owned unit entry: no single frame > 50 ms hitch.
- [ ] unit_e_003: turn does not swing triangles 45k → 270k in one frame.
- [ ] Elevator cab: floor pick + doors behave as before.
- [ ] Combat sim + `?fpnpc=1`: off-floor NPCs hidden (PVS).
- [ ] `?fpnpc=0` Mamutica: zero NPC presenters.

---

## Related docs

- [fp-apartment-interior-performance.md](fp-apartment-interior-performance.md)
- [fp-building-mesh-visibility.md](fp-building-mesh-visibility.md)
- [fp-world-npc-readiness.md](fp-world-npc-readiness.md)
