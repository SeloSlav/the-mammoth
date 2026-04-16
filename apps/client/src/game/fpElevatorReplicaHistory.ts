import type { ElevatorCar } from "../module_bindings/types";

export const ELEVATOR_REPLICA_HISTORY_MS = 5_000;

export type FpElevatorCarReplicaSample = {
  row: ElevatorCar;
  receivedAtMs: number;
};

export function nextElevatorCarReplicaSample(
  _prev: FpElevatorCarReplicaSample | undefined,
  row: ElevatorCar,
  receivedAtMs: number,
): FpElevatorCarReplicaSample {
  return {
    row,
    receivedAtMs,
  };
}

export function pruneElevatorCarReplicaHistory(
  history: FpElevatorCarReplicaSample[],
  nowMs: number,
  retainMs = ELEVATOR_REPLICA_HISTORY_MS,
): void {
  const cutoffMs = nowMs - retainMs;
  let dropCount = 0;
  while (dropCount + 1 < history.length && history[dropCount]!.receivedAtMs < cutoffMs) {
    dropCount++;
  }
  if (dropCount > 0) {
    history.splice(0, dropCount);
  }
}

export function selectElevatorCarReplicaSample(
  history: readonly FpElevatorCarReplicaSample[],
  evalWallClockMs: number,
): FpElevatorCarReplicaSample | null {
  if (history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const sample = history[i]!;
    if (sample.receivedAtMs <= evalWallClockMs) {
      return sample;
    }
  }
  return history[0]!;
}
