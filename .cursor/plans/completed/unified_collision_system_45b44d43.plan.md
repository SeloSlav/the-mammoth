---
name: Unified collision system
overview: Replace the current walk-top-only model with a shared collision scene that is automatically derived from authored world data for static geometry and from live elevator state for moving geometry. Keep client prediction and server authority aligned by generating both from the same collision source instead of duplicating ad hoc clamps.
todos:
  - id: define-collision-scene
    content: Add a shared `CollisionScene` representation in `packages/world` derived from authored building/floor/elevator data.
    status: completed
  - id: refactor-world-bake
    content: Refactor world baking so walk-top AABBs become a derived view of the shared collision scene instead of separate geometry logic.
    status: completed
  - id: build-collision-solver
    content: Implement client and server collision resolution against static solids plus generated kinematic elevator/door colliders.
    status: completed
  - id: replace-elevator-clamps
    content: Remove bespoke elevator/door push-out code in favor of generated kinematic colliders driven by elevator state.
    status: completed
  - id: add-parity-tests
    content: Add client, server, and shared fixture tests for walls, ceilings, stairs, door openings, and elevator interactions.
    status: completed
isProject: false
---

# Unified Collision System

## Why It Fails Today
The current movement model only understands "support under the feet" plus a few elevator-specific push-out rules. Static world collision is baked as walk-surface AABBs in [c:\WebProjects\the-mammoth\packages\world\src\walkSurfaceAABBs.ts](c:\WebProjects\the-mammoth\packages\world\src\walkSurfaceAABBs.ts), then sampled by [c:\WebProjects\the-mammoth\packages\engine\src\fpLocomotion.ts](c:\WebProjects\the-mammoth\packages\engine\src\fpLocomotion.ts) and [c:\WebProjects\the-mammoth\apps\server\src\movement.rs](c:\WebProjects\the-mammoth\apps\server\src\movement.rs). Visible walls, ceilings, shell sides, stair risers, and most doors are not part of that representation, so they only block when separately hardcoded, like the elevator door clamps in [c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingExteriorDoor.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingExteriorDoor.ts) and [c:\WebProjects\the-mammoth\apps\server\src\elevator.rs](c:\WebProjects\the-mammoth\apps\server\src\elevator.rs).

## Chosen Architecture
Use the hybrid approach:
- Static collision is auto-baked from authored building/floor data, not manually tagged meshes.
- Moving collision is generated from live elevator state as kinematic colliders.
- Client and server both consume the same collision description.

This fits the existing stack better than runtime mesh-derived collision because the server has no Three.js scene and already depends on deterministic generated world data.

## Design
### 1. Introduce a shared collision scene model
Add a new collision module under `packages/world` that emits a canonical `CollisionScene` for a building:
- Static solids: floor slabs, room shell walls, ceilings, stair treads/landings, elevator shaft shells, landing wall segments, corridor/unit walls with door cutouts.
- Static openings: corridor doors, apartment entries, hoistway openings.
- Dynamic collider descriptors: elevator cab shell, cab floor, cab doors, landing exterior doors, hoistway front opening lane.

This new builder should be derived from the same authored inputs already used by [c:\WebProjects\the-mammoth\packages\world\src\floorPlaceholderMeshes.ts](c:\WebProjects\the-mammoth\packages\world\src\floorPlaceholderMeshes.ts) and [c:\WebProjects\the-mammoth\packages\world\src\walkSurfaceAABBs.ts](c:\WebProjects\the-mammoth\packages\world\src\walkSurfaceAABBs.ts), so collision and visuals come from the same geometry rules instead of drifting copies.

### 2. Keep walk-top support as a derived optimization, not the source of truth
Refactor `walkSurfaceAABBsForBuilding` to become a projection of the shared collision scene's walkable tops rather than its own separate logic. That preserves existing cheap support sampling for stairs/floors while removing the current duplicate geometry logic.

### 3. Add a shared capsule-vs-collider solver
Implement a small deterministic collision solver shared conceptually between TS and Rust:
- Horizontal sweep / push-out against static solids.
- Step-up logic for shallow ledges and stair treads.
- Ceiling rejection for jumps.
- Kinematic support handling for moving elevator floors.
- Dynamic door and cab blocking based on live state instead of bespoke clamp functions.

Use the current player footprint assumptions as the initial capsule/cylinder dimensions so behavior stays close to the existing feel.

### 4. Replace hardcoded elevator clamps with generated kinematic colliders
Remove the special-purpose push-out math in:
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingExteriorDoor.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorLandingExteriorDoor.ts)
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorWorld.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpElevatorWorld.ts)
- [c:\WebProjects\the-mammoth\apps\server\src\elevator.rs](c:\WebProjects\the-mammoth\apps\server\src\elevator.rs)

Replace them with generated collision volumes from shaft layout plus door state:
- Cab shell and floor.
- Cab doorway blockers based on `doorOpen01`.
- Landing exterior swing door blocker based on `swingOpen01`.
- Hoistway front wall segments plus conditional doorway opening when cab is docked and both doors are open.

### 5. Wire the client to the new collision scene
Update:
- [c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionWorldMount.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionWorldMount.ts)
- [c:\WebProjects\the-mammoth\apps\client\src\game\mountFpSession.ts](c:\WebProjects\the-mammoth\apps\client\src\game\fpSessionWorldMount.ts)
- [c:\WebProjects\the-mammoth\packages\engine\src\fpLocomotion.ts](c:\WebProjects\the-mammoth\packages\engine\src\fpLocomotion.ts)

so the client no longer only samples top-Y support. Instead it should query the shared collision scene for support and blocking, while still using predicted elevator motion for kinematic surfaces.

### 6. Wire the server to the same collision semantics
Update [c:\WebProjects\the-mammoth\apps\server\src\movement.rs](c:\WebProjects\the-mammoth\apps\server\src\movement.rs) and the generated collision artifact pipeline so the server integrates against the same static solids and dynamic elevator collider generation. The current generated walk-surface file should either be replaced or expanded into a generated collision artifact consumed by the movement reducer.

### 7. Add strong parity tests
Add tests that prove the new system works without manual per-surface tagging:
- Static world cases: room shell walls, ceilings, slab edges, stair treads/landings, corridor openings, apartment doorways.
- Elevator cases: cab floor ride, closed/open cab doors, closed/open landing exterior doors, hoistway front wall, docked passage.
- Client/server parity fixtures using the same scenario inputs and expected post-step positions.

## Expected Outcome
After this change, authored geometry should become collidable by default because collision is generated from the same world description that generates the level, not from hand-added special cases. New floors, walls, ceilings, stairs, and elevator structures should inherit collision automatically as long as they are built through the shared world authoring pipeline.

## Risks To Handle In Implementation
- Keep movement feel stable while moving from top-sampling to solid blocking.
- Preserve deterministic enough behavior between TS and Rust to avoid client/server fighting.
- Avoid double-maintaining geometry rules by making walk support a derived view of the new collision scene, not a second system.
- Be careful with openings so corridor/unit door holes and elevator passages stay traversable when intended.
