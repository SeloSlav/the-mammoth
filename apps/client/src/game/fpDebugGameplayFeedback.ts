/**
 * Session-only gameplay feedback toggles (M debug menu). All default ON (normal UX).
 * Turn a feedback channel OFF to isolate perf impact during playtests.
 */

export type FpDebugGameplayFeedbackFlags = {
  /** Red vignette on hunger/thirst health-drain ticks (~<1 HP / server vitals step). */
  starvationDamageFlashes: boolean;
  /** Authoritative NPC body/head AABBs + BODY/HEADSHOT flash labels (combat sim). */
  npcHitDebugVolumes: boolean;
  /** Standing + crouch detection radius rings around babushkas. */
  npcDetectionRadiusDebug: boolean;
  /** Forward vision cone wedge out to aggro range. */
  npcVisionConeDebug: boolean;
};

export type FpDebugGameplayFeedbackKey = keyof FpDebugGameplayFeedbackFlags;

const ALL_ON: FpDebugGameplayFeedbackFlags = {
  starvationDamageFlashes: true,
  npcHitDebugVolumes: false,
  npcDetectionRadiusDebug: false,
  npcVisionConeDebug: false,
};

const listeners = new Set<() => void>();

let flags: FpDebugGameplayFeedbackFlags = { ...ALL_ON };

export function getFpDebugGameplayFeedbackFlags(): Readonly<FpDebugGameplayFeedbackFlags> {
  return flags;
}

export function isFpDebugGameplayFeedbackEnabled(key: FpDebugGameplayFeedbackKey): boolean {
  return flags[key];
}

export function subscribeFpDebugGameplayFeedback(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  for (const l of listeners) l();
}

export function setFpDebugGameplayFeedbackFlag(
  key: FpDebugGameplayFeedbackKey,
  enabled: boolean,
): void {
  if (flags[key] === enabled) return;
  flags = { ...flags, [key]: enabled };
  notify();
}

export function resetFpDebugGameplayFeedbackFlags(): void {
  flags = { ...ALL_ON };
  notify();
}
