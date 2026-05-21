import type { StairWellAuthoringScope } from "@the-mammoth/world";
import type { EditorContentIndex } from "../editor/content/editorContentDiscovery.js";
import type {
  EditorMode,
  EditorWorkspace,
} from "../state/editorStoreTypes.js";
import { editorChromeLabel, editorChromeRowBtn } from "./editorChromeStyles.js";

export function EditorChromeAuthoringIntroAndWorkspace(props: {
  contentIndex: EditorContentIndex;
  workspace: EditorWorkspace;
  setWorkspace: (w: EditorWorkspace) => void;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  stairWellAuthorScope: StairWellAuthoringScope;
  setStairWellAuthorScope: (s: StairWellAuthoringScope) => void;
}) {
  const {
    contentIndex,
    workspace,
    setWorkspace,
    mode,
    setMode,
    stairWellAuthorScope,
    setStairWellAuthorScope,
  } = props;
  const label = editorChromeLabel;
  const rowBtn = editorChromeRowBtn;

  return (
    <>
      <strong style={{ fontSize: 15 }}>Authoring</strong>
      <p
        style={{
          opacity: 0.8,
          fontSize: 12,
          lineHeight: 1.45,
          margin: "8px 0 0",
        }}
      >
        <strong>Cab</strong>, <strong>Corridor Door</strong>, and{" "}
        <strong>Stairwell</strong> edit shared vertical-core visuals (
        <code>{contentIndex.elevatorCabRelPath ?? "elevator/cab.json"}</code>,{" "}
        <code>
          {contentIndex.landingKitRelPath ?? "elevator/landing_kit.json"}
        </code>
        ,{" "}
        <code>
          {contentIndex.stairWellRelPath ?? "elevator/stairwell.json"}
        </code>
        ). <strong>FP viewmodel</strong> authors weapons and held consumables.
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
          }}
        >
          Corridor Door
        </button>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight:
              mode === "fp_viewmodel" || mode === "fp_consumable" ? 700 : 400,
            background:
              mode === "fp_viewmodel" || mode === "fp_consumable"
                ? "#3a4a7a"
                : "#2a2a34",
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
                  background:
                    stairWellAuthorScope === scope ? "#3a4a7a" : "#2a2a34",
                  border: "1px solid #444",
                  color: "#fff",
                }}
                onClick={() => setStairWellAuthorScope(scope)}
              >
                {scope === "typical" ? "Typical Storey" : "Ground Storey"}
              </button>
            ))}
          </div>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 11,
              opacity: 0.75,
              lineHeight: 1.4,
            }}
          >
            Transform deltas are authored separately for typical and ground
            stairwells. Materials stay shared across the full shaft.
          </p>
        </>
      ) : null}
    </>
  );
}
