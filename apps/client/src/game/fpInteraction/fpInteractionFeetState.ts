/** Last FP interaction feet position — updated each RAF frame for HUD stash validation. */

export type FpInteractionFeet = { x: number; y: number; z: number };

let feet: FpInteractionFeet = { x: 0, y: 0, z: 0 };

export function publishFpInteractionFeet(next: FpInteractionFeet): void {
  feet = next;
}

export function getFpInteractionFeetSnapshot(): FpInteractionFeet {
  return feet;
}
