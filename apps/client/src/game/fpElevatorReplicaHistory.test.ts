import { describe, expect, it } from "vitest";
import type { ElevatorCar } from "../module_bindings/types";
import { ELEVATOR_PHASE_MOVING } from "./fpElevatorConstants.js";
import {
  nextElevatorCarReplicaSample,
  pruneElevatorCarReplicaHistory,
  selectElevatorCarReplicaSample,
} from "./fpElevatorReplicaHistory.js";

const makeRow = (overrides: Partial<ElevatorCar> = {}): ElevatorCar => ({
  shaftKey: "mam-1",
  currentLevel: 1,
  doorOpen01: 0,
  phase: ELEVATOR_PHASE_MOVING,
  moveFromLevel: 1,
  moveToLevel: 3,
  moveU: 0,
  destQueue: [],
  cabFloorY: 10,
  sampleServerMicros: 0n,
  doorFace: 0,
  plateX: 0,
  plateZ: 0,
  ...overrides,
});

describe("nextElevatorCarReplicaSample", () => {
  it("tracks the local receive time for history selection", () => {
    const sample = nextElevatorCarReplicaSample(
      undefined,
      makeRow({ moveU: 0.2, sampleServerMicros: 2_000_000n }),
      1000,
    );

    expect(sample.receivedAtMs).toBe(1000);
    expect(sample.row.sampleServerMicros).toBe(2_000_000n);
  });
});

describe("selectElevatorCarReplicaSample", () => {
  it("reuses the latest sample at or before the replay clock", () => {
    const history = [
      nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.1 }), 1000),
      nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.2 }), 1050),
      nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.3 }), 1100),
    ];

    expect(selectElevatorCarReplicaSample(history, 1040)?.row.moveU).toBe(0.1);
    expect(selectElevatorCarReplicaSample(history, 1050)?.row.moveU).toBe(0.2);
    expect(selectElevatorCarReplicaSample(history, 2000)?.row.moveU).toBe(0.3);
  });

  it("falls back to the earliest sample for pre-history replay", () => {
    const history = [nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.4 }), 1000)];

    expect(selectElevatorCarReplicaSample(history, 900)?.row.moveU).toBe(0.4);
  });
});

describe("pruneElevatorCarReplicaHistory", () => {
  it("keeps the last sample before the retention cutoff", () => {
    const history = [
      nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.1 }), 1000),
      nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.2 }), 2000),
      nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.3 }), 3000),
    ];

    pruneElevatorCarReplicaHistory(history, 7000, 3500);

    expect(history.map((sample) => sample.receivedAtMs)).toEqual([3000]);
  });
});
