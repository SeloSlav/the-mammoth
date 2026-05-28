import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  type FpAuthoringPoseMode,
  type PlayerPresentationManager,
  buildWeaponFirstPersonPresentationMergeFromPickList,
  fpFirearmShotVisualConfigForHeldItem,
} from "@the-mammoth/engine";
import { patchFpTransformControlsPointerForCaptureCompat } from "../fpApartment/fpTransformControlsPointerPatch.js";
import {
  resetFpAuthoringAdsFovPreview,
  setFpAuthoringAdsFovPreview,
} from "../fpSession/fpSessionAuthoringAdsFov.js";
import {
  FP_COMBAT_AIM_FOV_DEG,
  FP_COMBAT_HIP_FOV_DEG,
  snapFpCombatAimFov,
} from "../fpSession/fpSessionCombatAim.js";
import { subscribeFpHotbarSelection } from "../fpHotbar/fpHotbarSelection.js";
import {
  revertLocalWeaponPresentationFromDisk,
  saveLocalWeaponPresentationFromAuthoring,
} from "./weaponPresentationDevDiskSave.js";

/** Hip authoring gizmo screen size (TransformControls). */
const FP_AUTHOR_GIZMO_SIZE_HIP = 0.78;
/** Compensate for narrower ADS FOV so handles stay usable. */
const FP_AUTHOR_GIZMO_SIZE_ADS =
  FP_AUTHOR_GIZMO_SIZE_HIP * (FP_COMBAT_HIP_FOV_DEG / FP_COMBAT_AIM_FOV_DEG) * 1.35;
/** Lift ADS gizmo along camera up so rings sit above the zoomed weapon mesh. */
const FP_AUTHOR_AIM_GIZMO_CAMERA_LIFT_M = 0.12;

export type FpViewmodelAuthoringOpts = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  presentation: PlayerPresentationManager;
  /** FP session reads this to skip pointer-lock and mouse-look while the tool is open. */
  activeRef: { active: boolean };
};

function buildExportJson(presentation: PlayerPresentationManager): string {
  const picks = presentation.getFpAuthoringPickList();
  const merge = buildWeaponFirstPersonPresentationMergeFromPickList(picks, {
    gripAnchor: presentation.getLocalFpGripAnchorObject(),
    weaponVisual: presentation.getLocalFpWeaponVisualObject(),
  });
  const doc = {
    _note:
      'Merge into content/weapons/<weaponId>.presentation.json under "firstPerson", or use Save to disk.',
    firstPersonMerge: merge,
  };
  return JSON.stringify(doc, null, 2);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function localWeaponSupportsAimAuthoring(presentation: PlayerPresentationManager): boolean {
  const def = presentation.getLocalWeaponDefinition();
  return def != null && fpFirearmShotVisualConfigForHeldItem(def.id) != null;
}

/**
 * In-game FP layout tool (dev only): TransformControls on the live gameplay camera, rest pose,
 * JSON export. No-op in production builds.
 */
export function mountFpViewmodelAuthoringDevOnly(opts: FpViewmodelAuthoringOpts): () => void {
  /* Vite: authoring overlay must not ship in production bundles. */
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- import.meta.env is Vite-injected
  if (!import.meta.env.DEV) return () => {};

  const { scene, camera, canvas, presentation, activeRef } = opts;

  const transformControls = new TransformControls(camera, canvas);
  patchFpTransformControlsPointerForCaptureCompat(transformControls);
  transformControls.setSize(FP_AUTHOR_GIZMO_SIZE_HIP);
  transformControls.setSpace("world");
  const transformHelper = transformControls.getHelper();
  scene.add(transformHelper);

  const aimGizmoPivot = new THREE.Object3D();
  aimGizmoPivot.name = "fp_author_aim_gizmo_pivot";
  scene.add(aimGizmoPivot);

  const _gizmoCamUp = new THREE.Vector3();
  const _gizmoWorldPos = new THREE.Vector3();
  const _gizmoWorldQuat = new THREE.Quaternion();
  const _gizmoParentWorldQuat = new THREE.Quaternion();
  const _gizmoLocalQuat = new THREE.Quaternion();

  const isAuthoringAdsGizmoMode = () =>
    panelVisible &&
    presentation.getFpAuthoringPoseMode() === "aim" &&
    localWeaponSupportsAimAuthoring(presentation);

  const cameraUpWorld = (out: THREE.Vector3) => {
    out.set(0, 1, 0).applyQuaternion(camera.quaternion);
  };

  const syncAimGizmoPivotFromRig = (rig: THREE.Object3D) => {
    cameraUpWorld(_gizmoCamUp);
    rig.getWorldPosition(_gizmoWorldPos);
    aimGizmoPivot.position.copy(_gizmoWorldPos).addScaledVector(_gizmoCamUp, FP_AUTHOR_AIM_GIZMO_CAMERA_LIFT_M);
    rig.getWorldQuaternion(_gizmoWorldQuat);
    aimGizmoPivot.quaternion.copy(_gizmoWorldQuat);
    aimGizmoPivot.scale.set(1, 1, 1);
  };

  const applyAimGizmoPivotToRig = (rig: THREE.Object3D) => {
    const parent = rig.parent;
    if (!parent) return;
    cameraUpWorld(_gizmoCamUp);
    aimGizmoPivot.getWorldPosition(_gizmoWorldPos);
    _gizmoWorldPos.addScaledVector(_gizmoCamUp, -FP_AUTHOR_AIM_GIZMO_CAMERA_LIFT_M);
    parent.worldToLocal(_gizmoWorldPos);
    rig.position.copy(_gizmoWorldPos);
    aimGizmoPivot.getWorldQuaternion(_gizmoWorldQuat);
    parent.getWorldQuaternion(_gizmoParentWorldQuat);
    _gizmoLocalQuat.copy(_gizmoParentWorldQuat).invert().multiply(_gizmoWorldQuat);
    rig.quaternion.copy(_gizmoLocalQuat);
  };

  const syncTransformGizmoAppearance = () => {
    transformControls.setSize(isAuthoringAdsGizmoMode() ? FP_AUTHOR_GIZMO_SIZE_ADS : FP_AUTHOR_GIZMO_SIZE_HIP);
    transformHelper.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.depthTest = false;
        m.depthWrite = false;
        m.transparent = true;
      }
    });
  };

  let aimGizmoPivotRaf = 0;
  const tickAimGizmoPivotFollow = () => {
    aimGizmoPivotRaf = requestAnimationFrame(tickAimGizmoPivotFollow);
    if (!panelVisible || transformControls.dragging || !isAuthoringAdsGizmoMode()) return;
    const rig = presentation.getFpAuthoringPickList()[0]?.object;
    if (rig) syncAimGizmoPivotFromRig(rig);
  };
  aimGizmoPivotRaf = requestAnimationFrame(tickAimGizmoPivotFollow);

  let panelVisible = new URLSearchParams(location.search).has("fpAuthor");
  activeRef.active = panelVisible;
  presentation.setFpAuthoringFrozen(panelVisible);
  if (panelVisible) void document.exitPointerLock();

  const shell = document.createElement("div");
  shell.setAttribute("data-fp-authoring", "1");
  shell.style.cssText = [
    "position:fixed",
    "right:8px",
    "top:8px",
    "z-index:100000",
    "font:12px/1.4 system-ui,sans-serif",
    "color:#e8e8ef",
    "background:rgba(18,20,30,0.94)",
    "border:1px solid rgba(255,255,255,0.14)",
    "border-radius:10px",
    "padding:10px 12px",
    "minWidth:300px",
    "maxWidth:440px",
    "box-shadow:0 8px 32px rgba(0,0,0,0.45)",
    "pointer-events:auto",
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "FP viewmodel authoring";
  title.style.fontWeight = "600";
  title.style.marginBottom = "4px";

  const hint = document.createElement("div");
  hint.style.opacity = "0.82";
  hint.style.fontSize = "11px";
  hint.style.marginBottom = "10px";

  const targetLabel = document.createElement("div");
  targetLabel.style.marginBottom = "8px";
  targetLabel.style.opacity = "0.9";

  const poseRow = document.createElement("div");
  poseRow.style.display = "flex";
  poseRow.style.gap = "6px";
  poseRow.style.marginBottom = "8px";

  const modeRow = document.createElement("div");
  modeRow.style.display = "flex";
  modeRow.style.gap = "6px";
  modeRow.style.marginBottom = "8px";

  const mkMode = (label: string, mode: "translate" | "rotate" | "scale") => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.flex = "1";
    b.style.cursor = "pointer";
    b.style.padding = "5px 0";
    b.style.borderRadius = "4px";
    b.style.border = "1px solid rgba(255,255,255,0.18)";
    b.style.background = "#2a2d3e";
    b.style.color = "#eee";
    b.addEventListener("click", () => {
      transformControls.setMode(mode);
    });
    modeRow.appendChild(b);
  };
  mkMode("Move", "translate");
  mkMode("Rotate", "rotate");
  mkMode("Scale", "scale");

  const diskRow = document.createElement("div");
  diskRow.style.display = "flex";
  diskRow.style.gap = "6px";
  diskRow.style.marginBottom = "8px";

  const mkDiskBtn = (label: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.flex = "1";
    b.style.cursor = "pointer";
    b.style.padding = "6px 0";
    b.style.borderRadius = "4px";
    b.style.border = "1px solid rgba(255,255,255,0.18)";
    b.style.background = "#2a2d3e";
    b.style.color = "#eee";
    return b;
  };

  const saveBtn = mkDiskBtn("Save to disk");
  saveBtn.style.border = "1px solid rgba(120,180,255,0.35)";
  saveBtn.style.background = "rgba(60,100,180,0.35)";
  saveBtn.style.color = "#e8f0ff";

  const revertBtn = mkDiskBtn("Revert from disk");
  diskRow.append(saveBtn, revertBtn);

  const status = document.createElement("div");
  status.style.minHeight = "16px";
  status.style.fontSize = "11px";
  status.style.marginBottom = "6px";
  status.style.opacity = "0.88";

  const setStatus = (text: string, tone: "ok" | "err" | "neutral" = "neutral") => {
    status.textContent = text;
    status.style.color =
      tone === "ok" ? "#9fd4a8" : tone === "err" ? "#f0a0a8" : "rgba(232,232,239,0.82)";
  };

  const flashBtn = (btn: HTMLButtonElement, text: string, restoreMs = 1400) => {
    const prev = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    window.setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, restoreMs);
  };

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy JSON";
  copyBtn.style.width = "100%";
  copyBtn.style.marginBottom = "6px";
  copyBtn.style.cursor = "pointer";
  copyBtn.style.padding = "6px";
  copyBtn.style.borderRadius = "4px";
  copyBtn.style.border = "1px solid rgba(120,180,255,0.35)";
  copyBtn.style.background = "rgba(60,100,180,0.35)";
  copyBtn.style.color = "#e8f0ff";

  const ta = document.createElement("textarea");
  ta.readOnly = true;
  ta.rows = 14;
  ta.style.width = "100%";
  ta.style.resize = "vertical";
  ta.style.boxSizing = "border-box";
  ta.style.fontFamily = "ui-monospace,monospace";
  ta.style.fontSize = "11px";
  ta.style.borderRadius = "4px";
  ta.style.border = "1px solid rgba(255,255,255,0.12)";
  ta.style.background = "#0f1018";
  ta.style.color = "#c8d0e0";
  ta.style.padding = "6px";

  const poseBtnStyles = {
    active: "1px solid rgba(120,180,255,0.55)",
    inactive: "1px solid rgba(255,255,255,0.18)",
    activeBg: "rgba(60,100,180,0.45)",
    inactiveBg: "#2a2d3e",
  };

  let restPoseBtn: HTMLButtonElement | null = null;
  let aimPoseBtn: HTMLButtonElement | null = null;

  /** Match in-game RMB ADS zoom while authoring the aim rig (main RAF keeps FOV pinned). */
  const syncAuthoringAdsFovPreview = () => {
    const adsPreview =
      panelVisible &&
      localWeaponSupportsAimAuthoring(presentation) &&
      presentation.getFpAuthoringPoseMode() === "aim";
    setFpAuthoringAdsFovPreview(adsPreview);
    snapFpCombatAimFov(camera, adsPreview);
  };

  const syncPoseUi = () => {
    const pose = presentation.getFpAuthoringPoseMode();
    const aimAvailable = localWeaponSupportsAimAuthoring(presentation);
    poseRow.style.display = aimAvailable ? "flex" : "none";

    if (pose === "aim") {
      targetLabel.textContent = "Aim rig (ADS)";
      hint.textContent =
        "Backtick (`) toggles this panel. ADS rig pose + combat zoom FOV — move/rotate to set fpViewmodel.aimRigRoot.";
    } else {
      targetLabel.textContent = "Hand & weapon";
      hint.textContent =
        "Backtick (`) toggles this panel. Uses the real gameplay camera; viewmodel stays at hip rest while open.";
    }

    if (restPoseBtn) {
      const active = pose === "rest";
      restPoseBtn.style.border = active ? poseBtnStyles.active : poseBtnStyles.inactive;
      restPoseBtn.style.background = active ? poseBtnStyles.activeBg : poseBtnStyles.inactiveBg;
    }
    if (aimPoseBtn) {
      const active = pose === "aim";
      aimPoseBtn.style.border = active ? poseBtnStyles.active : poseBtnStyles.inactive;
      aimPoseBtn.style.background = active ? poseBtnStyles.activeBg : poseBtnStyles.inactiveBg;
    }
  };

  const setAuthoringPose = (mode: FpAuthoringPoseMode) => {
    presentation.setFpAuthoringPoseMode(mode);
    syncPoseUi();
    syncAuthoringAdsFovPreview();
    syncTransformGizmoAppearance();
    attachAuthoringTarget();
  };

  const mkPoseBtn = (label: string, mode: FpAuthoringPoseMode) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.flex = "1";
    b.style.cursor = "pointer";
    b.style.padding = "5px 0";
    b.style.borderRadius = "4px";
    b.style.color = "#eee";
    b.addEventListener("click", () => setAuthoringPose(mode));
    poseRow.appendChild(b);
    return b;
  };

  restPoseBtn = mkPoseBtn("Hip rest", "rest");
  aimPoseBtn = mkPoseBtn("Aim (ADS)", "aim");

  shell.append(title, hint, poseRow, targetLabel, modeRow, diskRow, status, copyBtn, ta);
  shell.style.display = panelVisible ? "block" : "none";
  document.body.appendChild(shell);
  syncPoseUi();
  syncAuthoringAdsFovPreview();

  const refreshAuthoringAfterWeaponVisual = () => {
    if (!panelVisible) return;
    syncPoseUi();
    syncAuthoringAdsFovPreview();
    attachAuthoringTarget();
  };

  const attachAuthoringTarget = () => {
    const picks = presentation.getFpAuthoringPickList();
    const rig = picks[0]?.object;
    syncTransformGizmoAppearance();
    if (!rig) {
      transformControls.detach();
    } else if (isAuthoringAdsGizmoMode()) {
      syncAimGizmoPivotFromRig(rig);
      transformControls.attach(aimGizmoPivot);
    } else {
      transformControls.attach(rig);
    }
    ta.value = buildExportJson(presentation);
  };

  const refreshExport = () => {
    ta.value = buildExportJson(presentation);
  };

  if (panelVisible) attachAuthoringTarget();
  else ta.value = buildExportJson(presentation);

  saveBtn.addEventListener("click", async () => {
    refreshExport();
    setStatus("");
    try {
      const { weaponId } = await saveLocalWeaponPresentationFromAuthoring(presentation);
      attachAuthoringTarget();
      setStatus(`Saved content/weapons/${weaponId}.presentation.json`, "ok");
      flashBtn(saveBtn, "Saved!");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.", "err");
    }
  });

  revertBtn.addEventListener("click", async () => {
    const def = presentation.getLocalWeaponDefinition();
    if (!def) {
      setStatus("No weapon equipped — select a weapon on the hotbar first.", "err");
      return;
    }
    if (
      !window.confirm(
        `Discard unsaved gizmo edits and reload content/weapons/${def.id}.presentation.json from disk?`,
      )
    ) {
      return;
    }
    setStatus("");
    try {
      const { weaponId } = await revertLocalWeaponPresentationFromDisk(presentation);
      attachAuthoringTarget();
      setStatus(`Reverted from content/weapons/${weaponId}.presentation.json`, "ok");
      flashBtn(revertBtn, "Reverted");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Revert failed.", "err");
    }
  });

  copyBtn.addEventListener("click", async () => {
    refreshExport();
    try {
      await navigator.clipboard.writeText(ta.value);
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy JSON";
      }, 1200);
    } catch {
      ta.select();
      copyBtn.textContent = "Select & Ctrl+C";
      setTimeout(() => {
        copyBtn.textContent = "Copy JSON";
      }, 2000);
    }
  });

  const onTransformChange = () => {
    if (presentation.getFpAuthoringPoseMode() === "aim") {
      const rig = presentation.getFpAuthoringPickList()[0]?.object;
      if (rig) applyAimGizmoPivotToRig(rig);
      presentation.syncLocalFpAuthoringRigAimFromAttachedRig();
    }
    refreshExport();
  };
  transformControls.addEventListener("change", onTransformChange);

  const onDraggingChanged = (ev: unknown) => {
    const on = Boolean((ev as { value?: boolean }).value);
    if (on) void document.exitPointerLock();
    if (!on && isAuthoringAdsGizmoMode()) {
      const rig = presentation.getFpAuthoringPickList()[0]?.object;
      if (rig) syncAimGizmoPivotFromRig(rig);
    }
  };
  transformControls.addEventListener("dragging-changed", onDraggingChanged);

  const unsubHotbar = subscribeFpHotbarSelection(refreshAuthoringAfterWeaponVisual);
  const unsubWeaponVisual = presentation.subscribeLocalWeaponVisualApplied(
    refreshAuthoringAfterWeaponVisual,
  );

  const onWinKeydown = (e: KeyboardEvent) => {
    if (e.code !== "Backquote" || e.repeat) return;
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
    panelVisible = !panelVisible;
    shell.style.display = panelVisible ? "block" : "none";
    activeRef.active = panelVisible;
    presentation.setFpAuthoringFrozen(panelVisible);
    if (panelVisible) {
      void document.exitPointerLock();
      syncPoseUi();
      syncAuthoringAdsFovPreview();
      attachAuthoringTarget();
    } else {
      transformControls.detach();
      syncAuthoringAdsFovPreview();
      presentation.syncLocalFpWeaponMountBaselineFromRoot();
    }
  };
  window.addEventListener("keydown", onWinKeydown);

  return () => {
    cancelAnimationFrame(aimGizmoPivotRaf);
    unsubHotbar();
    unsubWeaponVisual();
    window.removeEventListener("keydown", onWinKeydown);
    transformControls.removeEventListener("dragging-changed", onDraggingChanged);
    transformControls.removeEventListener("change", onTransformChange);
    scene.remove(aimGizmoPivot);
    scene.remove(transformHelper);
    transformControls.dispose();
    shell.remove();
    activeRef.active = false;
    presentation.setFpAuthoringFrozen(false);
    resetFpAuthoringAdsFovPreview();
    snapFpCombatAimFov(camera, false);
    presentation.syncLocalFpWeaponMountBaselineFromRoot();
  };
}
