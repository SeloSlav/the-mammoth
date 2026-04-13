import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { reloadEditorFromContent } from "../editor/editorBootstrap.js";
import { spawnInFrontOfCamera } from "../editor/spawnBridge.js";
import { useShallow } from "zustand/react/shallow";
import {
  collectPrefabIdsFromFloors,
  collectPrefabIdsFromInteriors,
  serializeBuildingDocPretty,
  serializeFloorDocPretty,
  serializeInteriorDocPretty,
  useEditorStore,
} from "../state/editorStore.js";
import { eulerDegToQuat, quatToEulerDeg } from "./editorChromeMath.js";
import {
  downloadText,
  postSaveBuilding,
  postSaveFloor,
  postSaveInterior,
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

export function EditorChrome() {
  const {
    mode,
    building,
    floorDocs,
    interiorDocs,
    activeFloorDocId,
    activeInteriorDocId,
    focusedStoryLevelIndex,
    selectedId,
    dirty,
    transformMode,
    gridSnapM,
    shadowsEnabled,
    useHdriEnvironment,
    historyPast,
    historyFuture,
    setMode,
    setActiveFloorDocId,
    setActiveInteriorDocId,
    setFocusedStoryLevelIndex,
    setTransformMode,
    setGridSnapM,
    setShadowsEnabled,
    setUseHdriEnvironment,
    undo,
    redo,
    updatePlacedObject,
    updateInteriorPlacement,
    addFloorObject,
    deleteFloorObject,
    duplicateFloorObject,
    addInteriorPlacement,
    deleteInteriorPlacement,
    duplicateInteriorPlacement,
    patchBuilding,
    setSelectedId,
  } = useEditorStore(useShallow(selectEditorChromeStore));

  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [metaText, setMetaText] = useState("");
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const sortedRefs = useMemo(
    () => [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex),
    [building.floorRefs],
  );

  const activeFloorDoc = floorDocs[activeFloorDocId];
  const activeInteriorDoc = interiorDocs[activeInteriorDocId];

  const selectedFloorObj = useMemo(() => {
    if (!activeFloorDoc || !selectedId) return null;
    return activeFloorDoc.objects.find((o) => o.id === selectedId) ?? null;
  }, [activeFloorDoc, selectedId]);

  const selectedInteriorPl = useMemo(() => {
    if (!activeInteriorDoc || !selectedId) return null;
    return activeInteriorDoc.placements.find((p) => p.entityId === selectedId) ?? null;
  }, [activeInteriorDoc, selectedId]);

  useEffect(() => {
    if (selectedFloorObj) {
      setMetaText(
        selectedFloorObj.metadata
          ? JSON.stringify(selectedFloorObj.metadata, null, 2)
          : "",
      );
      setMetaErr(null);
    } else if (selectedInteriorPl) {
      setMetaText(
        selectedInteriorPl.overrides
          ? JSON.stringify(selectedInteriorPl.overrides, null, 2)
          : "",
      );
      setMetaErr(null);
    } else {
      setMetaText("");
    }
  }, [selectedFloorObj, selectedInteriorPl]);

  const floorPrefabIds = useMemo(() => collectPrefabIdsFromFloors(floorDocs), [floorDocs]);
  const interiorPrefabIds = useMemo(
    () => collectPrefabIdsFromInteriors(interiorDocs),
    [interiorDocs],
  );

  const onReload = useCallback(async () => {
    setSaveMsg(null);
    try {
      await reloadEditorFromContent();
      setSaveMsg("Reloaded from disk.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onSaveDisk = useCallback(async () => {
    setSaveMsg(null);
    try {
      if (mode === "floor") {
        const doc = floorDocs[activeFloorDocId];
        if (!doc) throw new Error("No active floor doc");
        await postSaveFloor(activeFloorDocId, serializeFloorDocPretty(doc));
      } else {
        const doc = interiorDocs[activeInteriorDocId];
        if (!doc) throw new Error("No active interior doc");
        await postSaveInterior(activeInteriorDocId, serializeInteriorDocPretty(doc));
      }
      useEditorStore.getState().setDirty(false);
      setSaveMsg("Saved to content/ (EDITOR_SAVE=1).");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [mode, floorDocs, interiorDocs, activeFloorDocId, activeInteriorDocId]);

  const onSaveBuilding = useCallback(async () => {
    setSaveMsg(null);
    try {
      await postSaveBuilding(serializeBuildingDocPretty(building));
      setSaveMsg("Saved mammoth.json.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [building]);

  const euler = useMemo(() => {
    if (selectedFloorObj) return quatToEulerDeg(selectedFloorObj.rotation);
    if (selectedInteriorPl) return quatToEulerDeg(selectedInteriorPl.rotation);
    return [0, 0, 0] as [number, number, number];
  }, [selectedFloorObj, selectedInteriorPl]);

  const updateEuler = (ix: 0 | 1 | 2, v: number) => {
    const base = euler;
    const next: [number, number, number] = [...base] as [number, number, number];
    next[ix] = v;
    const q = eulerDegToQuat(next[0], next[1], next[2]);
    if (mode === "floor" && selectedId) {
      updatePlacedObject(activeFloorDocId, selectedId, { rotation: q });
    } else if (mode === "interior" && selectedId) {
      updateInteriorPlacement(activeInteriorDocId, selectedId, { rotation: q });
    }
  };

  const wo = building.worldOrigin ?? [0, 0, 0];
  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;

  return (
    <div style={editorChromePanel}>
      <strong style={{ fontSize: 15 }}>Level editor</strong>
      <p style={{ opacity: 0.8, fontSize: 12, lineHeight: 1.45, margin: "8px 0 0" }}>
        <strong>FloorDoc</strong> is one horizontal plate (objects = corridor / shafts / unit
        shells). <strong>Storey</strong> is a row in mammoth.json: same plate doc can repeat at
        many levels. <strong>InteriorDoc</strong> is lobby / unit stream geometry (placements).
      </p>

      <span style={label}>Mode</span>
      <div>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight: mode === "floor" ? 700 : 400,
            background: mode === "floor" ? "#3a4a7a" : "#2a2a34",
            border: "1px solid #444",
            color: "#fff",
          }}
          onClick={() => setMode("floor")}
        >
          Floors (building stack)
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
          onClick={() => setMode("interior")}
        >
          Interior
        </button>
      </div>

      {mode === "floor" ? (
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
        </>
      ) : (
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
      )}

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
        <button type="button" style={rowBtn} onClick={() => onSaveDisk()}>
          Save to disk
        </button>
        <button
          type="button"
          style={rowBtn}
          onClick={() => {
            if (mode === "floor" && activeFloorDoc) {
              downloadText(
                `${activeFloorDocId}.json`,
                serializeFloorDocPretty(activeFloorDoc),
              );
            } else if (mode === "interior" && activeInteriorDoc) {
              downloadText(
                `${activeInteriorDocId}.json`,
                serializeInteriorDocPretty(activeInteriorDoc),
              );
            }
          }}
        >
          Download JSON
        </button>
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
        activeFloorDoc={activeFloorDoc}
        activeInteriorDoc={activeInteriorDoc}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        label={label}
      />

      <span style={label}>Prefab palette</span>
      <select
        style={{ ...input, marginBottom: 6 }}
        id="editor-prefab-palette"
        defaultValue=""
        onChange={() => {}}
      >
        <option value="">— pick prefab —</option>
        {(mode === "floor" ? floorPrefabIds : interiorPrefabIds).map((id) => (
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
              (mode === "floor" ? floorPrefabIds[0] : interiorPrefabIds[0]) ||
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
            else duplicateInteriorPlacement(activeInteriorDocId, selectedId);
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
            else deleteInteriorPlacement(activeInteriorDocId, selectedId);
          }}
        >
          Delete
        </button>
      </div>

      <EditorChromeInspector
        selectedId={selectedId}
        selectedFloorObj={selectedFloorObj}
        selectedInteriorPl={selectedInteriorPl}
        activeFloorDocId={activeFloorDocId}
        activeInteriorDocId={activeInteriorDocId}
        metaText={metaText}
        setMetaText={setMetaText}
        metaErr={metaErr}
        setMetaErr={setMetaErr}
        euler={euler}
        updateEuler={updateEuler}
        updatePlacedObject={updatePlacedObject}
        updateInteriorPlacement={updateInteriorPlacement}
        label={label}
        input={input}
      />
    </div>
  );
}
