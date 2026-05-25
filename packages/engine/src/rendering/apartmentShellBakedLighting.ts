import * as THREE from "three";
import type { ApartmentPracticalLightSpec } from "./apartmentInteriorPracticalLights.js";
import { evaluateApartmentShellLightingAtPoint } from "./apartmentShellLightingEvaluate.js";
import { isApartmentInteriorShellMesh } from "./bindMammothApartmentDecorIndirectEnv.js";

export const MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_UD = "mammothApartmentShellBakedLightmap";
export const MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_BACKUP_UD =
  "mammothApartmentShellBakedLightmapBackup";

const DEFAULT_BAKE_MAP_SIZE = 128;

const _worldPosScratch = new THREE.Vector3();
const _worldNormalScratch = new THREE.Vector3();
const _paScratch = new THREE.Vector3();
const _pbScratch = new THREE.Vector3();
const _pcScratch = new THREE.Vector3();
const _naScratch = new THREE.Vector3();
const _nbScratch = new THREE.Vector3();
const _ncScratch = new THREE.Vector3();

type BakedLightmapBackup = {
  lightMap: THREE.Texture | null;
  lightMapIntensity: number;
};

function rasterizeTriangleUv(
  uvA: THREE.Vector2,
  uvB: THREE.Vector2,
  uvC: THREE.Vector2,
  size: number,
  fn: (u: number, v: number, wBary: number, wCary: number) => void,
): void {
  const minX = Math.max(0, Math.floor(Math.min(uvA.x, uvB.x, uvC.x) * size));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(uvA.x, uvB.x, uvC.x) * size));
  const minY = Math.max(0, Math.floor(Math.min(1 - uvA.y, 1 - uvB.y, 1 - uvC.y) * size));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(1 - uvA.y, 1 - uvB.y, 1 - uvC.y) * size));

  const ax = uvA.x * size;
  const ay = (1 - uvA.y) * size;
  const bx = uvB.x * size;
  const by = (1 - uvB.y) * size;
  const cx = uvC.x * size;
  const cy = (1 - uvC.y) * size;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-8) return;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const u = (px + 0.5) / size;
      const v = 1 - (py + 0.5) / size;
      const wA = ((bx - u * size) * (cy - v * size) - (by - v * size) * (cx - u * size)) / area;
      const wB = ((cx - u * size) * (ay - v * size) - (cy - v * size) * (ax - u * size)) / area;
      const wC = 1 - wA - wB;
      if (wA < -0.001 || wB < -0.001 || wC < -0.001) continue;
      fn(u, v, wB, wC);
    }
  }
}

export function bakeApartmentShellMeshLightmap(
  mesh: THREE.Mesh,
  specs: readonly ApartmentPracticalLightSpec[],
  mapSize = DEFAULT_BAKE_MAP_SIZE,
): THREE.DataTexture | null {
  if (!isApartmentInteriorShellMesh(mesh)) return null;
  const geometry = mesh.geometry;
  const posAttr = geometry.getAttribute("position");
  const normalAttr = geometry.getAttribute("normal");
  const uvAttr = geometry.getAttribute("uv");
  if (!posAttr || !normalAttr || !uvAttr) return null;

  const index = geometry.getIndex();
  const data = new Float32Array(mapSize * mapSize * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 1;
  }

  mesh.updateMatrixWorld(true);
  const uvA = new THREE.Vector2();
  const uvB = new THREE.Vector2();
  const uvC = new THREE.Vector2();

  const writePixel = (
    px: number,
    py: number,
    wA: number,
    wB: number,
    wC: number,
    ia: number,
    ib: number,
    ic: number,
  ): void => {
    _paScratch.fromBufferAttribute(posAttr as THREE.BufferAttribute, ia).applyMatrix4(mesh.matrixWorld);
    _pbScratch.fromBufferAttribute(posAttr as THREE.BufferAttribute, ib).applyMatrix4(mesh.matrixWorld);
    _pcScratch.fromBufferAttribute(posAttr as THREE.BufferAttribute, ic).applyMatrix4(mesh.matrixWorld);
    _worldPosScratch.copy(_paScratch).multiplyScalar(wA).addScaledVector(_pbScratch, wB).addScaledVector(_pcScratch, wC);

    _naScratch.fromBufferAttribute(normalAttr as THREE.BufferAttribute, ia).transformDirection(mesh.matrixWorld);
    _nbScratch.fromBufferAttribute(normalAttr as THREE.BufferAttribute, ib).transformDirection(mesh.matrixWorld);
    _ncScratch.fromBufferAttribute(normalAttr as THREE.BufferAttribute, ic).transformDirection(mesh.matrixWorld);
    _worldNormalScratch.copy(_naScratch).multiplyScalar(wA).addScaledVector(_nbScratch, wB).addScaledVector(_ncScratch, wC).normalize();

    const lit = evaluateApartmentShellLightingAtPoint({
      worldPos: _worldPosScratch,
      worldNormal: _worldNormalScratch,
      specs,
      includeBounce: true,
    });

    const idx = (py * mapSize + px) * 4;
    data[idx] = Math.min(1, lit.r);
    data[idx + 1] = Math.min(1, lit.g);
    data[idx + 2] = Math.min(1, lit.b);
    data[idx + 3] = 1;
  };

  const processTri = (ia: number, ib: number, ic: number): void => {
    uvA.fromBufferAttribute(uvAttr as THREE.BufferAttribute, ia);
    uvB.fromBufferAttribute(uvAttr as THREE.BufferAttribute, ib);
    uvC.fromBufferAttribute(uvAttr as THREE.BufferAttribute, ic);
    rasterizeTriangleUv(uvA, uvB, uvC, mapSize, (u, v, wB, wC) => {
      const wA = 1 - wB - wC;
      const px = Math.min(mapSize - 1, Math.max(0, Math.floor(u * mapSize)));
      const py = Math.min(mapSize - 1, Math.max(0, Math.floor((1 - v) * mapSize)));
      writePixel(px, py, wA, wB, wC, ia, ib, ic);
    });
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      processTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      processTri(i, i + 1, i + 2);
    }
  }

  const texture = new THREE.DataTexture(data, mapSize, mapSize, THREE.RGBAFormat, THREE.FloatType);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  texture.name = `${mesh.name || "shell"}_baked_lightmap`;
  return texture;
}

export function applyApartmentShellBakedLightmap(mesh: THREE.Mesh, lightMap: THREE.Texture): void {
  const material = mesh.material;
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
    if (!mat.userData[MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_BACKUP_UD]) {
      const backup: BakedLightmapBackup = {
        lightMap: mat.lightMap,
        lightMapIntensity: mat.lightMapIntensity,
      };
      mat.userData[MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_BACKUP_UD] = backup;
    }
    mat.lightMap = lightMap;
    mat.lightMapIntensity = 1;
    mat.needsUpdate = true;
  }
  mesh.userData[MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_UD] = true;
}

export function clearApartmentShellBakedLightmap(mesh: THREE.Mesh): void {
  const material = mesh.material;
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
    const backup = mat.userData[
      MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_BACKUP_UD
    ] as BakedLightmapBackup | undefined;
    if (backup) {
      mat.lightMap = backup.lightMap;
      mat.lightMapIntensity = backup.lightMapIntensity;
      delete mat.userData[MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_BACKUP_UD];
    } else {
      mat.lightMap = null;
      mat.lightMapIntensity = 1;
    }
    mat.needsUpdate = true;
  }
  delete mesh.userData[MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_UD];
}

export type ApartmentShellBakedLightingMount = {
  layoutHash: string;
  unitKey: string;
  textures: THREE.Texture[];
  dispose: () => void;
};

export function bakeApartmentUnitShellLighting(args: {
  shellMeshes: readonly THREE.Mesh[];
  specs: readonly ApartmentPracticalLightSpec[];
  layoutHash: string;
  unitKey: string;
  mapSize?: number;
}): ApartmentShellBakedLightingMount {
  const textures: THREE.Texture[] = [];
  for (const mesh of args.shellMeshes) {
    const tex = bakeApartmentShellMeshLightmap(mesh, args.specs, args.mapSize);
    if (!tex) continue;
    textures.push(tex);
    applyApartmentShellBakedLightmap(mesh, tex);
  }
  return {
    layoutHash: args.layoutHash,
    unitKey: args.unitKey,
    textures,
    dispose: () => {
      for (const mesh of args.shellMeshes) {
        clearApartmentShellBakedLightmap(mesh);
      }
      for (const tex of textures) {
        tex.dispose();
      }
    },
  };
}

export function clearApartmentUnitShellBakedLighting(meshes: readonly THREE.Mesh[]): void {
  for (const mesh of meshes) {
    clearApartmentShellBakedLightmap(mesh);
  }
}
