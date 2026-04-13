import * as THREE from "three";
import type { PlacedObject } from "@the-mammoth/schemas";
import type { EditorMaterialMeta } from "../state/editorStore.js";

function readEditorMaterial(meta: Record<string, unknown> | undefined): EditorMaterialMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const em = meta.editorMaterial;
  if (!em || typeof em !== "object") return null;
  const o = em as Record<string, unknown>;
  const mapUrl = typeof o.mapUrl === "string" ? o.mapUrl : undefined;
  const roughness = typeof o.roughness === "number" ? o.roughness : undefined;
  const metalness = typeof o.metalness === "number" ? o.metalness : undefined;
  if (!mapUrl && roughness === undefined && metalness === undefined) return null;
  return { mapUrl, roughness, metalness };
}

/**
 * Applies `metadata.editorMaterial` to meshes under one placement group (floor mode).
 */
export function applyEditorMaterialsToFloorPlacement(
  root: THREE.Object3D,
  obj: PlacedObject,
  textureLoader: THREE.TextureLoader,
): void {
  const em = readEditorMaterial(obj.metadata as Record<string, unknown> | undefined);
  if (!em?.mapUrl) return;
  const group = root.getObjectByName(obj.id);
  if (!group) return;

  const tex = textureLoader.load(
    em.mapUrl,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    },
    undefined,
    () => {
      /* ignore load errors in editor */
    },
  );

  group.traverse((ch) => {
    if (!(ch instanceof THREE.Mesh)) return;
    const prev = ch.material;
    const baseColor =
      prev instanceof THREE.MeshStandardMaterial ? prev.color.getHex() : 0xaaaaaa;
    ch.material = new THREE.MeshStandardMaterial({
      map: tex,
      color: baseColor,
      roughness: em.roughness ?? 0.65,
      metalness: em.metalness ?? 0,
    });
  });
}
