import * as THREE from "three";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Stair-deck cigarette litter.
 *
 * Load the authored `used-cigarette-2.glb`, then bake placements into **per-storey** merged meshes.
 *
 * Why per-storey instead of one world mesh:
 * - stair shafts are tagged `mammothAlwaysVisible`, so children under the shaft never benefit from
 *   plate-band culling;
 * - a single scene-level merged mesh also never benefits from storey culling;
 * - cigarettes are tiny and only matter on the current / adjacent levels, so we keep a narrow
 *   cigarette-only visibility band around the player.
 *
 * This fixes the actual stair-litter scalability bug: rendering the entire building's cigarette
 * stack even though the player can only inspect a couple of storeys at once.
 *
 * Must run **before** `mergeStaticFloorGeometries(buildingRoot)` because it reads per-tread /
 * per-landing `userData` tags that are authored on the unmerged stair meshes.
 */

const CIGARETTE_GLB_URL = "/static/models/objects/used-cigarette-2.glb";
const CIGARETTE_VISIBLE_STOREY_RADIUS = 0;
const CIGARETTE_VISIBLE_RADIUS_XZ_M = 7.5;
const CIGARETTE_CHUNK_SIZE_XZ_M = 3.5;

const CIGARETTE_TARGET_LENGTH_M = 0.079;
const LENGTH_SCALE_CHOICES = [0.88, 1.0, 1.08] as const;

const GOLDEN_HASH = 2_654_435_769;
const HASH_B = 2_246_822_507;
const HASH_C = 3_266_489_909;
function hashUint32(a: number, b: number, c = 0): number {
  let n = (a | 0) ^ Math.imul(b | 0, GOLDEN_HASH) ^ Math.imul(c | 0, HASH_B);
  n ^= n >>> 16;
  n = Math.imul(n, HASH_C);
  n ^= n >>> 13;
  n = Math.imul(n, HASH_B);
  n ^= n >>> 16;
  return n >>> 0;
}
function hash01(a: number, b: number, c = 0): number {
  return hashUint32(a, b, c) / 4_294_967_295;
}
function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type InstallStairwellCigaretteDebrisOptions = {
  seed?: number;
  maxGlyphsPerSurface?: number;
  maxTotalInstances?: number;
  enabled?: boolean;
  /**
   * If `true` (default) the GLB's baked basecolor texture is applied to the merged mesh so the
   * cigarette reads as tobacco-brown / filter-yellow; if `false`, a flat pale-tan color is used
   * (zero texture fetches — cheapest possible fragment shader).
   */
  useBakedAlbedo?: boolean;
};

export type StairwellCigaretteDebrisHandle = {
  dispose: () => void;
  syncVisibility: (playerWorldX: number, playerFeetY: number, playerWorldZ: number) => void;
};

type ScatterSurface = {
  id: string;
  parentMesh: THREE.Mesh;
  uHalf: number;
  vHalf: number;
  yLocal: number;
};

type CapturedSurface = {
  surf: ScatterSurface;
  matrix: THREE.Matrix4;
};

function collectScatterSurfaces(buildingRoot: THREE.Group): ScatterSurface[] {
  const out: ScatterSurface[] = [];
  let landingIdx = 0;
  let treadIdx = 0;
  buildingRoot.updateMatrixWorld(true);
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh) return;
    const cl = obj.userData.mammothStairCornerLandingRef as
      | { halfW: number; halfD: number; thicknessHalf: number }
      | undefined;
    if (cl) {
      out.push({
        id: `landing_${landingIdx++}`,
        parentMesh: obj,
        uHalf: cl.halfW,
        vHalf: cl.halfD,
        yLocal: cl.thicknessHalf + 0.003,
      });
      return;
    }
    const ex = obj.userData.mammothStairTreadHalfExtents as
      | { halfAlong: number; riseHalf: number; halfAcross: number }
      | undefined;
    if (ex) {
      out.push({
        id: `tread_${treadIdx++}`,
        parentMesh: obj,
        uHalf: ex.halfAlong,
        vHalf: ex.halfAcross,
        yLocal: ex.riseHalf + 0.003,
      });
    }
  });
  return out;
}

function resolveMaxLevelIndex(buildingRoot: THREE.Group): number {
  let maxLevel = 1;
  for (const ch of buildingRoot.children) {
    const li = ch.userData.mammothPlateLevelIndex;
    if (typeof li === "number" && Number.isFinite(li)) maxLevel = Math.max(maxLevel, li);
  }
  return maxLevel;
}

function inferStoreyIndexFromWorldY(worldY: number, maxLevel: number): number {
  return THREE.MathUtils.clamp(
    Math.round(worldY / DEFAULT_BUILDING_FLOOR_SPACING_M) + 1,
    1,
    maxLevel,
  );
}

/**
 * Load the cigarette GLB once per session and extract:
 *   - a **single** `BufferGeometry` (the first mesh in the GLB, re-oriented and scaled so the
 *     cigarette lies flat with its long axis along +Z and length ≈ `CIGARETTE_TARGET_LENGTH_M`).
 *   - the baked `map` texture if present (so `MeshBasicMaterial` can sample it without the full
 *     PBR path).
 *
 * The extracted geometry is intentionally cached at module scope because the GLB ships at ~7 MB
 * with embedded textures — decoding it per session creates measurable frame drops.
 */
let cachedPromise: Promise<{
  geometry: THREE.BufferGeometry;
  bakedMap: THREE.Texture | null;
}> | null = null;
function loadCigaretteProxy(): Promise<{
  geometry: THREE.BufferGeometry;
  bakedMap: THREE.Texture | null;
}> {
  if (cachedPromise) return cachedPromise;
  const loader = new GLTFLoader();
  cachedPromise = loader.loadAsync(CIGARETTE_GLB_URL).then((gltf) => {
    let srcMesh: THREE.Mesh | null = null;
    gltf.scene.traverse((obj) => {
      if (srcMesh) return;
      if (obj instanceof THREE.Mesh) srcMesh = obj;
    });
    if (!srcMesh) throw new Error("[stairwellCigaretteDebris] GLB contained no mesh");
    /**
     * Extractor-local cast: TypeScript narrows `obj` → `Mesh` inside the traverse callback but
     * loses the narrowing once the closure returns, so re-assert the type before use.
     */
    const m: THREE.Mesh = srcMesh;
    m.updateWorldMatrix(true, false);

    const rawGeom = (m.geometry as THREE.BufferGeometry).clone();
    rawGeom.applyMatrix4(m.matrixWorld);

    /** Re-center and auto-orient so the longest local axis is +Z, length is normalized. */
    rawGeom.computeBoundingBox();
    const bb = rawGeom.boundingBox!;
    const size = new THREE.Vector3().subVectors(bb.max, bb.min);
    const center = new THREE.Vector3().addVectors(bb.min, bb.max).multiplyScalar(0.5);
    const recenter = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
    rawGeom.applyMatrix4(recenter);

    /** Pick the longest axis and rotate it onto +Z. */
    const axes = [
      { axis: "x" as const, len: size.x },
      { axis: "y" as const, len: size.y },
      { axis: "z" as const, len: size.z },
    ];
    axes.sort((a, b) => b.len - a.len);
    const longest = axes[0]!.axis;
    if (longest === "x") rawGeom.rotateY(-Math.PI * 0.5);
    else if (longest === "y") rawGeom.rotateX(Math.PI * 0.5);
    /** `z` is already aligned; no rotation. */

    rawGeom.computeBoundingBox();
    const newSize = new THREE.Vector3().subVectors(
      rawGeom.boundingBox!.max,
      rawGeom.boundingBox!.min,
    );
    const currentLen = Math.max(newSize.z, 1e-6);
    const scale = CIGARETTE_TARGET_LENGTH_M / currentLen;
    rawGeom.applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale));

    let bakedMap: THREE.Texture | null = null;
    const mat = m.material;
    if (!Array.isArray(mat) && mat) {
      const maybeMap = (mat as THREE.MeshStandardMaterial).map;
      if (maybeMap) bakedMap = maybeMap;
    }

    return { geometry: rawGeom, bakedMap };
  });
  return cachedPromise;
}

/**
 * **Call before** `mergeStaticFloorGeometries(buildingRoot)`.
 *
 * Requires `buildingRoot` to already be parented (`scene.add(buildingRoot)` in `mountFpSession`):
 * we attach the final merged litter mesh to `buildingRoot.parent` so the geometry (already in
 * world space) is not re-transformed.
 *
 * Returns a dispose handle that is valid immediately — the actual litter mesh appears once the
 * GLB finishes loading. Call the handle even if the promise has not resolved; pending loads are
 * cancelled by checking `disposed` before scene attachment.
 */
export function installStairwellCigaretteDebris(
  buildingRoot: THREE.Group,
  options?: InstallStairwellCigaretteDebrisOptions,
): StairwellCigaretteDebrisHandle {
  if (options?.enabled === false) {
    return { dispose: () => {}, syncVisibility: () => {} };
  }
  const scene = buildingRoot.parent;
  if (!scene) {
    console.warn(
      "[stairwellCigaretteDebris] buildingRoot has no parent — install after `scene.add(buildingRoot)`",
    );
    return { dispose: () => {}, syncVisibility: () => {} };
  }

  const seed = (options?.seed ?? 0x9e3779b9) >>> 0;
  const perSurface = Math.max(1, Math.floor(options?.maxGlyphsPerSurface ?? 3));
  const maxTotal = Math.max(1, Math.floor(options?.maxTotalInstances ?? 600));
  const useBakedAlbedo = options?.useBakedAlbedo ?? true;
  const maxLevel = resolveMaxLevelIndex(buildingRoot);

  /**
   * Capture surfaces **synchronously** before the merge pass runs — by the time the GLB resolves
   * the individual tread/landing meshes will already have been collapsed and the `userData` tags
   * we rely on will be gone.
   */
  const surfaces = collectScatterSurfaces(buildingRoot);
  if (surfaces.length === 0) {
    console.warn("[stairwellCigaretteDebris] no stair surfaces tagged — nothing to litter.");
    return { dispose: () => {}, syncVisibility: () => {} };
  }

  /** Capture world matrices upfront for the same reason. */
  const capturedSurfaces: CapturedSurface[] = surfaces.map((s) => ({
    surf: s,
    matrix: s.parentMesh.matrixWorld.clone(),
  }));

  let disposed = false;
  let attachedMaterial: THREE.Material | null = null;
  const attachedChunks: {
    levelIndex: number;
    centerX: number;
    centerZ: number;
    mesh: THREE.Mesh;
    geometry: THREE.BufferGeometry;
  }[] = [];
  let lastVisibleLo = -999;
  let lastVisibleHi = -999;
  let lastPlayerChunkX = Number.NaN;
  let lastPlayerChunkZ = Number.NaN;

  const syncVisibility = (playerWorldX: number, playerFeetY: number, playerWorldZ: number): void => {
    const playerStorey = inferStoreyIndexFromWorldY(playerFeetY, maxLevel);
    const lo = Math.max(1, playerStorey - CIGARETTE_VISIBLE_STOREY_RADIUS);
    const hi = Math.min(maxLevel, playerStorey + CIGARETTE_VISIBLE_STOREY_RADIUS);
    const playerChunkX = Math.floor(playerWorldX / CIGARETTE_CHUNK_SIZE_XZ_M);
    const playerChunkZ = Math.floor(playerWorldZ / CIGARETTE_CHUNK_SIZE_XZ_M);
    if (
      lo === lastVisibleLo &&
      hi === lastVisibleHi &&
      playerChunkX === lastPlayerChunkX &&
      playerChunkZ === lastPlayerChunkZ
    ) {
      return;
    }
    lastVisibleLo = lo;
    lastVisibleHi = hi;
    lastPlayerChunkX = playerChunkX;
    lastPlayerChunkZ = playerChunkZ;
    const r2 = CIGARETTE_VISIBLE_RADIUS_XZ_M * CIGARETTE_VISIBLE_RADIUS_XZ_M;
    for (const entry of attachedChunks) {
      const dx = entry.centerX - playerWorldX;
      const dz = entry.centerZ - playerWorldZ;
      entry.mesh.visible =
        entry.levelIndex >= lo &&
        entry.levelIndex <= hi &&
        dx * dx + dz * dz <= r2;
    }
  };

  void loadCigaretteProxy()
    .then(({ geometry, bakedMap }) => {
      if (disposed) return;

      const partsByChunk = new Map<
        string,
        {
          levelIndex: number;
          cellX: number;
          cellZ: number;
          parts: THREE.BufferGeometry[];
        }
      >();
      let placed = 0;

      const _local = new THREE.Matrix4();
      const _world = new THREE.Matrix4();
      const _pos = new THREE.Vector3();
      const _scl = new THREE.Vector3();
      const _quat = new THREE.Quaternion();
      const _y = new THREE.Vector3(0, 1, 0);
      const _worldPos = new THREE.Vector3();

      for (const { surf, matrix } of capturedSurfaces) {
        if (placed >= maxTotal) break;
        const edgeInset = Math.min(0.025, surf.uHalf * 0.25, surf.vHalf * 0.25);
        const uMax = Math.max(0, surf.uHalf - edgeInset);
        const vMax = Math.max(0, surf.vHalf - edgeInset);
        if (uMax <= 1e-4 || vMax <= 1e-4) continue;

        const surfKey = fnv1a32(`${seed}:${surf.id}`);
        const cap = Math.min(perSurface, maxTotal - placed);
        for (let k = 0; k < cap; k++) {
          const hu = hash01(surfKey, k, 1);
          const hv = hash01(surfKey, k, 2);
          const hy = hash01(surfKey, k, 3);
          const hs = hash01(surfKey, k, 4);
          const u = (hu * 2 - 1) * uMax;
          const v = (hv * 2 - 1) * vMax;
          const yaw = hy * Math.PI * 2;
          const lenF =
            LENGTH_SCALE_CHOICES[
              Math.floor(hs * LENGTH_SCALE_CHOICES.length) % LENGTH_SCALE_CHOICES.length
            ]!;

          _quat.setFromAxisAngle(_y, yaw);
          _pos.set(u, surf.yLocal, v);
          _scl.set(lenF, lenF, lenF);
          _local.compose(_pos, _quat, _scl);
          _world.multiplyMatrices(matrix, _local);
          _worldPos.setFromMatrixPosition(_world);
          const levelIndex = inferStoreyIndexFromWorldY(_worldPos.y, maxLevel);
          const cellX = Math.floor(_worldPos.x / CIGARETTE_CHUNK_SIZE_XZ_M);
          const cellZ = Math.floor(_worldPos.z / CIGARETTE_CHUNK_SIZE_XZ_M);
          const chunkKey = `${levelIndex}:${cellX}:${cellZ}`;

          const g = geometry.clone();
          g.applyMatrix4(_world);
          let bucket = partsByChunk.get(chunkKey);
          if (!bucket) {
            bucket = { levelIndex, cellX, cellZ, parts: [] };
            partsByChunk.set(chunkKey, bucket);
          }
          bucket.parts.push(g);
          placed++;
          if (placed >= maxTotal) break;
        }
      }

      if (partsByChunk.size === 0 || disposed) {
        for (const chunk of partsByChunk.values()) {
          for (const g of chunk.parts) g.dispose();
        }
        return;
      }

      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: useBakedAlbedo ? bakedMap : null,
      });
      if (!useBakedAlbedo || !bakedMap) material.color.setHex(0xd9cbb6);
      attachedMaterial = material;

      for (const chunk of partsByChunk.values()) {
        const merged = mergeGeometries(chunk.parts, false);
        for (const g of chunk.parts) g.dispose();
        if (!merged) {
          console.warn(
            "[stairwellCigaretteDebris] mergeGeometries returned null for chunk",
            chunk.levelIndex,
            chunk.cellX,
            chunk.cellZ,
          );
          continue;
        }
        merged.computeBoundingSphere();
        merged.computeBoundingBox();

        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `stairwell_cigarette_litter:L${chunk.levelIndex}:${chunk.cellX}:${chunk.cellZ}`;
        mesh.frustumCulled = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.mammothNoCollision = true;
        mesh.visible = false;
        scene.add(mesh);
        attachedChunks.push({
          levelIndex: chunk.levelIndex,
          centerX: (chunk.cellX + 0.5) * CIGARETTE_CHUNK_SIZE_XZ_M,
          centerZ: (chunk.cellZ + 0.5) * CIGARETTE_CHUNK_SIZE_XZ_M,
          mesh,
          geometry: merged,
        });
      }

      if (import.meta.env.DEV) {
        console.info(
          "[stairwellCigaretteDebris] surfaces=%d placed=%d levels=%d baked=%s",
          surfaces.length,
          placed,
          attachedChunks.length,
          bakedMap ? "yes" : "no",
        );
      }
    })
    .catch((err) => {
      console.warn("[stairwellCigaretteDebris] failed to load cigarette GLB", err);
    });

  return {
    syncVisibility,
    dispose: () => {
      disposed = true;
      for (const entry of attachedChunks) {
        entry.mesh.removeFromParent();
        entry.geometry.dispose();
      }
      attachedChunks.length = 0;
      attachedMaterial?.dispose();
      attachedMaterial = null;
    },
  };
}
