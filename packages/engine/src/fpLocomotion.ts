import * as THREE from "three";

/** Match `apps/server` pose clamp lower bound so client physics does not fight the reducer. */
const FLOOR_Y = 0.35;
const SKIN = 0.034;

const GRAVITY = 18;
const JUMP_SPEED = 5.4;
/** Indoor-ish gait: ~6 km/h walk, hard run ~12 km/h (not hallway blur). */
const WALK_SPEED = 1.65;
const SPRINT_SPEED = 3.35;
const CROUCH_SPEED = 1.05;
const GROUND_ACCEL = 19;
const AIR_ACCEL = 4.2;
const DRAG = 10;

const EYE_STAND = 1.55;
const EYE_CROUCH = 1.0;
const EYE_DAMP = 12;

/**
 * Walk AABB sampling — must match `sample_walk_ground_top_y` in `apps/server/src/movement.rs`
 * so client prediction and server authority land on the same support.
 */
export const FP_WALK_FOOT_RADIUS_XZ = 0.22;
export const FP_WALK_STEP_UP_MARGIN = 0.82;
/** Target micro-integration steps per second (both sides scale with sim `dt`). */
export const FP_LOCOMOTION_SUBSTEPS_PER_SECOND = 200;
export const FP_WALK_PROBE_DY = 1.05;
export const FP_WALK_MAX_SUPPORT_DROP_M = 3.1;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _input2 = new THREE.Vector2();

/**
 * World-space top Y of walk mesh under a vertical probe (see `sampleWalkGroundTopY` in
 * `@the-mammoth/world`). Implementations should use a small **foot radius** in XZ so point
 * probes do not slip through gaps between treads.
 */
export type WalkGroundSampler = (
  worldX: number,
  worldZ: number,
  probeTopY: number,
) => number;

export type FpLocomotionWalkOptions = {
  sampleWalkGroundTopY: WalkGroundSampler;
  /** Extra height above current `pos.y` for the downward probe (m). */
  probeDy?: number;
  /**
   * Ignore sampled ground more than this far **below** the feet (m), so a missed stair probe
   * does not snap you to the lobby `FLOOR_Y` slab.
   */
  maxSupportDropM?: number;
};

export type FpLocomotionInput = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  /** Toggle or hold — caller decides (we use sprint && !crouch for speed cap). */
  crouch: boolean;
};

export type FpLocomotionState = {
  velocity: THREE.Vector3;
  grounded: boolean;
  headBobPhase: number;
  jumpQueued: boolean;
  eyeSmoothed: number;
};

export function createFpLocomotionState(): FpLocomotionState {
  return {
    velocity: new THREE.Vector3(),
    grounded: true,
    headBobPhase: 0,
    jumpQueued: false,
    eyeSmoothed: EYE_STAND,
  };
}

export function queueFpJump(state: FpLocomotionState): void {
  state.jumpQueued = true;
}

/**
 * Integrates horizontal + vertical movement with damped accel (cyberpunk-apartment style),
 * gravity, optional jump, sprint / crouch speeds, and vertical head-bob when walking.
 * Mutates `pos` and `state` in place. Returns world-space Y for the head pivot (eye line).
 */
export function stepFpLocomotion(
  state: FpLocomotionState,
  pos: THREE.Vector3,
  yaw: number,
  input: FpLocomotionInput,
  dt: number,
  walk?: FpLocomotionWalkOptions,
): number {
  const h = Math.min(Math.max(dt, 0), 0.05);

  _input2.set(
    Number(input.right) - Number(input.left),
    Number(input.forward) - Number(input.backward),
  );
  if (_input2.lengthSq() > 1) _input2.normalize();

  _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  _desired.copy(_forward).multiplyScalar(_input2.y);
  _desired.addScaledVector(_right, _input2.x);

  const speed = input.crouch
    ? CROUCH_SPEED
    : input.sprint
      ? SPRINT_SPEED
      : WALK_SPEED;
  const accel = state.grounded ? GROUND_ACCEL : AIR_ACCEL;
  const targetVx = _desired.x * speed;
  const targetVz = _desired.z * speed;

  state.velocity.x = THREE.MathUtils.damp(
    state.velocity.x,
    targetVx,
    accel,
    h,
  );
  state.velocity.z = THREE.MathUtils.damp(
    state.velocity.z,
    targetVz,
    accel,
    h,
  );

  const moving = _input2.lengthSq() > 0.0001;
  if (!moving && state.grounded) {
    state.velocity.x = THREE.MathUtils.damp(state.velocity.x, 0, DRAG, h);
    state.velocity.z = THREE.MathUtils.damp(state.velocity.z, 0, DRAG, h);
  }

  if (state.grounded && state.jumpQueued) {
    state.velocity.y = JUMP_SPEED;
    state.grounded = false;
  }
  state.jumpQueued = false;

  const probeDy = walk?.probeDy ?? FP_WALK_PROBE_DY;
  const maxSupportDrop = walk?.maxSupportDropM ?? FP_WALK_MAX_SUPPORT_DROP_M;
  /**
   * Scale substeps with `dt` so client frames and the 20 Hz server tick use similar ground
   * resolution per second — avoids systematic drift that felt like rubber-banding.
   */
  const substeps = walk?.sampleWalkGroundTopY
    ? Math.max(1, Math.min(50, Math.round(FP_LOCOMOTION_SUBSTEPS_PER_SECOND * h)))
    : 1;
  const sh = h / substeps;
  for (let i = 0; i < substeps; i++) {
    const x0 = pos.x;
    const z0 = pos.z;
    state.velocity.y -= GRAVITY * sh;
    pos.x += state.velocity.x * sh;
    pos.z += state.velocity.z * sh;
    pos.y += state.velocity.y * sh;
    if (walk?.sampleWalkGroundTopY) {
      const probeY = pos.y + probeDy;
      const w0 = walk.sampleWalkGroundTopY(x0, z0, probeY);
      const w1 = walk.sampleWalkGroundTopY(pos.x, pos.z, probeY);
      let walkTop = w0;
      if (Number.isFinite(w1)) {
        walkTop = Number.isFinite(w0) ? Math.max(w0, w1) : w1;
      }
      const snapEps = 0.006;
      if (
        Number.isFinite(walkTop) &&
        walkTop > pos.y - maxSupportDrop &&
        pos.y <= walkTop + SKIN + snapEps
      ) {
        pos.y = walkTop + SKIN;
        state.velocity.y = 0;
        state.grounded = true;
      } else if (
        !Number.isFinite(walkTop) ||
        walkTop <= pos.y - maxSupportDrop
      ) {
        state.grounded = false;
      }
    } else if (pos.y <= FLOOR_Y + SKIN) {
      pos.y = FLOOR_Y + SKIN;
      state.velocity.y = 0;
      state.grounded = true;
    }
  }

  if (walk?.sampleWalkGroundTopY && pos.y < FLOOR_Y + SKIN - 1e-4) {
    pos.y = FLOOR_Y + SKIN;
    state.velocity.y = Math.max(0, state.velocity.y);
    state.grounded = true;
  }

  const horizontalSpeed = Math.hypot(state.velocity.x, state.velocity.z);
  const targetEye = input.crouch ? EYE_CROUCH : EYE_STAND;
  state.eyeSmoothed = THREE.MathUtils.damp(
    state.eyeSmoothed,
    targetEye,
    EYE_DAMP,
    h,
  );

  let bob = 0;
  if (state.grounded && !input.crouch && moving && horizontalSpeed > 0.15) {
    const walkStrength = THREE.MathUtils.clamp(
      horizontalSpeed / SPRINT_SPEED,
      0,
      1,
    );
    state.headBobPhase += h * THREE.MathUtils.lerp(0, 9, walkStrength);
    bob =
      Math.sin(state.headBobPhase * 2) * 0.0045 * walkStrength +
      Math.sin(state.headBobPhase * 0.5) * 0.0025 * walkStrength;
  }

  return state.eyeSmoothed + bob;
}

/** Tuned for believable interiors vs raw arcade feel; keep `apps/server/src/movement.rs` aligned. */
export const fpLocomotionConstants = {
  eyeStand: EYE_STAND,
  eyeCrouch: EYE_CROUCH,
  floorY: FLOOR_Y,
  walkSpeedMps: WALK_SPEED,
  sprintSpeedMps: SPRINT_SPEED,
  crouchSpeedMps: CROUCH_SPEED,
  walkFootRadiusXZ: FP_WALK_FOOT_RADIUS_XZ,
  walkStepUpMargin: FP_WALK_STEP_UP_MARGIN,
  walkProbeDy: FP_WALK_PROBE_DY,
  walkMaxSupportDropM: FP_WALK_MAX_SUPPORT_DROP_M,
  locomotionSubstepsPerSecond: FP_LOCOMOTION_SUBSTEPS_PER_SECOND,
  /** Narrower vertical FOV reads closer to eye-level photography and deepens rooms slightly. */
  cameraFovDeg: 62,
} as const;
