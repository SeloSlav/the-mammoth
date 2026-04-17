import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isStairWellOpeningProxyId,
  LANDING_DOOR_OPENING_PROXY_ID,
} from "@the-mammoth/world";
import { reloadEditorFromContent } from "../editor/editorBootstrap.js";
import {
  frameEditorBuilding,
  frameEditorSelection,
  frameFocusedStory,
} from "../editor/editorNavigationBridge.js";
import { spawnInFrontOfCamera } from "../editor/spawnBridge.js";
import { useShallow } from "zustand/react/shallow";
import {
  collectPrefabIdsFromCells,
  collectPrefabIdsFromFloors,
  collectPrefabIdsFromInteriors,
  collectPrefabIdsFromPrefabDefs,
  serializeBuildingDocPretty,
  serializeCellDocPretty,
  serializeElevatorCabDefPretty,
  serializeFloorDocPretty,
  serializeFloorOverrideDocPretty,
  serializeInteriorDocPretty,
  serializeLandingKitDefPretty,
  serializePrefabDefPretty,
  serializeStairWellDefPretty,
  useEditorStore,
} from "../state/editorStore.js";
import { eulerDegToQuat, quatToEulerDeg } from "./editorChromeMath.js";
import {
  fetchCollisionArtifactsStatus,
  postSaveBuilding,
  postSaveCell,
  postSaveElevatorCab,
  postSaveFloor,
  postSaveFloorOverride,
  postSaveApartmentKit,
  postSaveInterior,
  postSaveLandingKit,
  postSavePrefab,
  postSaveStairWell,
} from "./editorChromeNetwork.js";
import { selectEditorChromeStore } from "./editorChromeSelectors.js";
import {
  editorChromeInput,
  editorChromeLabel,
  editorChromePanel,
  editorChromeRowBtn,
} from "./editorChromeStyles.js";
import { EditorChromeInspector } from "./EditorChromeInspector.js";
import { EditorChromeSelectedMaterialPanel } from "./EditorChromeSelectedMaterialPanel.js";
import { EditorChromeOutliner } from "./EditorChromeOutliner.js";
import { EditorChromeFpViewmodel } from "./EditorChromeFpViewmodel.js";
import { useEditorChromeSelectionMeta } from "./hooks/useEditorChromeSelectionMeta.js";

export function EditorChrome() {
  const {
    workspace,
    mode,
    building,
    floorDocs,
    interiorDocs,
    cellDocs,
    prefabDefs,
    floorOverrideDocs,
    elevatorCabDef,
    landingKitDef,
    landingKitVariant,
    stairWellDef,
    contentIndex,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activeFloorOverrideDocId,
    focusedStoryLevelIndex,
    selectedId,
    dirty,
    collisionArtifactsStatus,
    transformMode,
    gridSnapM,
    shadowsEnabled,
    useHdriEnvironment,
    cameraMode,
    flySpeedMps,
    stairWellAuthorScope,
    historyPast,
    historyFuture,
    setMode,
    setWorkspace,
    setLandingKitVariant,
    patchElevatorCabDef,
    patchLandingKitDef,
    patchStairWellDef,
    setActiveFloorDocId,
    setActiveInteriorDocId,
    setActiveCellDocId,
    setActivePrefabDefId,
    setActiveFloorOverrideDocId,
    setFocusedStoryLevelIndex,
    setTransformMode,
    setGridSnapM,
    setShadowsEnabled,
    setUseHdriEnvironment,
    setCameraMode,
    setFlySpeedMps,
    setStairWellAuthorScope,
    setCollisionArtifactsStatus,
    undo,
    redo,
    updatePlacedObject,
    updateInteriorPlacement,
    updateCellPlacement,
    updatePrefabComponent,
    updateFloorOverrideObjectPatch,
    addFloorObject,
    deleteFloorObject,
    duplicateFloorObject,
    addInteriorPlacement,
    deleteInteriorPlacement,
    duplicateInteriorPlacement,
    addCellPlacement,
    deleteCellPlacement,
    duplicateCellPlacement,
    addPrefabComponent,
    deletePrefabComponent,
    duplicatePrefabComponent,
    patchBuilding,
    setSelectedId,
  } = useEditorStore(useShallow(selectEditorChromeStore));

  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const sortedRefs = useMemo(
    () => [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex),
    [building.floorRefs],
  );

  const activeFloorDoc = floorDocs[activeFloorDocId];
  const activeInteriorDoc = interiorDocs[activeInteriorDocId];
  const activeCellDoc = cellDocs[activeCellDocId];
  const activePrefabDef = activePrefabDefId ? prefabDefs[activePrefabDefId] : undefined;
  const activeFloorOverrideDoc = activeFloorOverrideDocId
    ? floorOverrideDocs[activeFloorOverrideDocId]
    : undefined;

  const {
    selectedFloorObj,
    selectedInteriorPl,
    selectedCellPl,
    selectedPrefabComponent,
    selectedFloorOverridePatch,
    metaText,
    setMetaText,
    metaErr,
    setMetaErr,
  } = useEditorChromeSelectionMeta(
    activeFloorDoc,
    activeInteriorDoc,
    activeCellDoc,
    activePrefabDef,
    activeFloorOverrideDoc,
    selectedId,
  );

  const floorPrefabIds = useMemo(() => collectPrefabIdsFromFloors(floorDocs), [floorDocs]);
  const interiorPrefabIds = useMemo(
    () => collectPrefabIdsFromInteriors(interiorDocs),
    [interiorDocs],
  );
  const cellPrefabIds = useMemo(() => collectPrefabIdsFromCells(cellDocs), [cellDocs]);
  const knownPrefabIds = useMemo(
    () => collectPrefabIdsFromPrefabDefs(prefabDefs),
    [prefabDefs],
  );

  const saveToDiskLabel = useMemo(() => {
    switch (mode) {
      case "cab":
        return "Save cab.json";
      case "landing_preview":
        return landingKitVariant === "apartment"
          ? "Save apartment door kit"
          : "Save landing kit";
      case "stairwell_preview":
        return "Save stairwell.json";
      case "floor":
        return `Save floor ${activeFloorDocId}`;
      case "interior":
        return `Save interior ${activeInteriorDocId}`;
      case "cell":
        return `Save cell ${activeCellDocId}`;
      case "prefab":
        return activePrefabDefId ? `Save prefab ${activePrefabDefId}` : "Save prefab";
      case "floor_override":
        return activeFloorOverrideDocId
          ? `Save floor override ${activeFloorOverrideDocId}`
          : "Save floor override";
      default:
        return "Save to disk";
    }
  }, [
    mode,
    landingKitVariant,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activeFloorOverrideDocId,
  ]);

  const refreshCollisionStatus = useCallback(async () => {
    try {
      const next = (await fetchCollisionArtifactsStatus()) as typeof collisionArtifactsStatus;
      setCollisionArtifactsStatus(next ?? null);
    } catch {
      /* ignore */
    }
  }, [collisionArtifactsStatus, setCollisionArtifactsStatus]);

  useEffect(() => {
    void refreshCollisionStatus();
  }, [refreshCollisionStatus]);

  /** World authoring is hidden for now; bounce off stale `world` workspace (e.g. devtools or old sessions). */
  useEffect(() => {
    if (workspace === "world") {
      setWorkspace("landing");
    }
  }, [workspace, setWorkspace]);

  const onReload = useCallback(async () => {
    setSaveMsg(null);
    try {
      await reloadEditorFromContent();
      await refreshCollisionStatus();
      setSaveMsg("Reloaded from disk.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [refreshCollisionStatus]);

  const onSaveDisk = useCallback(async () => {
    setSaveMsg(null);
    try {
      if (mode === "cab") {
        await postSaveElevatorCab(serializeElevatorCabDefPretty(elevatorCabDef));
      } else if (mode === "landing_preview") {
        const body = serializeLandingKitDefPretty(landingKitDef);
        if (landingKitVariant === "apartment") {
          await postSaveApartmentKit(body);
        } else {
          await postSaveLandingKit(body);
        }
      } else if (mode === "stairwell_preview") {
        await postSaveStairWell(serializeStairWellDefPretty(stairWellDef));
      } else if (mode === "floor") {
        const doc = floorDocs[activeFloorDocId];
        if (!doc) throw new Error("No active floor doc");
        await postSaveFloor(activeFloorDocId, serializeFloorDocPretty(doc));
      } else if (mode === "interior") {
        const doc = interiorDocs[activeInteriorDocId];
        if (!doc) throw new Error("No active interior doc");
        await postSaveInterior(activeInteriorDocId, serializeInteriorDocPretty(doc));
      } else if (mode === "cell") {
        const doc = cellDocs[activeCellDocId];
        if (!doc) throw new Error("No active cell doc");
        await postSaveCell(activeCellDocId, serializeCellDocPretty(doc));
      } else if (mode === "prefab") {
        if (!activePrefabDefId || !activePrefabDef) throw new Error("No active prefab def");
        await postSavePrefab(activePrefabDefId, serializePrefabDefPretty(activePrefabDef));
      } else if (mode === "floor_override") {
        if (!activeFloorOverrideDocId || !activeFloorOverrideDoc) {
          throw new Error("No active floor override doc");
        }
        await postSaveFloorOverride(
          activeFloorOverrideDocId,
          serializeFloorOverrideDocPretty(activeFloorOverrideDoc),
        );
      }
      if (workspace === "world") {
        await postSaveBuilding(serializeBuildingDocPretty(building));
      }
      useEditorStore.getState().setDirty(false);
      await refreshCollisionStatus();
      setSaveMsg(
        workspace === "world"
          ? "Saved to content/ (open document + mammoth.json)."
          : "Saved to content/.",
      );
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [
    mode,
    elevatorCabDef,
    landingKitDef,
    landingKitVariant,
    stairWellDef,
    floorDocs,
    interiorDocs,
    cellDocs,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activePrefabDef,
    activeFloorOverrideDocId,
    activeFloorOverrideDoc,
    workspace,
    building,
    refreshCollisionStatus,
  ]);

  const euler = useMemo(() => {
    if (mode === "cab" && selectedId) {
      const r = elevatorCabDef.partTransforms?.[selectedId]?.rotation;
      if (r) return quatToEulerDeg(r);
      return [0, 0, 0] as [number, number, number];
    }
    if (
      mode === "landing_preview" &&
      selectedId &&
      selectedId !== "landing_door_kit" &&
      selectedId !== LANDING_DOOR_OPENING_PROXY_ID
    ) {
      const r = landingKitDef.partTransforms?.[selectedId]?.rotation;
      if (r) return quatToEulerDeg(r);
      return [0, 0, 0] as [number, number, number];
    }
    if (mode === "stairwell_preview" && selectedId && !isStairWellOpeningProxyId(selectedId)) {
      const r =
        stairWellAuthorScope === "ground"
          ? stairWellDef.groundPartTransforms?.[selectedId]?.rotation
          : stairWellDef.partTransforms?.[selectedId]?.rotation;
      if (r) return quatToEulerDeg(r);
      return [0, 0, 0] as [number, number, number];
    }
    if (selectedFloorObj) return quatToEulerDeg(selectedFloorObj.rotation);
    if (selectedInteriorPl) return quatToEulerDeg(selectedInteriorPl.rotation);
    if (selectedCellPl) return quatToEulerDeg(selectedCellPl.rotation);
    if (selectedPrefabComponent) return quatToEulerDeg(selectedPrefabComponent.rotation);
    return [0, 0, 0] as [number, number, number];
  }, [
    mode,
    selectedId,
    elevatorCabDef,
    landingKitDef,
    stairWellDef,
    stairWellAuthorScope,
    selectedFloorObj,
    selectedInteriorPl,
    selectedCellPl,
    selectedPrefabComponent,
  ]);

  const updateEuler = (ix: 0 | 1 | 2, v: number) => {
    const base = euler;
    const next: [number, number, number] = [...base] as [number, number, number];
    next[ix] = v;
    const q = eulerDegToQuat(next[0], next[1], next[2]);
    if (mode === "cab" && selectedId) {
      patchElevatorCabDef((d) => ({
        ...d,
        partTransforms: {
          ...d.partTransforms,
          [selectedId]: {
            ...d.partTransforms?.[selectedId],
            rotation: q,
          },
        },
      }));
      return;
    }
    if (
      mode === "landing_preview" &&
      selectedId &&
      selectedId !== "landing_door_kit" &&
      selectedId !== LANDING_DOOR_OPENING_PROXY_ID
    ) {
      patchLandingKitDef((d) => ({
        ...d,
        partTransforms: {
          ...d.partTransforms,
          [selectedId]: {
            ...d.partTransforms?.[selectedId],
            rotation: q,
          },
        },
      }));
      return;
    }
    if (mode === "stairwell_preview" && selectedId && !isStairWellOpeningProxyId(selectedId)) {
      patchStairWellDef((d) => ({
        ...d,
        ...(stairWellAuthorScope === "ground"
          ? {
              groundPartTransforms: {
                ...d.groundPartTransforms,
                [selectedId]: {
                  ...d.groundPartTransforms?.[selectedId],
                  rotation: q,
                },
              },
            }
          : {
              partTransforms: {
                ...d.partTransforms,
                [selectedId]: {
                  ...d.partTransforms?.[selectedId],
                  rotation: q,
                },
              },
            }),
      }));
      return;
    }
    if (mode === "floor" && selectedId) {
      updatePlacedObject(activeFloorDocId, selectedId, { rotation: q });
    } else if (mode === "interior" && selectedId) {
      updateInteriorPlacement(activeInteriorDocId, selectedId, { rotation: q });
    } else if (mode === "cell" && selectedId) {
      updateCellPlacement(activeCellDocId, selectedId, { rotation: q });
    } else if (mode === "prefab" && selectedId && activePrefabDefId) {
      updatePrefabComponent(activePrefabDefId, selectedId, { rotation: q });
    } else if (mode === "floor_override" && selectedId && activeFloorOverrideDocId) {
      updateFloorOverrideObjectPatch(activeFloorOverrideDocId, selectedId, { rotation: q });
    }
  };

  const wo = building.worldOrigin ?? [0, 0, 0];
  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;
  const paletteIds =
    mode === "floor"
      ? floorPrefabIds
      : mode === "interior"
        ? interiorPrefabIds
        : mode === "cell"
          ? cellPrefabIds
          : knownPrefabIds;

  return (
    <>
      <EditorChromeSelectedMaterialPanel
        mode={mode}
        selectedId={selectedId}
        contentIndex={contentIndex}
        elevatorCabDef={elevatorCabDef}
        landingKitDef={landingKitDef}
        stairWellDef={stairWellDef}
        patchElevatorCabDef={patchElevatorCabDef}
        patchLandingKitDef={patchLandingKitDef}
        patchStairWellDef={patchStairWellDef}
        input={input}
      />
      <div style={editorChromePanel}>
      <strong style={{ fontSize: 15 }}>Authoring</strong>
      <p style={{ opacity: 0.8, fontSize: 12, lineHeight: 1.45, margin: "8px 0 0" }}>
        <strong>Cab</strong>, <strong>Corridor Door</strong>, and <strong>Stairwell</strong> edit shared
        vertical-core visuals (
        <code>{contentIndex.elevatorCabRelPath ?? "elevator/cab.json"}</code>,{" "}
        <code>{contentIndex.landingKitRelPath ?? "elevator/landing_kit.json"}</code>,{" "}
        <code>{contentIndex.stairWellRelPath ?? "elevator/stairwell.json"}</code>).{" "}
        <strong>FP viewmodel</strong> authors weapons and held consumables.
      </p>

      <span style={label}>Workspace</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight: workspace === "stairwell" ? 700 : 400,
            background: workspace === "stairwell" ? "#3a4a7a" : "#2a2a34",
            border: "1px solid #444",
            color: "#fff",
          }}
          onClick={() => {
            setWorkspace("stairwell");
            setCameraMode("orbit");
          }}
        >
          Stairwell
        </button>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight: workspace === "cab" ? 700 : 400,
            background: workspace === "cab" ? "#3a4a7a" : "#2a2a34",
            border: "1px solid #444",
            color: "#fff",
          }}
          onClick={() => setWorkspace("cab")}
        >
          Cab
        </button>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight: workspace === "landing" ? 700 : 400,
            background: workspace === "landing" ? "#3a4a7a" : "#2a2a34",
            border: "1px solid #444",
            color: "#fff",
          }}
          onClick={() => {
            setWorkspace("landing");
            setCameraMode("orbit");
          }}
        >
          Corridor Door
        </button>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight: mode === "fp_viewmodel" || mode === "fp_consumable" ? 700 : 400,
            background: mode === "fp_viewmodel" || mode === "fp_consumable" ? "#3a4a7a" : "#2a2a34",
            border: "1px solid #444",
            color: "#fff",
          }}
          onClick={() => setMode("fp_viewmodel")}
        >
          FP viewmodel
        </button>
      </div>

      {workspace === "stairwell" ? (
        <>
          <span style={label}>Stairwell Scope</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(["typical", "ground"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                style={{
                  ...rowBtn,
                  fontWeight: stairWellAuthorScope === scope ? 700 : 400,
                  background: stairWellAuthorScope === scope ? "#3a4a7a" : "#2a2a34",
                  border: "1px solid #444",
                  color: "#fff",
                }}
                onClick={() => setStairWellAuthorScope(scope)}
              >
                {scope === "typical" ? "Typical Storey" : "Ground Storey"}
              </button>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
            Transform deltas are authored separately for typical and ground stairwells. Materials stay
            shared across the full shaft.
          </p>
        </>
      ) : null}

      {mode === "fp_viewmodel" || mode === "fp_consumable" ? (
        <EditorChromeFpViewmodel
          transformMode={transformMode}
          setTransformMode={setTransformMode}
          gridSnapM={gridSnapM}
          setGridSnapM={setGridSnapM}
        />
      ) : null}

      {mode === "floor" && workspace === "world" ? (
        <>
          <span style={label}>Storey (mammoth floorRefs)</span>
          <select
            style={input}
            value={String(focusedStoryLevelIndex)}
            onChange={(e) => {
              const lv = Number(e.target.value);
              const ref = sortedRefs.find((r) => r.levelIndex === lv);
              if (ref) {
                setFocusedStoryLevelIndex(ref.levelIndex);
                setActiveFloorDocId(ref.floorDocId);
                requestAnimationFrame(() => frameFocusedStory());
              }
            }}
          >
            {sortedRefs.map((r) => (
              <option key={r.levelIndex} value={r.levelIndex}>
                L{r.levelIndex} — {r.floorDocId}
                {r.displayLabel ? ` (${r.displayLabel})` : ""}
              </option>
            ))}
          </select>

          <span style={label}>Active floor JSON (edit target)</span>
          <select
            style={input}
            value={activeFloorDocId}
            onChange={(e) => setActiveFloorDocId(e.target.value)}
          >
            {[...new Set(sortedRefs.map((r) => r.floorDocId))].map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <span style={label}>Quick picks</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button type="button" style={rowBtn} onClick={() => frameEditorBuilding()}>
              Frame building
            </button>
            <button type="button" style={rowBtn} onClick={() => frameFocusedStory()}>
              Frame storey
            </button>
            <button
              type="button"
              style={rowBtn}
              disabled={!selectedId}
              onClick={() => frameEditorSelection()}
            >
              Frame selection
            </button>
            <button
              type="button"
              style={rowBtn}
              disabled={!activeFloorDoc?.objects.some((o) =>
                o.prefabId.toLowerCase().includes("elevator"),
              )}
              onClick={() => {
                const firstElevator = activeFloorDoc?.objects.find((o) =>
                  o.prefabId.toLowerCase().includes("elevator"),
                );
                if (!firstElevator) return;
                setSelectedId(firstElevator.id);
                requestAnimationFrame(() => frameEditorSelection());
              }}
            >
              Pick elevator
            </button>
            <button
              type="button"
              style={rowBtn}
              disabled={!activeFloorDoc?.objects.some((o) =>
                o.prefabId.toLowerCase().includes("stair"),
              )}
              onClick={() => {
                const firstStair = activeFloorDoc?.objects.find((o) =>
                  o.prefabId.toLowerCase().includes("stair"),
                );
                if (!firstStair) return;
                setSelectedId(firstStair.id);
                requestAnimationFrame(() => frameEditorSelection());
              }}
            >
              Pick stair
            </button>
          </div>
        </>
      ) : mode === "interior" ? (
        <>
          <span style={label}>Interior document</span>
          <select
            style={input}
            value={activeInteriorDocId}
            onChange={(e) => setActiveInteriorDocId(e.target.value)}
          >
            {Object.keys(interiorDocs).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </>
      ) : mode === "cell" ? (
        <>
          <span style={label}>Cell document</span>
          <select
            style={input}
            value={activeCellDocId}
            onChange={(e) => setActiveCellDocId(e.target.value)}
          >
            {Object.keys(cellDocs).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </>
      ) : mode === "prefab" ? (
        <>
          <span style={label}>Prefab definition</span>
          <select
            style={input}
            value={activePrefabDefId ?? ""}
            onChange={(e) => setActivePrefabDefId(e.target.value || null)}
          >
            <option value="">— pick prefab —</option>
            {Object.keys(prefabDefs).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </>
      ) : mode === "floor_override" ? (
        <>
          <span style={label}>Floor override document</span>
          <select
            style={input}
            value={activeFloorOverrideDocId ?? ""}
            onChange={(e) => setActiveFloorOverrideDocId(e.target.value || null)}
          >
            <option value="">— pick override —</option>
            {Object.keys(floorOverrideDocs).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
        <>
      <span style={label}>Camera</span>
      <div>
        {(["orbit", "fly"] as const).map((m) => (
          <button
            key={m}
            type="button"
            style={{
              ...rowBtn,
              background: cameraMode === m ? "#5a3d2d" : "#2a2a34",
              border: "1px solid #444",
              color: "#fff",
            }}
            onClick={() => setCameraMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <span style={label}>Fly speed (m/s)</span>
      <input
        style={input}
        type="number"
        min={1}
        step={1}
        value={flySpeedMps}
        onChange={(e) => setFlySpeedMps(Number(e.target.value) || 1)}
      />
      <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
        Fly camera: hold left mouse to look, then use <code>WASD</code> + <code>R</code>/<code>F</code>.
      </p>
      <span style={label}>Scene / gizmo</span>
      <div>
        {(["translate", "rotate", "scale"] as const).map((m) => (
          <button
            key={m}
            type="button"
            style={{
              ...rowBtn,
              background: transformMode === m ? "#2d5a3d" : "#2a2a34",
              border: "1px solid #444",
              color: "#fff",
            }}
            onClick={() => setTransformMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {transformMode === "scale" ? (
        <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
          Viewport: axis scale handles now stretch from the dragged side while keeping the opposite
          face fixed. Drag the <strong>center</strong> scale handle (white cube) for uniform scale
          from center.
        </p>
      ) : null}
      <span style={label}>Grid snap (m / deg-ish for rotate)</span>
      <input
        style={input}
        type="number"
        step={0.5}
        min={0}
        value={gridSnapM || ""}
        placeholder="0 = off"
        onChange={(e) => setGridSnapM(Number(e.target.value) || 0)}
      />
        </>
      ) : null}
      <label style={{ ...label, textTransform: "none", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={shadowsEnabled}
          onChange={(e) => setShadowsEnabled(e.target.checked)}
        />{" "}
        Shadows (directional)
      </label>
      <label style={{ ...label, textTransform: "none", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={useHdriEnvironment}
          onChange={(e) => setUseHdriEnvironment(e.target.checked)}
        />{" "}
        HDRI room environment
      </label>

      <span style={label}>History</span>
      <div>
        <button
          type="button"
          style={rowBtn}
          disabled={historyPast.length === 0}
          onClick={() => undo()}
        >
          Undo
        </button>
        <button
          type="button"
          style={rowBtn}
          disabled={historyFuture.length === 0}
          onClick={() => redo()}
        >
          Redo
        </button>
      </div>

      <span style={label}>Content (JSON on disk)</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <button type="button" style={rowBtn} onClick={() => onReload()} title="Reload every authoring document from content/ (discards unsaved editor changes).">
          Reload from disk
        </button>
        {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
          <button
            type="button"
            style={rowBtn}
            onClick={() => onSaveDisk()}
            title={
              workspace === "world"
                ? "Writes the open document and mammoth.json under content/."
                : "Writes the open document under content/."
            }
          >
            {saveToDiskLabel}
          </button>
        ) : null}
      </div>
      {workspace === "world" && mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
        <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.75, lineHeight: 1.35 }}>
          Saving also updates <code style={{ fontSize: 10 }}>mammoth.json</code> (storey layout and world origin) together
          with the open document.
        </p>
      ) : null}

      <span style={{ ...label, marginTop: 10 }}>Server collision (Rust)</span>
      <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.75, lineHeight: 1.35 }}>
        Full collision regeneration is intentionally script-only. After saving collision-affecting changes, run{" "}
        <code style={{ fontSize: 10 }}>pnpm content:gen-walk-aabbs</code> from the repo root.
      </p>
      {dirty ? (
        <p style={{ color: "#fa0", margin: "8px 0 0", fontSize: 12 }}>
          Unsaved edits — save before running the collision generation script
        </p>
      ) : null}
      {saveMsg ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.9 }}>{saveMsg}</p>
      ) : null}
      {collisionArtifactsStatus ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: collisionArtifactsStatus.stale ? "#fa0" : "#8f8" }}>
          Generated collision vs disk:{" "}
          {collisionArtifactsStatus.stale
            ? "stale (save, then run pnpm content:gen-walk-aabbs)"
            : "in sync"}
        </p>
      ) : null}

      {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
        <>
      {workspace === "world" ? (
        <>
          <span style={label}>Building origin (world)</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <label key={axis} style={{ fontSize: 11 }}>
                {axis}
                <input
                  style={{ ...input, marginTop: 4 }}
                  type="number"
                  step={0.5}
                  value={wo[i]}
                  onChange={(e) => {
                    const nv = Number(e.target.value);
                    const next = [...wo] as [number, number, number];
                    next[i] = Number.isFinite(nv) ? nv : 0;
                    patchBuilding((b) => ({ ...b, worldOrigin: next }));
                  }}
                />
              </label>
            ))}
          </div>
        </>
      ) : null}

      <EditorChromeOutliner
        mode={mode}
        stairWellAuthorScope={stairWellAuthorScope}
        landingKitVariant={landingKitVariant}
        setLandingKitVariant={setLandingKitVariant}
        activeFloorDoc={activeFloorDoc}
        activeInteriorDoc={activeInteriorDoc}
        activeCellDoc={activeCellDoc}
        activePrefabDef={activePrefabDef}
        activeFloorOverrideDoc={activeFloorOverrideDoc}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        label={label}
      />

      {mode !== "cab" && mode !== "landing_preview" && mode !== "stairwell_preview" ? (
        <>
          <span style={label}>Prefab palette</span>
      <select
        style={{ ...input, marginBottom: 6 }}
        id="editor-prefab-palette"
        defaultValue=""
        onChange={() => {}}
      >
        <option value="">— pick prefab —</option>
        {paletteIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      <div>
        <button
          type="button"
          style={rowBtn}
          onClick={() => {
            const sel = document.getElementById(
              "editor-prefab-palette",
            ) as HTMLSelectElement | null;
            const prefabId =
              sel?.value ||
              paletteIds[0] ||
              "corridor_segment_a";
            const pos = spawnInFrontOfCamera(16);
            if (mode === "floor") {
              addFloorObject(activeFloorDocId, {
                id: crypto.randomUUID(),
                prefabId,
                position: pos,
                scale: [1, 1, 1],
              });
            } else {
              if (mode === "cell") {
                addCellPlacement(activeCellDocId, {
                  entityId: crypto.randomUUID(),
                  prefabId,
                  position: pos,
                  scale: [1, 1, 1],
                });
                return;
              }
              if (mode === "prefab" && activePrefabDefId) {
                addPrefabComponent(activePrefabDefId, {
                  id: crypto.randomUUID(),
                  prefabId,
                  position: pos,
                  scale: [1, 1, 1],
                  sockets: [],
                  tags: [],
                });
                return;
              }
              addInteriorPlacement(activeInteriorDocId, {
                entityId: crypto.randomUUID(),
                prefabId,
                position: pos,
                scale: [1, 1, 1],
              });
            }
          }}
        >
          Add object
        </button>
        <button
          type="button"
          style={rowBtn}
          disabled={!selectedId}
          onClick={() => {
            if (!selectedId) return;
            if (mode === "floor")
              duplicateFloorObject(activeFloorDocId, selectedId);
            else if (mode === "interior")
              duplicateInteriorPlacement(activeInteriorDocId, selectedId);
            else if (mode === "cell")
              duplicateCellPlacement(activeCellDocId, selectedId);
            else if (mode === "prefab" && activePrefabDefId)
              duplicatePrefabComponent(activePrefabDefId, selectedId);
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          style={rowBtn}
          disabled={!selectedId}
          onClick={() => {
            if (!selectedId) return;
            if (mode === "floor")
              deleteFloorObject(activeFloorDocId, selectedId);
            else if (mode === "interior")
              deleteInteriorPlacement(activeInteriorDocId, selectedId);
            else if (mode === "cell")
              deleteCellPlacement(activeCellDocId, selectedId);
            else if (mode === "prefab" && activePrefabDefId)
              deletePrefabComponent(activePrefabDefId, selectedId);
          }}
        >
          Delete
        </button>
      </div>
        </>
      ) : null}

      <EditorChromeInspector
        workspace={workspace}
        mode={mode}
        elevatorCabDef={elevatorCabDef}
        landingKitDef={landingKitDef}
        stairWellDef={stairWellDef}
        stairWellAuthorScope={stairWellAuthorScope}
        patchElevatorCabDef={patchElevatorCabDef}
        patchLandingKitDef={patchLandingKitDef}
        patchStairWellDef={patchStairWellDef}
        selectedId={selectedId}
        selectedFloorObj={selectedFloorObj}
        selectedInteriorPl={selectedInteriorPl}
        selectedCellPl={selectedCellPl}
        selectedPrefabComponent={selectedPrefabComponent}
        selectedFloorOverridePatch={selectedFloorOverridePatch}
        activeFloorDocId={activeFloorDocId}
        activeInteriorDocId={activeInteriorDocId}
        activeCellDocId={activeCellDocId}
        activePrefabDefId={activePrefabDefId}
        activeFloorOverrideDocId={activeFloorOverrideDocId}
        metaText={metaText}
        setMetaText={setMetaText}
        metaErr={metaErr}
        setMetaErr={setMetaErr}
        euler={euler}
        updateEuler={updateEuler}
        updatePlacedObject={updatePlacedObject}
        updateInteriorPlacement={updateInteriorPlacement}
        updateCellPlacement={updateCellPlacement}
        updatePrefabComponent={updatePrefabComponent}
        updateFloorOverrideObjectPatch={updateFloorOverrideObjectPatch}
        label={label}
        input={input}
      />
        </>
      ) : null}
    </div>
    </>
  );
}
