import * as THREE from "three";
import type { PlacedObject } from "@the-mammoth/schemas";
import type { EditorMaterialMeta } from "../../state/editorStore.js";

function readEditorMaterial(meta: Record<string, unknown> | undefined): EditorMaterialMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const em = meta.editorMaterial;
  if (!em || typeof em !== "object") return null;
  const o = em as Record<string, unknown>;
  const str = (k: string): string | undefined => {
    const v = o[k];
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };
  const mapUrl = str("mapUrl");
  const normalMapUrl = str("normalMapUrl");
  const roughnessMapUrl = str("roughnessMapUrl");
  const metalnessMapUrl = str("metalnessMapUrl");
  const bumpMapUrl = str("bumpMapUrl");
  const roughness = typeof o.roughness === "number" ? o.roughness : undefined;
  const metalness = typeof o.metalness === "number" ? o.metalness : undefined;
  const useMetalnessMap = o.useMetalnessMap === true;
  const useHeightMap = o.useHeightMap === true;
  if (
    !mapUrl &&
    !normalMapUrl &&
    !roughnessMapUrl &&
    !metalnessMapUrl &&
    !bumpMapUrl &&
    roughness === undefined &&
    metalness === undefined &&
    !useMetalnessMap &&
    !useHeightMap
  ) {
    return null;
  }
  return {
    mapUrl,
    normalMapUrl,
    roughnessMapUrl,
    metalnessMapUrl,
    bumpMapUrl,
    useMetalnessMap,
    useHeightMap,
    roughness,
    metalness,
  };
}

function loadRepeatSrgb(
  loader: THREE.TextureLoader,
  url: string | undefined,
): THREE.Texture | null {
  if (!url?.trim()) return null;
  return loader.load(
    url.trim(),
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.needsUpdate = true;
    },
    undefined,
    () => {
      /* ignore load errors in editor */
    },
  );
}

function loadRepeatData(
  loader: THREE.TextureLoader,
  url: string | undefined,
): THREE.Texture | null {
  if (!url?.trim()) return null;
  return loader.load(
    url.trim(),
    (t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.needsUpdate = true;
    },
    undefined,
    () => {
      /* ignore load errors in editor */
    },
  );
}

/**
 * Applies `metadata.editorMaterial` to meshes under one placement group (floor mode).
 * Targets every plate copy with matching `floorDocId` + `placedObjectId` (not only the first by name).
 */
export function applyEditorMaterialsToFloorPlacement(
  root: THREE.Object3D,
  floorDocId: string,
  obj: PlacedObject,
  textureLoader: THREE.TextureLoader,
): void {
  const em = readEditorMaterial(obj.metadata as Record<string, unknown> | undefined);
  if (!em) return;

  const map = loadRepeatSrgb(textureLoader, em.mapUrl);
  const normalMap = loadRepeatData(textureLoader, em.normalMapUrl);
  const roughnessMap = loadRepeatData(textureLoader, em.roughnessMapUrl);
  const metalnessMap = em.useMetalnessMap ? loadRepeatData(textureLoader, em.metalnessMapUrl) : null;
  const bumpMap = em.useHeightMap ? loadRepeatData(textureLoader, em.bumpMapUrl) : null;

  root.traverse((ch) => {
    if (!(ch instanceof THREE.Group)) return;
    if (ch.userData.placedObjectId !== obj.id || ch.userData.floorDocId !== floorDocId) {
      return;
    }
    ch.traverse((mesh) => {
      if (!(mesh instanceof THREE.Mesh)) return;
      const prev = mesh.material;
      const baseColor =
        prev instanceof THREE.MeshStandardMaterial ? prev.color.getHex() : 0xaaaaaa;
      mesh.material = new THREE.MeshStandardMaterial({
        map: map ?? null,
        normalMap: normalMap ?? null,
        roughnessMap: roughnessMap ?? null,
        metalnessMap: metalnessMap ?? null,
        bumpMap: bumpMap ?? null,
        bumpScale: bumpMap ? 0.02 : 0,
        color: baseColor,
        roughness: em.roughness ?? 0.8,
        metalness: em.metalness ?? 0,
      });
    });
  });
}
