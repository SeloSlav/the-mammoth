import * as THREE from "three";
import { MOUSE } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  createFPCamera,
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  type LocalFirstPersonPresenter,
} from "@the-mammoth/engine";
import {
  instantiateBuildingFloorStack,
  buildInteriorMeshes,
} from "@the-mammoth/world";
import { FloorDocSchema } from "@the-mammoth/schemas";
import { useEditorStore, type EditorState } from "../state/editorStore.js";
import { applyEditorMaterialsToFloorPlacement } from "./applyEditorMaterials.js";
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

function emptyFloorDoc(floorDocId: string) {
  return FloorDocSchema.parse({ id: floorDocId, version: 1, objects: [] });
}

const PLACEMENT_KEY_SEP = "\u0000";

function placementKey(floorDocId: string, objectId: string): string {
  return `${floorDocId}${PLACEMENT_KEY_SEP}${objectId}`;
}

function resolvePlacedId(
  hit: THREE.Object3D | null,
  floorDocs: Record<string, import("@the-mammoth/schemas").FloorDoc>,
): string | null {
  let cur: THREE.Object3D | null = hit;
  while (cur) {
    const id = cur.userData.placedObjectId;
    if (typeof id === "string" && id.length > 0) return id;
    if (cur instanceof THREE.Group && typeof cur.name === "string" && cur.name) {
      for (const d of Object.values(floorDocs)) {
        if (d.objects.some((o) => o.id === cur!.name)) return cur.name;
      }
    }
    cur = cur.parent;
  }
  return null;
}

function syncFloorTransforms(
  root: THREE.Object3D,
  floorDocs: EditorState["floorDocs"],
) {
  const byKey = new Map<string, import("@the-mammoth/schemas").PlacedObject>();
  for (const [fid, d] of Object.entries(floorDocs)) {
    for (const o of d.objects) byKey.set(placementKey(fid, o.id), o);
  }
  root.traverse((o) => {
    const id = o.userData.placedObjectId as string | undefined;
    if (!id || !(o instanceof THREE.Object3D)) return;
    const fid = o.userData.floorDocId as string | undefined;
    let pl = fid ? byKey.get(placementKey(fid, id)) : undefined;
    if (!pl) {
      for (const d of Object.values(floorDocs)) {
        const hit = d.objects.find((ob) => ob.id === id);
        if (hit) {
          pl = hit;
          break;
        }
      }
    }
    if (!pl) return;
    o.position.set(pl.position[0], pl.position[1], pl.position[2]);
    if (pl.rotation)
      o.quaternion.set(
        pl.rotation[0],
        pl.rotation[1],
        pl.rotation[2],
        pl.rotation[3],
      );
    else o.quaternion.identity();
    const sx = pl.scale?.[0] ?? 1;
    const sy = pl.scale?.[1] ?? 1;
    const sz = pl.scale?.[2] ?? 1;
    o.scale.set(sx, sy, sz);
  });
}

function syncInteriorTransforms(
  root: THREE.Object3D,
  doc: import("@the-mammoth/schemas").InteriorDoc,
) {
  for (const p of doc.placements) {
    const o = root.getObjectByName(p.entityId);
    if (!o) continue;
    if (
      typeof o.userData.streamDocId === "string" &&
      o.userData.streamDocId !== doc.id
    ) {
      continue;
    }
    o.position.set(p.position[0], p.position[1], p.position[2]);
    if (p.rotation)
      o.quaternion.set(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3]);
    else o.quaternion.identity();
    const sx = p.scale?.[0] ?? 1;
    const sy = p.scale?.[1] ?? 1;
    const sz = p.scale?.[2] ?? 1;
    o.scale.set(sx, sy, sz);
  }
}

export function mountEditorScene(canvas: HTMLCanvasElement): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a22);

  const camera = createFPCamera();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0xb8c4ff, 0x2a2a30, 0.55);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(40, 80, 30);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 400;
  dir.shadow.camera.left = -120;
  dir.shadow.camera.right = 120;
  dir.shadow.camera.top = 120;
  dir.shadow.camera.bottom = -120;
  scene.add(dir);

  const grid = new THREE.GridHelper(400, 80, 0x444455, 0x33333d);
  grid.position.y = 0;
  scene.add(grid);

  const textureLoader = new THREE.TextureLoader();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRt: THREE.WebGLRenderTarget | null = null;

  const applyEnvironment = (on: boolean) => {
    scene.environment = null;
    if (envRt) {
      envRt.dispose();
      envRt = null;
    }
    if (on) {
      envRt = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRt.texture;
    }
  };

  const contentRoot = new THREE.Group();
  contentRoot.name = "editorContentRoot";
  scene.add(contentRoot);

  const transformControls = new TransformControls(camera, canvas);
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

  const orbitControls = new OrbitControls(camera, canvas);
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
    const pitch = useEditorStore.getState().fpAuthorPitchRad;
    if (!pres.frameWeaponMountIntoGameplayCamera(scene, cam, pitch)) {
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

    if (s.mode === "floor") {
      buildingRoot = instantiateBuildingFloorStack(s.building, (floorDocId) => {
        return s.floorDocs[floorDocId] ?? emptyFloorDoc(floorDocId);
      });
      for (const doc of Object.values(s.floorDocs)) {
        for (const obj of doc.objects) {
          applyEditorMaterialsToFloorPlacement(
            buildingRoot,
            doc.id,
            obj,
            textureLoader,
          );
        }
      }
    } else {
      const doc = s.interiorDocs[s.activeInteriorDocId];
      buildingRoot = doc ? buildInteriorMeshes(doc) : new THREE.Group();
    }

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

  function syncDuplicateFloorGroups(
    root: THREE.Object3D,
    sourceId: string,
    source: THREE.Object3D,
  ) {
    const store = useEditorStore.getState();
    const fid = source.userData.floorDocId as string | undefined;
    const doc = fid
      ? store.floorDocs[fid]
      : store.floorDocs[store.activeFloorDocId];
    if (!doc) return;
    const obj = doc.objects.find((o) => o.id === sourceId);
    if (!obj) return;
    root.traverse((o) => {
      if (!(o instanceof THREE.Group)) return;
      if (o.userData.placedObjectId !== sourceId || o === source) return;
      if (
        typeof source.userData.floorDocId === "string" &&
        typeof o.userData.floorDocId === "string" &&
        o.userData.floorDocId !== source.userData.floorDocId
      ) {
        return;
      }
      o.position.copy(source.position);
      o.quaternion.copy(source.quaternion);
      o.scale.copy(source.scale);
    });
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
        } else {
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

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement) !== canvas) return;
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

  canvas.addEventListener("pointerdown", onPointerDown);

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement) !== canvas) return;
    const st = useEditorStore.getState();
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
    if (st.mode === "fp_viewmodel" && fpSession?.getPresenter()) {
      const pres = fpSession.getPresenter()!;
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
      const picksMeta = pres.getAuthoringPickList().map((p) => ({ id: p.id, label: p.label }));
      useEditorStore.getState().setFpAuthorPickList(picksMeta);
      fpSession.tick(dt, st.fpAuthorPitchRad);
      maybeSyncFpGizmoFromStore();
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
