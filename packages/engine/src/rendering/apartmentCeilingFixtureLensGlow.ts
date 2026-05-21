import * as THREE from "three";
import { MAMMOTH_APARTMENT_DECOR_PROP_LAYER } from "./apartmentInteriorLayers.js";

export const MAMMOTH_CEILING_LENS_GLOW_MESH_UD = "mammothCeilingLensGlowMesh";

/** Must match {@link MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD}. */
const FIXTURE_BULB_ORB_UD = "mammothApartmentFixtureBulbGlow";
/** Must match {@link MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_ATTACHED_UD}. */
const FIXTURE_GLOW_ATTACHED_UD = "mammothApartmentFixtureBulbGlowAttached";

const _fixtureCenterScratch = new THREE.Vector3();
const _splitLocalScratch = new THREE.Vector3();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _vc = new THREE.Vector3();
const _meshToRoot = new THREE.Matrix4();
const _rootInv = new THREE.Matrix4();

function createCeilingLensGlowMaterial(
  source: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  const m = source.clone();
  m.emissive.setRGB(1, 0.98, 0.92);
  m.emissiveIntensity = 5.4;
  m.toneMapped = false;
  m.roughness = Math.min(m.roughness, 0.32);
  m.color.lerp(new THREE.Color(0xfff4e8), 0.58);
  m.needsUpdate = true;
  return m;
}

function createGrowOpPanelGlowMaterial(
  source: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  const m = source.clone();
  m.emissive.setRGB(0.88, 0.94, 1.0);
  m.emissiveIntensity = 6.2;
  m.toneMapped = false;
  m.roughness = Math.min(m.roughness, 0.24);
  m.metalness = 0;
  m.color.lerp(new THREE.Color(0xf0f6ff), 0.72);
  m.needsUpdate = true;
  return m;
}

type FixtureLensGlowMaterialFactory = (
  source: THREE.MeshStandardMaterial,
) => THREE.MeshStandardMaterial;

function buildGeometry(
  positions: number[],
  rootLocalToParentLocal: THREE.Matrix4,
): THREE.BufferGeometry | null {
  if (positions.length === 0) return null;
  const parentLocal: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    _va.set(positions[i]!, positions[i + 1]!, positions[i + 2]!).applyMatrix4(rootLocalToParentLocal);
    parentLocal.push(_va.x, _va.y, _va.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(parentLocal, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function classifyTriangle(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ia: number,
  ib: number,
  ic: number,
  meshToRoot: THREE.Matrix4,
  splitLocalY: number,
  lowerPositions: number[],
  upperPositions: number[],
): void {
  _va.fromBufferAttribute(pos, ia).applyMatrix4(meshToRoot);
  _vb.fromBufferAttribute(pos, ib).applyMatrix4(meshToRoot);
  _vc.fromBufferAttribute(pos, ic).applyMatrix4(meshToRoot);
  const centroidY = (_va.y + _vb.y + _vc.y) / 3;
  const target = centroidY <= splitLocalY ? lowerPositions : upperPositions;
  target.push(
    _va.x,
    _va.y,
    _va.z,
    _vb.x,
    _vb.y,
    _vb.z,
    _vc.x,
    _vc.y,
    _vc.z,
  );
}

function splitMeshAtRootLocalY(
  mesh: THREE.Mesh,
  root: THREE.Object3D,
  splitLocalY: number,
  createGlowMaterial: FixtureLensGlowMaterialFactory,
): void {
  if (mesh.userData[MAMMOTH_CEILING_LENS_GLOW_MESH_UD] === true) return;
  if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
  if (Array.isArray(mesh.material)) return;

  const pos = mesh.geometry.getAttribute("position");
  if (!pos) return;

  root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const parent = mesh.parent;
  if (!parent) return;

  _rootInv.copy(root.matrixWorld).invert();
  _meshToRoot.multiplyMatrices(_rootInv, mesh.matrixWorld);
  const rootLocalToParentLocal = new THREE.Matrix4()
    .copy(parent.matrixWorld)
    .invert()
    .multiply(root.matrixWorld);

  const lowerPositions: number[] = [];
  const upperPositions: number[] = [];
  const index = mesh.geometry.getIndex();

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      classifyTriangle(
        pos,
        index.getX(i),
        index.getX(i + 1),
        index.getX(i + 2),
        _meshToRoot,
        splitLocalY,
        lowerPositions,
        upperPositions,
      );
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      classifyTriangle(
        pos,
        i,
        i + 1,
        i + 2,
        _meshToRoot,
        splitLocalY,
        lowerPositions,
        upperPositions,
      );
    }
  }

  const lowerGeometry = buildGeometry(lowerPositions, rootLocalToParentLocal);
  const upperGeometry = buildGeometry(upperPositions, rootLocalToParentLocal);
  if (!lowerGeometry) return;

  const lensMaterial = createGlowMaterial(mesh.material);
  const lowerMesh = new THREE.Mesh(lowerGeometry, lensMaterial);
  lowerMesh.name = `${mesh.name || "ceiling_fixture"}_lens_glow`;
  lowerMesh.userData[MAMMOTH_CEILING_LENS_GLOW_MESH_UD] = true;
  lowerMesh.userData.mammothSkipFloorGeometryMerge = true;
  lowerMesh.userData.mammothUnitInterior = mesh.userData.mammothUnitInterior === true;
  lowerMesh.castShadow = mesh.castShadow;
  lowerMesh.receiveShadow = mesh.receiveShadow;
  lowerMesh.layers.mask = mesh.layers.mask;
  lowerMesh.layers.set(MAMMOTH_APARTMENT_DECOR_PROP_LAYER);
  lowerMesh.position.copy(mesh.position);
  lowerMesh.quaternion.copy(mesh.quaternion);
  lowerMesh.scale.copy(mesh.scale);

  if (upperGeometry) {
    const upperMesh = new THREE.Mesh(upperGeometry, mesh.material);
    upperMesh.name = `${mesh.name || "ceiling_fixture"}_housing`;
    upperMesh.userData.mammothUnitInterior = mesh.userData.mammothUnitInterior === true;
    upperMesh.castShadow = mesh.castShadow;
    upperMesh.receiveShadow = mesh.receiveShadow;
    upperMesh.layers.mask = mesh.layers.mask;
    upperMesh.position.copy(mesh.position);
    upperMesh.quaternion.copy(mesh.quaternion);
    upperMesh.scale.copy(mesh.scale);
    parent.add(lowerMesh, upperMesh);
    parent.remove(mesh);
    mesh.geometry.dispose();
    return;
  }

  mesh.geometry.dispose();
  mesh.geometry = lowerGeometry;
  mesh.material = lensMaterial;
  mesh.userData[MAMMOTH_CEILING_LENS_GLOW_MESH_UD] = true;
}

/**
 * Splits fixture geometry at mid-height and makes the bottom lens emissive.
 * Replaces the hidden interior orb — the visible dome reads as lit.
 */
function applyFixtureLensGlow(
  root: THREE.Object3D,
  createGlowMaterial: FixtureLensGlowMaterialFactory,
): void {
  if (root.userData[FIXTURE_GLOW_ATTACHED_UD] === true) return;

  root.updateMatrixWorld(true);
  const fixtureBox = new THREE.Box3().setFromObject(root);
  if (fixtureBox.isEmpty()) return;

  fixtureBox.getCenter(_fixtureCenterScratch);
  _splitLocalScratch.copy(_fixtureCenterScratch);
  root.worldToLocal(_splitLocalScratch);
  const splitLocalY = _splitLocalScratch.y;

  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData[FIXTURE_BULB_ORB_UD] === true) return;
    if (obj.userData[MAMMOTH_CEILING_LENS_GLOW_MESH_UD] === true) return;
    meshes.push(obj);
  });

  for (const mesh of meshes) {
    splitMeshAtRootLocalY(mesh, root, splitLocalY, createGlowMaterial);
  }

  root.userData[FIXTURE_GLOW_ATTACHED_UD] = true;
}

export function applyCeilingFixtureLensGlow(root: THREE.Object3D): void {
  applyFixtureLensGlow(root, createCeilingLensGlowMaterial);
}

/** Cool-white lower-panel emissive for hanging grow-op LED fixtures. */
export function applyGrowOpFixturePanelGlow(root: THREE.Object3D): void {
  applyFixtureLensGlow(root, createGrowOpPanelGlowMaterial);
}