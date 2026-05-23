let active = false;

export function setFpCombatSimMode(enabled: boolean): void {
  active = enabled;
}

export function isFpCombatSimMode(): boolean {
  return active;
}
