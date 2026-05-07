import * as THREE from "three";
import { EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y } from "./editorMyApartmentMeshes.js";

const WALL_THICKNESS = 0.1;
const WALL_HEIGHT = 2.75;

const DOOR_WIDTH = 0.95;
const DOOR_OPENING_HEIGHT = 2.12;

const WINDOW_WIDTH = 1.38;
const WINDOW_HEIGHT = 1.06;
const WINDOW_SILL_ABOVE_FLOOR_TOP = 0.92;

const FRAME_THICKNESS = 0.075;
const FRAME_DEPTH = 0.055;

function stripRaycast(mesh: THREE.Mesh): void {
  mesh.raycast = () => {};
}

function addScaledBox(
  parent: THREE.Object3D,
  unitBox: THREE.BufferGeometry,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  px: number,
  py: number,
  pz: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox.clone(), mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(px, py, pz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.editorOwnedApartmentReferenceOnly = true;
  stripRaycast(mesh);
  parent.add(mesh);
  return mesh;
}

/**
 * South boundary: −Z outward (inner face roughly flush with slab z=0). Door centred on X=W/2.
 */
function buildSouthWallWithDoor(
  parent: THREE.Object3D,
  unitGeo: THREE.BufferGeometry,
  wallMat: THREE.Material,
  interiorW: number,
): void {
  const T = WALL_THICKNESS;
  const H = WALL_HEIGHT;
  const y0 = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const cz = -T * 0.5;
  const yMid = y0 + H * 0.5;

  const xLedge = interiorW * 0.5 - DOOR_WIDTH * 0.5;
  const xRedge = interiorW * 0.5 + DOOR_WIDTH * 0.5;

  const leftW = Math.max(0.02, xLedge);
  if (leftW >= 0.02 && xLedge > 1e-6) {
    addScaledBox(parent, unitGeo, wallMat, leftW, H, T, leftW * 0.5, yMid, cz);
  }

  const rightW = Math.max(0.02, interiorW - xRedge);
  if (rightW >= 0.02 && xRedge < interiorW - 1e-6) {
    addScaledBox(parent, unitGeo, wallMat, rightW, H, T, xRedge + rightW * 0.5, yMid, cz);
  }

  const doorTop = y0 + DOOR_OPENING_HEIGHT;
  const lintelH = y0 + H - doorTop;
  if (lintelH > 1e-3) {
    addScaledBox(
      parent,
      unitGeo,
      wallMat,
      DOOR_WIDTH,
      lintelH,
      T,
      interiorW * 0.5,
      doorTop + lintelH * 0.5,
      cz,
    );
  }
}

function buildLongitudinalWallEastWest(
  parent: THREE.Object3D,
  unitGeo: THREE.BufferGeometry,
  wallMat: THREE.Material,
  interiorW: number,
  wallCenterX: number,
): void {
  const T = WALL_THICKNESS;
  const H = WALL_HEIGHT;
  const y0 = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const zw0 = interiorW * 0.5 - WINDOW_WIDTH * 0.5;
  const zw1 = interiorW * 0.5 + WINDOW_WIDTH * 0.5;
  const yMid = y0 + H * 0.5;
  const winBot = y0 + WINDOW_SILL_ABOVE_FLOOR_TOP;
  const winTop = winBot + WINDOW_HEIGHT;
  const wallTop = y0 + H;

  addScaledBox(parent, unitGeo, wallMat, T, H, zw0, wallCenterX, yMid, zw0 * 0.5);
  addScaledBox(
    parent,
    unitGeo,
    wallMat,
    T,
    H,
    interiorW - zw1,
    wallCenterX,
    yMid,
    zw1 + (interiorW - zw1) * 0.5,
  );

  const sillBandH = winBot - y0;
  if (sillBandH > 1e-3) {
    addScaledBox(
      parent,
      unitGeo,
      wallMat,
      T,
      sillBandH,
      WINDOW_WIDTH,
      wallCenterX,
      y0 + sillBandH * 0.5,
      interiorW * 0.5,
    );
  }

  const lintelBandH = wallTop - winTop;
  if (lintelBandH > 1e-3) {
    addScaledBox(
      parent,
      unitGeo,
      wallMat,
      T,
      lintelBandH,
      WINDOW_WIDTH,
      wallCenterX,
      winTop + lintelBandH * 0.5,
      interiorW * 0.5,
    );
  }
}

/** North (+Z outward). */
function buildNorthWall(
  parent: THREE.Object3D,
  unitGeo: THREE.BufferGeometry,
  wallMat: THREE.Material,
  interiorW: number,
): void {
  const T = WALL_THICKNESS;
  const H = WALL_HEIGHT;
  const y0 = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const cz = interiorW + T * 0.5;
  addScaledBox(parent, unitGeo, wallMat, interiorW, H, T, interiorW * 0.5, y0 + H * 0.5, cz);
}

/** Interior doorway trim (+Z facing into room); not pickable or saved. */
function buildDoorInteriorFrame(
  parent: THREE.Object3D,
  unitGeo: THREE.BufferGeometry,
  frameMat: THREE.Material,
  interiorW: number,
): void {
  const y0 = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const x1 = interiorW * 0.5 - DOOR_WIDTH * 0.5;
  const x2 = interiorW * 0.5 + DOOR_WIDTH * 0.5;
  const dtTop = Math.min(y0 + DOOR_OPENING_HEIGHT, y0 + WALL_HEIGHT);
  const dH = dtTop - y0;
  if (dH < 1e-3 || x2 <= x1) return;

  const zFrame = FRAME_DEPTH * 0.5 + 0.02;
  const fj = FRAME_THICKNESS;

  addScaledBox(
    parent,
    unitGeo,
    frameMat,
    fj,
    dH,
    FRAME_DEPTH,
    x1 + fj * 0.5,
    y0 + dH * 0.5,
    zFrame,
  );
  addScaledBox(
    parent,
    unitGeo,
    frameMat,
    fj,
    dH,
    FRAME_DEPTH,
    x2 - fj * 0.5,
    y0 + dH * 0.5,
    zFrame,
  );

  const headH = 0.1;
  addScaledBox(
    parent,
    unitGeo,
    frameMat,
    x2 - x1,
    headH,
    FRAME_DEPTH,
    interiorW * 0.5,
    dtTop - headH * 0.5,
    zFrame,
  );
}

/**
 * Non-editable reference room: outer walls (+ door opening / frame + windows).
 * Walls sit **outside** the authoring slab `[0,W]×[0,W]` so fraction coordinates remain exact.
 *
 * Deliberately **no ceiling/roof** for top‑down authoring. Meshes raycast‑strip so picks target
 * furniture / slab normally.
 */
export function buildOwnedApartmentReferenceEnclosure(interiorSideM: number): THREE.Group {
  const enclosure = new THREE.Group();
  enclosure.name = "editor_owned_apartment_reference_enclosure";

  const interiorW = Math.max(2, interiorSideM);

  /** Single unit cube — clones per mesh (`clone()` in addScaledBox); disposed after build. */
  const sharedPrototype = new THREE.BoxGeometry(1, 1, 1);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xeae6dc,
    roughness: 0.88,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x484238,
    roughness: 0.74,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xb0cae8,
    roughness: 0.08,
    metalness: 0.06,
    transmission: 0.45,
    thickness: 0.2,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const T = WALL_THICKNESS;

  buildSouthWallWithDoor(enclosure, sharedPrototype, wallMat, interiorW);
  buildNorthWall(enclosure, sharedPrototype, wallMat, interiorW);
  buildLongitudinalWallEastWest(enclosure, sharedPrototype, wallMat, interiorW, interiorW + T * 0.5);
  buildLongitudinalWallEastWest(enclosure, sharedPrototype, wallMat, interiorW, -T * 0.5);

  const gz = interiorW * 0.5;
  const gw = WINDOW_WIDTH - 0.08;
  const gh = WINDOW_HEIGHT - 0.08;
  const gy = WINDOW_SILL_ABOVE_FLOOR_TOP + EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + WINDOW_HEIGHT * 0.48;

  addScaledBox(enclosure, sharedPrototype, glassMat, 0.022, gh, gw, interiorW - 0.03, gy, gz);
  addScaledBox(enclosure, sharedPrototype, glassMat, 0.022, gh, gw, 0.03, gy, gz);

  buildDoorInteriorFrame(enclosure, sharedPrototype, frameMat, interiorW);

  enclosure.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.userData.editorOwnedApartmentReferenceOnly = true;
    stripRaycast(o);
  });

  sharedPrototype.dispose();

  return enclosure;
}
