/**
 * Throttles expensive HUD look-at raycasts (stash, doors, sittables) when the player is not
 * interacting. Full-rate while E is held or a prompt is already showing; otherwise refresh on
 * coarse movement / look change or on a fixed frame interval.
 */
export type FpHudPickThrottleState = {
  coarseFx: number;
  coarseFy: number;
  coarseFz: number;
  coarseYaw: number;
  coarsePitch: number;
};

export const FP_HUD_PICK_RAYCAST_IDLE_INTERVAL_FRAMES = 4;

/** ~3° yaw/pitch buckets — enough to pick up intentional look-at without spinning every frame. */
const FP_HUD_PICK_LOOK_BUCKET_RAD = Math.PI / 60;

export function fpHudPickRaycastDue(input: {
  state: FpHudPickThrottleState;
  frameIndex: number;
  feetX: number;
  feetY: number;
  feetZ: number;
  cameraYawRad: number;
  cameraPitchRad: number;
  interactKeyDown: boolean;
  activePrompt: boolean;
  idleIntervalFrames?: number;
}): boolean {
  if (input.interactKeyDown || input.activePrompt) return true;

  const coarseFx = Math.floor(input.feetX * 2);
  const coarseFy = Math.floor(input.feetY * 2);
  const coarseFz = Math.floor(input.feetZ * 2);
  const coarseYaw = Math.floor(input.cameraYawRad / FP_HUD_PICK_LOOK_BUCKET_RAD);
  const coarsePitch = Math.floor(input.cameraPitchRad / FP_HUD_PICK_LOOK_BUCKET_RAD);

  const contextMoved =
    coarseFx !== input.state.coarseFx ||
    coarseFy !== input.state.coarseFy ||
    coarseFz !== input.state.coarseFz ||
    coarseYaw !== input.state.coarseYaw ||
    coarsePitch !== input.state.coarsePitch;

  if (contextMoved) return true;

  const interval = Math.max(1, input.idleIntervalFrames ?? FP_HUD_PICK_RAYCAST_IDLE_INTERVAL_FRAMES);
  return (input.frameIndex % interval) === 0;
}

export function fpHudPickThrottleStateFromSample(input: {
  feetX: number;
  feetY: number;
  feetZ: number;
  cameraYawRad: number;
  cameraPitchRad: number;
}): FpHudPickThrottleState {
  return {
    coarseFx: Math.floor(input.feetX * 2),
    coarseFy: Math.floor(input.feetY * 2),
    coarseFz: Math.floor(input.feetZ * 2),
    coarseYaw: Math.floor(input.cameraYawRad / FP_HUD_PICK_LOOK_BUCKET_RAD),
    coarsePitch: Math.floor(input.cameraPitchRad / FP_HUD_PICK_LOOK_BUCKET_RAD),
  };
}
