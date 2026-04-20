import * as THREE from "three";
import {
  subtractHolesFromRect,
  type RectXZ,
  type ShaftSlabHole,
} from "./shaftPlanformClip.js";
import { FP_OUTDOOR_GROUND_VISUAL_Y } from "./fpOutdoorGroundVisualY.js";

/**
 * World-space meters per texture repeat on horizontal ground slabs (patina maps are not seamless;
 * planar UV keeps tiles roughly square in XZ regardless of plate aspect ratio).
 */
export const GROUND_SLAB_PATINA_TILE_SIZE_M = 2.75;

/**
 * Replaces default box top-face UVs with planar XZ mapping in meters so albedo/normal repeat
 * consistently on long, narrow podium pieces (default 0–1 UV × equal `texture.repeat` looks awful).
 */
export function applyGroundSlabPlanarTopUV(
  geometry: THREE.BufferGeometry,
  width: number,
  depth: number,
  thickness: number,
  metersPerTile = GROUND_SLAB_PATINA_TILE_SIZE_M,
): void {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!pos || !uv) return;
  const yTop = thickness * 0.5;
  const inv = 1 / Math.max(1e-6, metersPerTile);
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < yTop - 1e-5) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, (x + width * 0.5) * inv, (z + depth * 0.5) * inv);
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
