import type { DbConnection } from "../../module_bindings";
import type { FpLocomotionInput } from "@the-mammoth/engine";
import {
  BIT_JUMP,
  encodeMoveIntentBits,
} from "./moveIntentCodec.js";
import { fpShortestAngleDeltaAbsRad } from "./fpShortestAngleDelta.js";
import type { FpSessionMoveIntentQueue } from "./fpSessionLocalPrediction.js";
import type { FpSessionMainRafState } from "./fpSessionMainRafFrame.js";
import {
  MOVE_INTENT_EDGE_WINDOW_MS,
  MOVE_INTENT_YAW_EDGE_RAD,
  NET_INTERVAL_MS,
} from "./fpSessionConstants.js";

export type FpSessionMoveIntentChannel = {
  intentSeq: { current: bigint };
  sendMoveIntent: (input: FpLocomotionInput, jump: boolean, nowMs: number) => void;
  maybeSendMoveIntent: (input: FpLocomotionInput, jump: boolean, nowMs: number) => void;
};

export type LocomotionSnapshotPoseSample = {
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  grounded: boolean;
};

export type CreateFpSessionMoveIntentChannelOpts = {
  conn: DbConnection;
  mainRaf: FpSessionMainRafState;
  moveIntentQueue: FpSessionMoveIntentQueue;
  maxPendingIntents: number;
  /** Trusted solo snapshot — becomes authoritative `player_pose` on the server (client-side collision). */
  samplePose: () => LocomotionSnapshotPoseSample;
};

/**
 * Owns move-intent sequencing, edge-trigger coalescing, and periodic resend throttling
 * for the first-person session mount without pulling in the rest of `mountFpSession`.
 */
export function createFpSessionMoveIntentChannel(
  opts: CreateFpSessionMoveIntentChannelOpts,
): FpSessionMoveIntentChannel {
  const { conn, mainRaf, moveIntentQueue, maxPendingIntents, samplePose } = opts;

  const intentSeq = { current: 0n };
  let lastMoveIntentMs = -Infinity;
  let lastSentPersistentBits = 0;
  let lastSentAimYaw = 0;
  let hasSentMoveIntent = false;
  let jumpIntentLockUntilMs = 0;

  const sendMoveIntent = (input: FpLocomotionInput, jump: boolean, nowMs: number) => {
    if (!conn.identity) return;
    intentSeq.current += 1n;
    const bits = encodeMoveIntentBits(input, jump);
    const replacePendingSameStep =
      moveIntentQueue.items.length > moveIntentQueue.head &&
      nowMs - lastMoveIntentMs < MOVE_INTENT_EDGE_WINDOW_MS;
    const sample = {
      seq: intentSeq.current,
      bits,
      aimYaw: mainRaf.bodyYaw,
      evalWallClockMs: replacePendingSameStep
        ? moveIntentQueue.items[moveIntentQueue.items.length - 1]!.evalWallClockMs
        : nowMs,
    };
    if (replacePendingSameStep) moveIntentQueue.items[moveIntentQueue.items.length - 1] = sample;
    else moveIntentQueue.items.push(sample);
    if (moveIntentQueue.items.length - moveIntentQueue.head > maxPendingIntents) {
      const excess =
        moveIntentQueue.items.length - moveIntentQueue.head - maxPendingIntents;
      moveIntentQueue.head += excess;
    }
    lastMoveIntentMs = nowMs;
    lastSentPersistentBits = bits & ~BIT_JUMP;
    lastSentAimYaw = mainRaf.bodyYaw;
    hasSentMoveIntent = true;
    if (jump) jumpIntentLockUntilMs = nowMs + NET_INTERVAL_MS;
    const p = samplePose();
    void conn.reducers.submitPlayerLocomotionSnapshot({
      intentSeq: intentSeq.current,
      bits,
      aimYaw: mainRaf.bodyYaw,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: mainRaf.bodyYaw,
      velX: p.velX,
      velY: p.velY,
      velZ: p.velZ,
      grounded: p.grounded ? 1 : 0,
    });
  };

  const maybeSendMoveIntent = (
    input: FpLocomotionInput,
    jump: boolean,
    nowMs: number,
  ): void => {
    if (!conn.identity) return;
    if (jump) {
      sendMoveIntent(input, true, nowMs);
      return;
    }
    if (nowMs < jumpIntentLockUntilMs) return;
    const persistentBits = encodeMoveIntentBits(input, false);
    const periodicDue = !hasSentMoveIntent || nowMs - lastMoveIntentMs >= NET_INTERVAL_MS;
    const bitsChanged = !hasSentMoveIntent || persistentBits !== lastSentPersistentBits;
    /** Publish yaw whenever look moves enough — required while stationary so server melee/firearm yaw stays fresh between ticks. */
    const yawChanged =
      hasSentMoveIntent &&
      fpShortestAngleDeltaAbsRad(mainRaf.bodyYaw, lastSentAimYaw) >= MOVE_INTENT_YAW_EDGE_RAD;
    if (periodicDue || bitsChanged || yawChanged) {
      sendMoveIntent(input, false, nowMs);
    }
  };

  return { intentSeq, sendMoveIntent, maybeSendMoveIntent };
}
