/** RAF-local baseline so the wardrobe claim bar advances at wall-clock rate while E is held. */
export type ApartmentClaimHoldSmooth = {
  unitKey: string;
  serverSecsAtHoldStart: number;
  wallMsAtHoldStart: number;
};

/**
 * Display progress plus next RAF carry state. While {@link eligible} holds, extrapolates from the
 * server snapshot taken when the hold began or resynced; never dips below {@link serverSecs}.
 */
export function computeOptimisticClaimProgressSecs(opts: {
  fullSecs: number;
  unitKey: string;
  serverSecs: number;
  nowMs: number;
  eligible: boolean;
  prevSmooth: ApartmentClaimHoldSmooth | null;
}): { displaySecs: number; nextSmooth: ApartmentClaimHoldSmooth | null } {
  const { fullSecs, unitKey, serverSecs, nowMs, eligible, prevSmooth } = opts;

  if (!eligible) {
    return { displaySecs: Math.min(fullSecs, serverSecs), nextSmooth: null };
  }

  const needFreshBaseline = prevSmooth === null || prevSmooth.unitKey !== unitKey;
  const nextSmooth: ApartmentClaimHoldSmooth = needFreshBaseline
    ? { unitKey, serverSecsAtHoldStart: serverSecs, wallMsAtHoldStart: nowMs }
    : prevSmooth;

  const wallSecsElapsed = (nowMs - nextSmooth.wallMsAtHoldStart) / 1000;
  const extrapolated = Math.min(fullSecs, nextSmooth.serverSecsAtHoldStart + wallSecsElapsed);
  const displaySecs = Math.min(fullSecs, Math.max(serverSecs, extrapolated));
  return { displaySecs, nextSmooth };
}
