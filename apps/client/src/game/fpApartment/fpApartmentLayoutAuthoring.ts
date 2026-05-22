/**
 * Owned-apartment layout: persists through Spacetime reducers (`set_owned_apartment_piece_pose`, decor CRUD).
 *
 * Normal authoring is the standalone editor (`my_apartment_layout`). This overlay is optional dev-only:
 * `localStorage.setItem('mammothApartmentLayoutAuthoring','1')`, reload, then **`F9`**.
 * Requires feet inside **your claimed** rooftop interior (matches server `player_may_layout_owned_apartment`).
 */
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { DbConnection } from "../../module_bindings";
import type { ApartmentUnit, ApartmentUnitDecor } from "../../module_bindings/types";
import {
  apartmentUnitContainingFeet,
  formatApartmentPublicLabel,
  residentInteriorPropsVisibleForViewer,
} from "./fpApartmentGameplay.js";
import {
  APARTMENT_LAYOUT_PIECE_BED,
  APARTMENT_LAYOUT_PIECE_FOOTLOCKER,
  APARTMENT_LAYOUT_PIECE_WARDROBE,
  type ApartmentLayoutBuiltinPiece,
} from "./fpApartmentLayoutPieces";
import {
  apartmentUnitDecorItemKindFromString,
  defaultOwnedApartmentDecorScaleForModel,
  ownedApartmentPlacedItemKindFromModelRelPath,
} from "@the-mammoth/schemas";
import {
  apartmentDecorCatalogLabel,
  fetchApartmentDecorCatalog,
  normalizeApartmentDecorModelRelPath,
  type ApartmentDecorCatalogEntry,
} from "./fpApartmentDecorAssets.js";
import { patchFpTransformControlsPointerForCaptureCompat } from "./fpTransformControlsPointerPatch";

export type MountFpApartmentLayoutAuthoringOpts = {
  conn: DbConnection;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  getFeetWorld: (out: THREE.Vector3) => void;
  getDecorObject: (decorId: bigint) => THREE.Object3D | undefined;
  /** When true: skip gameplay pointer-lock + free-look. */
  activeRef: { active: boolean };
};

type BuiltinPieceId = ApartmentLayoutBuiltinPiece;

export { normalizeApartmentDecorModelRelPath };

export function apartmentLayoutUiGateOpen(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mammothApartmentLayoutAuthoring") === "1";
  } catch {
    return false;
  }
}

const _editableUnitFeet = new THREE.Vector3();

function activeEditableUnit(
  conn: DbConnection,
  getFeetWorld: ((out: THREE.Vector3) => void) | null = null,
): ApartmentUnit | null {
  if (getFeetWorld) {
    getFeetWorld(_editableUnitFeet);
    const containing = apartmentUnitContainingFeet(
      conn,
      _editableUnitFeet.x,
      _editableUnitFeet.y,
      _editableUnitFeet.z,
    );
    if (containing && residentInteriorPropsVisibleForViewer(conn, containing)) {
      return containing;
    }
  }
  if (!conn.identity) return null;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (residentInteriorPropsVisibleForViewer(conn, u)) return u;
  }
  return null;
}

function builtinPieceLabel(p: BuiltinPieceId): string {
  switch (p) {
    case APARTMENT_LAYOUT_PIECE_BED:
      return "Bed";
    case APARTMENT_LAYOUT_PIECE_WARDROBE:
      return "Wardrobe";
    case APARTMENT_LAYOUT_PIECE_FOOTLOCKER:
      return "Footlocker";
    default:
      return "Builtin";
  }
}

function stagingPositionForBuiltin(unit: ApartmentUnit, piece: BuiltinPieceId): THREE.Vector3 {
  switch (piece) {
    case APARTMENT_LAYOUT_PIECE_BED:
      return new THREE.Vector3(unit.bedX, unit.bedY, unit.bedZ);
    case APARTMENT_LAYOUT_PIECE_WARDROBE:
      return new THREE.Vector3(unit.wardrobeX, unit.footY, unit.wardrobeZ);
    case APARTMENT_LAYOUT_PIECE_FOOTLOCKER:
      return new THREE.Vector3(unit.footX, unit.footY, unit.footZ);
    default:
      return new THREE.Vector3();
  }
}

function apartmentDecorRowById(conn: DbConnection, decorId: bigint) {
  for (const row of conn.db.apartment_unit_decor) {
    if (row.decorId === decorId) return row;
  }
  return null;
}

const _pW = new THREE.Vector3();
const _qW = new THREE.Quaternion();
const _sW = new THREE.Vector3();
const _euler = new THREE.Euler();

export function mountFpApartmentLayoutAuthoring(
  opts: MountFpApartmentLayoutAuthoringOpts,
): () => void {
  if (!apartmentLayoutUiGateOpen()) return () => {};

  const tc = new TransformControls(opts.camera, opts.canvas);
  patchFpTransformControlsPointerForCaptureCompat(tc);
  tc.setSize(0.68);
  tc.setSpace("world");
  tc.showY = true;
  const helper = tc.getHelper();
  opts.scene.add(helper);

  const stagingBuiltin = new THREE.Group();
  stagingBuiltin.name = "apartment_layout_staging_builtin";
  opts.scene.add(stagingBuiltin);

  const raycaster = new THREE.Raycaster();
  const ndcCenter = new THREE.Vector2(0, 0);
  const pickGeom = new THREE.BoxGeometry(0.85, 0.92, 0.92);
  const pickMat = new THREE.MeshBasicMaterial({
    color: 0x6ab7ff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pickMeshes: THREE.Mesh[] = [];
  const mkPickMesh = (piece: BuiltinPieceId): THREE.Mesh => {
    const m = new THREE.Mesh(pickGeom, pickMat);
    m.name = `apartment_layout_pick_${piece}`;
    m.userData.layoutPickBuiltin = piece;
    m.frustumCulled = false;
    m.visible = false;
    pickMeshes.push(m);
    opts.scene.add(m);
    return m;
  };
  const pickBed = mkPickMesh(APARTMENT_LAYOUT_PIECE_BED);
  const pickWa = mkPickMesh(APARTMENT_LAYOUT_PIECE_WARDROBE);
  const pickFoot = mkPickMesh(APARTMENT_LAYOUT_PIECE_FOOTLOCKER);

  let panelVisible = false;
  opts.activeRef.active = false;
  let selectedBuiltin: BuiltinPieceId = APARTMENT_LAYOUT_PIECE_BED;
  let selectedDecorId: bigint | null = null;
  let selectedCatalogModelRelPath: string | null = null;
  let catalogDisposed = false;
  let pendingSpawnModelRelPath: string | null = null;

  /** When true TransformControls consumes pointer — avoids pick-through. */
  let tcDragging = false;

  const shell = document.createElement("div");
  shell.dataset.mammothApartmentLayout = "1";
  shell.style.cssText = [
    "position:fixed",
    "right:8px",
    "top:48px",
    "z-index:100000",
    "font:12px/1.45 system-ui,sans-serif",
    "color:#e8e8ef",
    "background:rgba(18,26,38,0.94)",
    "border:1px solid rgba(255,255,255,0.14)",
    "border-radius:10px",
    "padding:10px 12px",
    "minWidth:300px",
    "maxWidth:440px",
    "box-shadow:0 8px 32px rgba(0,0,0,0.45)",
    "pointer-events:auto",
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "Apartment layout (your unit)";
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";

  const hint = document.createElement("div");
  hint.style.opacity = "0.82";
  hint.style.fontSize = "11px";
  hint.style.marginBottom = "10px";
  hint.innerHTML =
    "<b>F9</b> toggles this panel. Enable the overlay once with <code>localStorage.setItem('mammothApartmentLayoutAuthoring','1')</code> then reload. Prefer the standalone editor (<code>my_apartment_layout</code>) for normal authoring. Crosshair-ray picks wardrobe / locker / bed · decor uses meshes · feet must be inside your apartment · models under <code>public/static/models/objects/</code>.";

  const pieceSelect = document.createElement("select");
  pieceSelect.style.width = "100%";

  function repopBuiltinSelectOptions() {
    pieceSelect.innerHTML = "";
    for (const pid of [
      APARTMENT_LAYOUT_PIECE_BED,
      APARTMENT_LAYOUT_PIECE_WARDROBE,
      APARTMENT_LAYOUT_PIECE_FOOTLOCKER,
    ]) {
      const o = document.createElement("option");
      o.value = String(pid);
      o.textContent = builtinPieceLabel(pid);
      pieceSelect.appendChild(o);
    }
    pieceSelect.value = String(selectedBuiltin);
  }
  repopBuiltinSelectOptions();

  const mkModeRow = () => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.marginBottom = "8px";
    const mkBtn = (label: string, mode: "translate" | "rotate" | "scale") => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.flex = "1";
      b.style.cursor = "pointer";
      b.style.padding = "5px 0";
      b.style.borderRadius = "6px";
      b.style.border = "1px solid rgba(255,255,255,0.14)";
      b.style.background = "#243044";
      b.style.color = "#fff";
      b.addEventListener("click", () => {
        tc.setMode(mode);
        tc.setRotationSnap(mode === "rotate" ? THREE.MathUtils.degToRad(15) : null);
      });
      row.appendChild(b);
    };
    mkBtn("Move", "translate");
    mkBtn("Turn", "rotate");
    mkBtn("Scale", "scale");
    return row;
  };

  const catalogLabel = document.createElement("div");
  catalogLabel.textContent = "Decor catalog";
  catalogLabel.style.fontWeight = "600";
  catalogLabel.style.margin = "4px 0 6px";

  const catalogStatus = document.createElement("div");
  catalogStatus.style.fontSize = "11px";
  catalogStatus.style.opacity = "0.82";
  catalogStatus.style.marginBottom = "6px";
  catalogStatus.textContent = "Loading models...";

  const catalogList = document.createElement("div");
  catalogList.style.display = "grid";
  catalogList.style.gap = "6px";
  catalogList.style.maxHeight = "180px";
  catalogList.style.overflowY = "auto";
  catalogList.style.marginBottom = "8px";
  catalogList.style.paddingRight = "2px";

  const addDecorBtn = document.createElement("button");
  addDecorBtn.type = "button";
  addDecorBtn.textContent = "Import selected model";
  addDecorBtn.style.width = "100%";
  addDecorBtn.style.marginBottom = "8px";
  addDecorBtn.disabled = true;

  const delDecorBtn = document.createElement("button");
  delDecorBtn.type = "button";
  delDecorBtn.textContent = "Delete selected décor";
  delDecorBtn.style.width = "100%";
  delDecorBtn.style.opacity = selectedDecorId ? "1" : "0.5";

  shell.append(
    title,
    hint,
    pieceSelect,
    mkModeRow(),
    catalogLabel,
    catalogStatus,
    catalogList,
    addDecorBtn,
    delDecorBtn,
  );
  shell.style.display = panelVisible ? "block" : "none";
  document.body.appendChild(shell);

  function detachTc(): void {
    tc.detach();
  }

  function syncTitle(unit: ApartmentUnit | null): void {
    title.textContent = unit
      ? `Apartment layout (${formatApartmentPublicLabel(unit)})`
      : "Apartment layout (your unit)";
  }

  function renderCatalog(entries: ApartmentDecorCatalogEntry[]): void {
    catalogList.innerHTML = "";
    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.label;
      button.title = entry.modelRelPath;
      button.style.textAlign = "left";
      button.style.cursor = "pointer";
      button.style.padding = "6px 8px";
      button.style.borderRadius = "6px";
      button.style.border = "1px solid rgba(255,255,255,0.14)";
      button.style.background =
        entry.modelRelPath === selectedCatalogModelRelPath ? "#34507a" : "#243044";
      button.style.color = "#fff";
      button.addEventListener("click", () => {
        selectedCatalogModelRelPath = entry.modelRelPath;
        catalogStatus.textContent = `Selected ${entry.label}`;
        renderCatalog(entries);
      });
      catalogList.appendChild(button);
    }
    addDecorBtn.disabled = selectedCatalogModelRelPath === null;
  }

  async function loadCatalog(): Promise<void> {
    catalogStatus.textContent = "Loading models...";
    const entries = await fetchApartmentDecorCatalog();
    if (catalogDisposed) return;
    if (entries.length === 0) {
      selectedCatalogModelRelPath = null;
      catalogList.innerHTML = "";
      addDecorBtn.disabled = true;
      catalogStatus.textContent =
        "No .glb or .obj files found in public/static/models/objects/.";
      return;
    }
    if (
      selectedCatalogModelRelPath === null ||
      !entries.some((entry) => entry.modelRelPath === selectedCatalogModelRelPath)
    ) {
      selectedCatalogModelRelPath = entries[0]!.modelRelPath;
    }
    renderCatalog(entries);
    catalogStatus.textContent = `Loaded ${entries.length} model${entries.length === 1 ? "" : "s"}.`;
  }

  function syncPickMeshes(unit: ApartmentUnit): void {
    const bedP = stagingPositionForBuiltin(unit, APARTMENT_LAYOUT_PIECE_BED);
    const waP = stagingPositionForBuiltin(unit, APARTMENT_LAYOUT_PIECE_WARDROBE);
    const footP = stagingPositionForBuiltin(unit, APARTMENT_LAYOUT_PIECE_FOOTLOCKER);
    pickBed.position.copy(bedP);
    pickWa.position.copy(waP);
    pickFoot.position.copy(footP);
    pickBed.visible = panelVisible;
    pickWa.visible = panelVisible;
    pickFoot.visible = panelVisible;
  }

  function syncStagingFromReplica(): void {
    if (tcDragging) return;
    const unit = activeEditableUnit(opts.conn, opts.getFeetWorld);
    syncTitle(unit);
    if (!unit || !panelVisible) {
      detachTc();
      for (const p of pickMeshes) p.visible = false;
      return;
    }
    syncPickMeshes(unit);
    if (selectedDecorId !== null) {
      const decorRow = apartmentDecorRowById(opts.conn, selectedDecorId);
      if (decorRow?.unitKey !== unit.unitKey) {
        selectedDecorId = null;
        delDecorBtn.style.opacity = "0.55";
      }
    }
    if (selectedDecorId !== null) {
      const obj = opts.getDecorObject(selectedDecorId);
      if (obj) {
        tc.attach(obj);
        tc.setMode(tc.getMode());
        return;
      }
      selectedDecorId = null;
    }
    stagingBuiltin.position.copy(stagingPositionForBuiltin(unit, selectedBuiltin));
    stagingBuiltin.rotation.set(0, unit.bedYaw, 0);
    stagingBuiltin.scale.set(1, 1, 1);
    stagingBuiltin.updateMatrixWorld(true);
    tc.attach(stagingBuiltin);
    tc.setMode(tc.getMode());
  }

  function tryPickFromCenterReticle(): void {
    const unit = activeEditableUnit(opts.conn, opts.getFeetWorld);
    if (!unit || !panelVisible || tcDragging) return;
    opts.camera.updateMatrixWorld();
    raycaster.setFromCamera(ndcCenter, opts.camera);
    raycaster.far = 22;

    const ph = raycaster.intersectObjects(pickMeshes, false)[0]?.object as THREE.Mesh | undefined;
    if (ph?.userData?.layoutPickBuiltin != null) {
      selectedDecorId = null;
      selectedBuiltin = ph.userData.layoutPickBuiltin as BuiltinPieceId;
      pieceSelect.value = String(selectedBuiltin);
      syncStagingFromReplica();
      return;
    }

    const decorObjs: THREE.Object3D[] = [];
    for (const row of opts.conn.db.apartment_unit_decor) {
      if (row.unitKey !== unit.unitKey) continue;
      const d = row.decorId as bigint;
      const o = opts.getDecorObject(d);
      if (o) decorObjs.push(o);
    }
    const hitDecor = raycaster.intersectObjects(decorObjs, true)[0];
    if (hitDecor?.object) {
      let cur: THREE.Object3D | null = hitDecor.object;
      while (cur && cur.userData.mammothApartmentDecorId == null) cur = cur.parent;
      const idRaw = cur?.userData?.mammothApartmentDecorId as bigint | undefined;
      if (idRaw !== undefined && idRaw !== null) {
        selectedDecorId = idRaw;
        delDecorBtn.style.opacity = "1";
        const root = opts.getDecorObject(idRaw);
        if (root) tc.attach(root);
        return;
      }
    }
    delDecorBtn.style.opacity = selectedDecorId ? "1" : "0.55";
    syncStagingFromReplica();
  }

  function commitStaging(): void {
    const unit = activeEditableUnit(opts.conn, opts.getFeetWorld);
    if (!unit || !opts.conn.identity) return;

    const attached = tc.object as THREE.Object3D | undefined;

    if (selectedDecorId !== null) {
      const objRoot = opts.getDecorObject(selectedDecorId) ?? attached;
      if (!objRoot) return;
      objRoot.updateMatrixWorld(true);
      objRoot.matrixWorld.decompose(_pW, _qW, _sW);
      _euler.setFromQuaternion(_qW, "YXZ");
      const us = ((_sW.x + _sW.y + _sW.z) / 3) as number;
      try {
        void opts.conn.reducers.updateApartmentUnitDecor({
          decorId: selectedDecorId,
          posX: _pW.x,
          posY: _pW.y,
          posZ: _pW.z,
          yawRad: _euler.y,
          pitchRad: _euler.x,
          rollRad: _euler.z,
          uniformScale: us,
        });
      } catch (e) {
        console.warn("[apartment_layout] updateApartmentUnitDecor failed", e);
      }
      return;
    }

    stagingBuiltin.updateMatrixWorld(true);
    stagingBuiltin.matrixWorld.decompose(_pW, _qW, _sW);
    _euler.setFromQuaternion(_qW, "YXZ");

    try {
      void opts.conn.reducers.setOwnedApartmentPiecePose({
        unitKey: unit.unitKey,
        piece: selectedBuiltin,
        worldX: _pW.x,
        worldZ: _pW.z,
        yawRad: _euler.y,
        bedFloorWorldY:
          selectedBuiltin === APARTMENT_LAYOUT_PIECE_BED ? _pW.y : (unit.bedY as number),
      });
    } catch (e) {
      console.warn("[apartment_layout] setOwnedApartmentPiecePose failed", e);
    }
  }

  const onDraggingChanged = (ev: unknown): void => {
    const on = Boolean((ev as { value?: boolean }).value);
    tcDragging = on;
    if (on) void document.exitPointerLock();
    else commitStaging();
  };
  tc.addEventListener("dragging-changed", onDraggingChanged);

  pieceSelect.addEventListener("change", () => {
    selectedBuiltin = Number(pieceSelect.value) as BuiltinPieceId;
    selectedDecorId = null;
    tc.setMode(tc.getMode());
    syncStagingFromReplica();
  });

  addDecorBtn.addEventListener("click", () => {
    const unit = activeEditableUnit(opts.conn, opts.getFeetWorld);
    if (!unit) return;
    const path = normalizeApartmentDecorModelRelPath(selectedCatalogModelRelPath ?? "");
    if (!path) {
      window.alert("Select a model from the decor catalog first.");
      return;
    }
    const fp = new THREE.Vector3();
    opts.getFeetWorld(fp);
    pendingSpawnModelRelPath = path;
    catalogStatus.textContent = `Importing ${apartmentDecorCatalogLabel(path)}...`;
    const placedKind = ownedApartmentPlacedItemKindFromModelRelPath(path);
    const { uniformScale } = defaultOwnedApartmentDecorScaleForModel(path);
    try {
      void opts.conn.reducers.addApartmentUnitDecor({
        unitKey: unit.unitKey,
        modelRelPath: path,
        posX: fp.x,
        posY: fp.y + 0.05,
        posZ: fp.z,
        yawRad: 0,
        pitchRad: 0,
        rollRad: 0,
        uniformScale,
        itemKind: apartmentUnitDecorItemKindFromString(placedKind),
      });
    } catch (e) {
      console.warn("[apartment_layout] addApartmentUnitDecor failed", e);
      pendingSpawnModelRelPath = null;
    }
  });

  const onDecorInsert = (_ctx: unknown, row: ApartmentUnitDecor) => {
    if (!panelVisible || pendingSpawnModelRelPath === null) return;
    const unit = activeEditableUnit(opts.conn, opts.getFeetWorld);
    if (!unit || row.unitKey !== unit.unitKey || row.modelRelPath !== pendingSpawnModelRelPath) return;
    selectedDecorId = row.decorId as bigint;
    pendingSpawnModelRelPath = null;
    delDecorBtn.style.opacity = "1";
    catalogStatus.textContent = `Imported ${apartmentDecorCatalogLabel(row.modelRelPath)}.`;
    syncStagingFromReplica();
  };
  opts.conn.db.apartment_unit_decor.onInsert(onDecorInsert);

  delDecorBtn.addEventListener("click", () => {
    if (selectedDecorId === null) return;
    const id = selectedDecorId;
    try {
      void opts.conn.reducers.deleteApartmentUnitDecor({ decorId: id });
    } catch (e) {
      console.warn("[apartment_layout] delete failed", e);
    }
    selectedDecorId = null;
    detachTc();
    syncStagingFromReplica();
  });

  let raf = 0;
  const spin = () => {
    raf = requestAnimationFrame(spin);
    if (panelVisible) syncStagingFromReplica();
  };
  spin();

  const onCanvasPointerDown = (e: PointerEvent) => {
    if (!panelVisible || e.target !== opts.canvas || tcDragging) return;
    if (e.button !== 0) return;
    tryPickFromCenterReticle();
  };
  opts.canvas.addEventListener("pointerdown", onCanvasPointerDown);

  const typingTarget = (t: EventTarget | null) => {
    if (!(t instanceof HTMLElement)) return false;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== "F9" || e.repeat) return;
    if (typingTarget(e.target)) return;
    if (!apartmentLayoutUiGateOpen()) return;
    e.preventDefault();
    panelVisible = !panelVisible;
    shell.style.display = panelVisible ? "block" : "none";
    opts.activeRef.active = panelVisible;
    if (!panelVisible) {
      detachTc();
      tcDragging = false;
      opts.activeRef.active = false;
      for (const p of pickMeshes) p.visible = false;
      return;
    }
    void document.exitPointerLock();
    tc.setSpace("world");
    tc.showY = true;
    syncStagingFromReplica();
  };
  window.addEventListener("keydown", onKey);
  void loadCatalog();

  return () => {
    catalogDisposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    opts.canvas.removeEventListener("pointerdown", onCanvasPointerDown);
    tc.removeEventListener("dragging-changed", onDraggingChanged);
    opts.conn.db.apartment_unit_decor.removeOnInsert(onDecorInsert);
    opts.scene.remove(helper);
    opts.scene.remove(stagingBuiltin);
    tc.dispose();
    shell.remove();
    for (const p of pickMeshes) {
      opts.scene.remove(p);
    }
    pickGeom.dispose();
    pickMat.dispose();
    opts.activeRef.active = false;
  };
}
