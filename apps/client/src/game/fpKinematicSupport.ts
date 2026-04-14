import type { FpLocomotionState } from "@the-mammoth/engine";

export type FpKinematicSupportSampleOpts = {
  worldX: number;
  worldZ: number;
  probeTopY: number;
  footRadiusXZ: number;
  stepUpMargin: number;
  baseTop: number;
  evalWallClockMs?: number;
};

export type FpKinematicAttachment = {
  supportFeetY: number;
  clampWorldXZ?: (wx: number, wz: number) => { x: number; z: number; didClamp: boolean };
};

export type FpKinematicSupportSurface = {
  topY: number;
  verticalVelocityMps: number;
};

export type FpKinematicSupportProvider = {
  sampleSupportSurface(opts: FpKinematicSupportSampleOpts): FpKinematicSupportSurface | null;
  resolveAttachment(
    worldPos: { x: number; y: number; z: number },
    evalWallClockMs?: number,
  ): FpKinematicAttachment | null;
};

export function mergeKinematicSupportTop(
  provider: FpKinematicSupportProvider,
  opts: FpKinematicSupportSampleOpts,
): number {
  const sample = provider.sampleSupportSurface(opts);
  if (!sample) return opts.baseTop;
  if (!Number.isFinite(opts.baseTop)) return sample.topY;
  return Math.max(opts.baseTop, sample.topY);
}

export function getKinematicSupportVerticalVelocityMps(
  provider: FpKinematicSupportProvider,
  opts: FpKinematicSupportSampleOpts,
): number {
  return provider.sampleSupportSurface(opts)?.verticalVelocityMps ?? 0;
}

export function snapAttachedFeetToKinematicSupportIfNeeded(
  provider: FpKinematicSupportProvider,
  pos: { x: number; y: number; z: number },
  loco: FpLocomotionState,
  opts: {
    evalWallClockMs: number;
    jumpPressedThisFrame: boolean;
    skipAttachUpwardVyMps: number;
  },
): boolean {
  if (opts.jumpPressedThisFrame || loco.velocity.y > opts.skipAttachUpwardVyMps) return false;
  const attachment = provider.resolveAttachment(pos, opts.evalWallClockMs);
  if (!attachment) return false;
  pos.y = attachment.supportFeetY;
  loco.velocity.y = 0;
  loco.grounded = true;
  return true;
}

export function clampAttachedBodyXZToKinematicSupportIfNeeded(
  provider: FpKinematicSupportProvider,
  pos: { x: number; y: number; z: number },
  loco: FpLocomotionState,
  evalWallClockMs: number,
): boolean {
  const attachment = provider.resolveAttachment(pos, evalWallClockMs);
  if (!attachment?.clampWorldXZ) return false;
  const px = pos.x;
  const pz = pos.z;
  const { x, z, didClamp } = attachment.clampWorldXZ(px, pz);
  if (!didClamp) return false;
  pos.x = x;
  pos.z = z;
  if (x > px && loco.velocity.x < 0) loco.velocity.x = 0;
  if (x < px && loco.velocity.x > 0) loco.velocity.x = 0;
  if (z > pz && loco.velocity.z < 0) loco.velocity.z = 0;
  if (z < pz && loco.velocity.z > 0) loco.velocity.z = 0;
  return true;
}
