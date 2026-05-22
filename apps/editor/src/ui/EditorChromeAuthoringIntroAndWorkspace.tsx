import { useMemo, useState, type CSSProperties } from "react";
import type {
  ApartmentUnitLayoutProfilesDoc,
  BuildingDoc,
  FloorDoc,
} from "@the-mammoth/schemas";
import type { StairWellAuthoringScope } from "@the-mammoth/world";
import {
  HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID,
  listOwnedApartmentAuthoringPreviewUnits,
} from "@the-mammoth/world";
import type { EditorContentIndex } from "../editor/content/editorContentDiscovery.js";
import type {
  EditorMode,
  EditorWorkspace,
  ApartmentLayoutSource,
} from "../state/editorStoreTypes.js";
import { editorChromeInput, editorChromeLabel, editorChromeRowBtn } from "./editorChromeStyles.js";

const sectionCard: CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const sectionTitle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  opacity: 0.92,
  marginBottom: 8,
};

const subtleHelp: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 11,
  opacity: 0.72,
  lineHeight: 1.45,
};

export function EditorChromeAuthoringIntroAndWorkspace(props: {
  contentIndex: EditorContentIndex;
  workspace: EditorWorkspace;
  setWorkspace: (w: EditorWorkspace) => void;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  stairWellAuthorScope: StairWellAuthoringScope;
  setStairWellAuthorScope: (s: StairWellAuthoringScope) => void;
  building: BuildingDoc;
  floorDocs: Record<string, FloorDoc>;
  apartmentUnitLayoutProfiles: ApartmentUnitLayoutProfilesDoc;
  activeApartmentLayoutSource: ApartmentLayoutSource;
  activeApartmentLayoutProfileId: string | null;
  myApartmentPreviewUnitKey: string;
  setMyApartmentPreviewUnit: (input: { unitKey: string; unitId: string }) => void;
  setActiveApartmentLayoutSource: (source: ApartmentLayoutSource) => void;
  setActiveApartmentLayoutProfileId: (profileId: string | null) => void;
  createApartmentLayoutProfileFromCurrent: (name: string) => string | null;
  assignActiveApartmentLayoutProfileToPreviewUnit: () => void;
  historyPastLength: number;
  historyFutureLength: number;
  undo: () => void;
  redo: () => void;
}) {
  const {
    contentIndex,
    workspace,
    setWorkspace,
    mode,
    setMode,
    stairWellAuthorScope,
    setStairWellAuthorScope,
    building,
    floorDocs,
    apartmentUnitLayoutProfiles,
    activeApartmentLayoutSource,
    activeApartmentLayoutProfileId,
    myApartmentPreviewUnitKey,
    setMyApartmentPreviewUnit,
    setActiveApartmentLayoutSource,
    setActiveApartmentLayoutProfileId,
    createApartmentLayoutProfileFromCurrent,
    assignActiveApartmentLayoutProfileToPreviewUnit,
    historyPastLength,
    historyFutureLength,
    undo,
    redo,
  } = props;
  const [newProfileName, setNewProfileName] = useState("");
  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;

  const apartmentPreviewUnits = useMemo(
    () => {
      const refs = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
      return refs.flatMap((ref) => {
        const floor = floorDocs[ref.floorDocId];
        if (!floor) return [];
        return listOwnedApartmentAuthoringPreviewUnits(floor).map((unit) => {
          const residentialFloor = Math.max(1, ref.levelIndex - 1);
          return {
            unitKey: `${ref.floorDocId}|${ref.levelIndex}|${unit.unitId}`,
            unitId: unit.unitId,
            label: `Floor ${residentialFloor}, ${unit.label}`,
            isPlayerSpawnHome:
              ref.levelIndex === Math.max(...refs.map((r) => r.levelIndex)) &&
              unit.unitId === HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID,
          };
        });
      });
    },
    [building.floorRefs, floorDocs],
  );
  const previewUnit =
    apartmentPreviewUnits.find((unit) => unit.unitKey === myApartmentPreviewUnitKey) ?? null;
  const assignedProfile =
    apartmentUnitLayoutProfiles.assignments.find((a) => a.unitKey === myApartmentPreviewUnitKey)
      ?.profileId ?? null;
  const assignedProfileName =
    assignedProfile != null
      ? apartmentUnitLayoutProfiles.profiles.find((p) => p.id === assignedProfile)?.name
      : null;
  const layoutSourceValue =
    activeApartmentLayoutSource === "profile"
      ? `profile:${activeApartmentLayoutProfileId ?? ""}`
      : activeApartmentLayoutSource;
  const activeProfileName =
    activeApartmentLayoutSource === "profile" && activeApartmentLayoutProfileId
      ? apartmentUnitLayoutProfiles.profiles.find((p) => p.id === activeApartmentLayoutProfileId)
          ?.name
      : null;

  return (
    <>
      <strong style={{ fontSize: 15 }}>Authoring</strong>

      {workspace === "apartment" ? (
        <div style={sectionCard}>
          <span style={sectionTitle}>Apartment unit</span>
          <span style={{ ...label, marginTop: 0 }}>Preview apartment</span>
          <select
            style={input}
            value={myApartmentPreviewUnitKey}
            onChange={(e) => {
              const opt = apartmentPreviewUnits.find((unit) => unit.unitKey === e.target.value);
              if (opt) setMyApartmentPreviewUnit({ unitKey: opt.unitKey, unitId: opt.unitId });
            }}
          >
            {apartmentPreviewUnits.map((unit) => (
              <option key={unit.unitKey} value={unit.unitKey}>
                {unit.label}
                {unit.isPlayerSpawnHome ? " — player spawn home" : ""}
              </option>
            ))}
          </select>
          <p style={subtleHelp}>
            {previewUnit?.isPlayerSpawnHome
              ? "Player spawn home uses the protected owned default unless a profile is assigned."
              : assignedProfileName
                ? `Saved layout on disk: "${assignedProfileName}".`
                : "No profile assigned yet — start from an empty draft or clone another layout."}
          </p>

          <span style={{ ...sectionTitle, marginTop: 14 }}>Layout profile</span>
          <span style={{ ...label, marginTop: 0 }}>Editing source</span>
          <select
            style={input}
            value={layoutSourceValue}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "owned_default" || value === "unassigned") {
                setActiveApartmentLayoutSource(value);
                return;
              }
              if (value.startsWith("profile:")) {
                setActiveApartmentLayoutProfileId(value.slice("profile:".length));
              }
            }}
          >
            <option value="owned_default">Player owned default</option>
            <option value="unassigned">Unassigned empty draft</option>
            {apartmentUnitLayoutProfiles.profiles.map((profile) => (
              <option key={profile.id} value={`profile:${profile.id}`}>
                {profile.name}
              </option>
            ))}
          </select>
          {activeProfileName ? (
            <p style={subtleHelp}>
              Editing profile <strong>{activeProfileName}</strong>. Save profiles separately from
              the player default.
            </p>
          ) : activeApartmentLayoutSource === "owned_default" ? (
            <p style={subtleHelp}>
              Editing the protected player-owned fallback (
              <code style={{ fontSize: 10 }}>owned_apartment_builtins.json</code>).
            </p>
          ) : (
            <p style={subtleHelp}>
              Empty draft — create a profile to persist this apartment layout.
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <input
              style={{ ...input, flex: "1 1 100%", minWidth: 0 }}
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="New profile name"
            />
            <button
              type="button"
              style={{ ...rowBtn, flex: "1 1 140px" }}
              onClick={() => {
                const created = createApartmentLayoutProfileFromCurrent(newProfileName);
                if (created) setNewProfileName("");
              }}
            >
              Save as new profile
            </button>
            <button
              type="button"
              style={{ ...rowBtn, flex: "1 1 140px" }}
              disabled={activeApartmentLayoutSource !== "profile" || !activeApartmentLayoutProfileId}
              title={
                activeApartmentLayoutSource === "profile" && activeApartmentLayoutProfileId
                  ? "Assign the active profile to the preview apartment."
                  : "Select or create a profile first."
              }
              onClick={assignActiveApartmentLayoutProfileToPreviewUnit}
            >
              Assign to this unit
            </button>
          </div>

          <span style={{ ...sectionTitle, marginTop: 14 }}>Edits</span>
          <div>
            <button
              type="button"
              style={rowBtn}
              disabled={historyPastLength === 0}
              onClick={() => undo()}
              title="Undo decor placement, deletion, and other layout edits (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              style={rowBtn}
              disabled={historyFutureLength === 0}
              onClick={() => redo()}
              title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
            >
              Redo
            </button>
          </div>
          <p style={subtleHelp}>
            <strong>Ctrl+Z</strong> undo · <strong>Ctrl+Y</strong> redo · decor import, delete,
            clone, and gizmo moves are tracked while you edit.
          </p>
        </div>
      ) : null}

      <span style={label}>Workspace</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          style={{
            ...rowBtn,
            fontWeight: workspace === "apartment" ? 700 : 400,
            background: workspace === "apartment" ? "#3a4a7a" : "#2a2a34",
            border: "1px solid #444",
            color: "#fff",
          }}
          onClick={() => setWorkspace("apartment")}
        >
          Apartment
        </button>
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

      {workspace !== "apartment" ? (
        <p
          style={{
            opacity: 0.8,
            fontSize: 12,
            lineHeight: 1.45,
            margin: "8px 0 0",
          }}
        >
          <strong>Apartment</strong> authors owned-unit furniture, décor, and partition walls.{" "}
          <strong>Cab</strong>, <strong>Corridor Door</strong>, and <strong>Stairwell</strong> edit
          shared vertical-core visuals (
          <code>{contentIndex.elevatorCabRelPath ?? "elevator/cab.json"}</code>,{" "}
          <code>{contentIndex.landingKitRelPath ?? "elevator/landing_kit.json"}</code>,{" "}
          <code>{contentIndex.stairWellRelPath ?? "elevator/stairwell.json"}</code>
          ). <strong>FP viewmodel</strong> authors weapons and held consumables.
        </p>
      ) : null}

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
          <p style={subtleHelp}>
            Transform deltas are authored separately for typical and ground stairwells. Materials stay
            shared across the full shaft.
          </p>
        </>
      ) : null}
    </>
  );
}
