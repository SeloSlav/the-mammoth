import { useMemo, useState } from "react";
import type {
  CellDoc,
  FloorDoc,
  FloorOverrideDoc,
  InteriorDoc,
  PrefabDef,
  StairWellDef,
} from "@the-mammoth/schemas";
import {
  LANDING_DOOR_OPENING_PROXY_ID,
  resolveStairWellCeilingPropsForScope,
  stairWellCeilingPropEditorId,
  STAIR_WELL_EDITOR_PART_IDS,
} from "@the-mammoth/world";
import type { EditorMode, LandingKitVariant } from "../state/editorStore.js";
import { faListUl } from "@fortawesome/free-solid-svg-icons";
import { EditorChromeSectionTitleIcon } from "./EditorChromeSectionTitleIcon.js";

/** Subparts tagged with `userData.editorCabPartId` in the cab preview (see `elevatorCabPreview.ts`). */
const ELEVATOR_CAB_OUTLINER_PART_IDS = [
  "cab_floor",
  "cab_floor_panel",
  "cab_floor_button",
  "cab_ceiling",
  "cab_wall_back",
  "cab_wall_front_surround",
  "cab_wall_side_n",
  "cab_wall_side_s",
  "cab_wall_side_e",
  "cab_wall_side_w",
] as const;

export function EditorChromeOutliner(props: {
  mode: EditorMode;
  stairWellAuthorScope: "typical" | "ground";
  stairWellDef: StairWellDef;
  landingKitVariant: LandingKitVariant;
  setLandingKitVariant: (variant: LandingKitVariant) => void;
  activeFloorDoc: FloorDoc | undefined;
  activeInteriorDoc: InteriorDoc | undefined;
  activeCellDoc: CellDoc | undefined;
  activePrefabDef: PrefabDef | undefined;
  activeFloorOverrideDoc: FloorOverrideDoc | undefined;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const {
    mode,
    stairWellAuthorScope,
    stairWellDef,
    landingKitVariant,
    setLandingKitVariant,
    activeFloorDoc,
    activeInteriorDoc,
    activeCellDoc,
    activePrefabDef,
    activeFloorOverrideDoc,
    selectedId,
    setSelectedId,
  } = props;

  const [floorFilter, setFloorFilter] = useState<"all" | "elevator" | "stair" | "core">("all");
  const floorObjects = useMemo(() => {
    if (!activeFloorDoc) return [];
    return activeFloorDoc.objects.filter((o) => {
      if (floorFilter === "all") return true;
      const prefabId = o.prefabId.toLowerCase();
      if (floorFilter === "elevator") return prefabId.includes("elevator");
      if (floorFilter === "stair") return prefabId.includes("stair");
      return (
        prefabId.includes("elevator") ||
        prefabId.includes("stair") ||
        prefabId.includes("core")
      );
    });
  }, [activeFloorDoc, floorFilter]);

  const stairwellCeilingOutlinerProps = useMemo(() => {
    if (mode !== "stairwell_preview") return [];
    return resolveStairWellCeilingPropsForScope(stairWellDef, stairWellAuthorScope).filter(
      (prop) => {
        const scopes = prop.applyToScopes;
        if (!scopes || scopes.length === 0) return true;
        return scopes.includes(stairWellAuthorScope);
      },
    );
  }, [mode, stairWellAuthorScope, stairWellDef]);

  return (
    <>
      <EditorChromeSectionTitleIcon icon={faListUl}>Outliner</EditorChromeSectionTitleIcon>
      {mode === "cab" ? (
        <p style={{ margin: "0 0 8px", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
          Cab subparts (shared ElevatorCabDef). Door face follows the first shaft in the building.
        </p>
      ) : null}
      {mode === "landing_preview" ? (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {(["elevator", "apartment"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setLandingKitVariant(v)}
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: landingKitVariant === v ? "#5a3d2d" : "#2a2a34",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  textTransform: "capitalize",
                }}
                title={
                  v === "elevator"
                    ? "Edit content/elevator/landing_kit.json (glass corridor door)"
                    : "Edit content/door/apartment_unit_kit.json (solid apartment door)"
                }
              >
                {v === "elevator" ? "Elevator landing" : "Apartment unit"}
              </button>
            ))}
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
            {landingKitVariant === "apartment"
              ? "Apartment unit door kit (solid leaf). Select the whole door and use scale mode to stretch width (Z) and height (Y) as one block."
              : "Exterior corridor door kit. Use the blue wireframe opening gizmo (or click the glass): move sets the hole height; non-uniform scale makes the opening taller/wider."}
          </p>
        </>
      ) : null}
      {mode === "stairwell_preview" ? (
        <p style={{ margin: "0 0 8px", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
          Shared stairwell parts for the {stairWellAuthorScope} storey. Transform deltas are applied
          relative to the generated procedural mesh, so one authored tweak propagates across matching
          parts in every stairwell of that scope.
        </p>
      ) : null}
      {mode === "floor" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {(["all", "elevator", "stair", "core"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFloorFilter(key)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #444",
                background: floorFilter === key ? "#5a3d2d" : "#2a2a34",
                color: "#fff",
                cursor: "pointer",
                fontSize: 11,
                textTransform: "capitalize",
              }}
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}
      <div
        style={{
          maxHeight: 160,
          overflowY: "auto",
          border: "1px solid #333",
          borderRadius: 4,
          background: "#16161c",
        }}
      >
        {mode === "cab"
          ? ELEVATOR_CAB_OUTLINER_PART_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedId(id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === id ? "rgba(60,90,140,0.35)" : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {id}
              </button>
            ))
          : null}
        {mode === "landing_preview" ? (
          <>
            {landingKitVariant === "elevator" ? (
              <button
                type="button"
                onClick={() => setSelectedId(LANDING_DOOR_OPENING_PROXY_ID)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === LANDING_DOOR_OPENING_PROXY_ID
                      ? "rgba(60,90,140,0.35)"
                      : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {LANDING_DOOR_OPENING_PROXY_ID}{" "}
                <span style={{ opacity: 0.65 }}>(framed opening — gizmo)</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedId("landing_door_kit")}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                border: "none",
                borderBottom: "1px solid #282830",
                background:
                  selectedId === "landing_door_kit"
                    ? "rgba(60,90,140,0.35)"
                    : "transparent",
                color: "#ddd",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              landing_door_kit{" "}
              <span style={{ opacity: 0.65 }}>
                {landingKitVariant === "apartment"
                  ? "(whole-door gizmo)"
                  : "(overview, no gizmo)"}
              </span>
            </button>
          </>
        ) : null}
        {mode === "stairwell_preview"
          ? [
              ...Array.from(
                STAIR_WELL_EDITOR_PART_IDS.filter(
                  (id) =>
                    stairWellAuthorScope === "typical"
                      ? id !== "shaft_floor"
                      : id !== "stair_landing_lower",
                ),
              ),
            ].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedId(id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === id ? "rgba(60,90,140,0.35)" : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {id}
              </button>
            ))
          : null}
        {mode === "stairwell_preview"
          ? stairwellCeilingOutlinerProps.map((prop) => {
              const id = stairWellCeilingPropEditorId(prop.id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedId(id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    border: "none",
                    borderBottom: "1px solid #282830",
                    background:
                      selectedId === id ? "rgba(60,90,140,0.35)" : "transparent",
                    color: "#ddd",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {prop.id}{" "}
                  <span style={{ opacity: 0.65 }}>
                    (underside of each landing, centered)
                  </span>
                </button>
              );
            })
          : null}
        {mode === "floor" && activeFloorDoc
          ? floorObjects.map((o) => (
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
        {mode === "cell" && activeCellDoc
          ? activeCellDoc.placements.map((p) => (
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
        {mode === "prefab" && activePrefabDef
          ? activePrefabDef.components.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background: selectedId === p.id ? "rgba(60,90,140,0.35)" : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p.id}{" "}
                <span style={{ opacity: 0.65 }}>
                  ({p.prefabId ?? p.assetId ?? "?"})
                </span>
              </button>
            ))
          : null}
        {mode === "floor_override" && activeFloorOverrideDoc
          ? activeFloorOverrideDoc.objectPatches.map((p) => (
              <button
                key={p.targetObjectId}
                type="button"
                onClick={() => setSelectedId(p.targetObjectId)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === p.targetObjectId
                      ? "rgba(60,90,140,0.35)"
                      : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p.targetObjectId}
              </button>
            ))
          : null}
      </div>
    </>
  );
}
