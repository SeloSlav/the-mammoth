import type { FpLocomotionInput } from "@the-mammoth/engine";

/** Must match `apps/server/src/movement.rs` `BIT_*`. */
export const BIT_FORWARD = 1 << 0;
export const BIT_BACK = 1 << 1;
export const BIT_LEFT = 1 << 2;
export const BIT_RIGHT = 1 << 3;
export const BIT_JUMP = 1 << 4;
export const BIT_SPRINT = 1 << 5;
export const BIT_CROUCH = 1 << 6;

/**
 * Pack WASD / sprint / crouch / jump into the `bits` field for `submit_move_intent`.
 * `jump` is a one-shot (server applies when grounded); set from `jumpQueued` before integrating.
 */
export function encodeMoveIntentBits(
  input: FpLocomotionInput,
  jump: boolean,
): number {
  let bits = 0;
  if (input.forward) bits |= BIT_FORWARD;
  if (input.backward) bits |= BIT_BACK;
  if (input.left) bits |= BIT_LEFT;
  if (input.right) bits |= BIT_RIGHT;
  if (input.sprint) bits |= BIT_SPRINT;
  if (input.crouch) bits |= BIT_CROUCH;
  if (jump) bits |= BIT_JUMP;
  return bits & 0xff;
}
