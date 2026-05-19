/**
 * Session-only render isolation toggles (M debug menu). All default ON (normal rendering).
 * Turn a subsystem OFF to force-hide it for lag isolation. Never force-show — normal culling stays in charge.
 */

export type FpDebugRenderIsolationFlags = {
  apartmentDecor: boolean;
  /** Point/spot lights + emissive glow from lamp/TV/ceiling/chandelier decor (meshes stay visible). */
  apartmentDecorPracticalLights: boolean;
  /** All interior practical lights including window-linked spots. */
  apartmentPracticalLights: boolean;
  environmentSky: boolean;
  environmentLighting: boolean;
  mirrors: boolean;
  exteriorTrees: boolean;
  floorPlates: boolean;
  unitInteriorShells: boolean;
  transparentMeshes: boolean;
  lobbyInterior: boolean;
  droppedItems: boolean;
  decals: boolean;
  localViewmodel: boolean;
};

export type FpDebugRenderIsolationKey = keyof FpDebugRenderIsolationFlags;

const ALL_ON: FpDebugRenderIsolationFlags = {
  apartmentDecor: true,
  apartmentDecorPracticalLights: true,
  apartmentPracticalLights: true,
  environmentSky: true,
  environmentLighting: true,
  mirrors: true,
  exteriorTrees: true,
  floorPlates: true,
  unitInteriorShells: true,
  transparentMeshes: true,
  lobbyInterior: true,
  droppedItems: true,
  decals: true,
  localViewmodel: true,
};

const listeners = new Set<() => void>();

let flags: FpDebugRenderIsolationFlags = { ...ALL_ON };

export function getFpDebugRenderIsolationFlags(): Readonly<FpDebugRenderIsolationFlags> {
  return flags;
}

export function isFpDebugRenderIsolationEnabled(key: FpDebugRenderIsolationKey): boolean {
  return flags[key];
}

/** True when any category is forced off (cheap early-out for the pre-render pass). */
export function isFpDebugRenderIsolationSuppressingAnything(): boolean {
  const f = flags;
  return !(
    f.apartmentDecor &&
    f.apartmentDecorPracticalLights &&
    f.apartmentPracticalLights &&
    f.environmentSky &&
    f.environmentLighting &&
    f.mirrors &&
    f.exteriorTrees &&
    f.floorPlates &&
    f.unitInteriorShells &&
    f.transparentMeshes &&
    f.lobbyInterior &&
    f.droppedItems &&
    f.decals &&
    f.localViewmodel
  );
}

export function subscribeFpDebugRenderIsolation(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  for (const l of listeners) l();
}

export function setFpDebugRenderIsolationFlag(
  key: FpDebugRenderIsolationKey,
  enabled: boolean,
): void {
  if (flags[key] === enabled) return;
  flags = { ...flags, [key]: enabled };
  notify();
}

export function setAllFpDebugRenderIsolationFlags(enabled: boolean): void {
  flags = {
    apartmentDecor: enabled,
    apartmentDecorPracticalLights: enabled,
    apartmentPracticalLights: enabled,
    environmentSky: enabled,
    environmentLighting: enabled,
    mirrors: enabled,
    exteriorTrees: enabled,
    floorPlates: enabled,
    unitInteriorShells: enabled,
    transparentMeshes: enabled,
    lobbyInterior: enabled,
    droppedItems: enabled,
    decals: enabled,
    localViewmodel: enabled,
  };
  notify();
}

export function resetFpDebugRenderIsolationFlags(): void {
  flags = { ...ALL_ON };
  notify();
}
