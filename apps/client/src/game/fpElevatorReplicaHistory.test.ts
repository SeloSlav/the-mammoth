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
  doorFace: 0,
  plateX: 0,
  plateZ: 0,
  ...overrides,
});

describe("nextElevatorCarReplicaSample", () => {
  it("pins move replica time to the sample that changed cab motion", () => {
    const first = nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.2 }), 1000);
    const sameMotion = nextElevatorCarReplicaSample(first, makeRow({ moveU: 0.2 }), 1025);
    const progressed = nextElevatorCarReplicaSample(sameMotion, makeRow({ moveU: 0.35 }), 1050);

    expect(first.moveReplicaAtMs).toBe(1000);
    expect(sameMotion.moveReplicaAtMs).toBe(1000);
    expect(progressed.moveReplicaAtMs).toBe(1050);
  });

  it("clears move timing once the car is no longer moving", () => {
    const moving = nextElevatorCarReplicaSample(undefined, makeRow({ moveU: 0.8 }), 1000);
    const arrived = nextElevatorCarReplicaSample(
      moving,
      makeRow({ phase: 1, moveU: 1, cabFloorY: 30 }),
      1100,
    );

    expect(arrived.moveReplicaAtMs).toBeUndefined();
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
