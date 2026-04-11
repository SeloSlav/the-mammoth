import * as THREE from "three";

/** Match `apps/server` pose clamp lower bound so client physics does not fight the reducer. */
const FLOOR_Y = 0.35;
const SKIN = 0.02;

const GRAVITY = 18;
const JUMP_SPEED = 5.4;
const WALK_SPEED = 2.9;
const SPRINT_SPEED = 5.0;
const CROUCH_SPEED = 1.35;
const GROUND_ACCEL = 19;
const AIR_ACCEL = 4.2;
const DRAG = 10;

const EYE_STAND = 1.55;
const EYE_CROUCH = 1.0;
const EYE_DAMP = 12;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _input2 = new THREE.Vector2();

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

  state.velocity.y -= GRAVITY * h;

  pos.x += state.velocity.x * h;
  pos.z += state.velocity.z * h;
  pos.y += state.velocity.y * h;

  if (pos.y <= FLOOR_Y + SKIN) {
    pos.y = FLOOR_Y + SKIN;
    state.velocity.y = 0;
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

export const fpLocomotionConstants = {
  eyeStand: EYE_STAND,
  eyeCrouch: EYE_CROUCH,
  floorY: FLOOR_Y,
} as const;
