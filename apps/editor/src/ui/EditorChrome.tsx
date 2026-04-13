import * as THREE from "three";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type { PlacedObject } from "@the-mammoth/schemas";
import { reloadEditorFromContent } from "../editor/editorBootstrap.js";
import { spawnInFrontOfCamera } from "../editor/spawnBridge.js";
import {
  collectPrefabIdsFromFloors,
  collectPrefabIdsFromInteriors,
  serializeBuildingDocPretty,
  serializeFloorDocPretty,
  serializeInteriorDocPretty,
  useEditorStore,
} from "../state/editorStore.js";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function postSaveFloor(floorDocId: string, json: string): Promise<string> {
  const res = await fetch("/__editor/save-floor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floorDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return t;
}

async function postSaveInterior(interiorDocId: string, json: string): Promise<string> {
  const res = await fetch("/__editor/save-interior", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interiorDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return t;
}

async function postSaveBuilding(json: string): Promise<string> {
  const res = await fetch("/__editor/save-building", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return t;
}

function quatToEulerDeg(rot: PlacedObject["rotation"]): [number, number, number] {
  const q = rot
    ? new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3])
    : new THREE.Quaternion();
  const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ];
}

function eulerDegToQuat(rx: number, ry: number, rz: number): PlacedObject["rotation"] {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(rx),
    THREE.MathUtils.degToRad(ry),
    THREE.MathUtils.degToRad(rz),
    "YXZ",
  );
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

const panel: React.CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: 300,
  background: "rgba(12,12,18,0.94)",
  color: "#ddd",
  padding: 12,
  fontSize: 13,
  boxSizing: "border-box",
  overflowY: "auto",
  zIndex: 2,
  fontFamily: "system-ui, sans-serif",
};

const label: CSSProperties = {
  display: "block",
  marginTop: 10,
  marginBottom: 4,
  opacity: 0.9,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#1e1e28",
  border: "1px solid #333",
  color: "#eee",
  padding: "4px 6px",
  borderRadius: 4,
};

const rowBtn: CSSProperties = {
  marginRight: 6,
  marginTop: 6,
  padding: "4px 8px",
  cursor: "pointer",
};

export function EditorChrome() {
  const mode = useEditorStore((s) => s.mode);
  const building = useEditorStore((s) => s.building);
  const floorDocs = useEditorStore((s) => s.floorDocs);
  const interiorDocs = useEditorStore((s) => s.interiorDocs);
  const activeFloorDocId = useEditorStore((s) => s.activeFloorDocId);
  const activeInteriorDocId = useEditorStore((s) => s.activeInteriorDocId);
  const focusedStoryLevelIndex = useEditorStore((s) => s.focusedStoryLevelIndex);
  const selectedId = useEditorStore((s) => s.selectedId);
  const dirty = useEditorStore((s) => s.dirty);
  const transformMode = useEditorStore((s) => s.transformMode);
  const gridSnapM = useEditorStore((s) => s.gridSnapM);
  const shadowsEnabled = useEditorStore((s) => s.shadowsEnabled);
  const useHdriEnvironment = useEditorStore((s) => s.useHdriEnvironment);
  const historyPast = useEditorStore((s) => s.historyPast);
  const historyFuture = useEditorStore((s) => s.historyFuture);

  const setMode = useEditorStore((s) => s.setMode);
  const setActiveFloorDocId = useEditorStore((s) => s.setActiveFloorDocId);
  const setActiveInteriorDocId = useEditorStore((s) => s.setActiveInteriorDocId);
  const setFocusedStoryLevelIndex = useEditorStore((s) => s.setFocusedStoryLevelIndex);
  const setTransformMode = useEditorStore((s) => s.setTransformMode);
  const setGridSnapM = useEditorStore((s) => s.setGridSnapM);
  const setShadowsEnabled = useEditorStore((s) => s.setShadowsEnabled);
  const setUseHdriEnvironment = useEditorStore((s) => s.setUseHdriEnvironment);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const updatePlacedObject = useEditorStore((s) => s.updatePlacedObject);
  const updateInteriorPlacement = useEditorStore((s) => s.updateInteriorPlacement);
  const addFloorObject = useEditorStore((s) => s.addFloorObject);
  const deleteFloorObject = useEditorStore((s) => s.deleteFloorObject);
  const duplicateFloorObject = useEditorStore((s) => s.duplicateFloorObject);
  const addInteriorPlacement = useEditorStore((s) => s.addInteriorPlacement);
  const deleteInteriorPlacement = useEditorStore((s) => s.deleteInteriorPlacement);
  const duplicateInteriorPlacement = useEditorStore((s) => s.duplicateInteriorPlacement);
  const patchBuilding = useEditorStore((s) => s.patchBuilding);
  const setSelectedId = useEditorStore((s) => s.setSelectedId);

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

  return (
    <div style={panel}>
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

      <span style={label}>Outliner</span>
      <div
        style={{
          maxHeight: 160,
          overflowY: "auto",
          border: "1px solid #333",
          borderRadius: 4,
          background: "#16161c",
        }}
      >
        {mode === "floor" && activeFloorDoc
          ? activeFloorDoc.objects.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedId(o.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === o.id ? "rgba(60,90,140,0.35)" : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {o.id}{" "}
                <span style={{ opacity: 0.65 }}>({o.prefabId})</span>
              </button>
            ))
          : null}
        {mode === "interior" && activeInteriorDoc
          ? activeInteriorDoc.placements.map((p) => (
              <button
                key={p.entityId}
                type="button"
                onClick={() => setSelectedId(p.entityId)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === p.entityId ? "rgba(60,90,140,0.35)" : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p.entityId}{" "}
                <span style={{ opacity: 0.65 }}>
                  ({p.prefabId ?? p.assetId ?? "?"})
                </span>
              </button>
            ))
          : null}
      </div>

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

      <span style={label}>Inspector</span>
      {!selectedId ? (
        <p style={{ opacity: 0.7 }}>Click a volume in the 3D view or outliner.</p>
      ) : null}

      {selectedFloorObj ? (
        <>
          <label style={label}>prefabId</label>
          <input
            style={input}
            value={selectedFloorObj.prefabId}
            onChange={(e) =>
              updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                prefabId: e.target.value,
              })
            }
          />
          <label style={label}>position</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.1}
                value={selectedFloorObj.position[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [...selectedFloorObj.position] as [
                    number,
                    number,
                    number,
                  ];
                  p[i] = Number.isFinite(v) ? v : 0;
                  updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                    position: p,
                  });
                }}
              />
            ))}
          </div>
          <label style={label}>scale</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.05}
                value={selectedFloorObj.scale?.[i] ?? 1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [
                    selectedFloorObj.scale?.[0] ?? 1,
                    selectedFloorObj.scale?.[1] ?? 1,
                    selectedFloorObj.scale?.[2] ?? 1,
                  ] as [number, number, number];
                  p[i] = Number.isFinite(v) ? v : 1;
                  updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                    scale: p,
                  });
                }}
              />
            ))}
          </div>
          <label style={label}>rotation (Euler °, YXZ)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={1}
                value={euler[i].toFixed(2)}
                onChange={(e) =>
                  updateEuler(i, Number(e.target.value) || 0)
                }
              />
            ))}
          </div>
          <label style={label}>metadata (JSON) — use editorMaterial.mapUrl etc.</label>
          <textarea
            style={{ ...input, minHeight: 100, fontFamily: "monospace", fontSize: 11 }}
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            onBlur={() => {
              const t = metaText.trim();
              if (!t) {
                updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                  metadata: undefined,
                });
                setMetaErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(t) as Record<string, unknown>;
                updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                  metadata: parsed,
                });
                setMetaErr(null);
              } catch {
                setMetaErr("Invalid JSON");
              }
            }}
          />
          {metaErr ? <p style={{ color: "#f66", fontSize: 12 }}>{metaErr}</p> : null}
        </>
      ) : null}

      {selectedInteriorPl ? (
        <>
          <label style={label}>prefabId</label>
          <input
            style={input}
            value={selectedInteriorPl.prefabId ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              updateInteriorPlacement(
                activeInteriorDocId,
                selectedInteriorPl.entityId,
                {
                  prefabId: v.length > 0 ? v : selectedInteriorPl.prefabId,
                },
              );
            }}
          />
          <label style={label}>position</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.1}
                value={selectedInteriorPl.position[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [...selectedInteriorPl.position] as [
                    number,
                    number,
                    number,
                  ];
                  p[i] = Number.isFinite(v) ? v : 0;
                  updateInteriorPlacement(
                    activeInteriorDocId,
                    selectedInteriorPl.entityId,
                    { position: p },
                  );
                }}
              />
            ))}
          </div>
          <label style={label}>scale</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.05}
                value={selectedInteriorPl.scale?.[i] ?? 1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [
                    selectedInteriorPl.scale?.[0] ?? 1,
                    selectedInteriorPl.scale?.[1] ?? 1,
                    selectedInteriorPl.scale?.[2] ?? 1,
                  ] as [number, number, number];
                  p[i] = Number.isFinite(v) ? v : 1;
                  updateInteriorPlacement(
                    activeInteriorDocId,
                    selectedInteriorPl.entityId,
                    { scale: p },
                  );
                }}
              />
            ))}
          </div>
          <label style={label}>rotation (Euler °, YXZ)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={1}
                value={euler[i].toFixed(2)}
                onChange={(e) =>
                  updateEuler(i, Number(e.target.value) || 0)
                }
              />
            ))}
          </div>
          <label style={label}>overrides (JSON)</label>
          <textarea
            style={{ ...input, minHeight: 80, fontFamily: "monospace", fontSize: 11 }}
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            onBlur={() => {
              const t = metaText.trim();
              if (!t) {
                updateInteriorPlacement(
                  activeInteriorDocId,
                  selectedInteriorPl.entityId,
                  { overrides: undefined },
                );
                setMetaErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(t) as Record<string, unknown>;
                updateInteriorPlacement(
                  activeInteriorDocId,
                  selectedInteriorPl.entityId,
                  { overrides: parsed },
                );
                setMetaErr(null);
              } catch {
                setMetaErr("Invalid JSON");
              }
            }}
          />
          {metaErr ? <p style={{ color: "#f66", fontSize: 12 }}>{metaErr}</p> : null}
        </>
      ) : null}
    </div>
  );
}
