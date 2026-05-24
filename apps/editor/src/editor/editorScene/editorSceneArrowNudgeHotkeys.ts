import * as THREE from "three";
import { useEditorStore } from "../../state/editorStore.js";
import type { TransformMode } from "../../state/editorStoreTypes.js";
import { editorKeyboardTargetIsFormField } from "./editorSceneTransformModeHotkeys.js";
import { isFpMode } from "./editorStoreModeGuards.js";
import { anchoredScaleAnchorLocalPoint, computeAnchoredScalePosition } from "../scene/anchoredScaleGizmo.js";

export type EditorArrowNudgeKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export const EDITOR_ARROW_TRANSLATE_NUDGE_M = 0.05;
export const EDITOR_ARROW_SCALE_NUDGE_M = 0.05;

const screenRightScratch = new THREE.Vector3();
const screenUpScratch = new THREE.Vector3();
const localBeforeScratch = new THREE.Vector3();
const localAfterScratch = new THREE.Vector3();
const worldBeforeScratch = new THREE.Vector3();
const worldAfterScratch = new THREE.Vector3();
const scaleBoundsInvWorldScratch = new THREE.Matrix4();
const scaleBoundsWorldScratch = new THREE.Box3();
const scaleBoundsLocalScratch = new THREE.Box3();

export function editorArrowNudgeKey(key: string): EditorArrowNudgeKey | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
      return key;
    default:
      return null;
  }
}

export function editorArrowNudgeStep(opts: {
  baseStep: number;
  gridSnapM: number;
  shiftKey: boolean;
  altKey: boolean;
}): number {
  const snap = Number.isFinite(opts.gridSnapM) && opts.gridSnapM > 0 ? opts.gridSnapM : 0;
  let step = snap > 0 ? snap : opts.baseStep;
  if (opts.shiftKey) step *= 10;
  if (opts.altKey) step *= 0.1;
  return step;
}

export function editorArrowNudgeScreenAxis(
  camera: THREE.Camera,
  key: EditorArrowNudgeKey,
): THREE.Vector3 {
  const axis =
    key === "ArrowLeft" || key === "ArrowRight"
      ? screenRightScratch.setFromMatrixColumn(camera.matrixWorld, 0)
      : screenUpScratch.setFromMatrixColumn(camera.matrixWorld, 1);
  return axis.normalize();
}

export function editorArrowNudgeSignedWorldDelta(opts: {
  camera: THREE.Camera;
  key: EditorArrowNudgeKey;
  step: number;
}): THREE.Vector3 {
  const sign = opts.key === "ArrowLeft" || opts.key === "ArrowDown" ? -1 : 1;
  return editorArrowNudgeScreenAxis(opts.camera, opts.key).clone().multiplyScalar(opts.step * sign);
}

export function editorArrowNudgeDominantScaleAxis(
  camera: THREE.Camera,
  key: EditorArrowNudgeKey,
): "x" | "y" | "z" {
  const axis = editorArrowNudgeScreenAxis(camera, key);
  const ax = Math.abs(axis.x);
  const ay = Math.abs(axis.y);
  const az = Math.abs(axis.z);
  if (ay >= ax && ay >= az) return "y";
  if (az >= ax && az >= ay) return "z";
  return "x";
}

export function editorArrowNudgeDirectionalScaleRequest(
  camera: THREE.Camera,
  key: EditorArrowNudgeKey,
): { axis: "x" | "y" | "z"; sideSign: -1 | 1 } {
  const screenAxis = editorArrowNudgeScreenAxis(camera, key);
  const arrowSign = key === "ArrowLeft" || key === "ArrowDown" ? -1 : 1;
  const axis = editorArrowNudgeDominantScaleAxis(camera, key);
  const component = axis === "x" ? screenAxis.x : axis === "y" ? screenAxis.y : screenAxis.z;
  const sideSign = component * arrowSign < 0 ? -1 : 1;
  return { axis, sideSign };
}

export function applyEditorArrowTranslateNudge(
  object: THREE.Object3D,
  worldDelta: THREE.Vector3,
): void {
  if (!object.parent) {
    object.position.add(worldDelta);
    return;
  }
  object.getWorldPosition(worldBeforeScratch);
  worldAfterScratch.copy(worldBeforeScratch).add(worldDelta);
  object.parent.worldToLocal(localBeforeScratch.copy(worldBeforeScratch));
  object.parent.worldToLocal(localAfterScratch.copy(worldAfterScratch));
  object.position.add(localAfterScratch.sub(localBeforeScratch));
}

function localBoundsForArrowScale(root: THREE.Object3D): THREE.Box3 | null {
  root.updateWorldMatrix(true, true);
  scaleBoundsInvWorldScratch.copy(root.matrixWorld).invert();
  const bounds = new THREE.Box3();
  let has = false;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry;
    if (!geom) return;
    geom.computeBoundingBox();
    if (!geom.boundingBox) return;
    obj.updateWorldMatrix(true, false);
    scaleBoundsWorldScratch.copy(geom.boundingBox).applyMatrix4(obj.matrixWorld);
    scaleBoundsLocalScratch.copy(scaleBoundsWorldScratch).applyMatrix4(scaleBoundsInvWorldScratch);
    if (has) {
      bounds.union(scaleBoundsLocalScratch);
    } else {
      bounds.copy(scaleBoundsLocalScratch);
      has = true;
    }
  });
  return has ? bounds : null;
}

export function applyEditorArrowDirectionalScaleNudge(
  object: THREE.Object3D,
  axis: "x" | "y" | "z",
  sideSign: -1 | 1,
  faceDeltaM: number,
): void {
  const bounds = localBoundsForArrowScale(object);
  if (!bounds) return;

  const size = new THREE.Vector3();
  bounds.getSize(size);
  const localSize = size[axis];
  if (localSize <= 1e-6) return;

  const startPosition = object.position.clone();
  const startScale = object.scale.clone();
  const currentScale = object.scale.clone();
  const currentSize = localSize * Math.abs(startScale[axis]);
  const nextSize = Math.max(0.001, currentSize + faceDeltaM);
  currentScale[axis] = Math.max(0.001, startScale[axis] * (nextSize / currentSize));
  object.scale.copy(currentScale);

  const anchorLocalPoint = anchoredScaleAnchorLocalPoint({
    axis: axis.toUpperCase() as "X" | "Y" | "Z",
    localBounds: bounds,
    handleAxisSigns: new THREE.Vector3(
      axis === "x" ? sideSign : 0,
      axis === "y" ? sideSign : 0,
      axis === "z" ? sideSign : 0,
    ),
  });
  object.position.copy(
    computeAnchoredScalePosition({
      startPosition,
      startScale,
      currentScale,
      rotation: object.quaternion,
      anchorLocalPoint,
    }),
  );
}

export function registerEditorArrowNudgeHotkeys(opts: {
  getTransformControlsDragging: () => boolean;
  getAttachedObject: () => THREE.Object3D | undefined;
  getCamera: () => THREE.Camera;
  dispatchTransformObjectChange: () => void;
  requestRender: () => void;
}): () => void {
  const onKeyDown = (ev: KeyboardEvent): void => {
    const key = editorArrowNudgeKey(ev.key);
    if (!key) return;
    if (editorKeyboardTargetIsFormField(ev.target)) return;
    if (ev.ctrlKey || ev.metaKey) return;
    if (opts.getTransformControlsDragging()) return;

    const store = useEditorStore.getState();
    if (isFpMode(store.mode)) return;
    const transformMode: TransformMode = store.transformMode;
    if (transformMode !== "translate" && transformMode !== "scale") return;

    const attached = opts.getAttachedObject();
    if (!attached) return;

    ev.preventDefault();
    ev.stopPropagation();

    const camera = opts.getCamera();
    store.beginTransaction();
    try {
      if (transformMode === "translate") {
        applyEditorArrowTranslateNudge(
          attached,
          editorArrowNudgeSignedWorldDelta({
            camera,
            key,
            step: editorArrowNudgeStep({
              baseStep: EDITOR_ARROW_TRANSLATE_NUDGE_M,
              gridSnapM: store.gridSnapM,
              shiftKey: ev.shiftKey,
              altKey: ev.altKey,
            }),
          }),
        );
      } else {
        const request = editorArrowNudgeDirectionalScaleRequest(camera, key);
        applyEditorArrowDirectionalScaleNudge(
          attached,
          request.axis,
          request.sideSign,
          editorArrowNudgeStep({
            baseStep: EDITOR_ARROW_SCALE_NUDGE_M,
            gridSnapM: store.gridSnapM,
            shiftKey: ev.shiftKey,
            altKey: ev.altKey,
          }) * (ev.altKey ? -1 : 1),
        );
      }
      opts.dispatchTransformObjectChange();
      opts.requestRender();
    } finally {
      store.commitTransaction();
    }
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}
