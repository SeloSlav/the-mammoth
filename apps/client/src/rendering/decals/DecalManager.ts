import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { DecalManifest, DecalMeshResolver, DecalPlacement, DecalManifestEntry } from "./decalTypes.js";
import {
  createDecalMaterial,
  decalMaterialCacheKey,
  decalMaterialCacheKeyForEntry,
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

function maxBorderConnectedBackgroundRemovalByUrl(manifest: DecalManifest): Map<
  string,
  NonNullable<DecalManifestEntry["borderConnectedBackgroundRemoval"]>
> {
  const out = new Map<string, NonNullable<DecalManifestEntry["borderConnectedBackgroundRemoval"]>>();
  for (const e of manifest) {
    const cfg = e.borderConnectedBackgroundRemoval;
    if (!cfg) continue;
    const prev = out.get(e.url);
    if (!prev || cfg.maxLuma > prev.maxLuma) out.set(e.url, cfg);
  }
  return out;
}

function rgbaFromImageLike(source: CanvasImageSource, w: number, h: number): ImageData | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

/**
 * Punch alpha for **border-connected** near-black matte pixels.
 * Preserves enclosed blacks (paint strokes/shadow cores) disconnected from image edges.
 */
function punchBorderConnectedBackgroundOnRgba(img: ImageData, maxChannel: number): void {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const visited = new Uint8Array(n);
  const queue = new Uint32Array(n);
  let head = 0;
  let tail = 0;

  const isSeedAt = (i: number, x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const j = i * 4;
    const r = data[j]!;
    const g = data[j + 1]!;
    const b = data[j + 2]!;
    return r <= maxChannel && g <= maxChannel && b <= maxChannel;
  };

  const push = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    queue[tail++] = i;
  };

  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    push(y * w);
    push(y * w + (w - 1));
  }

  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    const y = (i / w) | 0;
    if (!isSeedAt(i, x, y)) continue;

    const j = i * 4;
    data[j + 3] = 0;

    if (x > 0) push(i - 1);
    if (x + 1 < w) push(i + 1);
    if (y > 0) push(i - w);
    if (y + 1 < h) push(i + w);
  }
}

function applyBorderConnectedBackgroundRemoval(tex: THREE.Texture, maxChannel: number): void {
  const img = tex.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | OffscreenCanvas
    | undefined;
  if (!img) return;

  let w = 0;
  let h = 0;
  if (img instanceof HTMLImageElement) {
    w = img.naturalWidth;
    h = img.naturalHeight;
  } else if (img instanceof ImageBitmap) {
    w = img.width;
    h = img.height;
  } else {
    w = img.width;
    h = img.height;
  }
  if (w <= 1 || h <= 1 || w > 8192 || h > 8192) return;

  const rgba = rgbaFromImageLike(img as CanvasImageSource, w, h);
  if (!rgba) return;
  punchBorderConnectedBackgroundOnRgba(rgba, maxChannel);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(rgba, 0, 0);
  tex.image = out;
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
  private readonly materialCache = new Map<string, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>();
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
    const removalByUrl = maxBorderConnectedBackgroundRemovalByUrl(manifest);
    await Promise.all(
      urls.map((u) => this.loadTexture(u, removalByUrl.get(u)).catch(() => undefined)),
    );
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

  private loadTexture(
    url: string,
    borderRemoval?: DecalManifestEntry["borderConnectedBackgroundRemoval"],
  ): Promise<THREE.Texture> {
    const existing = this.textureByUrl.get(url);
    if (existing) return Promise.resolve(existing);
    let pending = this.loadingUrls.get(url);
    if (!pending) {
      pending = new Promise<THREE.Texture>((resolve, reject) => {
        this.textureLoader.load(
          url,
          (tex) => {
            if (borderRemoval) {
              applyBorderConnectedBackgroundRemoval(tex, borderRemoval.maxLuma);
            }
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

  private async materialFor(
    entry: DecalManifestEntry,
    placement: DecalPlacement,
  ): Promise<THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | undefined> {
    const opacity = placement.opacity ?? 1;
    let opts;
    if (entry.category === "grime") {
      opts = grimeDecalMaterialOpts(opacity);
    } else if (placement.category === "sticker" || entry.category === "sticker") {
      opts = stickerDecalMaterialOpts(opacity);
    } else {
      opts = graffitiDecalMaterialOpts(opacity);
    }
    const key =
      entry.category === "grime"
        ? decalMaterialCacheKey(entry.id, opts)
        : decalMaterialCacheKeyForEntry(entry, opts);
    let mat = this.materialCache.get(key);
    if (mat) return mat;
    let tex: THREE.Texture | undefined;
    try {
      tex = await this.loadTexture(entry.url, entry.borderConnectedBackgroundRemoval);
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
    const key =
      manifestEntry.category === "grime"
        ? decalMaterialCacheKey(manifestEntry.id, opts)
        : decalMaterialCacheKeyForEntry(manifestEntry, opts);
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
    const key =
      manifestEntry.category === "grime"
        ? decalMaterialCacheKey(manifestEntry.id, opts)
        : decalMaterialCacheKeyForEntry(manifestEntry, opts);
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
   * Places decals from authoring data. `mode: "flat"` does not require a mesh ray-hit (cheap); projected
   * decals resolve against `buildingRoot` stair segment meshes.
   */
  async loadPlacements(placements: readonly DecalPlacement[], buildingRoot: THREE.Object3D): Promise<void> {
    for (const p of placements) {
      let candidates: THREE.Mesh[] = [];
      let segment: THREE.Object3D | null = null;
      if (p.stairShaftId !== undefined && p.storeyLevelIndex !== undefined) {
        segment = findStairShaftSegment(buildingRoot, p.stairShaftId, p.storeyLevelIndex);
        if (segment) candidates = collectMeshesInSegment(segment);
      }

      if (p.mode === "flat") {
        const mesh = await this.spawnFromPlacement(p, candidates, defaultProjectedResolver);
        if (!mesh) continue;
        if (segment) {
          segment.attach(mesh);
          mesh.userData.mammothUnitInterior = true;
        }
        continue;
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
