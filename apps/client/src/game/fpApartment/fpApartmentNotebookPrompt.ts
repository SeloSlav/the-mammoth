import * as THREE from "three";
import {
  APARTMENT_NOTEBOOK_INTERACT_RADIUS_M,
  APARTMENT_NOTEBOOK_PROMPT_LABEL,
  isApartmentNotebookModelRelPath,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import {
  FP_APARTMENT_DECOR_PROP_LAYER,
  FP_APARTMENT_INTERACT_PICK_MAX_RAY_M,
  FP_INTERACTION_PICK_LAYER,
} from "../fpSession/fpSessionConstants.js";
import { normalizeApartmentDecorModelRelPath } from "./fpApartmentDecorAssets.js";
import { clientOwnsClaimedApartmentUnit } from "./fpApartmentGameplay.js";
import type { ApartmentNotebookPrompt } from "./fpApartmentNotebookTypes.js";

const _screenCenterNdc = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();
const _decorPosScratch = new THREE.Vector3();
const _cameraForwardScratch = new THREE.Vector3();

function configureNotebookRaycasterLayers(): void {
  _raycaster.layers.disableAll();
  _raycaster.layers.enable(FP_INTERACTION_PICK_LAYER);
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

function notebookPromptIfPlayerInRange(
  conn: DbConnection,
  prompt: ApartmentNotebookPrompt | null,
  playerPos: THREE.Vector3,
  root: THREE.Object3D,
): ApartmentNotebookPrompt | null {
  if (!prompt || !conn.identity) return null;
  if (!clientOwnsClaimedApartmentUnit(conn, conn.identity, prompt.unitKey)) return null;
  root.getWorldPosition(_decorPosScratch);
  const dx = playerPos.x - _decorPosScratch.x;
  const dz = playerPos.z - _decorPosScratch.z;
  const radiusSq = APARTMENT_NOTEBOOK_INTERACT_RADIUS_M * APARTMENT_NOTEBOOK_INTERACT_RADIUS_M;
  if (dx * dx + dz * dz > radiusSq) return null;
  return prompt;
}

function promptFromPickHit(hit: THREE.Intersection): ApartmentNotebookPrompt | null {
  const notebookKey = hit.object.userData.mammothApartmentNotebookKey;
  const unitKey = hit.object.userData.mammothApartmentNotebookUnitKey;
  const root = hit.object.userData.mammothApartmentNotebookRoot;
  if (
    typeof notebookKey !== "string" ||
    typeof unitKey !== "string" ||
    !(root instanceof THREE.Object3D)
  ) {
    return null;
  }
  return {
    kind: "apartment_notebook",
    notebookKey,
    unitKey,
    label: APARTMENT_NOTEBOOK_PROMPT_LABEL,
  };
}

function resolveDecorNotebookRoot(obj: THREE.Object3D): {
  root: THREE.Object3D;
  unitKey: string;
  notebookKey: string;
} | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const rawPath = cur.userData.mammothApartmentDecorModelRelPath;
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      cur = cur.parent;
      continue;
    }
    const modelRelPath = normalizeApartmentDecorModelRelPath(rawPath) ?? rawPath;
    if (!isApartmentNotebookModelRelPath(modelRelPath)) return null;
    const unitKey = cur.userData.mammothApartmentUnitKey;
    if (typeof unitKey !== "string" || unitKey.length === 0) return null;
    const decorId = cur.userData.mammothApartmentDecorId;
    const notebookKey =
      typeof decorId === "bigint"
        ? `decor:${decorId.toString()}`
        : typeof cur.name === "string" && cur.name.startsWith("apartment_decor:")
          ? `content:${unitKey}:${cur.name}`
          : `decor:${unitKey}:${modelRelPath}`;
    return { root: cur, unitKey, notebookKey };
  }
  return null;
}

function raycastNotebookPickMeshes(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  screenNdc: THREE.Vector2;
  pickMeshes: readonly THREE.Mesh[];
  visibleScratch: THREE.Mesh[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentNotebookPrompt | null {
  if (args.pickMeshes.length === 0) return null;
  collectVisiblePickMeshes(
    args.pickMeshes,
    args.visibleScratch,
    args.objectVisibleInHierarchy,
  );
  if (args.visibleScratch.length === 0) return null;
  configureNotebookRaycasterLayers();
  _raycaster.setFromCamera(args.screenNdc, args.camera);
  _raycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
  const hits = _raycaster.intersectObjects(args.visibleScratch, false);
  for (const hit of hits) {
    const prompt = promptFromPickHit(hit);
    if (!prompt) continue;
    const root = hit.object.userData.mammothApartmentNotebookRoot as THREE.Object3D;
    return notebookPromptIfPlayerInRange(args.conn, prompt, args.playerPos, root);
  }
  return null;
}

function raycastNotebookDecorMeshes(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  screenNdc: THREE.Vector2;
  decorRoots: readonly THREE.Object3D[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentNotebookPrompt | null {
  const targets: THREE.Object3D[] = [];
  for (let i = 0; i < args.decorRoots.length; i++) {
    const g = args.decorRoots[i]!;
    if (args.objectVisibleInHierarchy(g)) targets.push(g);
  }
  if (targets.length === 0) return null;
  configureNotebookRaycasterLayers();
  _raycaster.setFromCamera(args.screenNdc, args.camera);
  _raycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
  const hits = _raycaster.intersectObjects(targets, true);
  for (const hit of hits) {
    const decor = resolveDecorNotebookRoot(hit.object);
    if (!decor) continue;
    const prompt: ApartmentNotebookPrompt = {
      kind: "apartment_notebook",
      notebookKey: decor.notebookKey,
      unitKey: decor.unitKey,
      label: APARTMENT_NOTEBOOK_PROMPT_LABEL,
    };
    return notebookPromptIfPlayerInRange(args.conn, prompt, args.playerPos, decor.root);
  }
  return null;
}

function nearestNotebookPrompt(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  decorRoots: readonly THREE.Object3D[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
}): ApartmentNotebookPrompt | null {
  if (!args.conn.identity) return null;
  args.camera.getWorldDirection(_cameraForwardScratch);
  _cameraForwardScratch.y = 0;
  if (_cameraForwardScratch.lengthSq() < 1e-8) return null;

  let best: ApartmentNotebookPrompt | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < args.decorRoots.length; i++) {
    const g = args.decorRoots[i]!;
    if (!args.objectVisibleInHierarchy(g)) continue;
    const rawPath = g.userData.mammothApartmentDecorModelRelPath;
    if (typeof rawPath !== "string") continue;
    const modelRelPath = normalizeApartmentDecorModelRelPath(rawPath) ?? rawPath;
    if (!isApartmentNotebookModelRelPath(modelRelPath)) continue;
    const unitKey = g.userData.mammothApartmentUnitKey;
    if (typeof unitKey !== "string") continue;
    g.getWorldPosition(_decorPosScratch);
    const prompt: ApartmentNotebookPrompt = {
      kind: "apartment_notebook",
      notebookKey:
        typeof g.userData.mammothApartmentDecorId === "bigint"
          ? `decor:${g.userData.mammothApartmentDecorId.toString()}`
          : `content:${unitKey}:${g.name}`,
      unitKey,
      label: APARTMENT_NOTEBOOK_PROMPT_LABEL,
    };
    const ranged = notebookPromptIfPlayerInRange(args.conn, prompt, args.playerPos, g);
    if (!ranged) continue;
    const toX = _decorPosScratch.x - args.playerPos.x;
    const toZ = _decorPosScratch.z - args.playerPos.z;
    const distSq = toX * toX + toZ * toZ;
    const facing =
      (toX * _cameraForwardScratch.x + toZ * _cameraForwardScratch.z) /
      Math.max(Math.sqrt(distSq), 0.01);
    const score = facing * 2 - distSq * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = ranged;
    }
  }
  return best;
}

export function getApartmentNotebookPrompt(args: {
  conn: DbConnection;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  notebookPickMeshes: readonly THREE.Mesh[];
  decorRoots: readonly THREE.Object3D[];
  visibleScratch: THREE.Mesh[];
  objectVisibleInHierarchy: (obj: THREE.Object3D) => boolean;
  screenNdc?: THREE.Vector2;
}): ApartmentNotebookPrompt | null {
  if (!args.conn.identity) return null;
  const screenNdc = args.screenNdc ?? _screenCenterNdc;
  const rayArgs = {
    conn: args.conn,
    playerPos: args.playerPos,
    camera: args.camera,
    screenNdc,
    visibleScratch: args.visibleScratch,
    objectVisibleInHierarchy: args.objectVisibleInHierarchy,
  };
  return (
    raycastNotebookPickMeshes({ ...rayArgs, pickMeshes: args.notebookPickMeshes }) ??
    raycastNotebookDecorMeshes({
      conn: args.conn,
      playerPos: args.playerPos,
      camera: args.camera,
      screenNdc,
      decorRoots: args.decorRoots,
      objectVisibleInHierarchy: args.objectVisibleInHierarchy,
    }) ??
    nearestNotebookPrompt({
      conn: args.conn,
      playerPos: args.playerPos,
      camera: args.camera,
      decorRoots: args.decorRoots,
      objectVisibleInHierarchy: args.objectVisibleInHierarchy,
    })
  );
}
