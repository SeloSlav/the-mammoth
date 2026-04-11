# Player presentation and animation architecture

This document describes the first milestone of the **separated local first-person** and **remote third-person** player presentation system for The Mammoth.

## What is real vs placeholder

| Area | Current | Future |
|------|---------|--------|
| Local body | Hidden — only arms + weapon primitives parented to the camera | Rigged FP arms/hands GLB, upper-body masks, IK hints |
| Remote body | Primitive humanoid boxes + shared crowbar mesh | Full-body GLB, locomotion blend tree, facial idle |
| Animation | `PrimitiveAnimationDriver` timers + procedural weapon swing | `GltfAnimationDriver` with `AnimationMixer`, clip retargeting, blending |
| Assets | `NoopModelLoadRegistry` + `ModelRef` metadata | `GLTFLoader` cache, async instantiate, bone anchors |
| Networking | `ReplicatedPlayerSnapshot` built in `mountFpSession` via `@the-mammoth/net` helpers | Inventory + action bits tables feeding snapshots |

## Package boundaries

- **`@the-mammoth/game`**: Presentation-agnostic `LocalPlayerGameplayState`, `ReplicatedPlayerSnapshot`, animation intent names, held item ids.
- **`@the-mammoth/net`**: Pure numeric adapters (`replicatedPlayerSnapshotFromPlainPose`) — no Three.js, no React.
- **`@the-mammoth/assets`**: `ModelRef`, `IModelLoadRegistry` contracts (engine implements loaders later).
- **`@the-mammoth/engine`**: Three.js presenters, `IAnimationDriver`, weapon presenters, `PlayerPresentationManager`.
- **`apps/client`**: Session wiring (`mountFpSession`), input → gameplay state, SpaceTimeDB subscriptions → snapshots, dev mock remotes.

## Intentional separation: local FP vs remote TP

- **`LocalFirstPersonPresenter`** parents a dedicated `local_fp_viewmodel_root` to the **camera**. It never instantiates a third-person capsule/body for the local user.
- **`RemotePlayerPresenter`** owns a **world-space** humanoid root for other players only. It consumes `ReplicatedPlayerSnapshot`, not raw DB rows.
- **`PlayerPresentationManager`** keeps those pipelines separate so future GLB swaps do not entangle first-person viewmodels with third-person locomotion rigs.

## Where rigged models plug in

1. **Registry**: implement `IModelLoadRegistry.instantiate(ModelRef)` in the client bootstrap (engine helper module) using `GLTFLoader` + Draco optional + LRU cache.
2. **Local**: swap `LocalFirstPersonPresenter` internals to attach a loaded scene under the same `fpRoot`, retarget `PrimitiveAnimationDriver` → `GltfAnimationDriver`, drive clips listed in `WeaponDefinition.animationSet`.
3. **Remote**: replace `buildPrimitiveHumanoid` with a `GltfCharacterInstance` wrapper that exposes stable **`handAttachRight`** (or bone lookup by name) so `WeaponPresenter` attachment rules stay stable.
4. **Weapons**: `WeaponPresenter` already centralizes attachment offsets per `WeaponPresentationRole`; GLB weapons reuse the same class with mesh swapping.

**Placeholder weapon tuning:** see [weapon-authoring.md](./weapon-authoring.md) (`content/weapons/*.presentation.json`).

## Dev mock remotes

`apps/client/src/game/mockRemoteSnapshots.ts` spawns two patrolling scouts (non-hex ids) so third-person visuals are testable alone. Real `player_pose` rows overwrite the same map keys if ids ever collide (they should not).

## TODO path (ordered)

1. Add `GLTFLoader` + cached `IModelLoadRegistry` implementation (client `static/` URLs).
2. Flesh out `GltfAnimationDriver` with clip maps per body archetype + weapon overlay slots.
3. Extend `PlayerPose` / reducers with equipment + melee phase bits for remote swing replication.
4. Route `onMeleeVisual` to a gameplay hit-scan module (client prediction → server validation).
5. Death / ragdoll presentation hooks on `PlayerLifePhase` + damage direction.
