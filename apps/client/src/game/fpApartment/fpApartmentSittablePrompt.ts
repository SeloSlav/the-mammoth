import * as THREE from "three";
import {
  apartmentSittableSpecForPlacedItem,
  apartmentSittableSpecFromModelPath,
  type OwnedApartmentPlacedItemKind,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import {
  FP_APARTMENT_DECOR_PROP_LAYER,
  FP_APARTMENT_INTERACT_PICK_MAX_RAY_M,
  FP_INTERACTION_PICK_LAYER,
} from "../fpSession/fpSessionConstants.js";
import { normalizeApartmentDecorModelRelPath } from "./fpApartmentDecorAssets.js";
import { clientMayUseApartmentSittable } from "./fpApartmentGameplay.js";
import { computeApartmentSittableWorldPose } from "./fpApartmentSittablePose.js";
import type { ApartmentSittablePrompt } from "./fpApartmentSittableTypes.js";

const _screenCenterNdc = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();
const _cameraForwardScratch = new THREE.Vector3();

function configureSittableRaycasterLayers(): void {
  _raycaster.layers.disableAll();
  /** Invisible picks (stash-style helpers on layer 4). */
  _raycaster.layers.enable(FP_INTERACTION_PICK_LAYER);
  /**
   * Visible decor GLBs live on {@link FP_APARTMENT_DECOR_PROP_LAYER} after mirror exclusion tagging —
   * not on the residential shell layer.
   */
  _raycaster.layers.enable(FP_APARTMENT_DECOR_PROP_LAYER);
}

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

type DecorSittableRoot = {
  root: THREE.Object3D;
  unitKey: string;
  modelRelPath: string;
  placedKind: OwnedApartmentPlacedItemKind;
  sittableKey: string;
};

function resolveDecorSittableRoot(obj: THREE.Object3D): DecorSittableRoot | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const rawPath = cur.userData.mammothApartmentDecorModelRelPath;
    if (typeof rawPath === "string" && rawPath.length > 0) {
      const unitKey = cur.userData.mammothApartmentUnitKey;
      if (typeof unitKey !== "string" || unitKey.length === 0) return null;
      const modelRelPath = normalizeApartmentDecorModelRelPath(rawPath) ?? rawPath;
      const placedKind =
        (cur.userData.mammothApartmentDecorPlacedKind as OwnedApartmentPlacedItemKind | undefined) ??
        "plain";
      const decorId = cur.userData.mammothApartmentDecorId;
      const sittableKey =
        typeof decorId === "bigint"
          ? `decor:${decorId.toString()}`
          : typeof cur.name === "string" && cur.name.startsWith("apartment_decor:")
            ? `content:${unitKey}:${cur.name}`
            : `decor:${unitKey}:${modelRelPath}`;
      return { root: cur, unitKey, modelRelPath, placedKind, sittableKey };
    }
    cur = cur.parent;
  }
  return null;
}

function promptFromDecorRoot(
  conn: DbConnection,
  decor: DecorSittableRoot,
): ApartmentSittablePrompt | null {
  const spec = apartmentSittableSpecForPlacedItem({
    modelRelPath: decor.modelRelPath,
    itemKind: decor.placedKind,
  });
  if (!spec) return null;
  return {
    kind: "apartment_sittable",
    sittableKey: decor.sittableKey,
    unitKey: decor.unitKey,
    label: spec.promptLabel,
    modelRelPath: spec.modelRelPath,
    root: decor.root,
  };
}

function promptFromPickHit(
  conn: DbConnection,
  hit: THREE.Intersection,
): ApartmentSittablePrompt | null {
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
    const decor = resolveDecorSittableRoot(hit.object);
    return decor ? promptFromDecorRoot(conn, decor) : null;
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

function sittablePromptIfPlayerInRange(
  conn: DbConnection,
  prompt: ApartmentSittablePrompt | null,
  playerPos: THREE.Vector3,
): ApartmentSittablePrompt | null {
  if (!prompt) return null;
  return clientCanEnterApartmentSittable(conn, prompt, playerPos) ? prompt : null;
}

function raycastApartmentSittablePickMeshes(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  pickMeshes: readonly THREE.Mesh[];
  visibleScratch: THREE.Mesh[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentSittablePrompt | null {
  if (args.pickMeshes.length === 0) return null;
  collectVisiblePickMeshes(
    args.pickMeshes,
    args.visibleScratch,
    args.objectVisibleInHierarchy,
  );
  if (args.visibleScratch.length === 0) return null;
  configureSittableRaycasterLayers();
  _raycaster.setFromCamera(_screenCenterNdc, args.camera);
  _raycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
  const hits = _raycaster.intersectObjects(args.visibleScratch, false);
  const seen = new Set<string>();
  for (const hit of hits) {
    const prompt = sittablePromptIfPlayerInRange(
      args.conn,
      promptFromPickHit(args.conn, hit),
      args.playerPos,
    );
    if (!prompt || seen.has(prompt.sittableKey)) continue;
    seen.add(prompt.sittableKey);
    return prompt;
  }
  return null;
}

function raycastApartmentSittableDecorMeshes(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  decorRoots: readonly THREE.Object3D[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentSittablePrompt | null {
  const targets: THREE.Object3D[] = [];
  for (let i = 0; i < args.decorRoots.length; i++) {
    const g = args.decorRoots[i]!;
    if (args.objectVisibleInHierarchy(g)) targets.push(g);
  }
  if (targets.length === 0) return null;
  configureSittableRaycasterLayers();
  _raycaster.setFromCamera(_screenCenterNdc, args.camera);
  _raycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
  const hits = _raycaster.intersectObjects(targets, true);
  const seen = new Set<string>();
  for (const hit of hits) {
    const decor = resolveDecorSittableRoot(hit.object);
    if (!decor || seen.has(decor.sittableKey)) continue;
    const prompt = sittablePromptIfPlayerInRange(
      args.conn,
      promptFromDecorRoot(args.conn, decor),
      args.playerPos,
    );
    if (!prompt) continue;
    seen.add(decor.sittableKey);
    return prompt;
  }
  return null;
}

/** Nearest sittable the player is standing beside (reticle optional). */
function nearestApartmentSittablePrompt(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  decorRoots: readonly THREE.Object3D[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentSittablePrompt | null {
  const id = args.conn.identity;
  if (!id) return null;
  args.camera.getWorldDirection(_cameraForwardScratch);
  _cameraForwardScratch.y = 0;
  if (_cameraForwardScratch.lengthSq() < 1e-8) return null;
  _cameraForwardScratch.normalize();

  let best: ApartmentSittablePrompt | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < args.decorRoots.length; i++) {
    const g = args.decorRoots[i]!;
    if (!args.objectVisibleInHierarchy(g)) continue;
    const rawPath = g.userData.mammothApartmentDecorModelRelPath;
    if (typeof rawPath !== "string") continue;
    const unitKey = g.userData.mammothApartmentUnitKey;
    if (typeof unitKey !== "string") continue;
    const modelRelPath = normalizeApartmentDecorModelRelPath(rawPath) ?? rawPath;
    const placedKind =
      (g.userData.mammothApartmentDecorPlacedKind as OwnedApartmentPlacedItemKind | undefined) ??
      "plain";
    const spec = apartmentSittableSpecForPlacedItem({ modelRelPath, itemKind: placedKind });
    if (!spec) continue;
    const pose = computeApartmentSittableWorldPose(g, spec);
    if (
      !clientMayUseApartmentSittable(
        args.conn,
        id,
        unitKey,
        args.playerPos,
        pose.feetX,
        pose.feetZ,
        spec.interactRadiusM,
      )
    ) {
      continue;
    }
    const toSeatX = pose.feetX - args.playerPos.x;
    const toSeatZ = pose.feetZ - args.playerPos.z;
    const distSq = toSeatX * toSeatX + toSeatZ * toSeatZ;
    const facing = (toSeatX * _cameraForwardScratch.x + toSeatZ * _cameraForwardScratch.z) / Math.max(
      Math.sqrt(distSq),
      0.01,
    );
    const score = facing * 2 - distSq * 0.35;
    if (score > bestScore) {
      const decorId = g.userData.mammothApartmentDecorId;
      const sittableKey =
        typeof decorId === "bigint"
          ? `decor:${decorId.toString()}`
          : `content:${unitKey}:${g.name}`;
      bestScore = score;
      best = {
        kind: "apartment_sittable",
        sittableKey,
        unitKey,
        label: spec.promptLabel,
        modelRelPath: spec.modelRelPath,
        root: g,
      };
    }
  }
  return best;
}

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
  decorRoots: readonly THREE.Object3D[];
  visibleScratch: THREE.Mesh[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentSittablePrompt | null {
  if (!args.conn.identity) return null;
  const rayArgs = {
    conn: args.conn,
    playerPos: args.playerPos,
    camera: args.camera,
    visibleScratch: args.visibleScratch,
    objectVisibleInHierarchy: args.objectVisibleInHierarchy,
  };
  return (
    raycastApartmentSittablePickMeshes({ ...rayArgs, pickMeshes: args.decorPickMeshes }) ??
    raycastApartmentSittableDecorMeshes({
      conn: args.conn,
      playerPos: args.playerPos,
      camera: args.camera,
      decorRoots: args.decorRoots,
      objectVisibleInHierarchy: args.objectVisibleInHierarchy,
    }) ??
    nearestApartmentSittablePrompt({
      conn: args.conn,
      playerPos: args.playerPos,
      camera: args.camera,
      decorRoots: args.decorRoots,
      objectVisibleInHierarchy: args.objectVisibleInHierarchy,
    })
  );
}
