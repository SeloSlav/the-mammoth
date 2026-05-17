import type { TransformMode } from "../state/editorStoreTypes.js";
import {
  editorChromeInput,
  editorChromeLabel,
  editorChromeRowBtn,
} from "./editorChromeStyles.js";

export type EditorChromeMyApartmentGizmoHint = "decor" | "builtins";

export function EditorChromeSceneGizmoBlock(props: {
  transformMode: TransformMode;
  setTransformMode: (m: TransformMode) => void;
  gridSnapM: number;
  setGridSnapM: (v: number) => void;
  /** When set, shows apartment-layout helper copy under the translate / rotate / scale buttons. */
  myApartmentLayoutHints?: EditorChromeMyApartmentGizmoHint | null;
}) {
  const {
    transformMode,
    setTransformMode,
    gridSnapM,
    setGridSnapM,
    myApartmentLayoutHints = null,
  } = props;
  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;

  return (
    <>
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
      {myApartmentLayoutHints === "decor" ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 11,
            opacity: 0.82,
            lineHeight: 1.38,
          }}
        >
          Imported decor: move on <strong>X / Y / Z</strong> (Y cannot go below the floor). Rotate uses{" "}
          <strong>world</strong> axes (X / Y / Z rings); optional angle snap matches{" "}
          <strong>Grid snap</strong> when set (&quot;deg-ish&quot;). Uniform scale from the gizmo center handle.
        </p>
      ) : myApartmentLayoutHints === "builtins" ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 11,
            opacity: 0.82,
            lineHeight: 1.38,
          }}
        >
          Built-ins move on the floor plane only; rotate around <strong>Y</strong> in <strong>45°</strong> steps;
          use <strong>Scale</strong> (center handle) for uniform size.
        </p>
      ) : null}
      {transformMode === "scale" ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 11,
            opacity: 0.78,
            lineHeight: 1.35,
          }}
        >
          Viewport: axis scale handles now stretch from the dragged side while keeping the opposite face fixed.
          Drag the <strong>center</strong> scale handle (white cube) for uniform scale from center.
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
  );
}
