/**
 * Lightweight pose interpolation (selo-empire `EntityInterpolationBuffer` ideas, trimmed for MVP).
 * Fixed synthetic timestep between samples reduces velocity hitching when subscription batches vary.
 */
const BUFFER_SIZE = 12;
const TICK_MS = 33;
const INTERP_DELAY_MS = 95;
const MAX_MOVING_EXTRAP_MS = 420;
const MAX_STOPPED_EXTRAP_MS = 55;

export type PoseSample = {
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
};

function velSq(vx: number, vz: number): number {
  return vx * vx + vz * vz;
}

export class PoseInterpBuffer {
  private buffers = new Map<string, PoseSample[]>();
  private lastT = new Map<string, number>();
  private lastPushed = new Map<
    string,
    { x: number; y: number; z: number; vx: number; vz: number }
  >();

  push(id: string, x: number, y: number, z: number, vx: number, vz: number): void {
    const last = this.lastPushed.get(id);
    if (
      last &&
      last.x === x &&
      last.y === y &&
      last.z === z &&
      last.vx === vx &&
      last.vz === vz
    ) {
      return;
    }
    this.lastPushed.set(id, { x, y, z, vx, vz });

    const now = performance.now();
    const prevT = this.lastT.get(id);
    let buf = this.buffers.get(id);
    if (!buf) {
      buf = [];
      this.buffers.set(id, buf);
    }

    if (prevT === undefined) {
      const t = Math.max(now - INTERP_DELAY_MS, 0);
      buf.push({ t, x, y, z, vx, vz });
      this.lastT.set(id, t);
    } else {
      const t = prevT + TICK_MS;
      buf.push({ t, x, y, z, vx, vz });
      this.lastT.set(id, t);
    }
    while (buf.length > BUFFER_SIZE) buf.shift();
  }

  getInterpolated(id: string, now: number): { x: number; y: number; z: number } | null {
    const buf = this.buffers.get(id);
    if (!buf || buf.length === 0) return null;
    const renderT = now - INTERP_DELAY_MS;

    if (buf.length === 1) {
      const s = buf[0]!;
      const extra = renderT - s.t;
      const cap = velSq(s.vx, s.vz) > 1e-10 ? MAX_MOVING_EXTRAP_MS : MAX_STOPPED_EXTRAP_MS;
      if (extra > 0 && extra <= cap && velSq(s.vx, s.vz) > 1e-10) {
        const dt = extra / 1000;
        return { x: s.x + s.vx * dt, y: s.y, z: s.z + s.vz * dt };
      }
      return { x: s.x, y: s.y, z: s.z };
    }

    const first = buf[0]!;
    const last = buf[buf.length - 1]!;

    if (renderT <= first.t) return { x: first.x, y: first.y, z: first.z };
    if (renderT >= last.t) {
      const extra = renderT - last.t;
      const cap = velSq(last.vx, last.vz) > 1e-10 ? MAX_MOVING_EXTRAP_MS : MAX_STOPPED_EXTRAP_MS;
      if (extra > 0 && extra <= cap && velSq(last.vx, last.vz) > 1e-10) {
        const dt = extra / 1000;
        return {
          x: last.x + last.vx * dt,
          y: last.y,
          z: last.z + last.vz * dt,
        };
      }
      return { x: last.x, y: last.y, z: last.z };
    }

    let i = 0;
    while (i < buf.length - 1 && buf[i + 1]!.t < renderT) i++;
    const s0 = buf[i]!;
    const s1 = buf[i + 1]!;
    const dt = s1.t - s0.t;
    const u = dt > 0 ? (renderT - s0.t) / dt : 1;
    return {
      x: s0.x + (s1.x - s0.x) * u,
      y: s0.y + (s1.y - s0.y) * u,
      z: s0.z + (s1.z - s0.z) * u,
    };
  }

  remove(id: string): void {
    this.buffers.delete(id);
    this.lastT.delete(id);
    this.lastPushed.delete(id);
  }

  prune(keep: Set<string>): void {
    for (const id of this.buffers.keys()) {
      if (!keep.has(id)) this.remove(id);
    }
  }
}
