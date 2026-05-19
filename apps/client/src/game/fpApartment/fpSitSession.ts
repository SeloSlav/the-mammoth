import type { ApartmentSittableMode } from "@the-mammoth/schemas";

export type FpSitSession = {
  active: true;
  sittableKey: string;
  unitKey: string;
  mode: ApartmentSittableMode;
  /** Feet world position when sit started — restored every frame until stand. */
  standFeet: { x: number; y: number; z: number };
  bodyYawRad: number;
  eyeHeightM: number;
};

let session: FpSitSession | null = null;

export function isFpSitActive(): boolean {
  return session !== null;
}

export function getFpSitSession(): FpSitSession | null {
  return session;
}

export function enterFpSit(next: FpSitSession): void {
  session = next;
}

export function exitFpSit(): void {
  session = null;
}

export function fpSitBlocksLocomotion(): boolean {
  return session !== null;
}

/** Returns true when a movement key edge should end the sit session. */
export function fpSitConsumeWasdExit(keys: Set<string>): boolean {
  if (!session) return false;
  const moving =
    keys.has("KeyW") || keys.has("KeyS") || keys.has("KeyA") || keys.has("KeyD");
  if (!moving) return false;
  session = null;
  return true;
}
