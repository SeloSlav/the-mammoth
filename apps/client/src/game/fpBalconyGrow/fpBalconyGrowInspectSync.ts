import * as THREE from "three";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import { balconyGrowSlotWorldPosition, readGrowTraySoilLocalY } from "./fpBalconyGrowStageVisual.js";
import { setBalconyGrowInspectTarget } from "./fpBalconyGrowInspectState.js";
import { publishBalconyGrowInspectScreenAnchor } from "./fpBalconyGrowInspectPresentation.js";
import {
  balconyGrowLivePlantInSlot,
  resolveBalconyGrowSoilAimedSlotIndex,
} from "./fpBalconyGrowTrayAim.js";

const _inspectAnchorScratch = new THREE.Vector3();
const _boundsScratch = new THREE.Box3();
const _camDirScratch = new THREE.Vector3();
const _toTrayScratch = new THREE.Vector3();
const _trayCenterScratch = new THREE.Vector3();

function publishInspectForPlantedSlot(
  unitKey: string,
  trayId: string,
  slotIndex: number,
  trayRoot: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): void {
  setBalconyGrowInspectTarget({ unitKey, trayId, slotIndex });

  trayRoot.updateMatrixWorld(true);
  const soilY = readGrowTraySoilLocalY(trayRoot);
  balconyGrowSlotWorldPosition(
    trayRoot.matrixWorld,
    slotIndex,
    soilY,
    _inspectAnchorScratch,
    trayRoot,
  );

  let liftM = 0.06;
  for (const child of trayRoot.children) {
    if (!(child instanceof THREE.Group) || child.name !== `grow_slot_visuals:${trayId}`) {
      continue;
    }
    for (const holder of child.children) {
      if (!(holder instanceof THREE.Group)) continue;
      if (holder.userData.mammothGrowSlotIndex !== slotIndex) continue;
      if (holder.children.length === 0) break;
      _boundsScratch.setFromObject(holder);
      if (!_boundsScratch.isEmpty()) {
        liftM = Math.max(liftM, _boundsScratch.max.y - _inspectAnchorScratch.y + 0.02);
      }
      break;
    }
  }

  _inspectAnchorScratch.y += liftM;
  publishBalconyGrowInspectScreenAnchor(camera, canvas, _inspectAnchorScratch);
}

function tryInspectFromTrayAim(
  hit: THREE.Intersection | { object: THREE.Object3D },
  growState: BalconyGrowOpUnitState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): boolean {
  const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
  const trayId = hit.object.userData.mammothGrowTrayId;
  if (typeof unitKey !== "string" || typeof trayId !== "string") return false;

  const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  if (!trayRoot) return false;

  const aimedSlot = resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot);
  if (aimedSlot === null || !balconyGrowLivePlantInSlot(growState, trayId, aimedSlot)) {
    return false;
  }

  publishInspectForPlantedSlot(unitKey, trayId, aimedSlot, trayRoot, camera, canvas);
  return true;
}

function tryInspectFromAimedTrayMeshes(
  camera: THREE.PerspectiveCamera,
  growState: BalconyGrowOpUnitState,
  canvas: HTMLCanvasElement,
  aimMeshes: readonly THREE.Mesh[],
): boolean {
  camera.getWorldDirection(_camDirScratch);
  let bestScore = -Infinity;
  let bestMesh: THREE.Mesh | null = null;

  for (const mesh of aimMeshes) {
    const trayId = mesh.userData.mammothGrowTrayId;
    const unitKey = mesh.userData.mammothGrowTrayUnitKey;
    if (typeof trayId !== "string" || typeof unitKey !== "string") continue;

    const trayRoot = mesh.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
    if (!trayRoot) continue;

    trayRoot.getWorldPosition(_trayCenterScratch);
    _toTrayScratch.subVectors(_trayCenterScratch, camera.position);
    const dist = _toTrayScratch.length();
    if (dist < 0.05) continue;
    _toTrayScratch.multiplyScalar(1 / dist);
    const dot = _toTrayScratch.dot(_camDirScratch);
    if (dot < 0.62) continue;

    const score = dot - dist * 0.02;
    if (score > bestScore) {
      bestScore = score;
      bestMesh = mesh;
    }
  }

  if (!bestMesh) return false;
  return tryInspectFromTrayAim({ object: bestMesh }, growState, camera, canvas);
}

/** Aim overlay at the planted slot mesh — only when a live plant occupies the quadrant. */
export function syncBalconyGrowInspect(
  hits: readonly THREE.Intersection[],
  growState: BalconyGrowOpUnitState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  aimMeshes: readonly THREE.Mesh[],
): void {
  for (const hit of hits) {
    const slotIndex = hit.object.userData.mammothGrowSlotIndex;
    if (typeof slotIndex !== "number") continue;

    const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
    const trayId = hit.object.userData.mammothGrowTrayId;
    if (typeof unitKey !== "string" || typeof trayId !== "string") continue;

    if (!balconyGrowLivePlantInSlot(growState, trayId, slotIndex)) continue;

    const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
    if (!trayRoot) continue;

    publishInspectForPlantedSlot(unitKey, trayId, slotIndex, trayRoot, camera, canvas);
    return;
  }

  for (const hit of hits) {
    if (typeof hit.object.userData.mammothGrowSlotIndex === "number") continue;
    if (tryInspectFromTrayAim(hit, growState, camera, canvas)) return;
  }

  if (tryInspectFromAimedTrayMeshes(camera, growState, canvas, aimMeshes)) return;

  setBalconyGrowInspectTarget(null);
  publishBalconyGrowInspectScreenAnchor(camera, canvas, null);
}

/** @deprecated Use {@link syncBalconyGrowInspect}. */
export function syncBalconyGrowInspectFromHits(
  hits: readonly THREE.Intersection[],
  growState: BalconyGrowOpUnitState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): void {
  syncBalconyGrowInspect(hits, growState, camera, canvas, []);
}
