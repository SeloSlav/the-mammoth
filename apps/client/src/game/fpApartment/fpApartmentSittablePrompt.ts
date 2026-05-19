import * as THREE from "three";
import {
  apartmentSittableSpecForPlacedItem,
  apartmentSittableSpecFromModelPath,
  type OwnedApartmentPlacedItemKind,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import { FP_INTERACTION_PICK_LAYER } from "../fpSession/fpSessionConstants.js";
import { clientMayUseApartmentSittable } from "./fpApartmentGameplay.js";
import { computeApartmentSittableWorldPose } from "./fpApartmentSittablePose.js";
import type { ApartmentSittablePrompt } from "./fpApartmentSittableTypes.js";

const _screenCenterNdc = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();

const SITTABLE_PICK_MAX_RAY_M = 6.5;

function collectVisiblePickMeshes(
  src: readonly THREE.Mesh[],
  dst: THREE.Mesh[],
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean,
): void {
  dst.length = 0;
  for (let i = 0; i < src.length; i++) {
    const mesh = src[i]!;
    if (objectVisibleInHierarchy(mesh)) dst.push(mesh);
  }
}

function promptFromPickHit(
  conn: DbConnection,
  hit: THREE.Intersection,
  playerPos: THREE.Vector3,
): ApartmentSittablePrompt | null {
  const id = conn.identity;
  if (!id) return null;
  const sittableKey = hit.object.userData.mammothApartmentSittableKey;
  const unitKey = hit.object.userData.mammothApartmentSittableUnitKey;
  const modelRelPath = hit.object.userData.mammothApartmentSittableModelRelPath;
  const root = hit.object.userData.mammothApartmentSittableRoot;
  if (
    typeof sittableKey !== "string" ||
    typeof unitKey !== "string" ||
    typeof modelRelPath !== "string" ||
    !(root instanceof THREE.Object3D)
  ) {
    return null;
  }
  const placedKind = hit.object.userData.mammothApartmentSittablePlacedKind;
  const spec =
    typeof placedKind === "string"
      ? apartmentSittableSpecForPlacedItem({
          modelRelPath,
          itemKind: placedKind as OwnedApartmentPlacedItemKind,
        })
      : apartmentSittableSpecFromModelPath(modelRelPath);
  if (!spec) return null;
  return {
    kind: "apartment_sittable",
    sittableKey,
    unitKey,
    label: spec.promptLabel,
    modelRelPath,
    root,
  };
}

export function raycastApartmentSittablePrompt(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  pickMeshes: readonly THREE.Mesh[];
  visibleScratch: THREE.Mesh[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentSittablePrompt | null {
  if (!args.conn.identity || args.pickMeshes.length === 0) return null;
  args.visibleScratch.length = 0;
  collectVisiblePickMeshes(
    args.pickMeshes,
    args.visibleScratch,
    args.objectVisibleInHierarchy,
  );
  _raycaster.layers.set(FP_INTERACTION_PICK_LAYER);
  _raycaster.setFromCamera(_screenCenterNdc, args.camera);
  _raycaster.far = SITTABLE_PICK_MAX_RAY_M;
  const hits = _raycaster.intersectObjects(args.visibleScratch, false);
  const seen = new Set<string>();
  for (const hit of hits) {
    const key = hit.object.userData.mammothApartmentSittableKey;
    if (typeof key !== "string" || seen.has(key)) continue;
    seen.add(key);
    const prompt = promptFromPickHit(args.conn, hit, args.playerPos);
    if (prompt) return prompt;
  }
  return null;
}

/** Decor picks first, then builtin furniture bed picks. */
/** Feet must be in range — call before {@link tryEnterFpSitFromPrompt}. */
export function clientCanEnterApartmentSittable(
  conn: DbConnection,
  prompt: ApartmentSittablePrompt,
  playerPos: THREE.Vector3,
): boolean {
  const id = conn.identity;
  if (!id) return false;
  const spec = apartmentSittableSpecFromModelPath(prompt.modelRelPath);
  if (!spec) return false;
  const pose = computeApartmentSittableWorldPose(prompt.root, spec);
  return clientMayUseApartmentSittable(
    conn,
    id,
    prompt.unitKey,
    playerPos,
    pose.feetX,
    pose.feetZ,
    spec.interactRadiusM,
  );
}

export function getApartmentSittablePrompt(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  decorPickMeshes: readonly THREE.Mesh[];
  furniturePickMeshes: readonly THREE.Mesh[];
  visibleScratch: THREE.Mesh[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentSittablePrompt | null {
  const rayArgs = {
    conn: args.conn,
    playerPos: args.playerPos,
    camera: args.camera,
    visibleScratch: args.visibleScratch,
    objectVisibleInHierarchy: args.objectVisibleInHierarchy,
  };
  return (
    raycastApartmentSittablePrompt({ ...rayArgs, pickMeshes: args.decorPickMeshes }) ??
    raycastApartmentSittablePrompt({ ...rayArgs, pickMeshes: args.furniturePickMeshes })
  );
}
