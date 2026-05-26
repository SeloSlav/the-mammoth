import * as THREE from "three";

/**
 * Meters per UV unit along holed wall slabs (shaft shells, corridor shells). Matches ground-slab
 * planar scale so procedural concrete tiles consistently instead of stretching on long faces.
 */
export const WALL_SEGMENT_UV_METERS_PER_TILE = 2.75;

/** Set on meshes whose UVs already span world meters / {@link WALL_SEGMENT_UV_METERS_PER_TILE}. */
export const MAMMOTH_WORLD_METRIC_WALL_UVS_UD = "mammothWorldMetricWallUvs" as const;

/**
 * Replaces default 0–1 box face UVs with world-space planar mapping (meters / tile) so shared
 * `concreteMaterial` textures repeat at a consistent scale on long walls and across adjacent
 * fragments. Axis-aligned mesh only; call after `mesh.position` is set.
 */
export function applyWorldMetricUvsToAxisAlignedBoxMesh(
  mesh: THREE.Mesh,
  metersPerTile = WALL_SEGMENT_UV_METERS_PER_TILE,
): void {
  const g = mesh.geometry;
  const geom = g.index != null ? g.toNonIndexed() : g;
  if (geom !== g) {
    g.dispose();
    mesh.geometry = geom;
  }
  const pos = geom.attributes.position;
  if (!pos) return;
  const inv = 1 / Math.max(1e-6, metersPerTile);
  const px = mesh.position.x;
  const py = mesh.position.y;
  const pz = mesh.position.z;
  const uv = new Float32Array(pos.count * 2);

  for (let vi = 0; vi < pos.count; vi += 3) {
    const x0 = pos.getX(vi) + px;
    const y0 = pos.getY(vi) + py;
    const z0 = pos.getZ(vi) + pz;
    const x1 = pos.getX(vi + 1) + px;
    const y1 = pos.getY(vi + 1) + py;
    const z1 = pos.getZ(vi + 1) + pz;
    const x2 = pos.getX(vi + 2) + px;
    const y2 = pos.getY(vi + 2) + py;
    const z2 = pos.getZ(vi + 2) + pz;

    const e1x = x1 - x0;
    const e1y = y1 - y0;
    const e1z = z1 - z0;
    const e2x = x2 - x0;
    const e2y = y2 - y0;
    const e2z = z2 - z0;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    const absx = Math.abs(nx);
    const absy = Math.abs(ny);
    const absz = Math.abs(nz);

    for (let j = 0; j < 3; j++) {
      const i = vi + j;
      const wx = pos.getX(i) + px;
      const wy = pos.getY(i) + py;
      const wz = pos.getZ(i) + pz;
      let u: number;
      let v: number;
      if (absx >= absy && absx >= absz) {
        u = wz * inv;
        v = wy * inv;
      } else if (absz >= absy) {
        u = wx * inv;
        v = wy * inv;
      } else {
        u = wx * inv;
        v = wz * inv;
      }
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
    }
  }

  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geom.computeVertexNormals();
}

/** Local +X / −X / +Z / −Z wall of an axis-aligned box shell. */
export type CardinalFace = "e" | "w" | "n" | "s";

export function pickFaceTowardPoint(
  px: number,
  pz: number,
  targetX: number,
  targetZ: number,
): CardinalFace {
  const dx = targetX - px;
  const dz = targetZ - pz;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? "e" : "w";
  }
  return dz >= 0 ? "n" : "s";
}

function addBox(
  group: THREE.Group,
  material: THREE.MeshStandardMaterial,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  name: string,
  opts?: { noCollision?: boolean; worldMetricWallUvs?: boolean },
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.name = name;
  if (opts?.noCollision === true) mesh.userData.mammothNoCollision = true;
  mesh.position.set(x, y, z);
  if (opts?.worldMetricWallUvs) {
    applyWorldMetricUvsToAxisAlignedBoxMesh(mesh);
    mesh.userData[MAMMOTH_WORLD_METRIC_WALL_UVS_UD] = true;
    /** Still an axis-aligned box; geometry is non-indexed BufferGeometry for per-face UVs. */
    mesh.userData.mammothAxisAlignedCollisionBox = true;
  }
  group.add(mesh);
}

/** Axis-aligned hole on a wall lying in the YZ plane (constant x). */
export type WallHoleYZ = { z0: number; z1: number; y0: number; y1: number };

function mergeIntervals1D(
  intervals: readonly [number, number][],
): [number, number][] {
  if (intervals.length === 0) return [];
  const s = [...intervals]
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .sort((u, v) => u[0] - v[0]);
  const out: [number, number][] = [];
  let cur: [number, number] = s[0]!;
  for (let i = 1; i < s.length; i++) {
    const n = s[i]!;
    if (n[0] <= cur[1] + 0.02) cur = [cur[0], Math.max(cur[1], n[1])];
    else {
      out.push(cur);
      cur = n;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Wall slab at `xCenter`, thickness `thickness`, spanning z ∈ [zMin,zMax], y ∈ [yLo,yHi].
 * Holes are subtracted (union); typical use: one door or several along Z at the same sill/head.
 */
export function addWallConstantXWithHoles(
  group: THREE.Group,
  wallM: THREE.MeshStandardMaterial,
  xCenter: number,
  thickness: number,
  zMin: number,
  zMax: number,
  yLo: number,
  yHi: number,
  holes: readonly WallHoleYZ[],
  namePrefix: string,
  opts?: { noCollision?: boolean },
): void {
  if (holes.length === 0) {
    addBox(
      group,
      wallM,
      thickness,
      yHi - yLo,
      zMax - zMin,
      xCenter,
      (yLo + yHi) * 0.5,
      (zMin + zMax) * 0.5,
      `${namePrefix}_solid`,
      { worldMetricWallUvs: true, noCollision: opts?.noCollision },
    );
    return;
  }

  const ySplit = new Set<number>([yLo, yHi]);
  for (const h of holes) {
    ySplit.add(Math.max(yLo, Math.min(h.y0, h.y1)));
    ySplit.add(Math.min(yHi, Math.max(h.y0, h.y1)));
  }
  const yLevels = [...ySplit].sort((a, b) => a - b);

  let part = 0;
  for (let yi = 0; yi < yLevels.length - 1; yi++) {
    const y0 = yLevels[yi]!;
    const y1 = yLevels[yi + 1]!;
    if (y1 <= y0 + 1e-4) continue;

    const active = holes.filter(
      (h) => Math.min(h.y0, h.y1) < y1 - 1e-4 && Math.max(h.y0, h.y1) > y0 + 1e-4,
    );
    if (active.length === 0) {
      addBox(
        group,
        wallM,
        thickness,
        y1 - y0,
        zMax - zMin,
        xCenter,
        (y0 + y1) * 0.5,
        (zMin + zMax) * 0.5,
        `${namePrefix}_y_${part++}`,
        { worldMetricWallUvs: true },
      );
      continue;
    }

    const zIntervals: [number, number][] = [];
    for (const h of active) {
      const hz0 = Math.max(zMin, Math.min(h.z0, h.z1));
      const hz1 = Math.max(zMin, Math.max(h.z0, h.z1));
      if (hz1 > hz0 + 1e-4) zIntervals.push([hz0, hz1]);
    }
    const merged = mergeIntervals1D(zIntervals);

    let zCursor = zMin;
    for (const [hz0, hz1] of merged) {
      if (hz0 > zCursor + 1e-4) {
        addBox(
          group,
          wallM,
          thickness,
          y1 - y0,
          hz0 - zCursor,
          xCenter,
          (y0 + y1) * 0.5,
          (zCursor + hz0) * 0.5,
          `${namePrefix}_z_${part++}`,
          { worldMetricWallUvs: true, noCollision: opts?.noCollision },
        );
      }
      zCursor = Math.max(zCursor, hz1);
    }
    if (zMax > zCursor + 1e-4) {
      addBox(
        group,
        wallM,
        thickness,
        y1 - y0,
        zMax - zCursor,
        xCenter,
        (y0 + y1) * 0.5,
        (zCursor + zMax) * 0.5,
        `${namePrefix}_z_${part++}`,
        { worldMetricWallUvs: true, noCollision: opts?.noCollision },
      );
    }
  }
}

/** Hole on a wall in the XY plane (constant z). */
export type WallHoleXY = { x0: number; x1: number; y0: number; y1: number };

export function addWallConstantZWithHoles(
  group: THREE.Group,
  wallM: THREE.MeshStandardMaterial,
  zCenter: number,
  thickness: number,
  xMin: number,
  xMax: number,
  yLo: number,
  yHi: number,
  holes: readonly WallHoleXY[],
  namePrefix: string,
  opts?: { noCollision?: boolean },
): void {
  if (holes.length === 0) {
    addBox(
      group,
      wallM,
      xMax - xMin,
      yHi - yLo,
      thickness,
      (xMin + xMax) * 0.5,
      (yLo + yHi) * 0.5,
      zCenter,
      `${namePrefix}_solid`,
      { worldMetricWallUvs: true, noCollision: opts?.noCollision },
    );
    return;
  }

  const ySplit = new Set<number>([yLo, yHi]);
  for (const h of holes) {
    ySplit.add(Math.max(yLo, Math.min(h.y0, h.y1)));
    ySplit.add(Math.min(yHi, Math.max(h.y0, h.y1)));
  }
  const yLevels = [...ySplit].sort((a, b) => a - b);

  let part = 0;
  for (let yi = 0; yi < yLevels.length - 1; yi++) {
    const y0 = yLevels[yi]!;
    const y1 = yLevels[yi + 1]!;
    if (y1 <= y0 + 1e-4) continue;

    const active = holes.filter(
      (h) => Math.min(h.y0, h.y1) < y1 - 1e-4 && Math.max(h.y0, h.y1) > y0 + 1e-4,
    );
    if (active.length === 0) {
      addBox(
        group,
        wallM,
        xMax - xMin,
        y1 - y0,
        thickness,
        (xMin + xMax) * 0.5,
        (y0 + y1) * 0.5,
        zCenter,
        `${namePrefix}_y_${part++}`,
        { worldMetricWallUvs: true },
      );
      continue;
    }

    const xIntervals: [number, number][] = [];
    for (const h of active) {
      const hx0 = Math.max(xMin, Math.min(h.x0, h.x1));
      const hx1 = Math.max(xMin, Math.max(h.x0, h.x1));
      if (hx1 > hx0 + 1e-4) xIntervals.push([hx0, hx1]);
    }
    const merged = mergeIntervals1D(xIntervals);

    let xCursor = xMin;
    for (const [hx0, hx1] of merged) {
      if (hx0 > xCursor + 1e-4) {
        addBox(
          group,
          wallM,
          hx0 - xCursor,
          y1 - y0,
          thickness,
          (xCursor + hx0) * 0.5,
          (y0 + y1) * 0.5,
          zCenter,
          `${namePrefix}_x_${part++}`,
          { worldMetricWallUvs: true, noCollision: opts?.noCollision },
        );
      }
      xCursor = Math.max(xCursor, hx1);
    }
    if (xMax > xCursor + 1e-4) {
      addBox(
        group,
        wallM,
        xMax - xCursor,
        y1 - y0,
        thickness,
        (xCursor + xMax) * 0.5,
        (y0 + y1) * 0.5,
        zCenter,
        `${namePrefix}_x_${part++}`,
        { worldMetricWallUvs: true, noCollision: opts?.noCollision },
      );
    }
  }
}

export const DOOR_FRAME_TRIM_LEG_M = 0.075;
export const DOOR_FRAME_TRIM_TH_M = 0.05;
/** Matches `th * 0.5 + 0.02` in {@link addDoorFrameTrimConstantX}. */
export const DOOR_FRAME_TRIM_PLANE_INSET_M = 0.02;

/** Trim mesh plane X for an east/west wall opening — shared with swing-door hinge placement. */
export function doorFrameTrimPlaneConstantX(xInner: number, inwardX: number): number {
  return xInner + inwardX * (DOOR_FRAME_TRIM_TH_M * 0.5 + DOOR_FRAME_TRIM_PLANE_INSET_M);
}

/** Trim mesh plane Z for a north/south wall opening — shared with swing-door hinge placement. */
export function doorFrameTrimPlaneConstantZ(zInner: number, inwardZ: number): number {
  return zInner + inwardZ * (DOOR_FRAME_TRIM_TH_M * 0.5 + DOOR_FRAME_TRIM_PLANE_INSET_M);
}

/** Trim around a single opening on an east/west wall (YZ plane), slightly inside the volume. */
export function addDoorFrameTrimConstantX(
  group: THREE.Group,
  frameM: THREE.MeshStandardMaterial,
  xInner: number,
  inwardX: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  namePrefix: string,
): void {
  const hz0 = Math.min(z0, z1);
  const hz1 = Math.max(z0, z1);
  const hy0 = Math.min(y0, y1);
  const hy1 = Math.max(y0, y1);
  const leg = DOOR_FRAME_TRIM_LEG_M;
  const th = DOOR_FRAME_TRIM_TH_M;
  const xc = doorFrameTrimPlaneConstantX(xInner, inwardX);
  const yc = (hy0 + hy1) * 0.5;
  const zc = (hz0 + hz1) * 0.5;

  addBox(
    group,
    frameM,
    th,
    hy1 - hy0,
    leg,
    xc,
    yc,
    hz0 + leg * 0.5,
    `${namePrefix}_jamb_lo`,
    { noCollision: true },
  );
  addBox(
    group,
    frameM,
    th,
    hy1 - hy0,
    leg,
    xc,
    yc,
    hz1 - leg * 0.5,
    `${namePrefix}_jamb_hi`,
    { noCollision: true },
  );
  addBox(
    group,
    frameM,
    th,
    leg,
    hz1 - hz0 + leg * 2,
    xc,
    hy1 - leg * 0.5,
    zc,
    `${namePrefix}_lintel`,
    { noCollision: true },
  );
}

export function addDoorFrameTrimConstantZ(
  group: THREE.Group,
  frameM: THREE.MeshStandardMaterial,
  zInner: number,
  inwardZ: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  namePrefix: string,
): void {
  const hx0 = Math.min(x0, x1);
  const hx1 = Math.max(x0, x1);
  const hy0 = Math.min(y0, y1);
  const hy1 = Math.max(y0, y1);
  const leg = DOOR_FRAME_TRIM_LEG_M;
  const th = DOOR_FRAME_TRIM_TH_M;
  const zc = doorFrameTrimPlaneConstantZ(zInner, inwardZ);
  const yc = (hy0 + hy1) * 0.5;
  const xc = (hx0 + hx1) * 0.5;

  addBox(
    group,
    frameM,
    leg,
    hy1 - hy0,
    th,
    hx0 + leg * 0.5,
    yc,
    zc,
    `${namePrefix}_jamb_lo`,
    { noCollision: true },
  );
  addBox(
    group,
    frameM,
    leg,
    hy1 - hy0,
    th,
    hx1 - leg * 0.5,
    yc,
    zc,
    `${namePrefix}_jamb_hi`,
    { noCollision: true },
  );
  addBox(
    group,
    frameM,
    hx1 - hx0 + leg * 2,
    leg,
    th,
    xc,
    hy1 - leg * 0.5,
    zc,
    `${namePrefix}_lintel`,
    { noCollision: true },
  );
}
