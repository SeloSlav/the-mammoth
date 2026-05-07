/**
 * Guest “save slots”: each slot holds the Spacetime anonymous WS token + cached roster name.
 * Migrates legacy single-key storage (`guestConnectionToken` / last-display-name keys).
 */

export const MAX_GUEST_SAVE_SLOTS = 5;

const REGISTRY_KEY = "mammoth_guest_save_registry_v1";

/** Legacy keys — removed after successful migration into {@link REGISTRY_KEY}. */
export const LEGACY_GUEST_WS_TOKEN_KEY = "mammoth_stdb_guest_ws_token";
export const LEGACY_GUEST_LAST_DISPLAY_NAME_KEY = "mammoth_stdb_guest_last_display_name";

export type GuestSaveSlot = {
  id: string;
  wsToken: string;
  cachedDisplayName: string | null;
  updatedAtMs: number;
};

export type GuestSaveRegistryV1 = {
  version: 1;
  activeSlotId: string | null;
  slots: GuestSaveSlot[];
};

export type GuestSaveSlotSummary = Pick<GuestSaveSlot, "id" | "cachedDisplayName" | "updatedAtMs">;

function newSlotId(): string {
  return crypto.randomUUID();
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function parseRegistryV1(raw: unknown): GuestSaveRegistryV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.slots)) return null;
  const slots: GuestSaveSlot[] = [];
  for (const row of o.slots) {
    if (!row || typeof row !== "object") return null;
    const s = row as Record<string, unknown>;
    if (!isNonEmptyString(s.id) || !isNonEmptyString(s.wsToken)) return null;
    const nameRaw = s.cachedDisplayName;
    const cachedDisplayName =
      nameRaw === null || nameRaw === undefined
        ? null
        : typeof nameRaw === "string" && nameRaw.trim().length > 0
          ? nameRaw.trim()
          : null;
    const updatedAtMs =
      typeof s.updatedAtMs === "number" && Number.isFinite(s.updatedAtMs) ? s.updatedAtMs : Date.now();
    slots.push({
      id: s.id.trim(),
      wsToken: s.wsToken.trim(),
      cachedDisplayName,
      updatedAtMs,
    });
  }
  const activeRaw = o.activeSlotId;
  const activeSlotId =
    activeRaw === null || activeRaw === undefined
      ? null
      : typeof activeRaw === "string" && activeRaw.trim().length > 0
        ? activeRaw.trim()
        : null;
  if (activeSlotId !== null && !slots.some((sl) => sl.id === activeSlotId)) return null;
  return { version: 1, activeSlotId, slots };
}

function readRawJson(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRawJson(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / privacy mode */
  }
}

function removeStorageKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function createEmptyGuestRegistry(): GuestSaveRegistryV1 {
  return { version: 1, activeSlotId: null, slots: [] };
}

/** Pure migration helper — covered by unit tests. */
export function mergeLegacyIntoGuestRegistry(
  parsed: GuestSaveRegistryV1 | null,
  legacyToken: string | null,
  legacyDisplayName: string | null,
): GuestSaveRegistryV1 {
  const token = legacyToken?.trim() ?? "";
  if (parsed && parsed.slots.length > 0) {
    return parsed;
  }
  if (!token) {
    return parsed ?? createEmptyGuestRegistry();
  }
  const id = newSlotId();
  const hint = legacyDisplayName?.trim() ?? "";
  return {
    version: 1,
    activeSlotId: id,
    slots: [
      {
        id,
        wsToken: token,
        cachedDisplayName: hint.length > 0 ? hint : null,
        updatedAtMs: Date.now(),
      },
    ],
  };
}

export function readGuestSaveRegistry(): GuestSaveRegistryV1 {
  if (typeof window === "undefined") return createEmptyGuestRegistry();
  const rawReg = readRawJson(REGISTRY_KEY);
  let parsed: GuestSaveRegistryV1 | null = null;
  if (rawReg) {
    try {
      parsed = parseRegistryV1(JSON.parse(rawReg));
    } catch {
      parsed = null;
    }
  }
  const legacyToken = readRawJson(LEGACY_GUEST_WS_TOKEN_KEY);
  const legacyName = readRawJson(LEGACY_GUEST_LAST_DISPLAY_NAME_KEY);
  const merged = mergeLegacyIntoGuestRegistry(parsed, legacyToken, legacyName);
  if (JSON.stringify(parsed) !== JSON.stringify(merged)) {
    writeGuestSaveRegistry(merged);
  }
  /** Legacy keys are obsolete once any v1 registry exists with data (including post-migration). */
  if (legacyToken?.trim() && merged.slots.length > 0) {
    removeStorageKey(LEGACY_GUEST_WS_TOKEN_KEY);
    removeStorageKey(LEGACY_GUEST_LAST_DISPLAY_NAME_KEY);
  }
  return merged;
}

export function writeGuestSaveRegistry(reg: GuestSaveRegistryV1): void {
  if (typeof window === "undefined") return;
  try {
    writeRawJson(REGISTRY_KEY, JSON.stringify(reg));
  } catch {
    /* ignore */
  }
}

export function guestSaveSummariesSorted(reg: GuestSaveRegistryV1): GuestSaveSlotSummary[] {
  return [...reg.slots]
    .map(({ id, cachedDisplayName, updatedAtMs }) => ({ id, cachedDisplayName, updatedAtMs }))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function getActiveGuestWsToken(reg: GuestSaveRegistryV1): string | null {
  if (!reg.activeSlotId) return null;
  const slot = reg.slots.find((s) => s.id === reg.activeSlotId);
  return slot?.wsToken ?? null;
}

export function persistGuestWsTokenAfterConnect(wsToken: string): void {
  const t = wsToken.trim();
  if (!t) return;
  const reg = readGuestSaveRegistry();
  const now = Date.now();
  let next: GuestSaveRegistryV1;

  if (!reg.activeSlotId) {
    if (reg.slots.length >= MAX_GUEST_SAVE_SLOTS) {
      console.error("[guest saves] cannot create slot: max saves reached");
      return;
    }
    const id = newSlotId();
    next = {
      ...reg,
      activeSlotId: id,
      slots: [...reg.slots, { id, wsToken: t, cachedDisplayName: null, updatedAtMs: now }],
    };
    writeGuestSaveRegistry(next);
    return;
  }

  const idx = reg.slots.findIndex((s) => s.id === reg.activeSlotId);
  if (idx < 0) {
    if (reg.slots.length >= MAX_GUEST_SAVE_SLOTS) {
      console.error("[guest saves] active slot missing and registry full — reset active slot");
      writeGuestSaveRegistry({ ...reg, activeSlotId: null });
      return;
    }
    const id = newSlotId();
    next = {
      ...reg,
      activeSlotId: id,
      slots: [...reg.slots, { id, wsToken: t, cachedDisplayName: null, updatedAtMs: now }],
    };
    writeGuestSaveRegistry(next);
    return;
  }

  const slots = reg.slots.slice();
  const prev = slots[idx]!;
  slots[idx] = {
    id: prev.id,
    wsToken: t,
    cachedDisplayName: prev.cachedDisplayName,
    updatedAtMs: now,
  };
  next = { ...reg, slots };
  writeGuestSaveRegistry(next);
}

/** Next anonymous handshake mints a new slot once the server returns a token. */
export function prepareFreshGuestSaveSlot(): void {
  const reg = readGuestSaveRegistry();
  writeGuestSaveRegistry({ ...reg, activeSlotId: null });
}

export function selectGuestSaveSlot(slotId: string): void {
  const reg = readGuestSaveRegistry();
  const found = reg.slots.some((s) => s.id === slotId);
  if (!found) return;
  writeGuestSaveRegistry({ ...reg, activeSlotId: slotId });
}

export function deleteGuestSaveSlot(slotId: string): void {
  const reg = readGuestSaveRegistry();
  const slots = reg.slots.filter((s) => s.id !== slotId);
  let activeSlotId = reg.activeSlotId;
  if (activeSlotId === slotId) {
    activeSlotId = slots[0]?.id ?? null;
  }
  writeGuestSaveRegistry({ ...reg, slots, activeSlotId });
}

export function updateActiveGuestCachedDisplayName(name: string | null): void {
  const reg = readGuestSaveRegistry();
  if (!reg.activeSlotId) return;
  const slots = reg.slots.map((s) => {
    if (s.id !== reg.activeSlotId) return s;
    const trimmed = name?.trim() ?? "";
    return {
      ...s,
      cachedDisplayName: trimmed.length > 0 ? trimmed : null,
      updatedAtMs: Date.now(),
    };
  });
  writeGuestSaveRegistry({ ...reg, slots });
}

export function readActiveGuestCachedDisplayName(): string | null {
  const reg = readGuestSaveRegistry();
  if (!reg.activeSlotId) return null;
  const slot = reg.slots.find((s) => s.id === reg.activeSlotId);
  const n = slot?.cachedDisplayName?.trim() ?? "";
  return n.length > 0 ? n : null;
}
