import { useCallback, useEffect, useMemo, useState } from "react";
import { LANDING_DOOR_OPENING_PROXY_ID } from "@the-mammoth/world";
import { reloadEditorFromContent } from "../editor/editorBootstrap.js";
import {
  frameEditorBuilding,
  frameEditorSelection,
  frameFocusedStory,
} from "../editor/editorNavigationBridge.js";
import { spawnInFrontOfCamera } from "../editor/spawnBridge.js";
import { useShallow } from "zustand/react/shallow";
import type { LandingDocKind } from "../state/editorStore.js";
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
  downloadText,
  fetchCollisionArtifactsStatus,
  postRebuildServerCollision,
  postSaveBuilding,
  postSaveCell,
  postSaveElevatorCab,
  postSaveFloor,
  postSaveFloorOverride,
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
import { EditorChromeOutliner } from "./EditorChromeOutliner.js";
import { EditorChromeFpViewmodel } from "./EditorChromeFpViewmodel.js";
import { useEditorChromeSelectionMeta } from "./hooks/useEditorChromeSelectionMeta.js";

export function EditorChrome() {
  const {
    workspace,
    landingDocKind,
    mode,
    building,
    floorDocs,
    interiorDocs,
    cellDocs,
    prefabDefs,
    floorOverrideDocs,
    elevatorCabDef,
    landingKitDef,
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
    setLandingDocKind,
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
        await postSaveLandingKit(serializeLandingKitDefPretty(landingKitDef));
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
      useEditorStore.getState().setDirty(false);
      await refreshCollisionStatus();
      setSaveMsg("Saved to content/ (disk write OK).");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [
    mode,
    elevatorCabDef,
    landingKitDef,
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
    refreshCollisionStatus,
  ]);

  const onSaveBuilding = useCallback(async () => {
    setSaveMsg(null);
    try {
      await postSaveBuilding(serializeBuildingDocPretty(building));
      useEditorStore.getState().setDirty(false);
      await refreshCollisionStatus();
      setSaveMsg("Saved mammoth.json.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [building, refreshCollisionStatus]);

  const onRebuildCollision = useCallback(async () => {
    setSaveMsg(null);
    try {
      const out = (await postRebuildServerCollision()) as {
        stdout?: string;
        status?: typeof collisionArtifactsStatus;
      };
      if (out.status) setCollisionArtifactsStatus(out.status);
      setSaveMsg(out.stdout?.trim() || "Rebuilt walk/collision artifacts.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [collisionArtifactsStatus, setCollisionArtifactsStatus]);

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
    if (mode === "stairwell_preview" && selectedId) {
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
    if (mode === "stairwell_preview" && selectedId) {
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

  const landingKindBtn = (kind: LandingDocKind, title: string) => (
    <button
      key={kind}
      type="button"
      style={{
        ...rowBtn,
        fontWeight: landingDocKind === kind ? 700 : 400,
        background: landingDocKind === kind ? "#3a4a7a" : "#2a2a34",
        border: "1px solid #444",
        color: "#fff",
      }}
      onClick={() => {
        setLandingDocKind(kind);
        setCameraMode("fly");
      }}
    >
      {title}
    </button>
  );

  return (
    <div style={editorChromePanel}>
      <strong style={{ fontSize: 15 }}>Authoring</strong>
      <p style={{ opacity: 0.8, fontSize: 12, lineHeight: 1.45, margin: "8px 0 0" }}>
        <strong>Cab</strong>, <strong>Landing</strong>, and <strong>Stairwell</strong> edit shared
        vertical-core visuals (
        <code>{contentIndex.elevatorCabRelPath ?? "elevator/cab.json"}</code>,{" "}
        <code>{contentIndex.landingKitRelPath ?? "elevator/landing_kit.json"}</code>,{" "}
        <code>{contentIndex.stairWellRelPath ?? "elevator/stairwell.json"}</code>).{" "}
        <strong>World</strong> is the building + streamed docs: fly the stack, pick placements, and
        save local JSON. <strong>FP viewmodel</strong> now authors both weapons and held consumables.
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
            setCameraMode("fly");
          }}
        >
          Landing
        </button>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight: workspace === "world" ? 700 : 400,
            background: workspace === "world" ? "#3a4a7a" : "#2a2a34",
            border: "1px solid #444",
            color: "#fff",
          }}
          onClick={() => {
            setWorkspace("world");
            setCameraMode("fly");
          }}
        >
          World
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

      {workspace === "landing" ? (
        <>
          <span style={label}>Landing target</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {landingKindBtn("kit", "Door kit (shared)")}
            {landingKindBtn("interior", "Interior doc")}
            {landingKindBtn("cell", "Cell doc")}
            {landingKindBtn("prefab", "Prefab def")}
            {landingKindBtn("floor_override", "Floor override")}
          </div>
        </>
      ) : null}

      {workspace === "world" ? (
        <>
          <span style={label}>World scope</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              style={{
                ...rowBtn,
                fontWeight: mode === "floor" ? 700 : 400,
                background: mode === "floor" ? "#3a4a7a" : "#2a2a34",
                border: "1px solid #444",
                color: "#fff",
              }}
              onClick={() => {
                setMode("floor");
                setCameraMode("fly");
              }}
            >
              Building stack + cell
            </button>
            <button
              type="button"
              style={{
                ...rowBtn,
                fontWeight: mode === "interior" ? 700 : 400,
                background: mode === "interior" ? "#3a4a7a" : "#2a2a34",
                border: "1px solid #444",
                color: "#fff",
              }}
              onClick={() => {
                setMode("interior");
                setCameraMode("fly");
              }}
            >
              Interior
            </button>
            <button
              type="button"
              style={{
                ...rowBtn,
                fontWeight: mode === "cell" ? 700 : 400,
                background: mode === "cell" ? "#3a4a7a" : "#2a2a34",
                border: "1px solid #444",
                color: "#fff",
              }}
              onClick={() => {
                setMode("cell");
                setCameraMode("fly");
              }}
            >
              Cell
            </button>
            <button
              type="button"
              style={{
                ...rowBtn,
                fontWeight: mode === "prefab" ? 700 : 400,
                background: mode === "prefab" ? "#3a4a7a" : "#2a2a34",
                border: "1px solid #444",
                color: "#fff",
              }}
              onClick={() => {
                setMode("prefab");
                setCameraMode("fly");
              }}
            >
              Prefab
            </button>
            <button
              type="button"
              style={{
                ...rowBtn,
                fontWeight: mode === "floor_override" ? 700 : 400,
                background: mode === "floor_override" ? "#3a4a7a" : "#2a2a34",
                border: "1px solid #444",
                color: "#fff",
              }}
              onClick={() => {
                setMode("floor_override");
                setCameraMode("fly");
              }}
            >
              Floor override
            </button>
          </div>
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
          Viewport: drag the <strong>center</strong> scale handle (white cube) for uniform scale. Axis
          handles change one dimension only.
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

      <span style={label}>I/O</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" style={rowBtn} onClick={() => onReload()}>
          Reload
        </button>
        {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
          <button type="button" style={rowBtn} onClick={() => onSaveDisk()}>
            Save to disk
          </button>
        ) : null}
        <button type="button" style={rowBtn} onClick={() => onRebuildCollision()}>
          Save + rebuild collision
        </button>
        {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
        <button
          type="button"
          style={rowBtn}
          onClick={() => {
            if (mode === "cab") {
              downloadText("cab.json", serializeElevatorCabDefPretty(elevatorCabDef));
            } else if (mode === "landing_preview") {
              downloadText("landing_kit.json", serializeLandingKitDefPretty(landingKitDef));
            } else if (mode === "stairwell_preview") {
              downloadText("stairwell.json", serializeStairWellDefPretty(stairWellDef));
            } else if (mode === "floor" && activeFloorDoc) {
              downloadText(
                `${activeFloorDocId}.json`,
                serializeFloorDocPretty(activeFloorDoc),
              );
            } else if (mode === "interior" && activeInteriorDoc) {
              downloadText(
                `${activeInteriorDocId}.json`,
                serializeInteriorDocPretty(activeInteriorDoc),
              );
            } else if (mode === "cell" && activeCellDoc) {
              downloadText(`${activeCellDocId}.json`, serializeCellDocPretty(activeCellDoc));
            } else if (mode === "prefab" && activePrefabDef && activePrefabDefId) {
              downloadText(
                `${activePrefabDefId}.json`,
                serializePrefabDefPretty(activePrefabDef),
              );
            } else if (
              mode === "floor_override" &&
              activeFloorOverrideDoc &&
              activeFloorOverrideDocId
            ) {
              downloadText(
                `${activeFloorOverrideDocId}.json`,
                serializeFloorOverrideDocPretty(activeFloorOverrideDoc),
              );
            }
          }}
        >
          Download JSON
        </button>
        ) : null}
        <button
          type="button"
          style={rowBtn}
          onClick={() =>
            downloadText("mammoth.json", serializeBuildingDocPretty(building))
          }
        >
          Download mammoth
        </button>
        <button type="button" style={rowBtn} onClick={() => onSaveBuilding()}>
          Save mammoth
        </button>
      </div>
      {dirty ? (
        <p style={{ color: "#fa0", margin: "8px 0 0", fontSize: 12 }}>Unsaved edits</p>
      ) : null}
      {saveMsg ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.9 }}>{saveMsg}</p>
      ) : null}
      {collisionArtifactsStatus ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: collisionArtifactsStatus.stale ? "#fa0" : "#8f8" }}>
          Collision artifacts: {collisionArtifactsStatus.stale ? "stale" : "up to date"}
        </p>
      ) : null}

      {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
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

      <EditorChromeOutliner
        mode={mode}
        stairWellAuthorScope={stairWellAuthorScope}
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
  );
}
