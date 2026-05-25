import {
  displayDayNumber,
  formatGameTimeHhMm,
  GAME_MINUTES_PER_REAL_SECOND,
  GAME_MINUTES_PER_TICK,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";

export type GameTimeDisplayState = {
  timeOfDayMinutes: number;
  sleepsCount: number;
  serverSyncedAtMs: number;
};

let state: GameTimeDisplayState = {
  timeOfDayMinutes: 360,
  sleepsCount: 0,
  serverSyncedAtMs: 0,
};

let version = 0;
const listeners = new Set<() => void>();

export function getGameTimeDisplayState(): Readonly<GameTimeDisplayState> {
  return state;
}

export function getGameTimeDisplayVersion(): number {
  return version;
}

export function subscribeGameTimeDisplay(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  version += 1;
  for (const l of listeners) l();
}

/** Apply authoritative row from SpacetimeDB subscription. */
export function syncGameTimeFromServer(
  row: {
    timeOfDayMinutes: number;
    sleepsCount: number;
  },
  syncedAtMs = performance.now(),
): void {
  const nowMs = syncedAtMs;
  const prev = state;
  const displayedMinutes = interpolatedGameTimeMinutes(nowMs);

  const dayRollover = row.sleepsCount !== prev.sleepsCount;
  const largeBackwardJump =
    row.timeOfDayMinutes + 60 < displayedMinutes &&
    row.timeOfDayMinutes < prev.timeOfDayMinutes;

  let nextMinutes: number;
  if (dayRollover || largeBackwardJump) {
    nextMinutes = row.timeOfDayMinutes;
  } else if (row.timeOfDayMinutes >= prev.timeOfDayMinutes - 0.001) {
    nextMinutes = Math.max(row.timeOfDayMinutes, displayedMinutes);
  } else {
    nextMinutes = row.timeOfDayMinutes;
  }

  state = {
    timeOfDayMinutes: nextMinutes,
    sleepsCount: row.sleepsCount,
    serverSyncedAtMs: nowMs,
  };
  notify();
}

/** Interpolated minutes for HUD between server ticks. */
export function interpolatedGameTimeMinutes(nowMs = performance.now()): number {
  const elapsedRealSec = Math.max(0, (nowMs - state.serverSyncedAtMs) / 1000);
  const gameMinutes = state.timeOfDayMinutes + elapsedRealSec * GAME_MINUTES_PER_REAL_SECOND;
  return gameMinutes;
}

export function displayGameClock(nowMs = performance.now()): {
  day: number;
  hhmm: string;
} {
  return {
    day: displayDayNumber(state.sleepsCount),
    hhmm: formatGameTimeHhMm(interpolatedGameTimeMinutes(nowMs)),
  };
}

/** Expected server tick advance for tests. */
export function gameMinutesPerServerTick(): number {
  return GAME_MINUTES_PER_TICK;
}

/** Session-level subscription — independent of React HUD mount. */
export function mountGameTimeDisplaySync(conn: DbConnection): () => void {
  const syncFromDb = () => {
    const id = conn.identity;
    if (!id) return;
    const row = conn.db.player_world_progress.identity.find(id);
    if (!row) return;
    syncGameTimeFromServer({
      timeOfDayMinutes: row.timeOfDayMinutes,
      sleepsCount: row.sleepsCount,
    });
  };

  syncFromDb();
  conn.db.player_world_progress.onInsert(syncFromDb);
  conn.db.player_world_progress.onUpdate(syncFromDb);
  conn.db.player_world_progress.onDelete(syncFromDb);
  return () => {
    conn.db.player_world_progress.removeOnInsert(syncFromDb);
    conn.db.player_world_progress.removeOnUpdate(syncFromDb);
    conn.db.player_world_progress.removeOnDelete(syncFromDb);
  };
}

export function resetGameTimeDisplayForTests(): void {
  state = {
    timeOfDayMinutes: 360,
    sleepsCount: 0,
    serverSyncedAtMs: 0,
  };
  version = 0;
  listeners.clear();
}
