import * as THREE from "three";
import {
  subtractHolesFromRect,
  type RectXZ,
  type ShaftSlabHole,
} from "./shaftPlanformClip.js";
import { FP_OUTDOOR_GROUND_VISUAL_Y } from "./fpOutdoorGroundVisualY.js";

/**
 * World-space meters per texture repeat on horizontal ground slabs (planar UV keeps repeats
 * roughly square in XZ regardless of plate aspect ratio).
 */
export const GROUND_SLAB_PLANAR_TILE_SIZE_M = 2.75;

/**
 * Replaces default box horizontal-face UVs with planar XZ mapping in meters so albedo/normal
 * repeat consistently on long, narrow podium pieces. Both top and underside use the same world
 * scale; otherwise the bottom face keeps BoxGeometry's 0..1 UVs and stretches badly when visible
 * from below.
 */
export function applyGroundSlabPlanarTopUV(
  geometry: THREE.BufferGeometry,
  width: number,
  depth: number,
  thickness: number,
  metersPerTile = GROUND_SLAB_PLANAR_TILE_SIZE_M,
): void {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!pos || !uv) return;
  const yTop = thickness * 0.5;
  const yBottom = -thickness * 0.5;
  const inv = 1 / Math.max(1e-6, metersPerTile);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < yTop - 1e-5 && y > yBottom + 1e-5) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, (x + width * 0.5) * inv, (z + depth * 0.5) * inv);
  }
  uv.needsUpdate = true;
}

/**
 * Horizontal-face UVs for holed corridor/core shell floors: each piece uses **room** XZ
 * coordinates so albedo/normal tile continuously across elevator/stair cutouts on both the walk
 * surface and the visible underside.
 */
export function applyShellFloorPlanarTopUV(
  geometry: THREE.BufferGeometry,
  thickness: number,
  meshCenterX: number,
  meshCenterZ: number,
  roomHalfX: number,
  roomHalfZ: number,
  metersPerTile = GROUND_SLAB_PLANAR_TILE_SIZE_M,
): void {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!pos || !uv) return;
  const yTop = thickness * 0.5;
  const yBottom = -thickness * 0.5;
  const inv = 1 / Math.max(1e-6, metersPerTile);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < yTop - 1e-5 && y > yBottom + 1e-5) continue;
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const gx = meshCenterX + lx;
    const gz = meshCenterZ + lz;
    uv.setXY(i, (gx + roomHalfX) * inv, (gz + roomHalfZ) * inv);
  }
  uv.needsUpdate = true;
}

/** Matches {@link addConcreteSlabWithOptionalShaftHoles} call on the ground storey. */
export const GROUND_SLAB_MARGIN_XZ = 0.8;
export const GROUND_SLAB_THICKNESS_M = 0.16;

/**
 * Solid slab under the holed structural pad so shaft / lobby cutouts do not show the outdoor
 * grass plane (`FP_OUTDOOR_GROUND_VISUAL_Y` in world space). Skipped when the plate sits far
 * above ground (no sensible column to the backdrop plane).
 */
export function addGroundFootprintGrassOccluder(
  root: THREE.Group,
  min: THREE.Vector3,
  max: THREE.Vector3,
  plateWorldOriginY: number,
  slabMaterial: THREE.MeshStandardMaterial,
): void {
  const x0 = min.x - GROUND_SLAB_MARGIN_XZ;
  const x1 = max.x + GROUND_SLAB_MARGIN_XZ;
  const z0 = min.z - GROUND_SLAB_MARGIN_XZ;
  const z1 = max.z + GROUND_SLAB_MARGIN_XZ;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;

  const yLow = min.y - GROUND_SLAB_THICKNESS_M - 0.006;
  const yHigh = FP_OUTDOOR_GROUND_VISUAL_Y + 0.012 - plateWorldOriginY;
  if (yHigh <= yLow + 1e-4) return;

  const h = yHigh - yLow;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), slabMaterial);
  mesh.name = "ground_footprint_grass_occluder";
  mesh.position.set(cx, yLow + h * 0.5, cz);
  root.add(mesh);
}

export function addConcreteSlabWithOptionalShaftHoles(
  root: THREE.Group,
  min: THREE.Vector3,
  max: THREE.Vector3,
  marginXZ: number,
  thickness: number,
  holes: readonly ShaftSlabHole[],
  slabMaterial: THREE.MeshStandardMaterial,
): void {
  const x0 = min.x - marginXZ;
  const x1 = max.x + marginXZ;
  const z0 = min.z - marginXZ;
  const z1 = max.z + marginXZ;
  const bottom = min.y - thickness * 0.5;
  const slabRect: RectXZ = { x0, x1, z0, z1 };
  let pieces =
    holes.length > 0 ? subtractHolesFromRect(slabRect, holes) : [slabRect];
  if (pieces.length === 0 && holes.length > 0) {
    pieces = subtractHolesFromRect(slabRect, holes, 0.001);
  }
  let i = 0;
  for (const p of pieces) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) * 0.5;
    const cz = (p.z0 + p.z1) * 0.5;
    const geom = new THREE.BoxGeometry(w, thickness, d);
    applyGroundSlabPlanarTopUV(geom, w, d, thickness);
    const slab = new THREE.Mesh(geom, slabMaterial);
    slab.name =
      holes.length > 0 ? `floor_slab_piece_${i}` : "floor_slab_placeholder";
    i += 1;
    slab.position.set(cx, bottom, cz);
    root.add(slab);
  }
}

/**
 * Mirror of {@link addConcreteSlabWithOptionalShaftHoles} positioned **above** the plate's
 * bounding max instead of below its min. Used on the topmost storey so that looking up from
 * a top-floor unit shows the underside of a concrete slab — same visual as every other floor
 * (whose "ceiling" is the floor slab of the storey above it). Without this the top storey
 * lacks any overhead concrete because there is no next-plate-up to contribute one.
 *
 * Slab pieces are named `roof_slab_*` to distinguish them from regular floor-plate slabs.
 */
export function addRoofConcreteSlabAboveMax(
  root: THREE.Group,
  min: THREE.Vector3,
  max: THREE.Vector3,
  marginXZ: number,
  thickness: number,
  holes: readonly ShaftSlabHole[],
  slabMaterial: THREE.MeshStandardMaterial,
): void {
  const x0 = min.x - marginXZ;
  const x1 = max.x + marginXZ;
  const z0 = min.z - marginXZ;
  const z1 = max.z + marginXZ;
  /** Slab bottom sits flush with `max.y` so its underside reads as the ceiling. */
  const center = max.y + thickness * 0.5;
  const slabRect: RectXZ = { x0, x1, z0, z1 };
  let pieces =
    holes.length > 0 ? subtractHolesFromRect(slabRect, holes) : [slabRect];
  if (pieces.length === 0 && holes.length > 0) {
    pieces = subtractHolesFromRect(slabRect, holes, 0.001);
  }
  let i = 0;
  for (const p of pieces) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) * 0.5;
    const cz = (p.z0 + p.z1) * 0.5;
    const geom = new THREE.BoxGeometry(w, thickness, d);
    applyGroundSlabPlanarTopUV(geom, w, d, thickness);
    const slab = new THREE.Mesh(geom, slabMaterial);
    slab.name =
      holes.length > 0 ? `roof_slab_piece_${i}` : "roof_slab_placeholder";
    i += 1;
    slab.position.set(cx, center, cz);
    root.add(slab);
  }
}
