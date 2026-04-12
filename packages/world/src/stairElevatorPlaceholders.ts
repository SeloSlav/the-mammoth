import * as THREE from "three";
import {
  computeSwitchbackStairLayout,
  type SwitchbackStairOpts,
} from "./stairWellGeometry.js";

const stairTread = new THREE.MeshStandardMaterial({
  color: 0xc8c0b4,
  roughness: 0.75,
  metalness: 0.04,
  emissive: 0x2a2218,
  emissiveIntensity: 0.06,
});
const landingMat = new THREE.MeshStandardMaterial({
  color: 0x9e968c,
  roughness: 0.85,
  metalness: 0.04,
  emissive: 0x1a1814,
  emissiveIntensity: 0.04,
});
const railMat = new THREE.MeshStandardMaterial({
  color: 0x5c5a58,
  roughness: 0.35,
  metalness: 0.35,
});
const shaftWall = new THREE.MeshStandardMaterial({
  color: 0x7a7d82,
  roughness: 0.55,
  metalness: 0.25,
});
/** Slightly brighter than hoistways so stair volumes read in dim lobby light. */
const stairShaftWall = new THREE.MeshStandardMaterial({
  color: 0x9ea2aa,
  roughness: 0.58,
  metalness: 0.12,
  emissive: 0x101418,
  emissiveIntensity: 0.05,
});
const shaftCeil = new THREE.MeshStandardMaterial({
  color: 0x6a6d72,
  roughness: 0.5,
  metalness: 0.2,
});

type ShaftShellOpts = {
  /** If false, top stays open so you can see through stacked storeys. */
  includeCeiling: boolean;
};

/**
 * Hoistway / stair shaft: floor slab + four walls to full interior height; optional ceiling.
 */
function addShaftShell(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  wallM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
  opts: ShaftShellOpts,
): void {
  const wt = 0.11;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const wallCenterY = (-hy + wt) + innerWallH * 0.5;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), wallM);
  floor.name = "shaft_floor";
  floor.position.set(0, -hy + wt * 0.5, 0);
  group.add(floor);

  if (opts.includeCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), ceilM);
    ceiling.name = "shaft_ceiling";
    ceiling.position.set(0, hy - wt * 0.5, 0);
    group.add(ceiling);
  }

  const east = new THREE.Mesh(new THREE.BoxGeometry(wt, innerWallH, vlenZ), wallM);
  east.name = "shaft_wall_e";
  east.position.set(hx - wt * 0.5, wallCenterY, 0);
  group.add(east);

  const west = new THREE.Mesh(new THREE.BoxGeometry(wt, innerWallH, vlenZ), wallM);
  west.name = "shaft_wall_w";
  west.position.set(-hx + wt * 0.5, wallCenterY, 0);
  group.add(west);

  const north = new THREE.Mesh(new THREE.BoxGeometry(vlenX, innerWallH, wt), wallM);
  north.name = "shaft_wall_n";
  north.position.set(0, wallCenterY, hz - wt * 0.5);
  group.add(north);

  const south = new THREE.Mesh(new THREE.BoxGeometry(vlenX, innerWallH, wt), wallM);
  south.name = "shaft_wall_s";
  south.position.set(0, wallCenterY, -hz + wt * 0.5);
  group.add(south);
}

/**
 * Open-top hoistway (no ceiling) so stacked floors read as one continuous shaft.
 */
export function addElevatorShaftPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
): void {
  addShaftShell(group, sx, sy, sz, shaftWall, shaftCeil, { includeCeiling: false });
}

/**
 * Circulating stair in a rectangular shaft (open top): perimeter runs + corner landings, stacked
 * per storey on tall shafts.
 */
export function addStairWellPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  layoutOpts?: SwitchbackStairOpts,
): void {
  addShaftShell(group, sx, sy, sz, stairShaftWall, shaftCeil, {
    includeCeiling: false,
  });

  const L = computeSwitchbackStairLayout(sx, sy, sz, layoutOpts);
  const { innerWallH, wallCenterY, ix0, ix1, iz0, iz1 } = L;

  let ti = 0;
  for (const tr of L.treads) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(tr.halfAlong * 2, tr.riseHalf * 2, tr.halfAcross * 2),
      stairTread,
    );
    mesh.name = `stair_tread_${ti}`;
    ti += 1;
    mesh.position.set(tr.x, tr.y, tr.z);
    mesh.rotation.y = tr.yaw;
    group.add(mesh);
  }

  let li = 0;
  for (const cl of L.cornerLandings) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        cl.halfW * 2,
        cl.thicknessHalf * 2,
        cl.halfD * 2,
      ),
      landingMat,
    );
    mesh.name = `stair_corner_landing_${li}`;
    li += 1;
    mesh.position.set(cl.x, cl.y, cl.z);
    group.add(mesh);
  }

  const railPost = 0.055;
  const corners: readonly [number, number][] = [
    [ix0, iz0],
    [ix1, iz0],
    [ix1, iz1],
    [ix0, iz1],
  ];
  let pi = 0;
  for (const [rx, rz] of corners) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(railPost, innerWallH, railPost),
      railMat,
    );
    post.name = `stair_rail_post_${pi}`;
    pi += 1;
    post.position.set(rx, wallCenterY, rz);
    group.add(post);
  }
}
