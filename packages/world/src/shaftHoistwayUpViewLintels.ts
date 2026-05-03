import * as THREE from "three";
import type { MeshStandardMaterial } from "three";
import { applyWorldMetricUvsToAxisAlignedBoxMesh } from "./wallWithDoorCutout.js";

/**
 * Thin horizontal rings at the open top of each stacked hoistway slice.
 *
 * Vertical shaft walls use axis-aligned slabs; a camera inside the shaft looking nearly straight up
 * has a view direction almost parallel to those planes, so they rasterize to ~zero pixels (not a
 * frustum bug). Down-facing lintel undersides stay visible and read as concrete “storey rings” when
 * pitching up through the stack.
 */
const LINTEL_INTO_SHAFT_M = 0.22;
const LINTEL_THICK_Y_M = 0.08;
/** Shorten strips at corners to limit coplanar overlap with the neighbouring lintel. */
const LINTEL_CORNER_GAP_M = 0.045;

export function addHoistwayUpViewLintelRing(
  group: THREE.Group,
  wallM: MeshStandardMaterial,
  vlenX: number,
  vlenZ: number,
  yWallTop: number,
): void {
  const hxI = vlenX * 0.5;
  const hzI = vlenZ * 0.5;
  const d = LINTEL_INTO_SHAFT_M;
  const ty = LINTEL_THICK_Y_M;
  const cg = LINTEL_CORNER_GAP_M;
  const y = yWallTop - ty * 0.5;

  const zRun = Math.max(0.08, vlenZ - 2 * cg);
  const xRun = Math.max(0.08, vlenX - 2 * cg);

  const addBox = (sx: number, sy: number, sz: number, px: number, pz: number, name: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallM);
    mesh.name = name;
    mesh.position.set(px, y, pz);
    applyWorldMetricUvsToAxisAlignedBoxMesh(mesh);
    group.add(mesh);
  };

  addBox(d, ty, zRun, hxI - d * 0.5, 0, "shaft_hoistway_lintel_e");
  addBox(d, ty, zRun, -hxI + d * 0.5, 0, "shaft_hoistway_lintel_w");
  addBox(xRun, ty, d, 0, hzI - d * 0.5, "shaft_hoistway_lintel_n");
  addBox(xRun, ty, d, 0, -hzI + d * 0.5, "shaft_hoistway_lintel_s");
}
