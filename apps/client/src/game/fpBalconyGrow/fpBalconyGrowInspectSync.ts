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
const _slotWorldScratch = new THREE.Vector3();
const _slotNdcScratch = new THREE.Vector3();
const _uniqueTrayMeshesScratch: THREE.Mesh[] = [];

const PROJECTED_SLOT_TARGET_RADIUS_PX = 130;

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
      if (Number(holder.userData.mammothGrowSlotIndex) !== slotIndex) continue;
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

function resolveLivePlantSlotFromHit(
  hit: THREE.Intersection | { object: THREE.Object3D },
  growState: BalconyGrowOpUnitState,
  camera: THREE.PerspectiveCamera,
): { unitKey: string; trayId: string; slotIndex: number; trayRoot: THREE.Object3D } | null {
  const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
  const trayId = hit.object.userData.mammothGrowTrayId;
  if (typeof unitKey !== "string" || typeof trayId !== "string") return null;

  const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  if (!trayRoot) return null;

  const explicitSlot = hit.object.userData.mammothGrowSlotIndex;
  const slotIndex =
    typeof explicitSlot === "number"
      ? explicitSlot
      : resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot);
  if (slotIndex === null || !balconyGrowLivePlantInSlot(growState, trayId, slotIndex)) {
    return null;
  }

  return { unitKey, trayId, slotIndex, trayRoot };
}

function collectUniqueTrayMeshes(
  aimMeshes: readonly THREE.Mesh[],
  trayPickMeshes: readonly THREE.Mesh[],
): readonly THREE.Mesh[] {
  _uniqueTrayMeshesScratch.length = 0;
  const seen = new Set<string>();
  const consider = (mesh: THREE.Mesh): void => {
    const unitKey = mesh.userData.mammothGrowTrayUnitKey;
    const trayId = mesh.userData.mammothGrowTrayId;
    if (typeof unitKey !== "string" || typeof trayId !== "string") return;
    const key = `${unitKey}:${trayId}`;
    if (seen.has(key)) return;
    seen.add(key);
    _uniqueTrayMeshesScratch.push(mesh);
  };
  for (const mesh of aimMeshes) consider(mesh);
  for (const mesh of trayPickMeshes) consider(mesh);
  return _uniqueTrayMeshesScratch;
}

/** Soil-plane snap on nearby trays — same quadrant logic as planting. */
function tryInspectFromSoilAimedTrays(
  camera: THREE.PerspectiveCamera,
  growState: BalconyGrowOpUnitState,
  canvas: HTMLCanvasElement,
  trayMeshes: readonly THREE.Mesh[],
): boolean {
  camera.getWorldDirection(_camDirScratch);
  let bestScore = -Infinity;
  let best: {
    unitKey: string;
    trayId: string;
    slotIndex: number;
    trayRoot: THREE.Object3D;
  } | null = null;

  for (const mesh of trayMeshes) {
    const unitKey = mesh.userData.mammothGrowTrayUnitKey;
    const trayId = mesh.userData.mammothGrowTrayId;
    if (typeof unitKey !== "string" || typeof trayId !== "string") continue;

    const trayRoot = mesh.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
    if (!trayRoot) continue;

    const aimedSlot = resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot);
    if (aimedSlot === null || !balconyGrowLivePlantInSlot(growState, trayId, aimedSlot)) {
      continue;
    }

    trayRoot.updateMatrixWorld(true);
    const soilY = readGrowTraySoilLocalY(trayRoot);
    balconyGrowSlotWorldPosition(
      trayRoot.matrixWorld,
      aimedSlot,
      soilY,
      _slotWorldScratch,
      trayRoot,
    );

    _toTrayScratch.subVectors(_slotWorldScratch, camera.position);
    const dist = _toTrayScratch.length();
    if (dist < 0.05) continue;
    _toTrayScratch.multiplyScalar(1 / dist);
    const dot = _toTrayScratch.dot(_camDirScratch);
    const score = dot - dist * 0.008;
    if (score > bestScore) {
      bestScore = score;
      best = { unitKey, trayId, slotIndex: aimedSlot, trayRoot };
    }
  }

  if (!best) return false;
  publishInspectForPlantedSlot(
    best.unitKey,
    best.trayId,
    best.slotIndex,
    best.trayRoot,
    camera,
    canvas,
  );
  return true;
}

/** Low trays are easy to visually aim at while missing their pick/soil ray; use reticle proximity too. */
function tryInspectFromProjectedLiveSlots(
  camera: THREE.PerspectiveCamera,
  growState: BalconyGrowOpUnitState,
  canvas: HTMLCanvasElement,
  trayMeshes: readonly THREE.Mesh[],
): boolean {
  const radiusPx = Math.min(
    PROJECTED_SLOT_TARGET_RADIUS_PX,
    Math.max(64, Math.min(canvas.clientWidth, canvas.clientHeight) * 0.18),
  );
  const radiusSq = radiusPx * radiusPx;
  const centerX = canvas.clientWidth * 0.5;
  const centerY = canvas.clientHeight * 0.5;

  let bestScore = Number.POSITIVE_INFINITY;
  let best: {
    unitKey: string;
    trayId: string;
    slotIndex: number;
    trayRoot: THREE.Object3D;
  } | null = null;

  for (const mesh of trayMeshes) {
    const unitKey = mesh.userData.mammothGrowTrayUnitKey;
    const trayId = mesh.userData.mammothGrowTrayId;
    if (typeof unitKey !== "string" || typeof trayId !== "string") continue;

    const trayRoot = mesh.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
    if (!trayRoot) continue;

    trayRoot.updateMatrixWorld(true);
    const soilY = readGrowTraySoilLocalY(trayRoot);
    for (const plant of growState.plants) {
      if (plant.trayId !== trayId || Number(plant.phase) === 0) continue;
      const slotIndex = Number(plant.slotIndex);
      balconyGrowSlotWorldPosition(
        trayRoot.matrixWorld,
        slotIndex,
        soilY,
        _slotWorldScratch,
        trayRoot,
      );

      _slotNdcScratch.copy(_slotWorldScratch).project(camera);
      if (_slotNdcScratch.z < -1 || _slotNdcScratch.z > 1) continue;

      const x = (_slotNdcScratch.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (-_slotNdcScratch.y * 0.5 + 0.5) * canvas.clientHeight;
      const dx = x - centerX;
      const dy = y - centerY;
      const screenDistSq = dx * dx + dy * dy;
      if (screenDistSq > radiusSq) continue;

      const worldDist = _slotWorldScratch.distanceToSquared(camera.position);
      const score = screenDistSq + worldDist * 0.002;
      if (score < bestScore) {
        bestScore = score;
        best = { unitKey, trayId, slotIndex, trayRoot };
      }
    }
  }

  if (!best) return false;
  publishInspectForPlantedSlot(
    best.unitKey,
    best.trayId,
    best.slotIndex,
    best.trayRoot,
    camera,
    canvas,
  );
  return true;
}

/** Aim overlay at the planted slot — when a live plant occupies the aimed quadrant. */
export function syncBalconyGrowInspect(
  hits: readonly THREE.Intersection[],
  growState: BalconyGrowOpUnitState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  aimMeshes: readonly THREE.Mesh[],
  trayPickMeshes: readonly THREE.Mesh[] = [],
): void {
  for (const hit of hits) {
    const resolved = resolveLivePlantSlotFromHit(hit, growState, camera);
    if (!resolved) continue;
    publishInspectForPlantedSlot(
      resolved.unitKey,
      resolved.trayId,
      resolved.slotIndex,
      resolved.trayRoot,
      camera,
      canvas,
    );
    return;
  }

  const trayMeshes = collectUniqueTrayMeshes(aimMeshes, trayPickMeshes);
  if (tryInspectFromSoilAimedTrays(camera, growState, canvas, trayMeshes)) return;
  if (tryInspectFromProjectedLiveSlots(camera, growState, canvas, trayMeshes)) return;

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
