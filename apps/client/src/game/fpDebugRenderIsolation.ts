/**
 * Session-only render isolation toggles (M debug menu). All default ON (normal rendering).
 * Turn a subsystem OFF to force-hide it for lag isolation. Never force-show — normal culling stays in charge.
 */

export type FpDebugRenderIsolationFlags = {
  apartmentDecor: boolean;
  /** Baked top-down silhouette overlays on shell floors (separate from decor GLBs). */
  apartmentDecorFloorShadows: boolean;
  /** Master: every interior practical light, including window-linked fills. */
  apartmentPracticalLights: boolean;
  /** Subset: decor fixture spots + emissive glow; window fills unaffected when master stays on. */
  apartmentDecorPracticalLights: boolean;
  environmentSky: boolean;
  environmentLighting: boolean;
  mirrors: boolean;
  floorPlates: boolean;
  unitInteriorShells: boolean;
  transparentMeshes: boolean;
  lobbyInterior: boolean;
  droppedItems: boolean;
  decals: boolean;
  localViewmodel: boolean;
  /** Shell plaster emissive + decor fixture glow (material emissive channels only). */
  emissiveMaterials: boolean;
};

export type FpDebugRenderIsolationKey = keyof FpDebugRenderIsolationFlags;

const ALL_ON: FpDebugRenderIsolationFlags = {
  apartmentDecor: true,
  apartmentDecorFloorShadows: true,
  apartmentPracticalLights: true,
  apartmentDecorPracticalLights: true,
  environmentSky: true,
  environmentLighting: true,
  mirrors: true,
  floorPlates: true,
  unitInteriorShells: true,
  transparentMeshes: true,
  lobbyInterior: true,
  droppedItems: true,
  decals: true,
  localViewmodel: true,
  emissiveMaterials: true,
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
    f.apartmentDecorFloorShadows &&
    f.apartmentPracticalLights &&
    f.apartmentDecorPracticalLights &&
    f.environmentSky &&
    f.environmentLighting &&
    f.mirrors &&
    f.floorPlates &&
    f.unitInteriorShells &&
    f.transparentMeshes &&
    f.lobbyInterior &&
    f.droppedItems &&
    f.decals &&
    f.localViewmodel &&
    f.emissiveMaterials
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
    apartmentDecorFloorShadows: enabled,
    apartmentPracticalLights: enabled,
    apartmentDecorPracticalLights: enabled,
    environmentSky: enabled,
    environmentLighting: enabled,
    mirrors: enabled,
    floorPlates: enabled,
    unitInteriorShells: enabled,
    transparentMeshes: enabled,
    lobbyInterior: enabled,
    droppedItems: enabled,
    decals: enabled,
    localViewmodel: enabled,
    emissiveMaterials: enabled,
  };
  notify();
}

export function resetFpDebugRenderIsolationFlags(): void {
  flags = { ...ALL_ON };
  notify();
}
