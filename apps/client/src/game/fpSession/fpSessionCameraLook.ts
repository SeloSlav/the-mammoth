import {
  FREE_LOOK_YAW_MAX,
  LOOK_INERTIA_COAST_GAIN,
  LOOK_INERTIA_DAMP_PER_S,
  MOUSE_SENS,
  PITCH_LIMIT,
} from "./fpSessionConstants.js";

export type FpLookInertiaState = {
  velYaw: number;
  velPitch: number;
};

export type FpLookAngleState = {
  bodyYaw: number;
  pitch: number;
  headLookYaw: number;
};

export function createFpLookInertiaState(): FpLookInertiaState {
  return { velYaw: 0, velPitch: 0 };
}

export function resetFpLookInertia(state: FpLookInertiaState): void {
  state.velYaw = 0;
  state.velPitch = 0;
}

export type StepFpLookInertiaOpts = {
  freeLook: boolean;
  mouseSens?: number;
  pitchLimit?: number;
  freeLookYawMax?: number;
  inertiaDampPerS?: number;
  coastGain?: number;
};

function applyLookVelocityToAngles(
  inertia: FpLookInertiaState,
  angles: FpLookAngleState,
  opts: StepFpLookInertiaOpts,
): void {
  const pitchLimit = opts.pitchLimit ?? PITCH_LIMIT;
  const freeLookYawMax = opts.freeLookYawMax ?? FREE_LOOK_YAW_MAX;

  if (opts.freeLook) {
    const nextHeadLookYaw = angles.headLookYaw + inertia.velYaw;
    if (nextHeadLookYaw <= -freeLookYawMax || nextHeadLookYaw >= freeLookYawMax) {
      angles.headLookYaw = Math.max(-freeLookYawMax, Math.min(freeLookYawMax, nextHeadLookYaw));
      inertia.velYaw = 0;
    } else {
      angles.headLookYaw = nextHeadLookYaw;
    }
  } else {
    angles.bodyYaw += inertia.velYaw;
  }

  const nextPitch = angles.pitch + inertia.velPitch;
  if (nextPitch <= -pitchLimit || nextPitch >= pitchLimit) {
    angles.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, nextPitch));
    inertia.velPitch = 0;
  } else {
    angles.pitch = nextPitch;
  }
}

/**
 * Instant mouse-look plus a light post-flick coast. Drag sensitivity is unchanged; fast turns
 * bleed a little momentum after the mouse stops.
 */
export function stepFpLookInertia(
  inertia: FpLookInertiaState,
  angles: FpLookAngleState,
  deltaX: number,
  deltaY: number,
  dt: number,
  opts: StepFpLookInertiaOpts,
): void {
  if (dt <= 0) return;

  const mouseSens = opts.mouseSens ?? MOUSE_SENS;
  const pitchLimit = opts.pitchLimit ?? PITCH_LIMIT;
  const freeLookYawMax = opts.freeLookYawMax ?? FREE_LOOK_YAW_MAX;
  const inertiaDampPerS = opts.inertiaDampPerS ?? LOOK_INERTIA_DAMP_PER_S;
  const coastGain = opts.coastGain ?? LOOK_INERTIA_COAST_GAIN;
  const decay = Math.exp(-inertiaDampPerS * dt);

  if (deltaX !== 0 || deltaY !== 0) {
    if (opts.freeLook) {
      angles.headLookYaw -= deltaX * mouseSens;
      angles.headLookYaw = Math.max(-freeLookYawMax, Math.min(freeLookYawMax, angles.headLookYaw));
    } else {
      angles.bodyYaw -= deltaX * mouseSens;
    }
    angles.pitch -= deltaY * mouseSens;
    angles.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, angles.pitch));

    inertia.velYaw -= deltaX * mouseSens * coastGain;
    inertia.velPitch -= deltaY * mouseSens * coastGain;
  } else if (Math.abs(inertia.velYaw) > 1e-8 || Math.abs(inertia.velPitch) > 1e-8) {
    applyLookVelocityToAngles(inertia, angles, opts);
  }

  inertia.velYaw *= decay;
  inertia.velPitch *= decay;
  if (Math.abs(inertia.velYaw) < 1e-7) inertia.velYaw = 0;
  if (Math.abs(inertia.velPitch) < 1e-7) inertia.velPitch = 0;
}
