export type ApartmentShellLightingLayoutItem = {
  modelRelPath: string;
  x: number;
  y: number;
  z: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
};

/** Stable hash input for one unit's decor layout (world poses, sorted by model + position). */
export function apartmentShellLightingLayoutHashInput(args: {
  unitKey: string;
  items: readonly ApartmentShellLightingLayoutItem[];
}): string {
  const sorted = [...args.items].sort((a, b) => {
    const mk = a.modelRelPath.localeCompare(b.modelRelPath);
    if (mk !== 0) return mk;
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    if (a.z !== b.z) return a.z - b.z;
    return a.yawRad - b.yawRad;
  });
  return JSON.stringify({ unitKey: args.unitKey, items: sorted });
}

/** FNV-1a 32-bit hex digest for compact cache keys. */
export function hashApartmentShellLightingLayout(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
