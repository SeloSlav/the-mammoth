import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { DecalManifest, DecalMeshResolver, DecalPlacement, DecalManifestEntry } from "./decalTypes.js";
import {
  createDecalMaterial,
  decalMaterialCacheKey,
  graffitiDecalMaterialOpts,
  grimeDecalMaterialOpts,
  stickerDecalMaterialOpts,
} from "./createDecalMaterial.js";
import {
  collectMeshesInSegment,
  eulerForDecalProjector,
  findStairShaftSegment,
  resolveDecalHitMesh,
} from "./decalPlacementResolve.js";

const DECALS_GROUP_NAME = "Decals";

/** WebGPU (FP) or any renderer that exposes GL-style `capabilities.getMaxAnisotropy`. */
type DecalHostRenderer =
  | THREE.WebGPURenderer
  | {
      capabilities?: { getMaxAnisotropy?: () => number };
    };

function manifestEntryById(manifest: DecalManifest, id: string): DecalManifestEntry | undefined {
  return manifest.find((e) => e.id === id);
}

const defaultProjectedResolver: DecalMeshResolver = (pl, c) => {
  if (c.length === 0) return undefined;
  return resolveDecalHitMesh(c, new THREE.Vector3(...pl.position), new THREE.Vector3(...pl.normal));
};

export class DecalManager {
  readonly group: THREE.Group;
  private readonly renderer: DecalHostRenderer;
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly textureByUrl = new Map<string, THREE.Texture>();
  private readonly loadingUrls = new Map<string, Promise<THREE.Texture>>();
  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly meshes = new Set<THREE.Mesh>();
  private manifest: DecalManifest = [];

  constructor(scene: THREE.Scene, renderer: DecalHostRenderer) {
    this.renderer = renderer;
    const found = scene.getObjectByName(DECALS_GROUP_NAME);
    let g: THREE.Group;
    if (found instanceof THREE.Group) {
      g = found;
    } else {
      if (found) scene.remove(found);
      g = new THREE.Group();
      g.name = DECALS_GROUP_NAME;
      scene.add(g);
    }
    this.group = g;
  }

  async preloadManifest(manifest: DecalManifest): Promise<void> {
    this.manifest = manifest;
    const urls = [...new Set(manifest.map((e) => e.url))];
    await Promise.all(urls.map((u) => this.loadTexture(u).catch(() => undefined)));
  }

  private maxAnisotropy(): number {
    const r = this.renderer;
    if (typeof r === "object" && r !== null && "capabilities" in r) {
      const cap = (r as { capabilities?: { getMaxAnisotropy?: () => number } }).capabilities;
      if (cap?.getMaxAnisotropy) {
        try {
          return cap.getMaxAnisotropy();
        } catch {
          return 4;
        }
      }
    }
    return 4;
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    const existing = this.textureByUrl.get(url);
    if (existing) return Promise.resolve(existing);
    let pending = this.loadingUrls.get(url);
    if (!pending) {
      pending = new Promise<THREE.Texture>((resolve, reject) => {
        this.textureLoader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.anisotropy = this.maxAnisotropy();
            tex.needsUpdate = true;
            this.textureByUrl.set(url, tex);
            this.loadingUrls.delete(url);
            resolve(tex);
          },
          undefined,
          () => {
            this.loadingUrls.delete(url);
            reject(new Error(`DecalManager: failed to load texture ${url}`));
          },
        );
      });
      this.loadingUrls.set(url, pending);
    }
    return pending;
  }

  private async materialFor(entry: DecalManifestEntry, placement: DecalPlacement): Promise<THREE.MeshStandardMaterial | undefined> {
    const opacity = placement.opacity ?? 1;
    let opts;
    if (entry.category === "grime") {
      opts = grimeDecalMaterialOpts(opacity);
    } else if (placement.category === "sticker" || entry.category === "sticker") {
      opts = stickerDecalMaterialOpts(opacity);
    } else {
      opts = graffitiDecalMaterialOpts(opacity);
    }
    const key = decalMaterialCacheKey(entry.id, opts);
    let mat = this.materialCache.get(key);
    if (mat) return mat;
    let tex: THREE.Texture | undefined;
    try {
      tex = await this.loadTexture(entry.url);
    } catch {
      return undefined;
    }
    mat = createDecalMaterial(entry, tex, opts);
    this.materialCache.set(key, mat);
    return mat;
  }

  spawnProjectedDecal(
    targetMesh: THREE.Mesh,
    manifestEntry: DecalManifestEntry,
    positionWorld: THREE.Vector3,
    orientation: THREE.Euler,
    sizeWorld: THREE.Vector3,
    placementMeta?: DecalPlacement,
  ): THREE.Mesh | null {
    void placementMeta;
    targetMesh.updateWorldMatrix(true, false);
    const geom = new DecalGeometry(targetMesh, positionWorld, orientation, sizeWorld);
    const opacity = placementMeta?.opacity ?? 1;
    let opts;
    if (manifestEntry.category === "grime") {
      opts = grimeDecalMaterialOpts(opacity);
    } else if (placementMeta?.category === "sticker" || manifestEntry.category === "sticker") {
      opts = stickerDecalMaterialOpts(opacity);
    } else {
      opts = graffitiDecalMaterialOpts(opacity);
    }
    const key = decalMaterialCacheKey(manifestEntry.id, opts);
    let mat = this.materialCache.get(key);
    if (!mat) {
      const tex = this.textureByUrl.get(manifestEntry.url);
      if (!tex) return null;
      mat = createDecalMaterial(manifestEntry, tex, opts);
      this.materialCache.set(key, mat);
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = `decal:${manifestEntry.id}`;
    mesh.userData.isDecal = true;
    if (placementMeta) mesh.userData.decalPlacement = placementMeta;
    mesh.frustumCulled = true;
    this.group.add(mesh);
    this.meshes.add(mesh);
    return mesh;
  }

  spawnFlatDecal(
    manifestEntry: DecalManifestEntry,
    positionWorld: THREE.Vector3,
    normalWorld: THREE.Vector3,
    width: number,
    height: number,
    rotationAroundNormal: number,
    placementMeta?: DecalPlacement,
  ): THREE.Mesh | null {
    const geom = new THREE.PlaneGeometry(width, height);
    const opacity = placementMeta?.opacity ?? 1;
    let opts;
    if (manifestEntry.category === "grime") {
      opts = grimeDecalMaterialOpts(opacity);
    } else if (placementMeta?.category === "sticker" || manifestEntry.category === "sticker") {
      opts = stickerDecalMaterialOpts(opacity);
    } else {
      opts = graffitiDecalMaterialOpts(opacity);
    }
    const key = decalMaterialCacheKey(manifestEntry.id, opts);
    let mat = this.materialCache.get(key);
    if (!mat) {
      const tex = this.textureByUrl.get(manifestEntry.url);
      if (!tex) return null;
      mat = createDecalMaterial(manifestEntry, tex, opts);
      this.materialCache.set(key, mat);
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = `decal_flat:${manifestEntry.id}`;
    const n = normalWorld.clone().normalize();
    const p = positionWorld.clone().addScaledVector(n, 0.002);
    mesh.position.copy(p);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mesh.quaternion.copy(q);
    mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), rotationAroundNormal);
    mesh.userData.isDecal = true;
    if (placementMeta) mesh.userData.decalPlacement = placementMeta;
    mesh.frustumCulled = true;
    this.group.add(mesh);
    this.meshes.add(mesh);
    return mesh;
  }

  removeDecal(mesh: THREE.Mesh): void {
    if (!this.meshes.has(mesh)) return;
    this.meshes.delete(mesh);
    mesh.removeFromParent();
    mesh.geometry?.dispose();
  }

  clear(): void {
    for (const m of [...this.meshes]) {
      m.removeFromParent();
      m.geometry?.dispose();
    }
    this.meshes.clear();
  }

  dispose(): void {
    this.clear();
    for (const m of this.materialCache.values()) {
      m.dispose();
    }
    this.materialCache.clear();
    for (const t of this.textureByUrl.values()) {
      t.dispose();
    }
    this.textureByUrl.clear();
    this.loadingUrls.clear();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }

  /** Decal meshes currently managed — append to FP `unitInteriorMeshes` so exterior shell-hide applies. */
  getMeshes(): THREE.Mesh[] {
    return [...this.meshes];
  }

  serializeDecal(mesh: THREE.Mesh): DecalPlacement | undefined {
    const p = mesh.userData.decalPlacement;
    return p && typeof p === "object" ? (p as DecalPlacement) : undefined;
  }

  async spawnFromPlacement(
    placement: DecalPlacement,
    candidateMeshes: readonly THREE.Mesh[],
    resolver: DecalMeshResolver = defaultProjectedResolver,
  ): Promise<THREE.Mesh | null> {
    const entry = manifestEntryById(this.manifest, placement.id);
    if (!entry) return null;

    const pos = new THREE.Vector3(...placement.position);
    const nor = new THREE.Vector3(...placement.normal).normalize();
    const rot = placement.rotation ?? 0;
    const sizeArr = placement.size ?? entry.defaultSize;
    const size = new THREE.Vector3(...sizeArr);

    if (placement.mode === "flat") {
      const w = placement.width ?? size.x;
      const h = placement.height ?? size.y;
      await this.materialFor(entry, placement);
      return this.spawnFlatDecal(entry, pos, nor, w, h, rot, placement);
    }

    const pick = resolver(placement, candidateMeshes);
    if (!(pick instanceof THREE.Mesh)) return null;

    const euler = eulerForDecalProjector(nor, rot);
    await this.materialFor(entry, placement);
    return this.spawnProjectedDecal(pick, entry, pos, euler, size, placement);
  }

  /**
   * Second projected layer: slightly larger, offset along normal, lower opacity.
   * Skips silently if grime texture failed to load.
   */
  async spawnGrimeLayerFromPlacement(
    placement: DecalPlacement,
    targetMesh: THREE.Mesh,
  ): Promise<THREE.Mesh | null> {
    const grimeEntry = manifestEntryById(this.manifest, "grime_01");
    if (!grimeEntry) return null;
    try {
      await this.loadTexture(grimeEntry.url);
    } catch {
      return null;
    }
    const nor = new THREE.Vector3(...placement.normal).normalize();
    const pos = new THREE.Vector3(...placement.position).addScaledVector(nor, 0.012);
    const rot = placement.rotation ?? 0;
    const baseSize = new THREE.Vector3(...(placement.size ?? grimeEntry.defaultSize)).multiplyScalar(1.08);
    const euler = eulerForDecalProjector(nor, rot);
    const grimePlacement: DecalPlacement = {
      ...placement,
      id: grimeEntry.id,
      category: "graffiti",
      opacity: (placement.opacity ?? 1) * 0.42,
    };
    await this.materialFor(grimeEntry, grimePlacement);
    return this.spawnProjectedDecal(targetMesh, grimeEntry, pos, euler, baseSize, grimePlacement);
  }

  /**
   * Resolves stair-scoped placements via raycast against segment meshes under `buildingRoot`.
   */
  async loadPlacements(placements: readonly DecalPlacement[], buildingRoot: THREE.Object3D): Promise<void> {
    for (const p of placements) {
      let candidates: THREE.Mesh[] = [];
      let segment: THREE.Object3D | null = null;
      if (p.stairShaftId !== undefined && p.storeyLevelIndex !== undefined) {
        segment = findStairShaftSegment(buildingRoot, p.stairShaftId, p.storeyLevelIndex);
        if (segment) candidates = collectMeshesInSegment(segment);
      }
      const hit = defaultProjectedResolver(p, candidates);
      if (!hit) continue;
      const mesh = await this.spawnFromPlacement(p, candidates, defaultProjectedResolver);
      if (!mesh) continue;

      const linkStairDecal = (m: THREE.Mesh): void => {
        if (!segment) return;
        segment.attach(m);
        m.userData.mammothUnitInterior = true;
      };
      linkStairDecal(mesh);

      if (p.grime) {
        const grimeMesh = await this.spawnGrimeLayerFromPlacement(p, hit);
        if (grimeMesh) linkStairDecal(grimeMesh);
      }
    }
  }
}
