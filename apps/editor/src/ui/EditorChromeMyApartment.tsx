import type { ReactNode } from "react";
import type { EditorMode, MyApartmentLayoutPiece } from "../state/editorStoreTypes.js";
import { useEditorStore } from "../state/editorStore.js";
import { workspaceToInitialMode } from "../state/editorWorkspaceMap.js";
import {
  editorChromeInput,
  editorChromeLabel,
  editorChromeRowBtn,
} from "./editorChromeStyles.js";

export function EditorChromeMyApartment(props: {
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  setCameraMode: (m: "orbit") => void;
  myApartmentLayoutPiece: MyApartmentLayoutPiece;
  setMyApartmentLayoutPiece: (p: MyApartmentLayoutPiece) => void;
  enterMyApartmentLayoutMode: () => void;
}) {
  const {
    mode,
    setMode,
    setCameraMode,
    myApartmentLayoutPiece,
    setMyApartmentLayoutPiece,
    enterMyApartmentLayoutMode,
  } = props;

  let body: ReactNode = null;
  if (mode === "my_apartment_layout") {
    body = (
      <>
        <span style={editorChromeLabel}>Prop gizmo</span>
        <select
          style={{ ...editorChromeInput, marginTop: 6 }}
          value={myApartmentLayoutPiece}
          onChange={(e) =>
            setMyApartmentLayoutPiece(e.target.value as MyApartmentLayoutPiece)
          }
        >
          <option value="bed">Bed</option>
          <option value="wardrobe">Wardrobe</option>
          <option value="footlocker">Footlocker</option>
        </select>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={() => {
              const st = useEditorStore.getState();
              setMode(workspaceToInitialMode(st.workspace, st.landingDocKind));
              setCameraMode("orbit");
            }}
          >
            Back to level editor
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <button
        type="button"
        style={{
          ...editorChromeRowBtn,
          background: "#2d4861",
          marginTop: 4,
        }}
        onClick={() => {
          setCameraMode("orbit");
          enterMyApartmentLayoutMode();
        }}
      >
        My apartment furniture
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <span style={{ ...editorChromeLabel, display: "block", marginBottom: 4 }}>
        Owned apartment preview
      </span>
      {body}
      <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.72, maxWidth: 440 }}>
        The grey slab matches the unit prefab footprint in the floor doc; walls reuse the playable
        shell hole layout. Placement data lives in{" "}
        <code style={{ fontSize: 10 }}>content/apartment/owned_apartment_builtins.json</code>
        {" — "}save writes that file; at runtime fractions map into each unit{"'"}s strict hull (`bound_*`)
        spans.
      </p>
    </div>
  );
}
