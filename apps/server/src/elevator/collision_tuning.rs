//! Numeric tuning for elevator exterior swing slabs, closed-cab hallway blockers, and hoistway
//! front-wall AABBs. **Must match** `packages/world/src/elevatorCollisionTuning.ts` — enforced by
//! `pnpm --filter @the-mammoth/world test` (`elevatorCollisionTuning.parity.test.ts`).

pub(super) const EXT_DOOR_W: f32 = 1.86;
#[allow(dead_code)]
pub(super) const EXT_DOOR_H: f32 = 2.05;
pub(super) const EXT_DOOR_COLLISION_OPEN_THRESH: f32 = 0.88;
pub(super) const EXT_DOOR_ANIM_SPEED: f32 = 3.0;
pub(super) const EXT_DOOR_SOLID_SLAB_MAX_SWING: f32 = 0.025;
pub(super) const EXT_DOOR_SWING_MAX_RAD: f32 = 1.55;
pub(super) const EXT_DOOR_HINGE_OUTSET: f32 = 0.048;
pub(super) const EXT_DOOR_PANEL_HALF_THICK: f32 = 0.10;

pub(super) const EXT_INTERACT_L0: f32 = -0.28;
pub(super) const EXT_INTERACT_L1: f32 = 0.82;
pub(super) const EXT_INTERACT_LZ_PAD: f32 = 0.08;
pub(super) const EXT_STRIP_Y0: f32 = 0.05;
pub(super) const EXT_STRIP_Y1: f32 = 2.25;

pub(super) const EXT_COLLISION_L0: f32 = -0.55;
pub(super) const EXT_COLLISION_L1: f32 = 0.92;
pub(super) const EXT_COLLISION_LZ_PAD: f32 = 0.18;
pub(super) const EXT_INTERACT_WORLD_RADIUS_M: f32 = 1.6;
pub(super) const EXT_INTERACT_WORLD_Y_HALF_M: f32 = 1.42;

pub(super) const CLOSED_CAB_OUTSIDE_SLAB_IN: f32 = 0.28;
pub(super) const CLOSED_CAB_OUTSIDE_SLAB_OUT: f32 = 1.05;
pub(super) const CLOSED_CAB_OUTSIDE_WIDTH_PAD: f32 = 0.32;

pub(super) const LANDING_FRONT_WALL_SLAB_IN: f32 = 0.2;
pub(super) const LANDING_FRONT_WALL_SLAB_OUT: f32 = 0.34;
/// Reserved for future server push-out; client still uses. Kept for parity with TS tuning.
#[allow(dead_code)]
pub(super) const LANDING_FRONT_WALL_PUSH_OUT: f32 = 0.08;

pub(super) const LANDING_FRONT_PASSAGE_HALF_W: f32 = EXT_DOOR_W * 0.5 + 0.04;
pub(super) const LANDING_PASSAGE_DOCK_Y_TOL_M: f32 = 0.5;
