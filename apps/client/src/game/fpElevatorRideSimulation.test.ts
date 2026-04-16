import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  type CollisionAabb,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types.js";
import {
  ELEVATOR_MOVE_SPEED_MPS,
  ELEVATOR_PHASE_MOVING,
} from "./fpElevatorConstants.js";
import {
  nextElevatorCarReplicaSample,
  pruneElevatorCarReplicaHistory,
  selectElevatorCarReplicaSample,
  type FpElevatorCarReplicaSample,
} from "./fpElevatorReplicaHistory.js";
import { createFpElevatorServerClock } from "./fpElevatorServerClock.js";
import { landingExteriorDoorRowKey } from "./fpElevatorLandingExteriorDoor.js";
import { predictMovingCabFeetWorldY } from "./fpElevatorCabPredict.js";
import {
  type FpElevatorWorldCollisionAuth,
  visitFpElevatorWorldCollisionAabbsInXZ,
} from "./fpElevatorWorldCollision.js";

const SHAFT_LOCAL_Y = 1.6589473684210527;
const SHAFT_SY = DEFAULT_BUILDING_FLOOR_SPACING_M;
const REPLICA_DT_MS = 50;
const FRAME_DT_MS = 1000 / 60;

function testLayout(
  plateX: number,
  plateZ: number,
  doorFace: ElevatorShaftLayout["doorFace"],
): ElevatorShaftLayout {
  return {
    planKey: "ride-sim-shaft",
    plateX,
    plateZ,
    plateLocalY: SHAFT_LOCAL_Y,
    sx: 2.38,
    sy: SHAFT_SY,
    sz: 4.0,
    doorFace,
  };
}

function feetYForLayout(layout: ElevatorShaftLayout, level: number): number {
  return elevatorSupportFeetWorldY({
    buildingWorldOriginY: 0,
    levelIndex: level,
    floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
    shaftPlateLocalY: layout.plateLocalY,
    shaftSy: layout.sy,
  });
}

function car(over: Partial<ElevatorCar> & Pick<ElevatorCar, "shaftKey" | "cabFloorY">): ElevatorCar {
  return {
    shaftKey: over.shaftKey,
    currentLevel: over.currentLevel ?? 1,
    doorOpen01: over.doorOpen01 ?? 0,
    phase: over.phase ?? 0,
    moveFromLevel: over.moveFromLevel ?? 1,
    moveToLevel: over.moveToLevel ?? 1,
    moveU: over.moveU ?? 0,
    destQueue: over.destQueue ?? [],
    cabFloorY: over.cabFloorY,
    sampleServerMicros: over.sampleServerMicros ?? 0n,
    doorFace: over.doorFace ?? 0,
    plateX: over.plateX ?? 0,
    plateZ: over.plateZ ?? 0,
  };
}

function collectHits(
  auth: FpElevatorWorldCollisionAuth,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): CollisionAabb[] {
  const out: CollisionAabb[] = [];
  visitFpElevatorWorldCollisionAabbsInXZ(auth, x0, x1, z0, z1, (aabb) => out.push(aabb));
  return out;
}

function serverCabFloorY(
  layout: ElevatorShaftLayout,
  fromLevel: number,
  toLevel: number,
  elapsedMs: number,
): number {
  return predictMovingCabFeetWorldY({
    moveFromLevel: fromLevel,
    moveToLevel: toLevel,
    moveUAtReplica: 0,
    elapsedSecSinceReplica: Math.max(0, elapsedMs) * 0.001,
    feetYForLevel: (level) => feetYForLayout(layout, level),
  });
}

function landingFrontSignature(
  hits: readonly CollisionAabb[],
  layout: ElevatorShaftLayout,
  landingFeetY: number,
): string {
  const outerHx = layout.sx * 0.5;
  return hits
    .filter(
      (b) =>
        b.min[1] <= landingFeetY + 1.0 &&
        b.max[1] >= landingFeetY + 1.0 &&
        b.max[1] - b.min[1] > 1.5 &&
        b.max[0] - b.min[0] < 1.5 &&
        b.min[0] >= outerHx - 0.25,
    )
    .map((b) =>
      [b.min[0], b.max[0], b.min[2], b.max[2]]
        .map((value) => value.toFixed(3))
        .join(":"),
    )
    .sort()
    .join("|");
}

function buildRideTrace(topLevel: number, swingOpen01: number): Array<{
  level: number;
  evalMs: number;
  reference: string;
  current: string;
  predictedLanding: string;
}> {
  const shaftKey = "ride-sim-shaft";
  const layout = testLayout(0, 0, "e");
  const traces: Array<{
    level: number;
    evalMs: number;
    reference: string;
    current: string;
    predictedLanding: string;
  }> = [];

  for (let fromLevel = 1; fromLevel < topLevel; fromLevel++) {
    const toLevel = fromLevel + 1;
    const landingRow: ElevatorLandingDoor = {
      rowKey: landingExteriorDoorRowKey(shaftKey, toLevel),
      shaftKey,
      level: toLevel,
      desiredOpen: swingOpen01 >= 0.9 ? 1 : 0,
      swingOpen01,
    };
    const y0 = feetYForLayout(layout, fromLevel);
    const y1 = feetYForLayout(layout, toLevel);
    const needSec = Math.abs(y1 - y0) / ELEVATOR_MOVE_SPEED_MPS;
    const durationMs = needSec * 1000;
    const outerHz = layout.sz * 0.5;
    const queryX0 = -2;
    const queryX1 = 2;
    const queryZ0 = -outerHz;
    const queryZ1 = outerHz;

    for (let replicaMs = 0; replicaMs < durationMs; replicaMs += REPLICA_DT_MS) {
      const moveUAtReplica = Math.min(1, replicaMs / durationMs);
      const row = car({
        shaftKey,
        currentLevel: fromLevel,
        moveFromLevel: fromLevel,
        moveToLevel: toLevel,
        moveU: moveUAtReplica,
        phase: ELEVATOR_PHASE_MOVING,
        doorOpen01: 0,
        doorFace: 0,
        cabFloorY: predictMovingCabFeetWorldY({
          moveFromLevel: fromLevel,
          moveToLevel: toLevel,
          moveUAtReplica,
          elapsedSecSinceReplica: 0,
          feetYForLevel: (level) => feetYForLayout(layout, level),
        }),
      });
      const authBase: FpElevatorWorldCollisionAuth = {
        buildingOriginX: 0,
        buildingOriginZ: 0,
        maxLevel: topLevel,
        latestCars: new Map([[shaftKey, row]]),
        layoutByKey: new Map([[shaftKey, layout]]),
        landingByRowKey: new Map([[landingRow.rowKey, landingRow]]),
        feetYForLayout,
      };
      const nextReplicaMs = Math.min(durationMs, replicaMs + REPLICA_DT_MS);
      for (let evalMs = replicaMs; evalMs < nextReplicaMs; evalMs += FRAME_DT_MS) {
        const predictedCabFloorY = predictMovingCabFeetWorldY({
          moveFromLevel: fromLevel,
          moveToLevel: toLevel,
          moveUAtReplica,
          elapsedSecSinceReplica: Math.max(0, (evalMs - replicaMs) * 0.001),
          feetYForLevel: (level) => feetYForLayout(layout, level),
        });
        const reference = landingFrontSignature(
          collectHits(authBase, queryX0, queryX1, queryZ0, queryZ1),
          layout,
          y1,
        );
        const current = landingFrontSignature(
          collectHits(
            {
              ...authBase,
              getCabFloorY: () => predictedCabFloorY,
            },
            queryX0,
            queryX1,
            queryZ0,
            queryZ1,
          ),
          layout,
          y1,
        );
        const predictedLanding = landingFrontSignature(
          collectHits(
            {
              ...authBase,
              getCabFloorY: () => predictedCabFloorY,
              getLandingCollisionCabFloorY: () => predictedCabFloorY,
            },
            queryX0,
            queryX1,
            queryZ0,
            queryZ1,
          ),
          layout,
          y1,
        );
        traces.push({
          level: toLevel,
          evalMs,
          reference,
          current,
          predictedLanding,
        });
      }
    }
  }

  return traces;
}

describe("fpElevator ride simulation", () => {
  it("keeps landing-threshold collision aligned with replicated authority during a multi-floor ride", () => {
    const openTrace = buildRideTrace(8, 1);
    const closedTrace = buildRideTrace(8, 0);
    const currentMismatches = [...openTrace, ...closedTrace].filter(
      (sample) => sample.current !== sample.reference,
    );
    expect(currentMismatches).toHaveLength(0);
  });

  it("keeps cab prediction aligned under realistic replica latency when replay uses server sample time", () => {
    const layout = testLayout(0, 0, "e");

    const simulateLatency = (
      latencyMs: number,
    ): { receiveAnchoredMaxError: number; serverAlignedMaxError: number } => {
      let receiveAnchoredMaxError = 0;
      let serverAlignedMaxError = 0;
      for (let fromLevel = 1; fromLevel < 8; fromLevel++) {
        const toLevel = fromLevel + 1;
        const y0 = feetYForLayout(layout, fromLevel);
        const y1 = feetYForLayout(layout, toLevel);
        const durationMs = (Math.abs(y1 - y0) / ELEVATOR_MOVE_SPEED_MPS) * 1000;
        const history: FpElevatorCarReplicaSample[] = [];
        let nextReplicaMs = 0;
        for (
          let evalMs = 0;
          evalMs <= durationMs + latencyMs + REPLICA_DT_MS;
          evalMs += FRAME_DT_MS
        ) {
          while (nextReplicaMs <= durationMs && nextReplicaMs + latencyMs <= evalMs + 1e-6) {
            const moveU = Math.min(1, nextReplicaMs / durationMs);
            const prev = history[history.length - 1];
            history.push(
              nextElevatorCarReplicaSample(
                prev,
                car({
                  shaftKey: "ride-sim-shaft",
                  currentLevel: fromLevel,
                  moveFromLevel: fromLevel,
                  moveToLevel: toLevel,
                  moveU,
                  phase: ELEVATOR_PHASE_MOVING,
                  doorOpen01: 0,
                  sampleServerMicros: BigInt(Math.round(nextReplicaMs * 1000)),
                  cabFloorY: serverCabFloorY(layout, fromLevel, toLevel, nextReplicaMs),
                }),
                nextReplicaMs + latencyMs,
              ),
            );
            pruneElevatorCarReplicaHistory(history, nextReplicaMs + latencyMs);
            nextReplicaMs += REPLICA_DT_MS;
          }
          const authoritative = serverCabFloorY(layout, fromLevel, toLevel, Math.min(evalMs, durationMs));
          const sample = selectElevatorCarReplicaSample(history, evalMs);
          if (!sample) continue;
          const receiveAnchored = predictMovingCabFeetWorldY({
            moveFromLevel: sample.row.moveFromLevel,
            moveToLevel: sample.row.moveToLevel,
            moveUAtReplica: sample.row.moveU,
            elapsedSecSinceReplica: Math.max(0, evalMs - sample.receivedAtMs) * 0.001,
            feetYForLevel: (level) => feetYForLayout(layout, level),
          });
          const serverAligned = predictMovingCabFeetWorldY({
            moveFromLevel: sample.row.moveFromLevel,
            moveToLevel: sample.row.moveToLevel,
            moveUAtReplica: sample.row.moveU,
            elapsedSecSinceReplica:
              Math.max(0, evalMs - Number(sample.row.sampleServerMicros) * 0.001) * 0.001,
            feetYForLevel: (level) => feetYForLayout(layout, level),
          });
          receiveAnchoredMaxError = Math.max(
            receiveAnchoredMaxError,
            Math.abs(receiveAnchored - authoritative),
          );
          serverAlignedMaxError = Math.max(
            serverAlignedMaxError,
            Math.abs(serverAligned - authoritative),
          );
        }
      }
      return { receiveAnchoredMaxError, serverAlignedMaxError };
    };

    const zeroLatency = simulateLatency(0);
    const realisticLatency = simulateLatency(40);

    expect(zeroLatency.serverAlignedMaxError).toBeLessThan(0.01);
    expect(realisticLatency.receiveAnchoredMaxError).toBeGreaterThan(0.08);
    expect(realisticLatency.serverAlignedMaxError).toBeLessThan(0.01);
  });

  it("stays aligned with authoritative cab position under client↔server wall-clock skew", () => {
    const layout = testLayout(0, 0, "e");
    // Physical time is the simulation's ground truth; CLIENT_EPOCH_ORIGIN_MS and
    // SERVER_EPOCH_ORIGIN_MS differ to simulate the client's wall clock running 350 ms ahead of
    // the server's (a common NTP-drift profile).
    const SERVER_EPOCH_ORIGIN_MS = 1_700_000_000_000;
    const CLIENT_EPOCH_ORIGIN_MS = SERVER_EPOCH_ORIGIN_MS + 350;
    const MIN_LATENCY_MS = 6;

    const simulate = (latencyJitterMs: (sampleIndex: number) => number) => {
      const clock = createFpElevatorServerClock();
      let naiveMaxError = 0;
      let estimatorMaxError = 0;
      let sampleIndex = 0;

      for (let fromLevel = 1; fromLevel < 8; fromLevel++) {
        const toLevel = fromLevel + 1;
        const y0 = feetYForLayout(layout, fromLevel);
        const y1 = feetYForLayout(layout, toLevel);
        const durationMs = (Math.abs(y1 - y0) / ELEVATOR_MOVE_SPEED_MPS) * 1000;

        const history: FpElevatorCarReplicaSample[] = [];
        let nextServerReplicaMs = 0;
        const START_PHYSICAL_MS = 500 * fromLevel; // each floor starts at a different physical time

        for (
          let physicalNowMs = START_PHYSICAL_MS;
          physicalNowMs <= START_PHYSICAL_MS + durationMs + 200;
          physicalNowMs += FRAME_DT_MS
        ) {
          const clientEpochNow = CLIENT_EPOCH_ORIGIN_MS + physicalNowMs;

          while (nextServerReplicaMs <= durationMs) {
            const physicalSendMs = START_PHYSICAL_MS + nextServerReplicaMs;
            const latency = latencyJitterMs(sampleIndex);
            const physicalArriveMs = physicalSendMs + latency;
            if (physicalArriveMs > physicalNowMs + 1e-6) break;

            const moveU = Math.min(1, nextServerReplicaMs / durationMs);
            const serverStampEpochMs = SERVER_EPOCH_ORIGIN_MS + physicalSendMs;
            const clientReceiveEpochMs = CLIENT_EPOCH_ORIGIN_MS + physicalArriveMs;
            const prev = history[history.length - 1];
            history.push(
              nextElevatorCarReplicaSample(
                prev,
                car({
                  shaftKey: "ride-sim-shaft",
                  currentLevel: fromLevel,
                  moveFromLevel: fromLevel,
                  moveToLevel: toLevel,
                  moveU,
                  phase: ELEVATOR_PHASE_MOVING,
                  doorOpen01: 0,
                  sampleServerMicros: BigInt(Math.round(serverStampEpochMs * 1000)),
                  cabFloorY: serverCabFloorY(layout, fromLevel, toLevel, nextServerReplicaMs),
                }),
                physicalArriveMs,
              ),
            );
            pruneElevatorCarReplicaHistory(history, physicalArriveMs);
            clock.observe(clientReceiveEpochMs, serverStampEpochMs);
            nextServerReplicaMs += REPLICA_DT_MS;
            sampleIndex++;
          }

          const sample = selectElevatorCarReplicaSample(history, physicalNowMs);
          if (!sample) continue;

          // Only compare while the authoritative cab is still moving; once docked the replica
          // carries the final `cabFloorY` which the client reads directly, not through these
          // prediction paths.
          const rideElapsedMs = physicalNowMs - START_PHYSICAL_MS;
          if (rideElapsedMs >= durationMs) continue;
          const authoritative = serverCabFloorY(layout, fromLevel, toLevel, rideElapsedMs);

          const sampleServerEpochMs = Number(sample.row.sampleServerMicros) / 1000;

          // Naive: client assumes its epoch matches the server's (pre-estimator behaviour).
          const naiveElapsedSec = Math.max(0, clientEpochNow - sampleServerEpochMs) * 0.001;
          const naive = predictMovingCabFeetWorldY({
            moveFromLevel: sample.row.moveFromLevel,
            moveToLevel: sample.row.moveToLevel,
            moveUAtReplica: sample.row.moveU,
            elapsedSecSinceReplica: naiveElapsedSec,
            feetYForLevel: (level) => feetYForLayout(layout, level),
          });

          // Estimator: map client epoch → server epoch through observed offset.
          const estimatorServerNow = clock.estimatedServerEpochMs(clientEpochNow);
          const estimatorElapsedSec = Math.max(0, (estimatorServerNow - sampleServerEpochMs) * 0.001);
          const estimator = predictMovingCabFeetWorldY({
            moveFromLevel: sample.row.moveFromLevel,
            moveToLevel: sample.row.moveToLevel,
            moveUAtReplica: sample.row.moveU,
            elapsedSecSinceReplica: estimatorElapsedSec,
            feetYForLevel: (level) => feetYForLayout(layout, level),
          });

          naiveMaxError = Math.max(naiveMaxError, Math.abs(naive - authoritative));
          estimatorMaxError = Math.max(estimatorMaxError, Math.abs(estimator - authoritative));
        }
      }

      return { naiveMaxError, estimatorMaxError, estimatedOffsetMs: clock.estimatedOffsetMs() };
    };

    // One-way latency in [6, 22] ms.
    const result = simulate((i) => MIN_LATENCY_MS + (i % 5) * 4);
    // Naive bakes in the 350 ms skew: elapsed is inflated by the full offset, so the cab races
    // ~350 ms * 3 m/s ≈ 1 m ahead of the authoritative position.
    expect(result.naiveMaxError).toBeGreaterThan(0.8);
    // Estimator-aligned prediction is bounded by (min_latency * speed) ≈ 2 cm.
    expect(result.estimatorMaxError).toBeLessThan(0.03);
    // Estimator should recover the true skew within min-one-way-latency.
    expect(result.estimatedOffsetMs).toBeGreaterThanOrEqual(350 + MIN_LATENCY_MS - 1);
    expect(result.estimatedOffsetMs).toBeLessThanOrEqual(350 + MIN_LATENCY_MS + 1);
  });
});
