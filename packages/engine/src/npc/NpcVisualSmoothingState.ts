import * as THREE from "three";

export type NpcVisualSmoothingConfig = {
  positionSmoothingRate: number;
  rotationSmoothingRate: number;
  velocitySmoothingRate: number;
  teleportSnapDistance: number;
  idleSpeedThreshold: number;
  runSpeedThreshold: number;
};

/** Frame-rate independent smoothing for replicated NPC transforms. */
export const NPC_VISUAL_SMOOTHING_DEFAULTS: NpcVisualSmoothingConfig = {
  positionSmoothingRate: 7.5,
  rotationSmoothingRate: 10,
  velocitySmoothingRate: 8,
  /** Snap visual pose when error exceeds this distance (teleport / spawn). */
  teleportSnapDistance: 8,
  idleSpeedThreshold: 0.12,
  runSpeedThreshold: 2.35,
};

export type NpcVisualAnimationState = "idle" | "walk" | "run";

/**
 * Per-NPC presentation state — intentionally separate from authoritative SpaceTimeDB pose.
 * `networkPosition` / `targetRotation` mirror server truth; `visualPosition` / `smoothedRotation`
 * drive the rendered Three.js root.
 */
export type NpcVisualSmoothingState = {
  networkPosition: THREE.Vector3;
  previousNetworkPosition: THREE.Vector3;
  visualPosition: THREE.Vector3;
  visualVelocity: THREE.Vector3;
  lastVisualPosition: THREE.Vector3;
  /** Authoritative facing from SpaceTimeDB. */
  networkRotation: THREE.Quaternion;
  /** Effective facing target for this frame (movement direction or networkRotation). */
  targetRotation: THREE.Quaternion;
  smoothedRotation: THREE.Quaternion;
  animationState: NpcVisualAnimationState;
  initialized: boolean;
};

export function createNpcVisualSmoothingState(): NpcVisualSmoothingState {
  return {
    networkPosition: new THREE.Vector3(),
    previousNetworkPosition: new THREE.Vector3(),
    visualPosition: new THREE.Vector3(),
    visualVelocity: new THREE.Vector3(),
    lastVisualPosition: new THREE.Vector3(),
    networkRotation: new THREE.Quaternion(),
    targetRotation: new THREE.Quaternion(),
    smoothedRotation: new THREE.Quaternion(),
    animationState: "idle",
    initialized: false,
  };
}

export function ingestNpcAuthoritativeTransform(
  state: NpcVisualSmoothingState,
  worldPosition: { x: number; y: number; z: number },
  yawRad: number,
): void {
  state.previousNetworkPosition.copy(state.networkPosition);
  state.networkPosition.set(worldPosition.x, worldPosition.y, worldPosition.z);
  state.networkRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yawRad);
  state.targetRotation.copy(state.networkRotation);

  if (!state.initialized) {
    state.visualPosition.copy(state.networkPosition);
    state.lastVisualPosition.copy(state.networkPosition);
    state.smoothedRotation.copy(state.networkRotation);
    state.visualVelocity.set(0, 0, 0);
    state.initialized = true;
  }
}

export type NpcVisualSmoothingStepResult = {
  horizontalSpeed: number;
  animationState: NpcVisualAnimationState;
};

const rawVisualVelocity = new THREE.Vector3();

/** Advance visual pose toward the latest authoritative transform. */
export function stepNpcVisualSmoothing(
  state: NpcVisualSmoothingState,
  dt: number,
  config: NpcVisualSmoothingConfig = NPC_VISUAL_SMOOTHING_DEFAULTS,
): NpcVisualSmoothingStepResult {
  if (!state.initialized || dt <= 0) {
    const speed = Math.hypot(state.visualVelocity.x, state.visualVelocity.z);
    return { horizontalSpeed: speed, animationState: state.animationState };
  }

  const errorDistance = state.visualPosition.distanceTo(state.networkPosition);
  let snapped = false;
  if (errorDistance >= config.teleportSnapDistance) {
    state.visualPosition.copy(state.networkPosition);
    state.smoothedRotation.copy(state.networkRotation);
    state.lastVisualPosition.copy(state.networkPosition);
    state.visualVelocity.set(0, 0, 0);
    snapped = true;
  } else {
    const positionAlpha = 1 - Math.exp(-dt * config.positionSmoothingRate);
    state.visualPosition.lerp(state.networkPosition, positionAlpha);
  }

  rawVisualVelocity.copy(state.visualPosition).sub(state.lastVisualPosition).divideScalar(dt);
  state.lastVisualPosition.copy(state.visualPosition);
  if (!snapped) {
    const velocityAlpha = 1 - Math.exp(-dt * config.velocitySmoothingRate);
    state.visualVelocity.lerp(rawVisualVelocity, velocityAlpha);
  }

  const horizontalSpeed = Math.hypot(state.visualVelocity.x, state.visualVelocity.z);
  state.animationState = resolveAnimationStateWithHysteresis(
    state.animationState,
    horizontalSpeed,
    config,
  );

  if (horizontalSpeed >= config.idleSpeedThreshold) {
    const moveYaw = Math.atan2(state.visualVelocity.x, state.visualVelocity.z);
    state.targetRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, moveYaw);
  } else {
    state.targetRotation.copy(state.networkRotation);
  }

  if (errorDistance < config.teleportSnapDistance) {
    const rotationAlpha = 1 - Math.exp(-dt * config.rotationSmoothingRate);
    state.smoothedRotation.slerp(state.targetRotation, rotationAlpha);
  } else {
    state.targetRotation.copy(state.networkRotation);
  }

  return { horizontalSpeed, animationState: state.animationState };
}

function resolveAnimationStateWithHysteresis(
  current: NpcVisualAnimationState,
  horizontalSpeed: number,
  config: NpcVisualSmoothingConfig,
): NpcVisualAnimationState {
  const idleEnter = config.idleSpeedThreshold;
  const idleExit = config.idleSpeedThreshold * 1.6;
  const runEnter = config.runSpeedThreshold;
  const runExit = config.runSpeedThreshold * 0.82;

  if (current === "run") {
    if (horizontalSpeed >= runExit) return "run";
    if (horizontalSpeed <= idleEnter) return "idle";
    return "walk";
  }
  if (current === "walk") {
    if (horizontalSpeed >= runEnter) return "run";
    if (horizontalSpeed <= idleEnter) return "idle";
    return "walk";
  }
  if (horizontalSpeed >= runEnter) return "run";
  if (horizontalSpeed >= idleExit) return "walk";
  return "idle";
}
