import * as THREE from "three";
import { MOUSE } from "three";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
  createFPCamera,
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  type LocalFirstPersonPresenter,
} from "@the-mammoth/engine";
import {
  applyElevatorCabPartTransforms,
  glassOpeningFromProxyMesh,
  LANDING_DOOR_OPENING_PROXY_ID,
  rebuildLandingDoorPreviewSwing,
} from "@the-mammoth/world";
import { useEditorStore } from "../state/editorStore.js";
import {
  disposeSceneEnvironment,
  disposeSubtreeGpuAssets,
} from "./disposeSubtree.js";
import { registerEditorSpawnCalculator } from "./spawnBridge.js";
import { registerEditorNavigationBridge } from "./editorNavigationBridge.js";
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
  floorPlacedObjectIdForTransformRoot,
  interiorEntityIdForTransformRoot,
  resolveFloorPlacementTransformRoot,
  resolveGizmoFloorDocId,
  resolveGizmoInteriorDocId,
  resolveInteriorPlacementTransformRoot,
  resolveCabPartId,
  resolveLandingKitPickId,
  resolvePlacedId,
} from "./editorPlacementKeys.js";
import { emptyFloorDoc } from "./editorEmptyFloorDoc.js";
import {
  syncCellTransforms,
  syncDuplicateFloorGroups,
  syncFloorTransforms,
  syncInteriorTransforms,
  syncPrefabTransforms,
} from "./editorFloorTransformSync.js";
import { addEditorSceneLighting } from "./editorSceneLighting.js";
import { createEditorPmremEnvironment } from "./editorSceneEnvironment.js";
import { buildEditorStructuralRoot } from "./editorBuildingContentMount.js";

export async function mountEditorScene(canvas: HTMLCanvasElement): Promise<() => void> {
  await assertWebGpuAdapterOrThrow();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a22);

  const camera = createFPCamera();
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: false });
  await renderer.init();
  assertWebGpuRendererBackend(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { dir, grid } = addEditorSceneLighting(scene);

  const textureLoader = new THREE.TextureLoader();
  const { pmrem, applyEnvironment } = createEditorPmremEnvironment(scene, renderer);

  const contentRoot = new THREE.Group();
  contentRoot.name = "editorContentRoot";
  scene.add(contentRoot);

  const transformControls = new TransformControls(camera, null);
  /**
   * `TransformControls.pointerMove` ignores moves unless `getPointer().button === -1` (see three
   * `TransformControls.js`). Some browsers send `button: 0` on captured `pointermove` while the
   * primary button is held, so drags never apply → nothing commits and the next sync snaps back.
   */
  {
    type TcPriv = { _getPointer: (e: PointerEvent) => { x: number; y: number; button: number } };
    const tc = transformControls as unknown as TcPriv;
    const orig = tc._getPointer.bind(transformControls);
    tc._getPointer = function (this: TransformControls, event: PointerEvent) {
      const out = orig(event);
      if (this.dragging === true && event.type === "pointermove") {
        return { ...out, button: -1 };
      }
      return out;
    };
  }
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

  /**
   * True while a floor/interior gizmo drag is in progress (TransformControls `mouseDown`…`mouseUp`).
   * Used with {@link TransformControls#dragging} so we never run {@link syncTransformsFromStore}
   * mid-gesture: generic `change` events (camera, mode, etc.) must not pull stale doc data onto the
   * mesh while Zustand is catching up.
   */
  let levelEditorTransformGesture = false;

  function commitLevelEditorAttachedTransformToStore(): void {
    if (programmaticTransformControlsDepth > 0) return;
    const store = useEditorStore.getState();
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (!attached) return;

    if (store.mode === "cab") {
      let o: THREE.Object3D | null = attached;
      let partId: string | undefined;
      while (o) {
        partId = o.userData.editorCabPartId as string | undefined;
        if (partId) break;
        o = o.parent;
      }
      if (!partId || !o) return;
      const pos: [number, number, number] = [o.position.x, o.position.y, o.position.z];
      const rot: [number, number, number, number] = [
        o.quaternion.x,
        o.quaternion.y,
        o.quaternion.z,
        o.quaternion.w,
      ];
      const sc: [number, number, number] = [o.scale.x, o.scale.y, o.scale.z];
      store.patchElevatorCabDef((d) => ({
        ...d,
        partTransforms: {
          ...d.partTransforms,
          [partId]: {
            ...d.partTransforms?.[partId],
            position: pos,
            rotation: rot,
            scale: sc,
          },
        },
      }));
      return;
    }

    if (store.mode === "landing_preview") {
      let o: THREE.Object3D | null = attached;
      while (o) {
        if (o.userData.editorLandingOpeningProxy === true) {
          const open = glassOpeningFromProxyMesh(o, store.landingKitDef);
          store.patchLandingKitDef((d) => ({
            ...d,
            glassOpening: {
              ...d.glassOpening,
              widthM: open.widthM,
              heightM: open.heightM,
              centerYM: open.centerYM,
            },
          }));
          return;
        }
        o = o.parent;
      }
      o = attached;
      let partId: string | undefined;
      while (o) {
        partId = o.userData.editorLandingPartId as string | undefined;
        if (partId) break;
        o = o.parent;
      }
      if (!partId || !o) return;
      const pos: [number, number, number] = [o.position.x, o.position.y, o.position.z];
      const rot: [number, number, number, number] = [
        o.quaternion.x,
        o.quaternion.y,
        o.quaternion.z,
        o.quaternion.w,
      ];
      const sc: [number, number, number] = [o.scale.x, o.scale.y, o.scale.z];
      store.patchLandingKitDef((d) => ({
        ...d,
        partTransforms: {
          ...d.partTransforms,
          [partId]: {
            ...d.partTransforms?.[partId],
            position: pos,
            rotation: rot,
            scale: sc,
          },
        },
      }));
      return;
    }

    if (
      store.mode !== "floor" &&
      store.mode !== "interior" &&
      store.mode !== "cell" &&
      store.mode !== "prefab" &&
      store.mode !== "floor_override"
    ) {
      return;
    }
    if (store.mode === "floor") {
      const root = resolveFloorPlacementTransformRoot(attached, store.floorDocs);
      if (!root) return;
      const id = floorPlacedObjectIdForTransformRoot(root, store.floorDocs);
      if (!id) return;
      const pos: [number, number, number] = [
        root.position.x,
        root.position.y,
        root.position.z,
      ];
      const rot: [number, number, number, number] = [
        root.quaternion.x,
        root.quaternion.y,
        root.quaternion.z,
        root.quaternion.w,
      ];
      const sc: [number, number, number] = [
        root.scale.x,
        root.scale.y,
        root.scale.z,
      ];
      store.updatePlacedObject(resolveGizmoFloorDocId(root, store.activeFloorDocId), id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
      syncDuplicateFloorGroups(contentRoot, id, root);
    } else if (store.mode === "interior") {
      const intDocId = resolveGizmoInteriorDocId(attached, store.activeInteriorDocId);
      const doc = store.interiorDocs[intDocId];
      const root = resolveInteriorPlacementTransformRoot(attached, doc);
      if (!root) return;
      const id = interiorEntityIdForTransformRoot(root);
      if (!id) return;
      const pos: [number, number, number] = [
        root.position.x,
        root.position.y,
        root.position.z,
      ];
      const rot: [number, number, number, number] = [
        root.quaternion.x,
        root.quaternion.y,
        root.quaternion.z,
        root.quaternion.w,
      ];
      const sc: [number, number, number] = [
        root.scale.x,
        root.scale.y,
        root.scale.z,
      ];
      store.updateInteriorPlacement(intDocId, id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
    } else if (store.mode === "cell") {
      const id =
        (typeof attached.userData.placedObjectId === "string" && attached.userData.placedObjectId) ||
        attached.name;
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
      store.updateCellPlacement(store.activeCellDocId, id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
    } else if (store.mode === "prefab") {
      const id =
        (typeof attached.userData.placedObjectId === "string" && attached.userData.placedObjectId) ||
        attached.name;
      if (!id || !store.activePrefabDefId) return;
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
      store.updatePrefabComponent(store.activePrefabDefId, id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
    } else if (store.activeFloorOverrideDocId) {
      const root = resolveFloorPlacementTransformRoot(attached, store.floorDocs);
      if (!root) return;
      const id = floorPlacedObjectIdForTransformRoot(root, store.floorDocs);
      if (!id) return;
      const pos: [number, number, number] = [
        root.position.x,
        root.position.y,
        root.position.z,
      ];
      const rot: [number, number, number, number] = [
        root.quaternion.x,
        root.quaternion.y,
        root.quaternion.z,
        root.quaternion.w,
      ];
      const sc: [number, number, number] = [
        root.scale.x,
        root.scale.y,
        root.scale.z,
      ];
      store.updateFloorOverrideObjectPatch(store.activeFloorOverrideDocId, id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
    }
  }

  transformControls.addEventListener("mouseDown", () => {
    if (useEditorStore.getState().mode === "fp_viewmodel") return;
    levelEditorTransformGesture = true;
  });
  transformControls.addEventListener("mouseUp", () => {
    if (useEditorStore.getState().mode === "fp_viewmodel") return;
    levelEditorTransformGesture = false;
    /** No `objectChange` if the pointer never moved; still persist rest pose. */
    commitLevelEditorAttachedTransformToStore();
    /** After `dragging` flips false, subscriber may skip sync; realign mesh ↔ store once. */
    queueMicrotask(() => {
      const m = useEditorStore.getState().mode;
      if (m !== "fp_viewmodel") {
        syncTransformsFromStore();
        /** Landing swing rebuild replaces the mesh under the gizmo; re-attach to the new proxy. */
        syncTransformAttachment();
      }
    });
  });

  transformControls.addEventListener("dragging-changed", (ev) => {
    const raw = ev as unknown as { value?: boolean };
    const active = raw.value === true;
    const st = useEditorStore.getState();
    if (st.mode === "fp_viewmodel") {
      orbitControls.enabled = !active && st.fpAuthorCamera === "orbit";
      return;
    }
    /** Immediate camera off/on so fly/orbit release before the next Zustand tick. */
    if (active) {
      orbitControls.enabled = false;
      flyControls.enabled = false;
    } else {
      orbitControls.enabled = st.cameraMode !== "fly";
      flyControls.enabled = st.cameraMode === "fly";
    }
    if (!active) levelEditorTransformGesture = false;
    if (active) useEditorStore.getState().beginTransaction();
    else useEditorStore.getState().commitTransaction();
  });
  transformControls.addEventListener("objectChange", () => {
    commitLevelEditorAttachedTransformToStore();
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
        else if (pid === "weaponRoot") pres.syncFpWeaponMountBaselineFromRoot();
      }
      store.bumpFpAuthorLive();
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
  const flyControls = new FlyControls(camera, canvas);
  flyControls.movementSpeed = useEditorStore.getState().flySpeedMps;
  flyControls.rollSpeed = 0.6;
  flyControls.dragToLook = true;
  flyControls.autoForward = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const fpSelectionOutline = new FpSelectionAabbOutline();
  fpSelectionOutline.visible = false;
  scene.add(fpSelectionOutline);

  let fpClickCandidate: { x: number; y: number } | null = null;

  let buildingRoot: THREE.Group | null = null;
  let lastBuiltContentEpoch = -1;
  let shouldFrameAfterRebuild = true;

  let fpSession: FpViewmodelEditorSession | null = null;
  let fpSessionLoading = false;
  /** Guards nested store updates during FP teardown (`setFpAuthorPickList([])`, etc.). */
  let fpTeardownInProgress = false;
  /** Wireframe at canonical rig rest (head-pitch space); editor-only. */
  let fpDefaultRigAnchor: THREE.LineSegments | null = null;
  /** Last FP gizmo attach signature from store (refreshed in syncFpTransformAttachment). */
  let lastFpGizmoAttachKey = "";

  function ancestorLevelIndex(obj: THREE.Object3D | null): number | null {
    let cur = obj;
    while (cur) {
      const raw = cur.userData.mammothPlateLevelIndex;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      cur = cur.parent;
    }
    return null;
  }

  function frameBox(box: THREE.Box3): void {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    camera.up.set(0, 1, 0);
    orbitControls.target.copy(center);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(-0.82, 0.46, 0.68).normalize().multiplyScalar(Math.max(span * 1.5, 16)));
    camera.lookAt(center);
    orbitControls.update();
  }

  function frameObject(obj: THREE.Object3D | null): void {
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    frameBox(box);
  }

  function frameFocusedStoryObject(): void {
    if (!buildingRoot) return;
    const focusedLevel = useEditorStore.getState().focusedStoryLevelIndex;
    const levelNodes: THREE.Object3D[] = [];
    buildingRoot.traverse((child) => {
      if (child.userData.mammothPlateLevelIndex === focusedLevel) levelNodes.push(child);
    });
    const box = new THREE.Box3();
    for (const node of levelNodes) {
      box.expandByObject(node);
    }
    if (box.isEmpty()) {
      frameObject(buildingRoot);
      return;
    }
    frameBox(box);
  }

  function findBestSelectionTarget(): THREE.Object3D | null {
    const s = useEditorStore.getState();
    if (!buildingRoot || !s.selectedId) return null;
    let target: THREE.Object3D | null = null;
    let bestRank = -1;
    let bestD = Infinity;
    if (s.mode === "cab") {
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorCabPartId as string | undefined;
        if (pid !== s.selectedId) return;
        target = o;
      });
      return target;
    }
    if (s.mode === "landing_preview") {
      if (s.selectedId === "landing_door_kit") {
        const door = buildingRoot.getObjectByName("editor_landing_door");
        return door ?? null;
      }
      if (s.selectedId === LANDING_DOOR_OPENING_PROXY_ID) {
        buildingRoot.traverse((o) => {
          if (o.userData.editorLandingOpeningProxy === true) target = o;
        });
        return target;
      }
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorLandingPartId as string | undefined;
        if (pid === s.selectedId) target = o;
      });
      return target;
    }
    if (s.mode === "floor") {
      buildingRoot.traverse((o) => {
        const root = resolveFloorPlacementTransformRoot(o, s.floorDocs);
        if (root !== o) return;
        const id = floorPlacedObjectIdForTransformRoot(o, s.floorDocs);
        if (id !== s.selectedId) return;
        if (resolveGizmoFloorDocId(o, s.activeFloorDocId) !== s.activeFloorDocId) return;
        const levelIndex = ancestorLevelIndex(o);
        const rank = levelIndex === s.focusedStoryLevelIndex ? 2 : 1;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const d = wp.distanceToSquared(camera.position);
        if (rank > bestRank || (rank === bestRank && d < bestD)) {
          bestRank = rank;
          bestD = d;
          target = o;
        }
      });
      return target;
    }
    if (s.mode === "interior") {
      const intDoc = s.interiorDocs[s.activeInteriorDocId];
      buildingRoot.traverse((o) => {
        const root = resolveInteriorPlacementTransformRoot(o, intDoc);
        if (root !== o) return;
        const eid = interiorEntityIdForTransformRoot(o);
        if (eid !== s.selectedId) return;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const d = wp.distanceToSquared(camera.position);
        if (d < bestD) {
          bestD = d;
          target = o;
        }
      });
      return target;
    }
    buildingRoot.traverse((o) => {
      const id =
        (typeof o.userData.placedObjectId === "string" && o.userData.placedObjectId) || o.name;
      if (id !== s.selectedId) return;
      const levelIndex = ancestorLevelIndex(o);
      const rank = levelIndex === s.focusedStoryLevelIndex ? 1 : 0;
      const wp = new THREE.Vector3();
      o.getWorldPosition(wp);
      const d = wp.distanceToSquared(camera.position);
      if (rank > bestRank || (rank === bestRank && d < bestD)) {
        bestRank = rank;
        bestD = d;
        target = o;
      }
    });
    return target;
  }

  registerEditorNavigationBridge({
    frameEditorBuilding: () => frameObject(buildingRoot),
    frameEditorSelection: () => frameObject(findBestSelectionTarget()),
    frameFocusedStory: frameFocusedStoryObject,
  });

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
    if (fpTeardownInProgress) return;
    levelEditorTransformGesture = false;
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
    if (fpTeardownInProgress) return;
    fpTeardownInProgress = true;
    try {
      disposeFpViewmodelRuntimeOnly();
      contentRoot.visible = true;
      grid.visible = true;
      shouldFrameAfterRebuild = true;
      camera.position.set(-38, 28, 22);
      camera.lookAt(2, 18, 0);
      orbitControls.target.set(0, 1.45, 0);
      orbitControls.mouseButtons = {
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      };
      orbitControls.update();
    } finally {
      fpTeardownInProgress = false;
    }
  }

  function syncFpTransformAttachment() {
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
        transformControls.enabled = true;
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
        transformControls.enabled = true;
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
      workspace: s.workspace,
      building: s.building,
      floorDocs: s.floorDocs,
      floorOverrideDocs: s.floorOverrideDocs,
      activeInteriorDocId: s.activeInteriorDocId,
      interiorDocs: s.interiorDocs,
      activeCellDocId: s.activeCellDocId,
      cellDocs: s.cellDocs,
      activePrefabDefId: s.activePrefabDefId,
      prefabDefs: s.prefabDefs,
      activeFloorOverrideDocId: s.activeFloorOverrideDocId,
      elevatorCabDef: s.elevatorCabDef,
      landingKitDef: s.landingKitDef,
      textureLoader,
      emptyFloorDoc,
    });

    contentRoot.add(buildingRoot);
    syncTransformsFromStore();
    syncTransformAttachment();
    if (shouldFrameAfterRebuild) {
      shouldFrameAfterRebuild = false;
      if (s.mode === "floor" || s.mode === "floor_override") frameFocusedStoryObject();
      else if (s.mode === "cab" || s.mode === "landing_preview") frameObject(buildingRoot);
      else frameObject(buildingRoot);
    }
  };

  function syncTransformsFromStore() {
    if (!buildingRoot) return;
    const s = useEditorStore.getState();
    if (s.mode === "floor") {
      syncFloorTransforms(buildingRoot, s.floorDocs);
      if (s.workspace === "world") {
        const cellDoc = s.cellDocs[s.activeCellDocId];
        if (cellDoc) {
          const cellRoot = buildingRoot.getObjectByName(`cell:${cellDoc.id}`);
          if (cellRoot) syncCellTransforms(cellRoot, cellDoc);
        }
      }
    } else if (s.mode === "interior") {
      const doc = s.interiorDocs[s.activeInteriorDocId];
      if (doc) syncInteriorTransforms(buildingRoot, doc);
    } else if (s.mode === "cell") {
      const doc = s.cellDocs[s.activeCellDocId];
      if (doc) syncCellTransforms(buildingRoot, doc);
    } else if (s.mode === "prefab") {
      const doc = s.activePrefabDefId ? s.prefabDefs[s.activePrefabDefId] : undefined;
      if (doc) syncPrefabTransforms(buildingRoot, doc);
    } else if (s.mode === "floor_override") {
      syncFloorTransforms(buildingRoot, s.floorDocs);
      if (s.workspace === "world") {
        const cellDoc = s.cellDocs[s.activeCellDocId];
        if (cellDoc) {
          const cellRoot = buildingRoot.getObjectByName(`cell:${cellDoc.id}`);
          if (cellRoot) syncCellTransforms(cellRoot, cellDoc);
        }
      }
    } else if (s.mode === "cab") {
      const cabPreview = buildingRoot.getObjectByName("editor_elevator_cab_preview");
      if (cabPreview) applyElevatorCabPartTransforms(cabPreview, s.elevatorCabDef);
    } else if (s.mode === "landing_preview") {
      const door = buildingRoot.getObjectByName("editor_landing_door");
      if (door instanceof THREE.Group) {
        rebuildLandingDoorPreviewSwing(door, s.landingKitDef);
      }
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
      if (s.mode === "landing_preview" && s.selectedId === "landing_door_kit") {
        return;
      }
      const target = findBestSelectionTarget();
      if (target) {
        transformControls.attach(target);
        transformControls.setMode(s.transformMode);
        const opening =
          s.mode === "landing_preview" && s.selectedId === LANDING_DOOR_OPENING_PROXY_ID;
        transformControls.setSize(opening ? 1.35 : 1);
        if (opening) {
          transformControls.setTranslationSnap(null);
          transformControls.setRotationSnap(null);
          transformControls.setScaleSnap(null);
        } else {
          const snap = s.gridSnapM;
          transformControls.setTranslationSnap(snap > 0 ? snap : null);
          transformControls.setRotationSnap(snap > 0 ? THREE.MathUtils.degToRad(15) : null);
          transformControls.setScaleSnap(snap > 0 ? snap : null);
        }
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
      if (s.mode !== prev.mode && s.mode !== "fp_viewmodel") {
        shouldFrameAfterRebuild = true;
      }
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
      } else if (prev.mode === "fp_viewmodel" && !fpTeardownInProgress) {
        teardownFpSession();
      }

      if (s.mode !== "fp_viewmodel") {
        if (prev.mode === "fp_viewmodel") {
          levelEditorTransformGesture = false;
          transformControls.enabled = true;
        }
        if (s.contentStructureEpoch !== prev.contentStructureEpoch) {
          rebuildStructural();
        } else {
          const placementDataChanged =
            s.floorDocs !== prev.floorDocs ||
            s.interiorDocs !== prev.interiorDocs ||
            s.building !== prev.building ||
            s.activeInteriorDocId !== prev.activeInteriorDocId ||
            s.workspace !== prev.workspace ||
            s.activeCellDocId !== prev.activeCellDocId ||
            s.cellDocs !== prev.cellDocs ||
            s.elevatorCabDef !== prev.elevatorCabDef ||
            s.landingKitDef !== prev.landingKitDef;
          /**
           * Never sync meshes from store on unrelated updates (`fpAuthorLive`, pick list, dirty
           * flag, …). Those used to fire every RAF / UI tick and overwrote the gizmo mid-edit.
           */
          if (
            placementDataChanged &&
            !transformControls.dragging &&
            !levelEditorTransformGesture
          ) {
            syncTransformsFromStore();
          }
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
          s.activeInteriorDocId !== prev.activeInteriorDocId ||
          s.workspace !== prev.workspace ||
          s.elevatorCabDef !== prev.elevatorCabDef ||
          s.landingKitDef !== prev.landingKitDef);
      if (tcFp || tcLevel) {
        syncTransformAttachment();
      }

      flyControls.movementSpeed = s.flySpeedMps;
      /**
       * While dragging the level-editor gizmo, Orbit + Fly must stay off — both use the primary
       * button and would steal pointer capture from {@link TransformControls} (especially Fly
       * `dragToLook` on LMB).
       */
      const gizmoDragging = transformControls.dragging === true;
      const wantOrbit =
        (s.mode === "fp_viewmodel" && s.fpAuthorCamera === "orbit") ||
        (s.mode !== "fp_viewmodel" && s.cameraMode !== "fly");
      const wantFly = s.mode !== "fp_viewmodel" && s.cameraMode === "fly";
      orbitControls.enabled = !gizmoDragging && wantOrbit;
      flyControls.enabled = !gizmoDragging && wantFly;
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
        camera.up.set(0, 1, 0);
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
      ? store.mode === "cab"
        ? resolveCabPartId(hit.object)
        : store.mode === "landing_preview"
          ? resolveLandingKitPickId(hit.object)
          : resolvePlacedId(hit.object, store.floorDocs)
      : null;
    if (hit && id && store.mode === "floor") {
      const hitFloorDocId = resolveGizmoFloorDocId(hit.object, store.activeFloorDocId);
      if (hitFloorDocId !== store.activeFloorDocId) {
        useEditorStore.getState().setActiveFloorDocId(hitFloorDocId);
      }
      const hitLevelIndex = ancestorLevelIndex(hit.object);
      if (hitLevelIndex !== null && hitLevelIndex !== store.focusedStoryLevelIndex) {
        useEditorStore.getState().setFocusedStoryLevelIndex(hitLevelIndex);
      }
    } else if (hit && id && store.mode === "floor_override") {
      const hitLevelIndex = ancestorLevelIndex(hit.object);
      if (hitLevelIndex !== null && hitLevelIndex !== store.focusedStoryLevelIndex) {
        useEditorStore.getState().setFocusedStoryLevelIndex(hitLevelIndex);
      }
    }
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

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const st = useEditorStore.getState();

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

  let raf = 0;
  let lastTickMs = performance.now();
  let lastWeaponPresentationPollMs = 0;
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
        pres.setFpSwingAuthoringOverlay({ previewPhase01: null, keyframes: null });
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
    if (!tcDragging) {
      if (st.mode === "fp_viewmodel" && st.fpAuthorCamera === "orbit") {
        orbitControls.update();
      } else if (st.mode !== "fp_viewmodel" && st.cameraMode === "fly") {
        flyControls.update(dt);
      } else if (st.mode !== "fp_viewmodel") {
        orbitControls.update();
      }
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
    registerEditorNavigationBridge(null);
    teardownFpSession();
    orbitControls.dispose();
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointerDown);
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
