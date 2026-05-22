import type { ApartmentSittableMode } from "@the-mammoth/schemas";
import { OWNED_APARTMENT_MODEL_BED } from "@the-mammoth/schemas";

export type FpSitSession = {
  active: true;
  sittableKey: string;
  unitKey: string;
  modelRelPath: string;
  mode: ApartmentSittableMode;
  /** Locked feet while seated/lying (seat anchor). */
  anchorFeet: { x: number; y: number; z: number };
  /** Feet when sit started — restored on stand. */
  exitFeet: { x: number; y: number; z: number };
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

export function fpSitSessionIsOnBed(): boolean {
  return session?.mode === "lie" && session.modelRelPath === OWNED_APARTMENT_MODEL_BED;
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
