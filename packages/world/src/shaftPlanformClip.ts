import type { FloorDoc } from "@the-mammoth/schemas";

export type RectXZ = { x0: number; x1: number; z0: number; z1: number };

/** Shaft footprint in floor plate XZ (half-extents), same convention as slab holes. */
export type ShaftSlabHole = { cx: number; cz: number; hx: number; hz: number };

export function clipRectMinusHole(r: RectXZ, hole: ShaftSlabHole): RectXZ[] {
  const ix0 = hole.cx - hole.hx;
  const ix1 = hole.cx + hole.hx;
  const iz0 = hole.cz - hole.hz;
  const iz1 = hole.cz + hole.hz;
  if (ix1 <= r.x0 || ix0 >= r.x1 || iz1 <= r.z0 || iz0 >= r.z1) return [r];
  const out: RectXZ[] = [];
  if (iz0 > r.z0)
    out.push({
      x0: r.x0,
      x1: r.x1,
      z0: r.z0,
      z1: Math.min(r.z1, iz0),
    });
  if (iz1 < r.z1)
    out.push({
      x0: r.x0,
      x1: r.x1,
      z0: Math.max(r.z0, iz1),
      z1: r.z1,
    });
  const mz0 = Math.max(r.z0, iz0);
  const mz1 = Math.min(r.z1, iz1);
  if (mz1 > mz0) {
    if (ix0 > r.x0)
      out.push({
        x0: r.x0,
        x1: Math.min(r.x1, ix0),
        z0: mz0,
        z1: mz1,
      });
    if (ix1 < r.x1)
      out.push({
        x0: Math.max(r.x0, ix1),
        x1: r.x1,
        z0: mz0,
        z1: mz1,
      });
  }
  return out.filter((q) => q.x1 - q.x0 > 0.08 && q.z1 - q.z0 > 0.08);
}

export function subtractHolesFromRect(
  rect: RectXZ,
  holes: readonly ShaftSlabHole[],
): RectXZ[] {
  let parts: RectXZ[] = [rect];
  for (const h of holes) {
    parts = parts.flatMap((p) => clipRectMinusHole(p, h));
  }
  return parts;
}

const SHAFT_PAD = 0.12;

export function collectShaftSlabHoles(doc: FloorDoc): ShaftSlabHole[] {
  const holes: ShaftSlabHole[] = [];
  for (const obj of doc.objects) {
    const pid = obj.prefabId.toLowerCase();
    if (!pid.includes("elevator") && !pid.includes("stair_well") && !pid.includes("stairwell"))
      continue;
    const [px, , pz] = obj.position;
    const sx = obj.scale?.[0] ?? 1;
    const sz = obj.scale?.[2] ?? 1;
    holes.push({
      cx: px,
      cz: pz,
      hx: sx * 0.5 + SHAFT_PAD,
      hz: sz * 0.5 + SHAFT_PAD,
    });
  }
  return holes;
}

/**
 * Hollow-shell footprint in **room-local** XZ (origin = room group), with elevator/stair
 * shafts punched out so ceilings/floors do not cap continuous vertical cores.
 */
export function hollowShellXZRectsWithShaftCutouts(
  sx: number,
  sz: number,
  roomPx: number,
  roomPz: number,
  holesPlate: readonly ShaftSlabHole[],
): RectXZ[] {
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const shell: RectXZ = { x0: -hx, x1: hx, z0: -hz, z1: hz };
  if (holesPlate.length === 0) return [shell];

  const localHoles: ShaftSlabHole[] = holesPlate.map((h) => ({
    cx: h.cx - roomPx,
    cz: h.cz - roomPz,
    hx: h.hx,
    hz: h.hz,
  }));
  const parts = subtractHolesFromRect(shell, localHoles);
  return parts.length > 0 ? parts : [shell];
}
