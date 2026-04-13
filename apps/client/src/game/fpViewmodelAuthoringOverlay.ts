import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { PlayerPresentationManager } from "@the-mammoth/engine";

export type FpViewmodelAuthoringOpts = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  presentation: PlayerPresentationManager;
  /** FP session reads this to skip pointer-lock and mouse-look while the tool is open. */
  activeRef: { active: boolean };
};

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function vec3(v: THREE.Vector3) {
  return { x: r4(v.x), y: r4(v.y), z: r4(v.z) };
}

function buildExportJson(presentation: PlayerPresentationManager): string {
  const picks = presentation.getFpAuthoringPickList();
  const byId = new Map(picks.map((p) => [p.id, p.object]));

  const rig = byId.get("rigRoot");
  const grip = byId.get("gripAnchor");
  const hand = byId.get("hand");
  const wRoot = byId.get("weaponRoot");
  const wVis = byId.get("weaponVisual");

  const mountEuler = wRoot?.rotation;
  const mount =
    wRoot && mountEuler
      ? {
          positionM: vec3(wRoot.position),
          eulerRad: { x: r4(mountEuler.x), y: r4(mountEuler.y), z: r4(mountEuler.z) },
        }
      : null;
  const fpViewmodel: Record<string, unknown> = {};
  if (rig) {
    const re = rig.rotation;
    fpViewmodel.rigRoot = {
      positionM: vec3(rig.position),
      eulerRad: { x: r4(re.x), y: r4(re.y), z: r4(re.z) },
      scaleM: vec3(rig.scale),
    };
  }
  if (grip) {
    const w = new THREE.Vector3();
    if (hand) {
      grip.getWorldPosition(w);
      hand.worldToLocal(w);
      fpViewmodel.gripAnchorPositionM = vec3(w);
    } else {
      fpViewmodel.gripAnchorPositionM = vec3(grip.position);
    }
  }
  if (hand) { 
    fpViewmodel.hand = {
      positionM: vec3(hand.position),
      eulerRad: { x: r4(hand.rotation.x), y: r4(hand.rotation.y), z: r4(hand.rotation.z) },
      scale: vec3(hand.scale),
    };
  }
  if (wVis) fpViewmodel.weaponVisualScale = vec3(wVis.scale);
  const doc = {
    _note:
      'Merge into content/weapons/<weaponId>.presentation.json under "firstPerson" (same shape as editor export). Commit JSON — HMR reloads it.',
    firstPersonMerge: {
      mount,
      fpViewmodel: Object.keys(fpViewmodel).length > 0 ? fpViewmodel : null,
    },
  };
  return JSON.stringify(doc, null, 2);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
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
  hint.textContent =
    "Backtick (`) toggles this panel. Uses the real gameplay camera; viewmodel stays at rest while open.";
  hint.style.opacity = "0.82";
  hint.style.fontSize = "11px";
  hint.style.marginBottom = "10px";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.marginBottom = "8px";
  select.style.padding = "4px 6px";
  select.style.borderRadius = "4px";
  select.style.border = "1px solid rgba(255,255,255,0.2)";
  select.style.background = "#1a1c28";
  select.style.color = "#eee";

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

  shell.append(title, hint, select, modeRow, copyBtn, ta);
  shell.style.display = panelVisible ? "block" : "none";
  document.body.appendChild(shell);

  const repopulateSelect = () => {
    const prev = select.value;
    select.innerHTML = "";
    const picks = presentation.getFpAuthoringPickList();
    for (const p of picks) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      select.appendChild(opt);
    }
    const next =
      picks.find((p) => p.id === prev) ?? picks[0];
    if (next) {
      select.value = next.id;
      transformControls.attach(next.object);
    } else {
      transformControls.detach();
    }
    ta.value = buildExportJson(presentation);
  };

  const refreshExport = () => {
    ta.value = buildExportJson(presentation);
  };

  if (panelVisible) repopulateSelect();
  else ta.value = buildExportJson(presentation);

  select.addEventListener("change", () => {
    const picks = presentation.getFpAuthoringPickList();
    const hit = picks.find((p) => p.id === select.value);
    if (hit) transformControls.attach(hit.object);
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

  transformControls.addEventListener("change", refreshExport);

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
      repopulateSelect();
    } else {
      transformControls.detach();
      presentation.syncLocalFpWeaponMountBaselineFromRoot();
    }
  };
  window.addEventListener("keydown", onWinKeydown);

  return () => {
    window.removeEventListener("keydown", onWinKeydown);
    transformControls.removeEventListener("dragging-changed", onDraggingChanged);
    transformControls.removeEventListener("change", refreshExport);
    scene.remove(transformHelper);
    transformControls.dispose();
    shell.remove();
    activeRef.active = false;
    presentation.setFpAuthoringFrozen(false);
    presentation.syncLocalFpWeaponMountBaselineFromRoot();
  };
}
