import type { CSSProperties } from "react";
import type { CellPlacement, PlacedObject } from "@the-mammoth/schemas";
import type { EditorState } from "../state/editorStore.js";

export function EditorChromeInspector(props: {
  selectedId: string | null;
  selectedFloorObj: PlacedObject | null;
  selectedInteriorPl: CellPlacement | null;
  activeFloorDocId: string;
  activeInteriorDocId: string;
  metaText: string;
  setMetaText: (t: string) => void;
  metaErr: string | null;
  setMetaErr: (e: string | null) => void;
  euler: [number, number, number];
  updateEuler: (ix: 0 | 1 | 2, v: number) => void;
  updatePlacedObject: EditorState["updatePlacedObject"];
  updateInteriorPlacement: EditorState["updateInteriorPlacement"];
  label: CSSProperties;
  input: CSSProperties;
}) {
  const {
    selectedId,
    selectedFloorObj,
    selectedInteriorPl,
    activeFloorDocId,
    activeInteriorDocId,
    metaText,
    setMetaText,
    metaErr,
    setMetaErr,
    euler,
    updateEuler,
    updatePlacedObject,
    updateInteriorPlacement,
    label,
    input,
  } = props;

  return (
    <>
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
                onChange={(e) => updateEuler(i, Number(e.target.value) || 0)}
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
                onChange={(e) => updateEuler(i, Number(e.target.value) || 0)}
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
    </>
  );
}
