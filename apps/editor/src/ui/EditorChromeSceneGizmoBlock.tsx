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
  decorNeighborAlignSnap?: boolean;
  setDecorNeighborAlignSnap?: (enabled: boolean) => void;
  /** When set, shows apartment-layout helper copy under the translate / rotate / scale buttons. */
  myApartmentLayoutHints?: EditorChromeMyApartmentGizmoHint | null;
}) {
  const {
    transformMode,
    setTransformMode,
    gridSnapM,
    setGridSnapM,
    decorNeighborAlignSnap = false,
    setDecorNeighborAlignSnap,
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
          Imported decor / wall slabs / mirrors: move on <strong>X / Y / Z</strong> (Y cannot go below the
          floor). Turn on <strong>Align to décor</strong> when gridding pots or props; leave it off for free
          placement. With align on, set <strong>Grid snap</strong> to your spacing gap, or leave grid snap off
          to match gaps already in the layout. Rotate: décor uses <strong>X / Y / Z</strong> rings; slabs use{" "}
          <strong>Y</strong> (yaw) and <strong>X</strong> (pitch). Optional angle snap matches{" "}
          <strong>Grid snap</strong> when set. Side scale handles stretch on one axis (green = taller);
          center handle = uniform scale.
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
      {myApartmentLayoutHints === "decor" && setDecorNeighborAlignSnap ? (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={decorNeighborAlignSnap}
            onChange={(e) => setDecorNeighborAlignSnap(e.target.checked)}
          />
          Align to décor (edge / row snap while translating)
        </label>
      ) : null}
      <span style={{ ...label, display: "block", marginTop: 8 }}>Grid snap (m / deg-ish for rotate)</span>
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
