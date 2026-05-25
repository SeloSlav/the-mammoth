import { useMemo, useState } from "react";
import {
  faBuilding,
  faDiagramProject,
  faFloppyDisk,
  faRotateLeft,
  faSitemap,
} from "@fortawesome/free-solid-svg-icons";
import {
  apartmentUnitLayoutProfileForUnitKey,
  type ApartmentUnitLayoutProfilesDoc,
  type BuildingDoc,
  type FloorDoc,
} from "@the-mammoth/schemas";
import type { StairWellAuthoringScope } from "@the-mammoth/world";
import {
  formatOwnedApartmentPreviewUnitKeyHeading,
  listAuthoringCorridorPreviewFloors,
  listOwnedApartmentAuthoringPreviewUnits,
  ownedDefaultApartmentUnitKey,
} from "@the-mammoth/world";
import type {
  CollisionArtifactsStatus,
  EditorContentIndex,
} from "../editor/content/editorContentDiscovery.js";
import type {
  EditorMode,
  EditorWorkspace,
  ApartmentLayoutSource,
} from "../state/editorStoreTypes.js";
import {
  editorChromeDiskSaveBtn,
  editorChromeHelp,
  editorChromeInput,
  editorChromeLabel,
  editorChromePanelTitle,
  editorChromeRowBtn,
  editorChromeSection,
} from "./editorChromeStyles.js";
import {
  EditorChromeGroupTitleIcon,
  EditorChromeSectionTitleIcon,
} from "./EditorChromeSectionTitleIcon.js";
import { EDITOR_CHROME_SECTION } from "./editorChromeSectionAnchors.js";

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
  myApartmentCorridorPreviewKey: string;
  setMyApartmentPreviewUnit: (input: { unitKey: string; unitId: string }) => void;
  setMyApartmentCorridorPreviewFloor: (input: {
    levelIndex: number;
    floorDocId: string;
    corridorKey: string;
  }) => void;
  setActiveApartmentLayoutSource: (source: ApartmentLayoutSource) => void;
  setActiveApartmentLayoutProfileId: (profileId: string | null) => void;
  createApartmentLayoutProfileFromCurrent: (name: string) => string | null;
  assignActiveApartmentLayoutProfileToPreviewUnit: () => void;
  saveToDiskLabel: string;
  canSaveContentToDisk: boolean;
  onSaveDisk: () => Promise<void>;
  saveMsg: string | null;
  dirty: boolean;
  collisionArtifactsStatus: CollisionArtifactsStatus | null;
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
    myApartmentCorridorPreviewKey,
    setMyApartmentPreviewUnit,
    setMyApartmentCorridorPreviewFloor,
    setActiveApartmentLayoutSource,
    setActiveApartmentLayoutProfileId,
    createApartmentLayoutProfileFromCurrent,
    saveToDiskLabel,
    canSaveContentToDisk,
    onSaveDisk,
    saveMsg,
    dirty,
    collisionArtifactsStatus,
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
      const ownedDefaultPreviewUnitKey = ownedDefaultApartmentUnitKey(building);
      const refs = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
      return refs.flatMap((ref) => {
        const floor = floorDocs[ref.floorDocId];
        if (!floor) return [];
        return listOwnedApartmentAuthoringPreviewUnits(floor).map((unit) => {
          const unitKey = `${ref.floorDocId}|${ref.levelIndex}|${unit.unitId}`;
          const assignedProfile = apartmentUnitLayoutProfileForUnitKey(
            apartmentUnitLayoutProfiles,
            unitKey,
          );
          const assignedProfileName = assignedProfile?.name ?? null;
          const isPlayerSpawnHome = unitKey === ownedDefaultPreviewUnitKey;
          const unitLabel = formatOwnedApartmentPreviewUnitKeyHeading(unitKey, unit.unitId);
          const profileListSuffix =
            assignedProfileName ??
            (isPlayerSpawnHome ? "Player owned default" : null);
          return {
            unitKey,
            unitId: unit.unitId,
            label: profileListSuffix ? `${unitLabel} — ${profileListSuffix}` : unitLabel,
            assignedProfileName,
            isPlayerSpawnHome,
          };
        });
      });
    },
    [apartmentUnitLayoutProfiles, building, floorDocs],
  );
  const corridorPreviewFloors = useMemo(
    () => listAuthoringCorridorPreviewFloors(building, (floorDocId) => floorDocs[floorDocId]),
    [building, floorDocs],
  );
  const previewUnit =
    apartmentPreviewUnits.find((unit) => unit.unitKey === myApartmentPreviewUnitKey) ?? null;
  const assignedProfileDoc = apartmentUnitLayoutProfileForUnitKey(
    apartmentUnitLayoutProfiles,
    myApartmentPreviewUnitKey,
  );
  const assignedProfileName = assignedProfileDoc?.name ?? null;
  const layoutSourceValue =
    activeApartmentLayoutSource === "profile"
      ? `profile:${activeApartmentLayoutProfileId ?? ""}`
      : activeApartmentLayoutSource;
  const activeProfileName =
    activeApartmentLayoutSource === "profile" && activeApartmentLayoutProfileId
      ? apartmentUnitLayoutProfiles.profiles.find((p) => p.id === activeApartmentLayoutProfileId)
          ?.name
      : null;
  const activeCorridorFloor =
    corridorPreviewFloors.find((floor) => floor.corridorKey === myApartmentCorridorPreviewKey) ??
    null;
  return (
    <>
      <div id={EDITOR_CHROME_SECTION.authoringTop} style={editorChromePanelTitle}>
        Authoring
      </div>

      <div
        id={EDITOR_CHROME_SECTION.workspace}
        style={{ ...editorChromeSection, scrollMarginTop: 6 }}
      >
        <EditorChromeSectionTitleIcon icon={faSitemap}>Workspace</EditorChromeSectionTitleIcon>
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
              fontWeight: workspace === "corridor" ? 700 : 400,
              background: workspace === "corridor" ? "#3a4a7a" : "#2a2a34",
              border: "1px solid #444",
              color: "#fff",
            }}
            onClick={() => setWorkspace("corridor")}
          >
            Corridor
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
            onClick={() => setWorkspace("stairwell")}
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

        {workspace !== "apartment" && workspace !== "corridor" ? (
          <p
            style={{
              ...editorChromeHelp,
              marginTop: 10,
              opacity: 0.82,
              fontSize: 12,
            }}
          >
            <strong>Apartment</strong> authors owned-unit furniture, décor, and partition walls.{" "}
            <strong>Corridor</strong> authors shared corridor décor and ceiling fixtures.{" "}
            <strong>Cab</strong>, <strong>Corridor Door</strong>, and <strong>Stairwell</strong> edit
            shared vertical-core visuals (
            <code>{contentIndex.elevatorCabRelPath ?? "elevator/cab.json"}</code>,{" "}
            <code>{contentIndex.landingKitRelPath ?? "elevator/landing_kit.json"}</code>,{" "}
            <code>{contentIndex.stairWellRelPath ?? "elevator/stairwell.json"}</code>
            ). <strong>FP viewmodel</strong> authors weapons and held consumables.
          </p>
        ) : null}

        {workspace === "corridor" ? (
          <>
            <span style={{ ...editorChromeLabel, marginTop: 12 }}>Preview floor</span>
            <select
              style={input}
              value={myApartmentCorridorPreviewKey}
              onChange={(e) => {
                const floor = corridorPreviewFloors.find((f) => f.corridorKey === e.target.value);
                if (floor) {
                  setMyApartmentCorridorPreviewFloor({
                    levelIndex: floor.levelIndex,
                    floorDocId: floor.floorDocId,
                    corridorKey: floor.corridorKey,
                  });
                }
              }}
            >
              {corridorPreviewFloors.map((floor) => (
                <option key={floor.corridorKey} value={floor.corridorKey}>
                  {floor.label}
                  {floor.hasPersistedBuiltins ? " — disk-backed" : ""}
                </option>
              ))}
            </select>
            <p style={editorChromeHelp}>
              {activeCorridorFloor?.hasPersistedBuiltins ? (
                <>
                  Editing corridor props for {activeCorridorFloor.label}. Saves to{" "}
                  <code style={{ fontSize: 10 }}>floor_19_corridor_builtins.json</code>.
                </>
              ) : (
                <>
                  Previewing {activeCorridorFloor?.label ?? "this floor"} — placement is session-only
                  until more floors get disk-backed corridor docs.
                </>
              )}
            </p>
          </>
        ) : null}

        {workspace === "stairwell" ? (
          <>
            <span style={{ ...editorChromeLabel, marginTop: 12 }}>Stairwell scope</span>
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
            <p style={editorChromeHelp}>
              Transform deltas are authored separately for typical and ground stairwells. Materials
              stay shared across the full shaft.
            </p>
          </>
        ) : null}
      </div>

      {workspace === "apartment" ? (
        <div
          id={EDITOR_CHROME_SECTION.apartmentUnit}
          style={{ ...editorChromeSection, scrollMarginTop: 6 }}
        >
          <EditorChromeSectionTitleIcon icon={faBuilding}>Apartment unit</EditorChromeSectionTitleIcon>
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
              </option>
            ))}
          </select>
          <p style={editorChromeHelp}>
            {assignedProfileName
              ? `Editing layout profile "${assignedProfileName}" for this unit.`
              : previewUnit?.isPlayerSpawnHome
                ? "Editing the player-owned default layout for this unit."
                : "Editing an empty draft for this unit — save as a profile to persist."}
          </p>

          <EditorChromeGroupTitleIcon icon={faDiagramProject}>Layout profile</EditorChromeGroupTitleIcon>
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
            {assignedProfileDoc ? (
              <option value={`profile:${assignedProfileDoc.id}`}>
                {assignedProfileDoc.name}
              </option>
            ) : previewUnit?.isPlayerSpawnHome ? (
              <option value="owned_default">Player owned default</option>
            ) : null}
            <option value="unassigned">Unassigned empty draft</option>
          </select>
          {activeProfileName ? (
            <p style={editorChromeHelp}>
              Saves go to unit layout profiles, not the player-owned default.
            </p>
          ) : activeApartmentLayoutSource === "owned_default" ? (
            <p style={editorChromeHelp}>
              Saves to{" "}
              <code style={{ fontSize: 10 }}>owned_apartment_builtins.json</code>.
            </p>
          ) : (
            <p style={editorChromeHelp}>
              Empty draft — use <strong>Save as new profile</strong> below.
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
          </div>
        </div>
      ) : null}

      {workspace === "apartment" || workspace === "corridor" ? (
        <div style={{ ...editorChromeSection, scrollMarginTop: 6 }}>
          <EditorChromeGroupTitleIcon icon={faFloppyDisk}>Disk</EditorChromeGroupTitleIcon>
          <span style={{ ...label, marginTop: 0 }}>Content (JSON on disk)</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {canSaveContentToDisk ? (
              <button
                type="button"
                style={editorChromeDiskSaveBtn}
                onClick={() => void onSaveDisk()}
              >
                {saveToDiskLabel}
              </button>
            ) : null}
          </div>
          {!canSaveContentToDisk && workspace === "apartment" ? (
            <p style={editorChromeHelp}>
              This empty draft has no disk destination yet. Use <strong>Save as new profile</strong>{" "}
              once to create and assign one.
            </p>
          ) : null}
          {!canSaveContentToDisk && workspace === "corridor" ? (
            <p style={editorChromeHelp}>
              Only Floor 19 has a disk-backed corridor doc today. Other floors are preview-only.
            </p>
          ) : null}
          <p style={editorChromeHelp}>
            Collision regeneration is script-only. After saving collision-affecting changes, run{" "}
            <code style={{ fontSize: 10 }}>pnpm content:gen-walk-aabbs</code>.
          </p>
          {dirty ? (
            <p style={{ color: "#fa0", margin: "8px 0 0", fontSize: 12 }}>
              {canSaveContentToDisk
                ? "Unsaved edits — save before running the collision generation script"
                : "Unsaved draft — save as a profile before running the collision generation script"}
            </p>
          ) : null}
          {saveMsg ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.9 }}>{saveMsg}</p>
          ) : null}
          {collisionArtifactsStatus ? (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12,
                color: collisionArtifactsStatus.stale ? "#fa0" : "#8f8",
              }}
            >
              Generated collision vs disk:{" "}
              {collisionArtifactsStatus.stale
                ? "stale (save, then run pnpm content:gen-walk-aabbs)"
                : "in sync"}
            </p>
          ) : null}

          <EditorChromeGroupTitleIcon icon={faRotateLeft}>Edits</EditorChromeGroupTitleIcon>
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
          <p style={editorChromeHelp}>
            <strong>Ctrl+Z</strong> undo · <strong>Ctrl+Y</strong> redo · decor import, delete,
            clone, and gizmo moves are tracked while you edit.
          </p>
        </div>
      ) : null}

    </>
  );
}
