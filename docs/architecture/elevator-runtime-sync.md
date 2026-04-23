# Elevator Runtime, SpaceTimeDB Sync, and Hitch-Free Rides

This doc explains how elevators work today:

- server authority and SpaceTimeDB data flow,
- client-side state sync and motion evaluation,
- rider support/collision behavior,
- and why rides no longer hitch while moving between floors.

## The Short Version

- Server is authoritative for elevator cab and landing door state.
- Clients subscribe to rows and render/interact locally, but reducers validate against authoritative eligibility.
- Moving-cab evaluation uses server-stamped sample time (`sample_server_micros`) plus estimated client/server clock offset.
- Reconcile now suppresses known moving-elevator phantom corrections and smooths remaining error visually.
- Server/client share elevator volume and tolerance rules, avoiding support/clamp disagreement jitter.

## 1) Server Authority (SpaceTimeDB)

Main logic: `apps/server/src/elevator/mod.rs`.

### Runtime tables

- `elevator_car` (`shaft_key` PK): phase, levels, move progress, `cab_floor_y`, door state, queue, sample timestamp.
- `elevator_landing_door` (`shaft|level` key): desired state + animated corridor door swing.

Rows are seeded idempotently at startup (`seed_elevators`, `seed_elevator_landing_doors`).

### Tick state machine

`tick_all_elevators(ctx, dt)` runs once per physics tick and transitions:

- `IDLE` -> `CLOSING` when a new destination is queued,
- `CLOSING` -> `MOVING` once doors close,
- `MOVING` -> `OPENING` when move reaches destination,
- `OPENING` -> `IDLE` when doors fully open.

Each tick updates `sample_server_micros` so clients can evaluate motion against server time.

### Reducers

- `elevator_hail`: validated by player proximity + redundancy checks.
- `elevator_select_floor`: validated by "player is inside the requested cab".
- `elevator_landing_exterior_door_toggle` / `..._set`: validated target resolution + pose eligibility + moving-cab restrictions.

Door reducers accept client feet hints, but only as bounded helpers near authoritative pose.

## 2) Client Sync and Cab Evaluation

Main logic: `apps/client/src/game/fpElevatorWorld.ts`.

### Subscriptions and replica history

- Subscribes to `elevator_car` and `elevator_landing_door`.
- Keeps latest rows (`latest`, `landingByRowKey`) plus short per-shaft history (`replicaHistoryByKey`) for frame/reconcile evaluation.

### Server-clock aligned moving-cab math

Moving-cab Y is derived from:

- row sample timestamp (`sampleServerMicros`),
- estimated offset from `createFpElevatorServerClock`,
- and motion leg data (`moveFromLevel`, `moveToLevel`, `moveU`).

This avoids baking local wall-clock drift into cab prediction.

### Frame path vs reconcile path

- Frame path: `syncCabEvalClock(nowMs, dt)` enables smooth move-u progression per render frame.
- Reconcile replay: `syncCabEvalClock(stepNowMs)` uses replay timing without frame smoothing.

That split keeps replay deterministic while preserving smooth real-time ride visuals.

## 3) Rider Support, Snap, and Clamp

Both server and client treat elevator floors as kinematic support surfaces:

- walk-merge uses guarded vertical bands and doorway seam padding,
- rider snap/clamp are door-aware and bounded to avoid cross-floor false captures,
- roof support is handled separately.

Server side is in `elevator/mod.rs`; client mirrors behavior in `fpElevatorWorld` kinematic support hooks.

Critical constants are explicitly kept in sync in server comments and client constants, which reduces one-frame attach/detach jitter.

## 4) Why Elevator Movement No Longer Hitches

Primary changes are in `apps/client/src/game/mountFpSession.ts` and `fpElevatorWorld.ts`.

### Reconcile suppression for moving riders

`reconcileLocalPredictionToServer` now avoids applying known phantom corrections when the rider is on a moving cab:

- ignores small full-vector rider corrections,
- ignores mostly-vertical mismatches (small XZ, larger Y) that are timeline skew artifacts,
- still hard-snaps genuine large desync.

This removes the old 20 Hz "tug" during rides.

### Better visual error smoothing

- `_displayOffset` absorbs reconcile corrections (Source-style visual smoothing).
- Decay tuning is less aggressive and elevator-aware on Y.
- Idle/friction handling avoids key-up snapback artifacts.

Physics state remains authoritative; smoothing is visual only.

### Rig easing aligned with elevator motion

- Render rig follows `pos + _displayOffset` through an exponential smoother.
- Elevator vertical motion path avoids conflicting vertical timelines.
- Large divergence still hard-snaps as safety.

### Consistent cab timeline inputs

View placement, support sampling, and ride debug all consume the same cab timeline basis (server-stamped + offset corrected), avoiding mixed-frame disagreement.

## 5) SpaceTimeDB + Client Interact Reliability

Exterior landing door interactions use a small client retry/confirmation loop:

- client queues expected desired state,
- sends reducer with local feet hint,
- retries briefly while eligibility still holds,
- clears once replicated state confirms.

This addresses "pressed interact but no visible change" cases from transient ordering/ack timing.

## 6) Useful Debug Surface

`fpElevatorWorld.sampleRideDebug` exposes ride internals (phase, levels, predicted cab Y/Vy, elapsed since server sample, clock offset estimate, floor visibility band), useful for validating smoothness changes and clock behavior.

## 7) Files to Read First

- `apps/server/src/elevator/mod.rs`
- `apps/server/src/movement.rs`
- `apps/client/src/game/fpElevatorWorld.ts`
- `apps/client/src/game/mountFpSession.ts`
- `apps/client/src/game/fpElevatorConstants.ts`

