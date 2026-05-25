import type { TransformMode } from "../state/editorStoreTypes.js";
import { flipEditorOrbitView } from "../editor/bridges/editorNavigationBridge.js";
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
  apartmentBakedFloorShadowsEnabled?: boolean;
  setApartmentBakedFloorShadowsEnabled?: (enabled: boolean) => void;
  apartmentPracticalLightsEnabled?: boolean;
  setApartmentPracticalLightsEnabled?: (enabled: boolean) => void;
  myApartmentLayoutHidePickMode?: boolean;
  setMyApartmentLayoutHidePickMode?: (enabled: boolean) => void;
  myApartmentLayoutHiddenCount?: number;
  clearMyApartmentLayoutHiddenPlacements?: () => void;
  /** When set, shows apartment-layout helper copy under the translate / rotate / scale buttons. */
  myApartmentLayoutHints?: EditorChromeMyApartmentGizmoHint | null;
  /** Per selected imported décor: skip support-surface raycasts while translating (fine placement). */
  decorIgnoreSupportSurfacesWhileTranslating?: {
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
  };
  /** Hide the leading “Scene / gizmo” line when an outer panel already titled this block. */
  omitSectionHeading?: boolean;
}) {
  const {
    transformMode,
    setTransformMode,
    gridSnapM,
    setGridSnapM,
    decorNeighborAlignSnap = false,
    setDecorNeighborAlignSnap,
    apartmentBakedFloorShadowsEnabled = false,
    setApartmentBakedFloorShadowsEnabled,
    apartmentPracticalLightsEnabled = true,
    setApartmentPracticalLightsEnabled,
    myApartmentLayoutHidePickMode = false,
    setMyApartmentLayoutHidePickMode,
    myApartmentLayoutHiddenCount = 0,
    clearMyApartmentLayoutHiddenPlacements,
    myApartmentLayoutHints = null,
    decorIgnoreSupportSurfacesWhileTranslating,
    omitSectionHeading = false,
  } = props;
  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;

  return (
    <>
      {omitSectionHeading ? null : <span style={label}>Scene / gizmo</span>}
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
      {myApartmentLayoutHints != null && setApartmentBakedFloorShadowsEnabled ? (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 8,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={apartmentBakedFloorShadowsEnabled}
            onChange={(e) => setApartmentBakedFloorShadowsEnabled(e.target.checked)}
          />
          <span style={{ lineHeight: 1.35 }}>
            Show baked floor shadows
            <span style={{ display: "block", fontSize: 11, opacity: 0.72 }}>
              Off by default — rebuilding silhouettes is slow with many props.
            </span>
          </span>
        </label>
      ) : null}
      {myApartmentLayoutHints != null && setApartmentPracticalLightsEnabled ? (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 8,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={apartmentPracticalLightsEnabled}
            onChange={(e) => setApartmentPracticalLightsEnabled(e.target.checked)}
          />
          <span style={{ lineHeight: 1.35 }}>
            Show practical lights
            <span style={{ display: "block", fontSize: 11, opacity: 0.72 }}>
              Uncheck to disable lamps, screens, and window pools while authoring.
            </span>
          </span>
        </label>
      ) : null}
      {setMyApartmentLayoutHidePickMode ? (
        <>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              marginTop: 8,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={myApartmentLayoutHidePickMode}
              onChange={(e) => setMyApartmentLayoutHidePickMode(e.target.checked)}
            />
            <span style={{ lineHeight: 1.35 }}>
              Click to hide (viewport only)
              <span style={{ display: "block", fontSize: 11, opacity: 0.72 }}>
                Left-click décor, wall slabs, or mirrors to hide them while laying out. Does not
                delete or save — use Show all hidden to restore.
              </span>
            </span>
          </label>
          {myApartmentLayoutHiddenCount > 0 && clearMyApartmentLayoutHiddenPlacements ? (
            <button
              type="button"
              style={{ ...rowBtn, marginTop: 6 }}
              onClick={clearMyApartmentLayoutHiddenPlacements}
            >
              Show all hidden ({myApartmentLayoutHiddenCount})
            </button>
          ) : null}
        </>
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
      {decorIgnoreSupportSurfacesWhileTranslating ? (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 8,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={decorIgnoreSupportSurfacesWhileTranslating.checked}
            onChange={(e) =>
              decorIgnoreSupportSurfacesWhileTranslating.onCheckedChange(e.target.checked)
            }
          />
          <span style={{ lineHeight: 1.35 }}>
            Ignore support surfaces while translating
            <span style={{ display: "block", fontSize: 11, opacity: 0.72 }}>
              Use for fine placements like leaning a carton through / against an ashtray.
            </span>
          </span>
        </label>
      ) : null}
      <button
        type="button"
        style={{ ...rowBtn, marginTop: 8, width: "100%" }}
        onClick={() => flipEditorOrbitView()}
        title="Turn the viewport 180° in place (shortcut: H)"
      >
        Flip view 180°
      </button>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 11,
          opacity: 0.78,
          lineHeight: 1.35,
        }}
      >
        Viewport fly: <strong>W A S D</strong> move, <strong>Q / E</strong> orbit in place. Shortcut:{" "}
        <strong>H</strong> flips the view 180°.
      </p>
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
