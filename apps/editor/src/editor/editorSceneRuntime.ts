import * as THREE from "three";
import { MOUSE } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  createFPCamera,
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  type LocalFirstPersonPresenter,
  type PrimitiveSwingKeyframe,
} from "@the-mammoth/engine";
import { useEditorStore } from "../state/editorStore.js";
import {
  disposeSceneEnvironment,
  disposeSubtreeGpuAssets,
} from "./disposeSubtree.js";
import { registerEditorSpawnCalculator } from "./spawnBridge.js";
import { FpViewmodelEditorSession } from "./fpViewmodelEditorSession.js";
import {
  getFpViewmodelAuthoringPicks,
  registerFpViewmodelAuthoringBridge,
} from "./fpViewmodelAuthoringBridge.js";
import { resolveFpAuthorPickId } from "./fpAuthorPickResolve.js";
import { FpSelectionAabbOutline } from "./fpSelectionAabbOutline.js";
import {
  adoptWeaponPresentationFileText,
  getLastWeaponPresentationFileText,
  registerWeaponPresentationPostSaveApply,
  resetWeaponPresentationEditorSyncStateForTeardown,
} from "./weaponPresentationEditorSync.js";
import { objectLivesUnderScene } from "./sceneGraphUtils.js";
import {
  buildMeleeSwingKeyframesFromFpRootAbsLocals,
  intersectViewportRayWithSwingSweepPlaneFpRootLocal,
  projectViewportStrokeToFpRootLocals,
} from "./fpSwingViewportStroke.js";
import { registerEditorSwingStrokeReview } from "./editorSwingStrokeReviewBridge.js";
import { resolvePlacedId } from "./editorPlacementKeys.js";
import { emptyFloorDoc } from "./editorEmptyFloorDoc.js";
import {
  syncDuplicateFloorGroups,
  syncFloorTransforms,
  syncInteriorTransforms,
} from "./editorFloorTransformSync.js";
import { addEditorSceneLighting } from "./editorSceneLighting.js";
import { createEditorPmremEnvironment } from "./editorSceneEnvironment.js";
import { buildEditorStructuralRoot } from "./editorBuildingContentMount.js";

export function mountEditorScene(canvas: HTMLCanvasElement): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a22);

  const camera = createFPCamera();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { dir, grid } = addEditorSceneLighting(scene);

  const textureLoader = new THREE.TextureLoader();
  const { pmrem, applyEnvironment } = createEditorPmremEnvironment(scene, renderer);

  const contentRoot = new THREE.Group();
  contentRoot.name = "editorContentRoot";
  scene.add(contentRoot);

  /**
   * Defer {@link TransformControls#connect} until after our capture listener is registered so
   * "paint swing" can `stopImmediatePropagation` before Three's `pointerdown` runs. Otherwise TC
   * always captures first, then `enabled = false` makes its `pointerup` no-op — leaving orphan
   * `pointermove` listeners and a wedged gizmo.
   */
  const transformControls = new TransformControls(camera, null);
  /**
   * {@link TransformControls} dispatches `change` when `object`/camera/mode/etc. are set.
   * Our listener calls into Zustand; a nested subscribe can still see stale `prev` and think
   * the FP gizmo must re-sync → infinite recursion. Ignore `change` during programmatic sync.
   */
  let programmaticTransformControlsDepth = 0;
  function withProgrammaticTransformControls<T>(fn: () => T): T {
    programmaticTransformControlsDepth++;
    try {
      return fn();
    } finally {
      programmaticTransformControlsDepth--;
    }
  }

  transformControls.addEventListener("dragging-changed", (ev) => {
    const raw = ev as unknown as { value?: boolean };
    const active = raw.value === true;
    const st = useEditorStore.getState();
    if (st.mode === "fp_viewmodel") {
      orbitControls.enabled = !active && st.fpAuthorCamera === "orbit";
      return;
    }
    if (active) useEditorStore.getState().beginTransaction();
    else useEditorStore.getState().commitTransaction();
  });
  transformControls.addEventListener("change", () => {
    if (programmaticTransformControlsDepth > 0) return;
    const store = useEditorStore.getState();
    if (store.mode === "fp_viewmodel") {
      const pres = fpSession?.getPresenter();
      const attached = transformControls.object as THREE.Object3D | undefined;
      if (pres && attached) {
        const pid = pres.getAuthoringPickList().find((p) => p.object === attached)?.id;
        if (pid === "rigRoot") pres.syncAuthoringRigRestFromAttachedRig();
      }
      store.bumpFpAuthorLive();
      return;
    }
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (!attached) return;
    const id = attached.userData.placedObjectId as string | undefined;
    if (!id) return;
    const pos: [number, number, number] = [
      attached.position.x,
      attached.position.y,
      attached.position.z,
    ];
    const rot: [number, number, number, number] = [
      attached.quaternion.x,
      attached.quaternion.y,
      attached.quaternion.z,
      attached.quaternion.w,
    ];
    const sc: [number, number, number] = [
      attached.scale.x,
      attached.scale.y,
      attached.scale.z,
    ];
    if (store.mode === "floor") {
      store.updatePlacedObject(store.activeFloorDocId, id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
      syncDuplicateFloorGroups(contentRoot, id, attached);
    } else {
      store.updateInteriorPlacement(store.activeInteriorDocId, id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
    }
  });
  const transformHelper = transformControls.getHelper();
  scene.add(transformHelper);

  /** Defer {@link OrbitControls#connect} until after {@link TransformControls#connect} (see `rewireCanvasPrimaryPointerListeners`). */
  const orbitControls = new OrbitControls(camera, null);
  orbitControls.enableDamping = true;
  orbitControls.target.set(0, 1.45, 0);
  orbitControls.minDistance = 0.22;
  orbitControls.maxDistance = 6;
  orbitControls.update();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const fpSelectionOutline = new FpSelectionAabbOutline();
  fpSelectionOutline.visible = false;
  scene.add(fpSelectionOutline);

  let fpClickCandidate: { x: number; y: number } | null = null;
  let swingStrokeDragging = false;
  let swingStrokeCapturePointerId: number | null = null;
  let swingStrokeBuf: { clientX: number; clientY: number }[] = [];
  /** 2D stroke preview while painting a swing (sits above the WebGL canvas, below the tools panel). */
  let swingStrokeOverlayEl: HTMLCanvasElement | null = null;
  /** Editable 3D path (fpRoot-local) after a stroke, before Confirm. */
  let swingReviewLocals: THREE.Vector3[] | null = null;
  let swingReviewDragIdx: number | null = null;
  /** Preview track while reviewing; overrides store draft in the scene tick until Confirm. */
  let swingReviewPreviewKeys: PrimitiveSwingKeyframe[] | null = null;
  let swingReviewCanvasListenersAttached = false;
  const _swingProj = new THREE.Vector3();
  const _swingProjOut = { x: 0, y: 0 };

  function onSwingStrokeOverlayWindowResize(): void {
    if (!swingStrokeOverlayEl) return;
    if (swingStrokeDragging && swingStrokeBuf.length > 0) {
      redrawSwingStrokeOverlayFromBuf(swingStrokeBuf);
    } else if (swingReviewLocals && swingReviewLocals.length > 0) {
      redrawSwingReviewOverlay();
    } else {
      resizeSwingStrokeOverlayOnly();
    }
  }

  function canvasHostCssSize(): { w: number; h: number } {
    const parent = canvas.parentElement;
    if (parent) {
      return { w: Math.max(1, parent.clientWidth), h: Math.max(1, parent.clientHeight) };
    }
    return { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
  }

  function ensureSwingStrokeOverlayMounted(): void {
    if (swingStrokeOverlayEl) return;
    const el = document.createElement("canvas");
    el.dataset.editorFpSwingStroke = "1";
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.pointerEvents = "none";
    el.style.zIndex = "1";
    const parent = canvas.parentElement;
    if (parent) parent.appendChild(el);
    else document.body.appendChild(el);
    swingStrokeOverlayEl = el;
    window.addEventListener("resize", onSwingStrokeOverlayWindowResize);
  }

  function resizeSwingStrokeOverlayOnly(): void {
    if (!swingStrokeOverlayEl) return;
    const { w, h } = canvasHostCssSize();
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    swingStrokeOverlayEl.width = Math.floor(w * dpr);
    swingStrokeOverlayEl.height = Math.floor(h * dpr);
    swingStrokeOverlayEl.style.width = `${w}px`;
    swingStrokeOverlayEl.style.height = `${h}px`;
  }

  function redrawSwingStrokeOverlayFromBuf(buf: { clientX: number; clientY: number }[]): void {
    ensureSwingStrokeOverlayMounted();
    if (!swingStrokeOverlayEl) return;
    resizeSwingStrokeOverlayOnly();
    const ctx = swingStrokeOverlayEl.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, swingStrokeOverlayEl.width, swingStrokeOverlayEl.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (buf.length === 0) return;
    const r = canvas.getBoundingClientRect();
    const lx = (cx: number) => cx - r.left;
    const ly = (cy: number) => cy - r.top;
    const p0 = buf[0]!;
    const x0 = lx(p0.clientX);
    const y0 = ly(p0.clientY);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(64, 255, 180, 1)";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
    ctx.shadowBlur = 14;
    if (buf.length === 1) {
      ctx.fillStyle = "rgba(64, 255, 180, 0.95)";
      ctx.beginPath();
      ctx.arc(x0, y0, 8, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < buf.length; i++) {
      ctx.lineTo(lx(buf[i]!.clientX), ly(buf[i]!.clientY));
    }
    ctx.stroke();
  }

  function clearSwingStrokeOverlay(): void {
    if (!swingStrokeOverlayEl) return;
    const ctx = swingStrokeOverlayEl.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, swingStrokeOverlayEl.width, swingStrokeOverlayEl.height);
  }

  function setSwingStrokeOverlayPointerInteractive(on: boolean): void {
    if (!swingStrokeOverlayEl) return;
    swingStrokeOverlayEl.style.pointerEvents = on ? "auto" : "none";
    swingStrokeOverlayEl.style.cursor = on ? "crosshair" : "default";
  }

  function projectSwingLocalToCanvasCss(
    local: THREE.Vector3,
    fpRoot: THREE.Object3D,
    pickCam: THREE.Camera,
    canvasRect: DOMRect,
    out: { x: number; y: number },
  ): boolean {
    _swingProj.copy(local).applyMatrix4(fpRoot.matrixWorld);
    _swingProj.project(pickCam);
    if (!Number.isFinite(_swingProj.x) || !Number.isFinite(_swingProj.y)) return false;
    out.x = (_swingProj.x * 0.5 + 0.5) * canvasRect.width;
    out.y = (-_swingProj.y * 0.5 + 0.5) * canvasRect.height;
    return true;
  }

  function rebuildSwingReviewPreview(): void {
    if (!swingReviewLocals || swingReviewLocals.length < 2 || !fpSession?.getPresenter()) {
      swingReviewPreviewKeys = null;
      return;
    }
    const pres = fpSession.getPresenter()!;
    fpSession.syncWorldMatrices();
    const rig = pres.getFpRigRestLocal();
    try {
      swingReviewPreviewKeys = buildMeleeSwingKeyframesFromFpRootAbsLocals({
        absLocals: swingReviewLocals,
        rigRestPositionLocal: rig.position,
      });
    } catch {
      swingReviewPreviewKeys = null;
    }
  }

  function redrawSwingReviewOverlay(): void {
    ensureSwingStrokeOverlayMounted();
    if (!swingStrokeOverlayEl || !swingReviewLocals || swingReviewLocals.length === 0) return;
    const pres = fpSession?.getPresenter();
    if (!pres) return;
    fpSession?.syncWorldMatrices();
    const st = useEditorStore.getState();
    const pickCam =
      st.fpAuthorCamera === "gameplay" && fpSession ? fpSession.getGameplayCamera() : camera;
    const r = canvas.getBoundingClientRect();
    const fpRoot = pres.getFpViewmodelAuthoringRoot();
    resizeSwingStrokeOverlayOnly();
    const ctx = swingStrokeOverlayEl.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, swingStrokeOverlayEl.width, swingStrokeOverlayEl.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cssPts: { x: number; y: number }[] = [];
    for (const loc of swingReviewLocals) {
      if (!projectSwingLocalToCanvasCss(loc, fpRoot, pickCam, r, _swingProjOut)) continue;
      cssPts.push({ x: _swingProjOut.x, y: _swingProjOut.y });
    }
    if (cssPts.length < 2) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(64, 255, 200, 0.95)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(cssPts[0]!.x, cssPts[0]!.y);
    for (let i = 1; i < cssPts.length; i++) {
      ctx.lineTo(cssPts[i]!.x, cssPts[i]!.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    const handleR = 9;
    for (let i = 0; i < cssPts.length; i++) {
      const p = cssPts[i]!;
      const active = swingReviewDragIdx === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, handleR, 0, Math.PI * 2);
      ctx.fillStyle = active ? "rgba(255, 220, 120, 0.98)" : "rgba(255, 255, 255, 0.92)";
      ctx.fill();
      ctx.strokeStyle = active ? "rgba(255, 160, 40, 1)" : "rgba(40, 200, 140, 1)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function detachSwingReviewCanvasListeners(): void {
    if (!swingReviewCanvasListenersAttached) return;
    canvas.removeEventListener("pointerdown", onSwingReviewCanvasPointerDownCapture, { capture: true });
    canvas.removeEventListener("pointermove", onSwingReviewPointerMove);
    canvas.removeEventListener("pointerup", onSwingReviewPointerUp);
    canvas.removeEventListener("pointercancel", onSwingReviewPointerCancel);
    swingReviewCanvasListenersAttached = false;
  }

  function attachSwingReviewCanvasListeners(): void {
    if (swingReviewCanvasListenersAttached) return;
    canvas.addEventListener("pointerdown", onSwingReviewCanvasPointerDownCapture, { capture: true });
    canvas.addEventListener("pointermove", onSwingReviewPointerMove);
    canvas.addEventListener("pointerup", onSwingReviewPointerUp);
    canvas.addEventListener("pointercancel", onSwingReviewPointerCancel);
    swingReviewCanvasListenersAttached = true;
  }

  /**
   * Capture phase: when a handle is hit, block orbit / transform from seeing this gesture (same
   * idea as paint swing). Misses fall through so middle-drag orbit still works.
   */
  function onSwingReviewCanvasPointerDownCapture(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    if (ev.currentTarget !== canvas) return;
    if (!swingReviewLocals || swingReviewLocals.length < 2) return;
    const pres = fpSession?.getPresenter();
    if (!pres) return;
    fpSession?.syncWorldMatrices();
    const st = useEditorStore.getState();
    const pickCam =
      st.fpAuthorCamera === "gameplay" && fpSession ? fpSession.getGameplayCamera() : camera;
    const r = canvas.getBoundingClientRect();
    const fpRoot = pres.getFpViewmodelAuthoringRoot();
    const lx = ev.clientX - r.left;
    const ly = ev.clientY - r.top;
    let best = -1;
    let bestD = 1e9;
    for (let i = 0; i < swingReviewLocals.length; i++) {
      if (!projectSwingLocalToCanvasCss(swingReviewLocals[i]!, fpRoot, pickCam, r, _swingProjOut))
        continue;
      const d = Math.hypot(_swingProjOut.x - lx, _swingProjOut.y - ly);
      if (d < bestD && d < 16) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    swingReviewDragIdx = best;
    canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    ev.stopImmediatePropagation();
    redrawSwingReviewOverlay();
  }

  function onSwingReviewPointerMove(ev: PointerEvent): void {
    if (swingReviewDragIdx === null || !swingReviewLocals) return;
    const pres = fpSession?.getPresenter();
    if (!pres) return;
    fpSession?.syncWorldMatrices();
    const st = useEditorStore.getState();
    const pickCam =
      st.fpAuthorCamera === "gameplay" && fpSession ? fpSession.getGameplayCamera() : camera;
    const r = canvas.getBoundingClientRect();
    const fpRoot = pres.getFpViewmodelAuthoringRoot();
    const rig = pres.getFpRigRestLocal();
    const hit = intersectViewportRayWithSwingSweepPlaneFpRootLocal({
      clientPoint: { clientX: ev.clientX, clientY: ev.clientY },
      canvasRect: r,
      pickCamera: pickCam,
      fpRoot,
      rigRestPositionLocal: rig.position,
    });
    if (hit) {
      swingReviewLocals[swingReviewDragIdx]!.copy(hit);
      rebuildSwingReviewPreview();
      redrawSwingReviewOverlay();
    }
  }

  function onSwingReviewPointerUp(ev: PointerEvent): void {
    if (swingReviewDragIdx === null) return;
    swingReviewDragIdx = null;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* not captured */
    }
    redrawSwingReviewOverlay();
  }

  function onSwingReviewPointerCancel(ev: PointerEvent): void {
    onSwingReviewPointerUp(ev);
  }

  function endSwingStrokeReviewSession(): void {
    detachSwingReviewCanvasListeners();
    swingReviewLocals = null;
    swingReviewDragIdx = null;
    swingReviewPreviewKeys = null;
    useEditorStore.getState().setFpSwingStrokeReviewActive(false);
    setSwingStrokeOverlayPointerInteractive(false);
    clearSwingStrokeOverlay();
    transformControls.enabled = true;
    rewireCanvasPrimaryPointerListeners();
  }

  function confirmSwingReviewFromUser(): void {
    const keys = swingReviewPreviewKeys;
    if (!keys?.length) {
      useEditorStore
        .getState()
        .showFpAuthorToast("Path invalid — adjust handles or cancel and paint again.", 5600);
      return;
    }
    const n = keys.length;
    const store = useEditorStore.getState();
    store.setFpSwingKeyframesDraft(keys);
    endSwingStrokeReviewSession();
    store.showFpAuthorToast(
      `Swing confirmed: ${n} keyframes (motion in head-pitch space). Play or Save layout.`,
      6200,
    );
  }

  function cancelSwingReviewFromUser(): void {
    if (!useEditorStore.getState().fpSwingStrokeReviewActive) return;
    endSwingStrokeReviewSession();
    useEditorStore.getState().showFpAuthorToast("Swing path edit cancelled.", 3200);
  }

  function disposeSwingStrokeOverlay(): void {
    detachSwingReviewCanvasListeners();
    window.removeEventListener("resize", onSwingStrokeOverlayWindowResize);
    swingStrokeOverlayEl?.remove();
    swingStrokeOverlayEl = null;
  }

  let buildingRoot: THREE.Group | null = null;
  let lastBuiltContentEpoch = -1;

  let fpSession: FpViewmodelEditorSession | null = null;
  let fpSessionLoading = false;
  /** Wireframe at canonical rig rest (head-pitch space); editor-only. */
  let fpDefaultRigAnchor: THREE.LineSegments | null = null;
  /** Last FP gizmo attach signature from store (refreshed in syncFpTransformAttachment). */
  let lastFpGizmoAttachKey = "";

  function disposeFpDefaultRigAnchor(): void {
    if (!fpDefaultRigAnchor) return;
    fpDefaultRigAnchor.parent?.remove(fpDefaultRigAnchor);
    fpDefaultRigAnchor.geometry.dispose();
    (fpDefaultRigAnchor.material as THREE.Material).dispose();
    fpDefaultRigAnchor = null;
  }

  function attachFpDefaultRigAnchor(pres: LocalFirstPersonPresenter): void {
    disposeFpDefaultRigAnchor();
    const fpRoot = pres.getFpViewmodelAuthoringRoot();
    const box = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const mat = new THREE.LineBasicMaterial({
      color: 0x5599dd,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
    const lines = new THREE.LineSegments(edges, mat);
    lines.name = "fp_default_rig_anchor_editor";
    const d = FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED.positionM;
    lines.position.set(d.x, d.y, d.z);
    lines.renderOrder = 999;
    fpRoot.add(lines);
    fpDefaultRigAnchor = lines;
  }

  function frameOrbitOnFpViewmodel(): void {
    const pres = fpSession?.getPresenter();
    if (!pres) return;
    scene.updateMatrixWorld(true);
    const t = new THREE.Vector3();
    if (!pres.getAuthoringOrbitTargetWorld(t)) return;
    orbitControls.target.copy(t);
    const dir = new THREE.Vector3(0.58, 0.22, 0.78).normalize();
    const dist = Math.min(1.05, orbitControls.maxDistance * 0.35);
    camera.position.copy(t).addScaledVector(dir, dist);
    orbitControls.update();
  }

  /**
   * Snap to engine defaults, then nudge `rigRoot` so the crowbar mount tracks a fixed point in the
   * **gameplay camera** frame (same solver as tuning). In-memory only; use Save layout to persist.
   */
  function frameMountIntoGameplayView(): void {
    const pres = fpSession?.getPresenter();
    const cam = fpSession?.getGameplayCamera();
    if (!pres || !cam) return;
    pres.snapRigRootToAuthoringDefaults();
    if (!pres.frameWeaponMountIntoGameplayCamera(scene, cam)) {
      useEditorStore.getState().showFpAuthorToast("Could not align mount to gameplay camera (mesh not ready).", 6500);
      return;
    }
    useEditorStore.getState().bumpFpAuthorLive();
    maybeSyncFpGizmoFromStore();
    useEditorStore
      .getState()
      .showFpAuthorToast(
        "Fit hand + weapon to the gameplay camera (in memory). Save layout to write JSON.",
        6200,
      );
  }

  function disposeFpViewmodelRuntimeOnly() {
    swingStrokeDragging = false;
    swingStrokeCapturePointerId = null;
    swingStrokeBuf = [];
    swingReviewDragIdx = null;
    swingReviewLocals = null;
    swingReviewPreviewKeys = null;
    detachSwingReviewCanvasListeners();
    useEditorStore.getState().setFpSwingStrokeReviewActive(false);
    setSwingStrokeOverlayPointerInteractive(false);
    clearSwingStrokeOverlay();
    transformControls.enabled = true;
    rewireCanvasPrimaryPointerListeners();
    resetWeaponPresentationEditorSyncStateForTeardown();
    disposeFpDefaultRigAnchor();
    registerFpViewmodelAuthoringBridge(null);
    registerWeaponPresentationPostSaveApply(null);
    lastFpGizmoAttachKey = "";
    fpClickCandidate = null;
    fpSelectionOutline.setFromObject(null);
    // Detach before tearing down the FP graph so we never render with a control target that was
    // already removed from the scene (TransformControls warns and can glitch).
    withProgrammaticTransformControls(() => transformControls.detach());
    fpSession?.dispose();
    fpSession = null;
    fpSessionLoading = false;
    // Store updates run synchronously; nested subscribers still see outer `prev` until the outer
    // callback returns. Clear session *before* pick list so weapon-change teardown cannot recurse.
    useEditorStore.getState().setFpAuthorPickList([]);
  }

  function teardownFpSession() {
    disposeFpViewmodelRuntimeOnly();
    contentRoot.visible = true;
    grid.visible = true;
    camera.position.set(-38, 28, 22);
    camera.lookAt(2, 18, 0);
    orbitControls.target.set(0, 1.45, 0);
    orbitControls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };
    orbitControls.update();
  }

  function syncFpTransformAttachment() {
    /** Paint swing / path review disables the gizmo; detach-only sync paths must not leave it stuck off. */
    const restoreGizmoEnabledIfNotPainting = () => {
      const z = useEditorStore.getState();
      if (!swingStrokeDragging && !z.fpSwingStrokeReviewActive) transformControls.enabled = true;
    };
    withProgrammaticTransformControls(() => {
      const s = useEditorStore.getState();
      const pres = fpSession?.getPresenter();
      if (!pres) {
        lastFpGizmoAttachKey = "";
        return;
      }
      const picks = pres.getAuthoringPickList();
      if (picks.length === 0) {
        transformControls.detach();
        lastFpGizmoAttachKey = "";
        restoreGizmoEnabledIfNotPainting();
        return;
      }
      const hit = picks.find((p) => p.id === s.fpAuthorTargetId) ?? picks[0];
      transformControls.detach();
      if (hit && objectLivesUnderScene(hit.object, scene)) {
        transformControls.enabled = true;
        transformControls.attach(hit.object);
        transformControls.setMode(s.transformMode);
        // World-aligned handles (same as floor/interior editor default): local space tied
        // weapon/hand euler to screen-unfriendly axes; world space tracks drag vs arrow direction.
        transformControls.setSpace("world");
        // Orbit camera is meters from the subject — large handles. Gameplay uses the in-head lens;
        // 2.25 fills the frustum and hides the hand/weapon (same rig as `mountFpSession`).
        transformControls.setSize(s.fpAuthorCamera === "gameplay" ? 0.62 : 2.25);
        const snap = s.gridSnapM;
        transformControls.setTranslationSnap(snap > 0 ? snap : null);
        transformControls.setRotationSnap(snap > 0 ? THREE.MathUtils.degToRad(15) : null);
        transformControls.setScaleSnap(snap > 0 ? snap : null);
        lastFpGizmoAttachKey = `${s.fpAuthorTargetId}\0${s.transformMode}\0${s.gridSnapM}\0${s.fpAuthorCamera}`;
      } else {
        lastFpGizmoAttachKey = "";
        restoreGizmoEnabledIfNotPainting();
      }
    });
  }

  /** Re-attach gizmo when store-driven target/mode/snap changed (runs from RAF; avoids missed zustand subscribe edges). */
  function maybeSyncFpGizmoFromStore() {
    const s = useEditorStore.getState();
    if (s.mode !== "fp_viewmodel" || !fpSession?.getPresenter()) {
      lastFpGizmoAttachKey = "";
      return;
    }
    const key = `${s.fpAuthorTargetId}\0${s.transformMode}\0${s.gridSnapM}\0${s.fpAuthorCamera}`;
    if (key === lastFpGizmoAttachKey) return;
    syncFpTransformAttachment();
  }

  function ensureFpSession() {
    if (fpSession || fpSessionLoading) return;
    fpSessionLoading = true;
    const requestedWeaponId = useEditorStore.getState().fpAuthorWeaponId;
    useEditorStore.getState().setFpAuthorInitMessage("Loading FP viewmodels…");
    void FpViewmodelEditorSession.create(scene, requestedWeaponId)
      .then((s) => {
        fpSessionLoading = false;
        const store = useEditorStore.getState();
        if (store.mode !== "fp_viewmodel" || store.fpAuthorWeaponId !== requestedWeaponId) {
          s.dispose();
          if (store.mode === "fp_viewmodel") ensureFpSession();
          else useEditorStore.getState().setFpAuthorInitMessage(null);
          return;
        }
        if (s.getInitError()) {
          useEditorStore.getState().setFpAuthorInitMessage(s.getInitError());
          s.dispose();
          return;
        }
        fpSession = s;
        useEditorStore.getState().setFpAuthorInitMessage(null);
        useEditorStore.getState().bumpFpAuthorLive();
        registerWeaponPresentationPostSaveApply((weaponId, json) => {
          const pres = fpSession?.getPresenter();
          if (!pres) return;
          if (useEditorStore.getState().fpAuthorWeaponId !== weaponId) return;
          adoptWeaponPresentationFileText(pres, weaponId, json);
          maybeSyncFpGizmoFromStore();
        });
        void (async () => {
          try {
            const wid = useEditorStore.getState().fpAuthorWeaponId;
            const r = await fetch(`/content/weapons/${wid}.presentation.json`, {
              cache: "no-store",
            });
            if (!r.ok) return;
            const text = await r.text();
            if (useEditorStore.getState().mode !== "fp_viewmodel") return;
            const pres = fpSession?.getPresenter();
            if (!pres) return;
            adoptWeaponPresentationFileText(pres, wid, text);
            maybeSyncFpGizmoFromStore();
          } catch {
            /* ignore */
          }
        })();
        registerFpViewmodelAuthoringBridge({
          getPicks: () => fpSession?.getPresenter()?.getAuthoringPickList() ?? [],
          getPresenter: () => fpSession?.getPresenter(),
          frameOrbitOnViewmodel: frameOrbitOnFpViewmodel,
          frameMountIntoGameplayView,
        });
        contentRoot.visible = false;
        grid.visible = false;
        const presReady = fpSession.getPresenter();
        if (presReady) attachFpDefaultRigAnchor(presReady);
        frameOrbitOnFpViewmodel();
        syncTransformAttachment();
      })
      .catch((e) => {
        fpSessionLoading = false;
        const store = useEditorStore.getState();
        if (store.mode !== "fp_viewmodel" || store.fpAuthorWeaponId !== requestedWeaponId) {
          if (store.mode === "fp_viewmodel") ensureFpSession();
          return;
        }
        useEditorStore
          .getState()
          .setFpAuthorInitMessage(e instanceof Error ? e.message : String(e));
      });
  }

  const rebuildStructural = () => {
    const s = useEditorStore.getState();
    if (s.mode === "fp_viewmodel") return;
    const ep = s.contentStructureEpoch;
    if (ep === lastBuiltContentEpoch) return;
    lastBuiltContentEpoch = ep;

    if (buildingRoot) {
      contentRoot.remove(buildingRoot);
      disposeSubtreeGpuAssets(buildingRoot);
      buildingRoot = null;
    }

    buildingRoot = buildEditorStructuralRoot({
      mode: s.mode,
      building: s.building,
      floorDocs: s.floorDocs,
      activeInteriorDocId: s.activeInteriorDocId,
      interiorDocs: s.interiorDocs,
      textureLoader,
      emptyFloorDoc,
    });

    contentRoot.add(buildingRoot);
    syncTransformsFromStore();
    syncTransformAttachment();
  };

  function syncTransformsFromStore() {
    if (!buildingRoot) return;
    const s = useEditorStore.getState();
    if (s.mode === "floor") syncFloorTransforms(buildingRoot, s.floorDocs);
    else {
      const doc = s.interiorDocs[s.activeInteriorDocId];
      if (doc) syncInteriorTransforms(buildingRoot, doc);
    }
  }

  function syncTransformAttachment() {
    withProgrammaticTransformControls(() => {
      const s = useEditorStore.getState();
      transformControls.detach();
      if (s.mode === "fp_viewmodel") {
        syncFpTransformAttachment();
        return;
      }
      if (!buildingRoot || !s.selectedId) return;

      let target: THREE.Object3D | null = null;
      let bestD = Infinity;
      buildingRoot.traverse((o) => {
        if (o.userData.placedObjectId !== s.selectedId) return;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const d = wp.distanceToSquared(camera.position);
        if (d < bestD) {
          bestD = d;
          target = o;
        }
      });
      if (target) {
        transformControls.attach(target);
        transformControls.setMode(s.transformMode);
        transformControls.setSize(1);
        const snap = s.gridSnapM;
        transformControls.setTranslationSnap(snap > 0 ? snap : null);
        transformControls.setRotationSnap(snap > 0 ? THREE.MathUtils.degToRad(15) : null);
        transformControls.setScaleSnap(snap > 0 ? snap : null);
      }
    });
  }

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (fpSession) {
      const g = fpSession.getGameplayCamera();
      g.aspect = w / h;
      g.updateProjectionMatrix();
    }
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(canvas);

  camera.position.set(-38, 28, 22);
  camera.lookAt(2, 18, 0);

  registerEditorSpawnCalculator(() => {
    const st = useEditorStore.getState();
    const cam =
      st.mode === "fp_viewmodel" && st.fpAuthorCamera === "gameplay" && fpSession
        ? fpSession.getGameplayCamera()
        : camera;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    forward.normalize();
    return {
      position: cam.position.toArray() as [number, number, number],
      forward: forward.toArray() as [number, number, number],
    };
  });

  /** Nested `set()` inside this subscriber leaves `prev` stale; never re-run weapon teardown there. */
  let editorStoreSyncDepth = 0;
  let prev = useEditorStore.getState();
  const unsub = useEditorStore.subscribe((s) => {
    editorStoreSyncDepth++;
    try {
      if (s.mode === "fp_viewmodel" && prev.mode !== "fp_viewmodel") {
        document.exitPointerLock?.();
      }
      if (s.mode === "fp_viewmodel") {
        if (
          editorStoreSyncDepth === 1 &&
          prev.mode === "fp_viewmodel" &&
          s.fpAuthorWeaponId !== prev.fpAuthorWeaponId &&
          (fpSession || fpSessionLoading)
        ) {
          disposeFpViewmodelRuntimeOnly();
        }
        ensureFpSession();
        if (fpSession?.getPresenter()) {
          contentRoot.visible = false;
          grid.visible = false;
        }
      } else if (prev.mode === "fp_viewmodel") {
        teardownFpSession();
      }

      if (s.mode !== "fp_viewmodel") {
        if (s.contentStructureEpoch !== prev.contentStructureEpoch) {
          rebuildStructural();
        } else if (!transformControls.dragging) {
          syncTransformsFromStore();
        }
      }

      const tcFp =
        s.mode === "fp_viewmodel" &&
        Boolean(fpSession?.getPresenter()) &&
        (s.fpAuthorTargetId !== prev.fpAuthorTargetId ||
          s.fpAuthorWeaponId !== prev.fpAuthorWeaponId ||
          s.fpAuthorCamera !== prev.fpAuthorCamera ||
          s.transformMode !== prev.transformMode ||
          s.gridSnapM !== prev.gridSnapM);
      const tcLevel =
        s.mode !== "fp_viewmodel" &&
        (s.selectedId !== prev.selectedId ||
          s.transformMode !== prev.transformMode ||
          s.gridSnapM !== prev.gridSnapM ||
          s.mode !== prev.mode ||
          s.activeInteriorDocId !== prev.activeInteriorDocId);
      if (tcFp || tcLevel) {
        syncTransformAttachment();
      }

      orbitControls.enabled = s.mode === "fp_viewmodel" && s.fpAuthorCamera === "orbit";
      if (s.mode === "fp_viewmodel" && s.fpAuthorCamera === "orbit") {
        orbitControls.mouseButtons = {
          LEFT: null,
          MIDDLE: MOUSE.ROTATE,
          RIGHT: MOUSE.PAN,
        };
      } else {
        orbitControls.mouseButtons = {
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        };
      }

      if (s.shadowsEnabled !== prev.shadowsEnabled) {
        renderer.shadowMap.enabled = s.shadowsEnabled;
        dir.castShadow = s.shadowsEnabled;
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = s.shadowsEnabled;
        });
      }
      if (s.useHdriEnvironment !== prev.useHdriEnvironment) {
        applyEnvironment(s.useHdriEnvironment);
      }
      prev = s;
    } finally {
      editorStoreSyncDepth--;
    }
  });

  // Subscribers are not invoked on register — cold-start default `fp_viewmodel` must bootstrap here.
  {
    const st = useEditorStore.getState();
    if (st.mode === "fp_viewmodel") {
      ensureFpSession();
      orbitControls.enabled = st.fpAuthorCamera === "orbit";
      if (st.fpAuthorCamera === "orbit") {
        orbitControls.mouseButtons = {
          LEFT: null,
          MIDDLE: MOUSE.ROTATE,
          RIGHT: MOUSE.PAN,
        };
      } else {
        orbitControls.mouseButtons = {
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        };
      }
    }
  }

  rebuildStructural();
  applyEnvironment(useEditorStore.getState().useHdriEnvironment);
  syncTransformAttachment();

  const transformRoot = transformHelper;

  /**
   * Paint swing must not reach {@link TransformControls} `pointerdown` (see class comment above).
   * Capture phase + `stopImmediatePropagation` keeps Three from attaching its per-gesture listeners.
   */
  const onPaintSwingPointerDownCapture = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (ev.currentTarget !== canvas) return;
    const st = useEditorStore.getState();
    if (st.mode !== "fp_viewmodel" || !st.fpSwingStrokeArmed) return;
    if (st.fpSwingStrokeReviewActive) return;
    if (!fpSession?.getPresenter()) {
      useEditorStore.getState().setFpSwingStrokeArmed(false);
      useEditorStore
        .getState()
        .showFpAuthorToast("FP viewmodel is still loading — wait for the hand/weapon, then arm paint again.", 5200);
      return;
    }
    swingStrokeDragging = true;
    swingStrokeCapturePointerId = ev.pointerId;
    swingStrokeBuf = [{ clientX: ev.clientX, clientY: ev.clientY }];
    useEditorStore.getState().setFpSwingStrokeArmed(false);
    transformControls.enabled = false;
    canvas.setPointerCapture(ev.pointerId);
    redrawSwingStrokeOverlayFromBuf(swingStrokeBuf);
    useEditorStore
      .getState()
      .showFpAuthorToast(
        "Swing stroke — drag in the view; release to edit the 3D path, then Confirm in the panel.",
        5200,
      );
    fpClickCandidate = null;
    ev.stopImmediatePropagation();
  };
  canvas.addEventListener("pointerdown", onPaintSwingPointerDownCapture, { capture: true });

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (ev.currentTarget !== canvas) return;
    const st = useEditorStore.getState();
    const pickCam =
      st.mode === "fp_viewmodel" && st.fpAuthorCamera === "gameplay" && fpSession
        ? fpSession.getGameplayCamera()
        : camera;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    transformRoot.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, pickCam);

    const gizmoHits = raycaster.intersectObjects([transformRoot], true);

    if (gizmoHits.length > 0) {
      fpClickCandidate = null;
      return;
    }

    if (st.mode === "fp_viewmodel") {
      fpClickCandidate = { x: ev.clientX, y: ev.clientY };
      return;
    }
    fpClickCandidate = null;

    const targets: THREE.Object3D[] = [];
    if (buildingRoot) targets.push(buildingRoot);
    const intersects = raycaster.intersectObjects(targets, true);
    if (intersects.length === 0) {
      useEditorStore.getState().setSelectedId(null);
      return;
    }
    const hit = intersects[0];
    const store = useEditorStore.getState();
    const id = hit
      ? resolvePlacedId(hit.object, store.floorDocs)
      : null;
    useEditorStore.getState().setSelectedId(id);
  };

  function rewireCanvasPrimaryPointerListeners(): void {
    if (transformControls.domElement) {
      withProgrammaticTransformControls(() => transformControls.disconnect());
    }
    if (orbitControls.domElement) {
      orbitControls.disconnect();
    }
    canvas.removeEventListener("pointerdown", onPointerDown);
    withProgrammaticTransformControls(() => transformControls.connect(canvas));
    orbitControls.connect(canvas);
    canvas.addEventListener("pointerdown", onPointerDown);
  }
  rewireCanvasPrimaryPointerListeners();

  const onSwingStrokeMove = (ev: PointerEvent) => {
    if (!swingStrokeDragging) return;
    const last = swingStrokeBuf[swingStrokeBuf.length - 1];
    if (last && Math.hypot(ev.clientX - last.clientX, ev.clientY - last.clientY) < 2) return;
    swingStrokeBuf.push({ clientX: ev.clientX, clientY: ev.clientY });
    redrawSwingStrokeOverlayFromBuf(swingStrokeBuf);
  };
  canvas.addEventListener("pointermove", onSwingStrokeMove);

  const onSwingStrokeCancel = (ev: PointerEvent) => {
    if (!swingStrokeDragging) return;
    swingStrokeDragging = false;
    swingStrokeCapturePointerId = null;
    swingStrokeBuf = [];
    clearSwingStrokeOverlay();
    transformControls.enabled = true;
    rewireCanvasPrimaryPointerListeners();
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* not captured */
    }
    useEditorStore.getState().showFpAuthorToast("Swing stroke cancelled.", 2800);
  };
  canvas.addEventListener("pointercancel", onSwingStrokeCancel);

  const onLostPointerCapture = (ev: PointerEvent) => {
    if (!swingStrokeDragging) return;
    if (
      swingStrokeCapturePointerId !== null &&
      ev.pointerId !== swingStrokeCapturePointerId
    ) {
      return;
    }
    swingStrokeDragging = false;
    swingStrokeCapturePointerId = null;
    swingStrokeBuf = [];
    clearSwingStrokeOverlay();
    transformControls.enabled = true;
    rewireCanvasPrimaryPointerListeners();
    useEditorStore
      .getState()
      .showFpAuthorToast(
        "Swing stroke interrupted (pointer capture ended). Transform tools are active again.",
        4200,
      );
  };
  canvas.addEventListener("lostpointercapture", onLostPointerCapture);

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const st = useEditorStore.getState();

    if (swingStrokeDragging) {
      swingStrokeDragging = false;
      const lastPt = { clientX: ev.clientX, clientY: ev.clientY };
      const lastPrev = swingStrokeBuf[swingStrokeBuf.length - 1];
      if (!lastPrev || lastPrev.clientX !== lastPt.clientX || lastPrev.clientY !== lastPt.clientY) {
        swingStrokeBuf.push(lastPt);
      }

      let pxLen = 0;
      for (let i = 1; i < swingStrokeBuf.length; i++) {
        const a = swingStrokeBuf[i - 1]!;
        const b = swingStrokeBuf[i]!;
        pxLen += Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      }

      let strokeEnteredReview = false;
      try {
        if (swingStrokeBuf.length < 3 || pxLen < 28) {
          throw new Error("Stroke too short — drag a longer arc in the view.");
        }
        const pres = fpSession?.getPresenter();
        if (!pres) throw new Error("Presenter not ready yet.");
        fpSession?.syncWorldMatrices();
        const pickCamUp =
          st.fpAuthorCamera === "gameplay" && fpSession
            ? fpSession.getGameplayCamera()
            : camera;
        const rectUp = canvas.getBoundingClientRect();
        const rigRest = pres.getFpRigRestLocal();
        const locals = projectViewportStrokeToFpRootLocals({
          clientPoints: swingStrokeBuf,
          canvasRect: rectUp,
          pickCamera: pickCamUp,
          fpRoot: pres.getFpViewmodelAuthoringRoot(),
          rigRestPositionLocal: rigRest.position,
        });
        swingReviewLocals = locals.map((v) => v.clone());
        rebuildSwingReviewPreview();
        if (!swingReviewPreviewKeys?.length) {
          throw new Error("Could not build preview from path — try a longer stroke.");
        }
        const store = useEditorStore.getState();
        store.setFpSwingStrokeReviewActive(true);
        attachSwingReviewCanvasListeners();
        setSwingStrokeOverlayPointerInteractive(false);
        clearSwingStrokeOverlay();
        redrawSwingReviewOverlay();
        strokeEnteredReview = true;
        store.showFpAuthorToast(
          "Drag the bright handles to tune the 3D swing path, then Confirm (or Esc to cancel).",
          8200,
        );
      } catch (e) {
        useEditorStore
          .getState()
          .showFpAuthorToast(e instanceof Error ? e.message : String(e), 6800);
      } finally {
        if (strokeEnteredReview) {
          transformControls.enabled = false;
        } else {
          transformControls.enabled = true;
          clearSwingStrokeOverlay();
        }
        rewireCanvasPrimaryPointerListeners();
      }
      swingStrokeBuf = [];
      swingStrokeCapturePointerId = null;
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
        /* not captured */
      }
      return;
    }

    if (ev.currentTarget !== canvas) return;

    if (st.mode !== "fp_viewmodel") {
      fpClickCandidate = null;
      return;
    }
    if (!fpClickCandidate) return;
    const dx = ev.clientX - fpClickCandidate.x;
    const dy = ev.clientY - fpClickCandidate.y;
    fpClickCandidate = null;
    if (Math.hypot(dx, dy) > 5) return;

    const pickCam =
      st.fpAuthorCamera === "gameplay" && fpSession
        ? fpSession.getGameplayCamera()
        : camera;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    transformRoot.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, pickCam);

    const gizmoHitsUp = raycaster.intersectObjects([transformRoot], true);
    if (gizmoHitsUp.length > 0) return;

    const picks = getFpViewmodelAuthoringPicks();
    if (picks.length === 0) return;
    const hits = raycaster.intersectObjects(
      picks.map((p) => p.object),
      true,
    );
    if (hits.length === 0) return;
    const id = resolveFpAuthorPickId(hits[0]!.object, picks);
    if (id) {
      useEditorStore.getState().pickFpAuthorTarget(id);
    }
  };
  canvas.addEventListener("pointerup", onPointerUp);

  registerEditorSwingStrokeReview({
    confirm: confirmSwingReviewFromUser,
    cancel: cancelSwingReviewFromUser,
  });

  const onWindowKeyDownSwingReview = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    if (!useEditorStore.getState().fpSwingStrokeReviewActive) return;
    ev.preventDefault();
    cancelSwingReviewFromUser();
  };
  window.addEventListener("keydown", onWindowKeyDownSwingReview);

  let raf = 0;
  let lastTickMs = performance.now();
  let lastWeaponPresentationPollMs = 0;
  let fpSwingPlayStartMs = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - lastTickMs) / 1000, 0.05);
    lastTickMs = now;
    const st = useEditorStore.getState();
    const tcDragging = transformControls.dragging === true;
    if (st.mode === "fp_viewmodel" && fpSession?.getPresenter()) {
      const pres = fpSession.getPresenter()!;
      if (!tcDragging) {
        if (st.fpSwingPlayActive) {
          if (fpSwingPlayStartMs <= 0) fpSwingPlayStartMs = now;
        } else {
          fpSwingPlayStartMs = 0;
        }
        const swingDur = pres.getWeaponDefinition()?.primitiveSwingDurationS ?? 0.55;
        const swingPhase = st.fpSwingPlayActive
          ? (((now - fpSwingPlayStartMs) / 1000 / swingDur) % 1 + 1) % 1
          : st.fpSwingPreviewPhase01;
        const swingOverlayKeys =
          st.fpSwingStrokeReviewActive && swingReviewPreviewKeys?.length
            ? swingReviewPreviewKeys
            : st.fpSwingKeyframesDraft;
        pres.setFpSwingAuthoringOverlay({
          previewPhase01: swingPhase,
          keyframes: swingOverlayKeys,
        });
        if (st.fpSwingStrokeReviewActive && swingReviewLocals) {
          redrawSwingReviewOverlay();
        }
        const tPoll = performance.now();
        if (tPoll - lastWeaponPresentationPollMs >= 600) {
          lastWeaponPresentationPollMs = tPoll;
          const weaponId = st.fpAuthorWeaponId;
          void (async () => {
            try {
              const r = await fetch(`/content/weapons/${weaponId}.presentation.json`, {
                cache: "no-store",
              });
              if (!r.ok) return;
              const text = await r.text();
              if (text === getLastWeaponPresentationFileText(weaponId)) return;
              adoptWeaponPresentationFileText(pres, weaponId, text);
              maybeSyncFpGizmoFromStore();
            } catch {
              /* ignore */
            }
          })();
        }
      }
      const picksMeta = pres.getAuthoringPickList().map((p) => ({ id: p.id, label: p.label }));
      useEditorStore.getState().setFpAuthorPickList(picksMeta);
      if (tcDragging) {
        fpSession.applyAuthoringPitchOnly(st.fpAuthorPitchRad);
      } else {
        fpSession.tick(dt, st.fpAuthorPitchRad);
        maybeSyncFpGizmoFromStore();
      }
      const picksAfter = pres.getAuthoringPickList();
      const sel = picksAfter.find(
        (p) => p.id === useEditorStore.getState().fpAuthorTargetId,
      )?.object;
      fpSelectionOutline.setFromObject(sel ?? null);
    } else {
      fpSelectionOutline.setFromObject(null);
    }
    const renderCam =
      st.mode === "fp_viewmodel" && st.fpAuthorCamera === "gameplay" && fpSession
        ? fpSession.getGameplayCamera()
        : camera;
    if (st.mode === "fp_viewmodel" && st.fpAuthorCamera === "gameplay" && fpSession) {
      fpSession.syncWorldMatrices();
    }
    renderCam.aspect = canvas.clientWidth / canvas.clientHeight;
    renderCam.updateProjectionMatrix();
    (transformControls as unknown as { camera: THREE.Camera }).camera = renderCam;
    if (st.mode === "fp_viewmodel" && st.fpAuthorCamera === "orbit") {
      orbitControls.update();
    }
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (attached && !objectLivesUnderScene(attached, scene)) {
      withProgrammaticTransformControls(() => transformControls.detach());
    }
    renderer.render(scene, renderCam);
  };
  tick();

  return () => {
    registerEditorSpawnCalculator(null);
    registerEditorSwingStrokeReview(null);
    window.removeEventListener("keydown", onWindowKeyDownSwingReview);
    teardownFpSession();
    disposeSwingStrokeOverlay();
    orbitControls.dispose();
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPaintSwingPointerDownCapture, { capture: true });
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onSwingStrokeMove);
    canvas.removeEventListener("pointercancel", onSwingStrokeCancel);
    canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
    canvas.removeEventListener("pointerup", onPointerUp);
    unsub();
    ro.disconnect();
    scene.remove(transformHelper);
    transformControls.dispose();
    fpSelectionOutline.geometry.dispose();
    (fpSelectionOutline.material as THREE.Material).dispose();
    scene.remove(fpSelectionOutline);
    if (buildingRoot) {
      contentRoot.remove(buildingRoot);
      disposeSubtreeGpuAssets(buildingRoot);
      buildingRoot = null;
    }
    pmrem.dispose();
    applyEnvironment(false);
    disposeSceneEnvironment(scene);
    renderer.dispose();
    scene.clear();
  };
}
