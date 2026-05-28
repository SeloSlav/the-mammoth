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
import { snapFpCombatAimFov } from "../fpSession/fpSessionCombatAim.js";
import {
  revertLocalWeaponPresentationFromDisk,
  saveLocalWeaponPresentationFromAuthoring,
} from "./weaponPresentationDevDiskSave.js";

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
  transformControls.setSize(0.78);
  transformControls.setSpace("world");
  const transformHelper = transformControls.getHelper();
  scene.add(transformHelper);

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

  const attachAuthoringTarget = () => {
    const picks = presentation.getFpAuthoringPickList();
    const target = picks[0];
    if (target) transformControls.attach(target.object);
    else transformControls.detach();
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
      presentation.syncLocalFpAuthoringRigAimFromAttachedRig();
    }
    refreshExport();
  };
  transformControls.addEventListener("change", onTransformChange);

  const onDraggingChanged = (ev: unknown) => {
    const on = Boolean((ev as { value?: boolean }).value);
    if (on) void document.exitPointerLock();
  };
  transformControls.addEventListener("dragging-changed", onDraggingChanged);

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
    window.removeEventListener("keydown", onWinKeydown);
    transformControls.removeEventListener("dragging-changed", onDraggingChanged);
    transformControls.removeEventListener("change", onTransformChange);
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
