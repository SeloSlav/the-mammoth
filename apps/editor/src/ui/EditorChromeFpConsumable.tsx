import { useEffect, useState } from "react";
import type { FpAuthorCameraKind, TransformMode } from "../state/editorStore.js";
import { useEditorFpConsumablePanelStore } from "./hooks/useEditorFpConsumablePanelStore.js";
import {
  FP_AUTHORABLE_CONSUMABLE_IDS,
  isFpAuthorConsumableId,
  saveConsumablePresentationFromEditor,
} from "../editor/fpAuthoring/consumablePresentationDiskSave.js";
import { editorChromeInput, editorChromeLabel, editorChromeRowBtn } from "./editorChromeStyles.js";

type ConsumableAssetSurvey = {
  authorableIds: string[];
  glbIds: string[];
  presentationStems: string[];
  authorableWithoutGlb: string[];
};

type Props = {
  transformMode: TransformMode;
  setTransformMode: (m: TransformMode) => void;
  gridSnapM: number;
  setGridSnapM: (m: number) => void;
};

export function EditorChromeFpConsumable({
  transformMode,
  setTransformMode,
  gridSnapM,
  setGridSnapM,
}: Props) {
  const [survey, setSurvey] = useState<ConsumableAssetSurvey | null>(null);

  useEffect(() => {
    void fetch("/__editor/consumable-asset-survey", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as ConsumableAssetSurvey) : null))
      .then(setSurvey)
      .catch(() => setSurvey(null));
  }, []);

  const {
    fpAuthorCamera,
    fpAuthorTargetId,
    fpAuthorPitchRad,
    fpAuthorInitMessage,
    fpAuthorPickList,
    fpAuthorConsumableId,
    setFpAuthorConsumableId,
    setFpAuthorCamera,
    pickFpAuthorTarget,
    setFpAuthorPitchRad,
    fpAuthorToast,
    showFpAuthorToast,
  } = useEditorFpConsumablePanelStore();

  const gizmoTargetValue =
    fpAuthorPickList.length === 0
      ? ""
      : fpAuthorPickList.some((p) => p.id === fpAuthorTargetId)
        ? fpAuthorTargetId
        : (fpAuthorPickList[0]?.id ?? "");

  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;

  const saveLayout = () => {
    void (async () => {
      try {
        await saveConsumablePresentationFromEditor(fpAuthorConsumableId);
        showFpAuthorToast(
          "Saved. The game client will pick up the same layout automatically.",
        );
      } catch (e) {
        showFpAuthorToast(e instanceof Error ? e.message : String(e), 7000);
      }
    })();
  };

  return (
    <>
      <p style={{ opacity: 0.9, fontSize: 12, lineHeight: 1.45, margin: "0 0 10px" }}>
        Position the consumable mesh in the FP view. Use{" "}
        <strong>Orbit</strong> for a studio view and <strong>Gameplay</strong> to see it through
        the real FP lens. <strong>Save layout</strong> writes{" "}
        <code>{fpAuthorConsumableId}.presentation.json</code> to{" "}
        <code>content/consumables/</code>.
      </p>

      {fpAuthorInitMessage ? (
        <p style={{ color: "#f88", fontSize: 12, margin: "0 0 8px" }}>{fpAuthorInitMessage}</p>
      ) : null}

      {survey && survey.authorableWithoutGlb.length > 0 ? (
        <p
          style={{
            color: "#e8c07a",
            fontSize: 11,
            lineHeight: 1.4,
            margin: "0 0 10px",
            padding: "8px 10px",
            background: "#2a2618",
            border: "1px solid #5a4a2a",
            borderRadius: 4,
          }}
        >
          <strong>Missing GLBs</strong>
          <br />
          Authorable consumables without a GLB under{" "}
          <code>apps/client/public/static/models/consumables/</code>:{" "}
          <code>{survey.authorableWithoutGlb.join(", ")}</code> — drop{" "}
          <code>{"<id>.glb"}</code> there first.
        </p>
      ) : null}

      <span style={label}>Consumable</span>
      <p style={{ fontSize: 10, opacity: 0.75, margin: "0 0 4px" }}>
        Dropdown follows <code>FP_AUTHORABLE_CONSUMABLE_IDS</code>. Drop the GLB as{" "}
        <code>apps/client/public/static/models/consumables/{"<id>.glb"}</code> before authoring.
      </p>
      <select
        style={{ ...input, marginBottom: 10 }}
        value={fpAuthorConsumableId}
        onChange={(e) => {
          const v = e.target.value;
          if (isFpAuthorConsumableId(v)) setFpAuthorConsumableId(v);
        }}
      >
        {FP_AUTHORABLE_CONSUMABLE_IDS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      <span style={label}>Camera</span>
      <p style={{ fontSize: 11, opacity: 0.8, margin: "0 0 6px" }}>
        <strong>Orbit</strong>: drag empty space with <strong>LMB</strong> to orbit; drag the gizmo
        handles with <strong>LMB</strong> to edit. <strong>MMB</strong> dollys, <strong>RMB</strong>{" "}
        pans.{" "}
        <strong>Gameplay</strong>: through the real FP lens (no orbit).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {(
          [
            ["orbit", "Orbit"],
            ["gameplay", "Gameplay"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            style={{
              ...rowBtn,
              flex: 1,
              minWidth: 0,
              fontWeight: fpAuthorCamera === id ? 700 : 400,
              background: fpAuthorCamera === id ? "#3a4a7a" : "#2a2a34",
              border: "1px solid #444",
              color: "#fff",
            }}
            onClick={() => setFpAuthorCamera(id as FpAuthorCameraKind)}
          >
            {text}
          </button>
        ))}
      </div>

      <span style={label}>Look pitch (rad)</span>
      <input
        style={{ ...input, marginBottom: 4 }}
        type="number"
        step={0.02}
        value={fpAuthorPitchRad}
        onChange={(e) => setFpAuthorPitchRad(Number(e.target.value) || 0)}
      />
      <p style={{ fontSize: 10, opacity: 0.75, margin: "0 0 8px" }}>
        Default <strong>0</strong> = level gaze, same as gameplay initial pitch.
      </p>

      <span style={label}>Part</span>
      <select
        style={{ ...input, marginBottom: 8 }}
        value={gizmoTargetValue}
        onChange={(e) => pickFpAuthorTarget(e.target.value)}
      >
        {fpAuthorPickList.length === 0 ? (
          <option value="">Loading…</option>
        ) : (
          fpAuthorPickList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))
        )}
      </select>

      <span style={label}>Gizmo</span>
      <div style={{ marginBottom: 8 }}>
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

      <span style={label}>Grid snap (m)</span>
      <input
        style={{ ...input, marginBottom: 12 }}
        type="number"
        step={0.5}
        min={0}
        value={gridSnapM || ""}
        placeholder="0 = off"
        onChange={(e) => setGridSnapM(Number(e.target.value) || 0)}
      />

      <button
        type="button"
        style={{
          ...rowBtn,
          width: "100%",
          padding: "10px 12px",
          fontSize: 14,
          fontWeight: 600,
          background: "#2d4a5a",
          border: "1px solid #4a7a9a",
        }}
        onClick={saveLayout}
      >
        Save layout
      </button>
      {fpAuthorToast ? (
        <p
          style={{
            fontSize: 12,
            margin: "8px 0 0",
            color:
              fpAuthorToast.startsWith("Saved") ? "#a8d8a8" : "#f8a8a8",
          }}
        >
          {fpAuthorToast}
        </p>
      ) : null}
    </>
  );
}
