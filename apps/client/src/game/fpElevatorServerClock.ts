/**
 * Tracks the apparent offset between the client's wall clock and the server's wall clock by
 * observing `ElevatorCar` replica arrivals.
 *
 * The server stamps every `ElevatorCar` row with `sample_server_micros` at the moment its physics
 * tick ran.  When the client receives that row at local epoch time `R`, the observed offset
 * `R - T = (client_epoch - server_epoch) + one_way_latency`.  Taking the minimum observed offset
 * over a rolling window approximates `client_epoch - server_epoch` (latency floor is the fastest
 * packet in the window), giving a stable, smoothly-drifting estimate independent of jitter.
 *
 * We use this to convert a client epoch time into the corresponding server epoch time, so elevator
 * prediction elapsed-time matches the server's physics clock even when the two wall clocks
 * disagree by hundreds of milliseconds (NTP skew, tab throttling, etc.).
 *
 * Per-frame cost is O(1) amortised: a single new observation, with stale samples dropped from the
 * front of the ring buffer.  Re-scan of the window only runs when the current-minimum sample
 * expires, not on every observation.
 */

const DEFAULT_WINDOW_MS = 8_000;

type ClockSample = {
  /** `client_epoch - server_epoch` at the moment this row arrived (ms). */
  offsetMs: number;
  /** Client epoch time at which the sample was observed (ms). */
  observedAtEpochMs: number;
};

export type FpElevatorServerClock = {
  /**
   * Record a new server-sampled observation.
   * @param clientReceiveEpochMs Client epoch time the replica was ingested.
   * @param serverSampleEpochMs  Server epoch time the replica was stamped at.
   */
  observe(clientReceiveEpochMs: number, serverSampleEpochMs: number): void;
  /** True once at least one sample has been observed. */
  hasEstimate(): boolean;
  /**
   * Current best estimate of `client_epoch - server_epoch`, in milliseconds.
   * Returns 0 before the first observation.
   */
  estimatedOffsetMs(): number;
  /** Map a client epoch time to the corresponding server epoch time. */
  estimatedServerEpochMs(clientEpochMs: number): number;
  /** Test/inspection hook — returns a copy of the current window samples. */
  _samplesForTest(): readonly ClockSample[];
};

export type CreateFpElevatorServerClockOpts = {
  /** Rolling window for min-offset tracking (ms).  Defaults to 8_000 ms. */
  windowMs?: number;
};

export function createFpElevatorServerClock(
  opts: CreateFpElevatorServerClockOpts = {},
): FpElevatorServerClock {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const samples: ClockSample[] = [];
  let minOffsetMs = Number.POSITIVE_INFINITY;
  let minOffsetIndex = -1;

  const recomputeMin = () => {
    minOffsetMs = Number.POSITIVE_INFINITY;
    minOffsetIndex = -1;
    for (let i = 0; i < samples.length; i++) {
      const offset = samples[i]!.offsetMs;
      if (offset < minOffsetMs) {
        minOffsetMs = offset;
        minOffsetIndex = i;
      }
    }
  };

  const observe = (clientReceiveEpochMs: number, serverSampleEpochMs: number): void => {
    if (!Number.isFinite(clientReceiveEpochMs) || !Number.isFinite(serverSampleEpochMs)) return;
    const offsetMs = clientReceiveEpochMs - serverSampleEpochMs;
    samples.push({ offsetMs, observedAtEpochMs: clientReceiveEpochMs });

    const cutoffEpochMs = clientReceiveEpochMs - windowMs;
    let dropCount = 0;
    while (dropCount < samples.length && samples[dropCount]!.observedAtEpochMs < cutoffEpochMs) {
      dropCount++;
    }
    if (dropCount > 0) {
      samples.splice(0, dropCount);
      minOffsetIndex -= dropCount;
      if (minOffsetIndex < 0) {
        recomputeMin();
        return;
      }
    }

    if (offsetMs < minOffsetMs) {
      minOffsetMs = offsetMs;
      minOffsetIndex = samples.length - 1;
    }
  };

  const hasEstimate = () => Number.isFinite(minOffsetMs);

  const estimatedOffsetMs = () => (hasEstimate() ? minOffsetMs : 0);

  const estimatedServerEpochMs = (clientEpochMs: number): number => {
    if (!hasEstimate()) return clientEpochMs;
    return clientEpochMs - minOffsetMs;
  };

  return {
    observe,
    hasEstimate,
    estimatedOffsetMs,
    estimatedServerEpochMs,
    _samplesForTest: () => samples.slice(),
  };
}
