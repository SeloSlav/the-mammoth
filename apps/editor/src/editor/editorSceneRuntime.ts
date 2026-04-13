import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createFPCamera } from "@the-mammoth/engine";
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
  transformControls.addEventListener("dragging-changed", (ev) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active = Boolean((ev as any).value);
    if (active) useEditorStore.getState().beginTransaction();
    else useEditorStore.getState().commitTransaction();
  });
  transformControls.addEventListener("change", () => {
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (!attached) return;
    const id = attached.userData.placedObjectId as string | undefined;
    if (!id) return;
    const store = useEditorStore.getState();
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
  scene.add(transformControls as unknown as THREE.Object3D);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let buildingRoot: THREE.Group | null = null;
  let lastBuiltContentEpoch = -1;

  const rebuildStructural = () => {
    const s = useEditorStore.getState();
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
    const s = useEditorStore.getState();
    transformControls.detach();
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
      const snap = s.gridSnapM;
      transformControls.setTranslationSnap(snap > 0 ? snap : null);
      transformControls.setRotationSnap(snap > 0 ? THREE.MathUtils.degToRad(15) : null);
      transformControls.setScaleSnap(snap > 0 ? snap : null);
    }
  }

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(canvas);

  camera.position.set(-38, 28, 22);
  camera.lookAt(2, 18, 0);

  registerEditorSpawnCalculator(() => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.quaternion,
    );
    forward.normalize();
    return {
      position: camera.position.toArray() as [number, number, number],
      forward: forward.toArray() as [number, number, number],
    };
  });

  let prev = useEditorStore.getState();
  const unsub = useEditorStore.subscribe((s) => {
    if (s.contentStructureEpoch !== prev.contentStructureEpoch) {
      rebuildStructural();
    } else {
      syncTransformsFromStore();
    }

    if (
      s.selectedId !== prev.selectedId ||
      s.transformMode !== prev.transformMode ||
      s.gridSnapM !== prev.gridSnapM ||
      s.mode !== prev.mode ||
      s.activeInteriorDocId !== prev.activeInteriorDocId
    ) {
      syncTransformAttachment();
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
  });

  rebuildStructural();
  applyEnvironment(useEditorStore.getState().useHdriEnvironment);
  syncTransformAttachment();

  const transformRoot = transformControls as unknown as THREE.Object3D;

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement) !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const gizmoHits = raycaster.intersectObjects([transformRoot], true);
    if (gizmoHits.length > 0) return;

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

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    registerEditorSpawnCalculator(null);
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointerDown);
    unsub();
    ro.disconnect();
    transformControls.dispose();
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
