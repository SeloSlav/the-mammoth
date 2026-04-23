import * as THREE from "three";

/**
 * Meters per texture repeat on stair tread PBR maps. Larger values stretch the texture (fewer
 * ribs/grooves per tread); smaller values tile tighter. Raised for patina tread albedo where one
 * texture period packs several horizontal grooves — we want ~1–2 ribs visible per tread depth.
 */
export const STAIR_TREAD_UV_METERS_PER_TILE = 1.95;

/**
 * Replaces UVs on a box so each face maps **position / metersPerTile** (RepeatWrapping textures
 * tile consistently in world units). Expects axis-aligned `BoxGeometry(halfAlong*2, riseHalf*2,
 * halfAcross*2)` in tread-local space: X = along run, Y = rise, Z = across.
 *
 * Top/bottom faces use **U along across (Z)** and **V along run (X)** so board/grain lines read
 * parallel to the nosing (90° from the older U-along-run mapping).
 *
 * Converts to non-indexed geometry so edge vertices can have per-face UVs.
 */
export function createStairTreadBoxGeometry(
  halfAlong: number,
  riseHalf: number,
  halfAcross: number,
  metersPerTile = STAIR_TREAD_UV_METERS_PER_TILE,
): THREE.BufferGeometry {
  const base = new THREE.BoxGeometry(halfAlong * 2, riseHalf * 2, halfAcross * 2);
  const geom = base.index != null ? base.toNonIndexed() : base;
  if (!geom) {
    base.dispose();
    throw new Error("createStairTreadBoxGeometry: toNonIndexed failed");
  }
  if (geom !== base) base.dispose();

  const pos = geom.attributes.position;
  if (!pos) {
    geom.dispose();
    throw new Error("createStairTreadBoxGeometry: missing position attribute");
  }
  const uv = new Float32Array(pos.count * 2);
  const inv = 1 / Math.max(1e-6, metersPerTile);
  const hw = halfAlong;
  const hh = riseHalf;
  const hd = halfAcross;

  for (let vi = 0; vi < pos.count; vi += 3) {
    const x0 = pos.getX(vi);
    const y0 = pos.getY(vi);
    const z0 = pos.getZ(vi);
    const x1 = pos.getX(vi + 1);
    const y1 = pos.getY(vi + 1);
    const z1 = pos.getZ(vi + 1);
    const x2 = pos.getX(vi + 2);
    const y2 = pos.getY(vi + 2);
    const z2 = pos.getZ(vi + 2);

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
    let face: "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
    if (absy >= absx && absy >= absz) face = ny > 0 ? "+y" : "-y";
    else if (absx >= absz) face = nx > 0 ? "+x" : "-x";
    else face = nz > 0 ? "+z" : "-z";

    const setUv = (i: number, x: number, y: number, z: number) => {
      let u: number;
      let v: number;
      switch (face) {
        case "+y":
        case "-y":
          u = (z + hd) * inv;
          v = (x + hw) * inv;
          break;
        case "+x":
        case "-x":
          u = (z + hd) * inv;
          v = (y + hh) * inv;
          break;
        case "+z":
        case "-z":
          u = (x + hw) * inv;
          v = (y + hh) * inv;
          break;
      }
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
    };

    setUv(vi, x0, y0, z0);
    setUv(vi + 1, x1, y1, z1);
    setUv(vi + 2, x2, y2, z2);
  }

  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geom.computeVertexNormals();
  return geom;
}
