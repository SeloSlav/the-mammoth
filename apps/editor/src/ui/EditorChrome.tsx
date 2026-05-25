import { useMemo, useState } from "react";
import {
  faAnglesUp,
  faArrowsRotate,
  faBuilding,
  faCloudArrowDown,
  faCrosshairs,
  faCubes,
  faDatabase,
  faFileLines,
  faGripLinesVertical,
  faListUl,
  faObjectGroup,
  faSitemap,
  faSliders,
  faTableCells,
  faWandMagicSparkles,
  faWindowRestore,
} from "@fortawesome/free-solid-svg-icons";
import {
  isStairWellCeilingPropEditorId,
  isStairWellOpeningProxyId,
  parseStairWellCeilingPropEditorId,
  patchStairWellCeilingPropAnchorInDef,
  resolveStairWellCeilingPropsForScope,
  FLOOR_19_GAMEPLAY_LEVEL_INDEX,
  LANDING_DOOR_OPENING_PROXY_ID,
} from "@the-mammoth/world";
import { spawnInFrontOfCamera } from "../editor/bridges/spawnBridge.js";
import { useShallow } from "zustand/react/shallow";
import {
  collectPrefabIdsFromCells,
  collectPrefabIdsFromFloors,
  collectPrefabIdsFromInteriors,
  collectPrefabIdsFromPrefabDefs,
  useEditorStore,
} from "../state/editorStore.js";
import { eulerDegToQuat, quatToEulerDeg } from "./editorChromeMath.js";
import { selectEditorChromeStore } from "./editorChromeSelectors.js";
import {
  editorChromeDiskSaveBtn,
  editorChromeHelp,
  editorChromeInput,
  editorChromeLabel,
  editorChromePanel,
  editorChromePanelBody,
  editorChromePanelJumpBarWrap,
  editorChromeRowBtn,
  editorChromeSection,
  editorChromeSubsectionLabel,
  editorChromeSubsectionLabelFirst,
} from "./editorChromeStyles.js";
import { EDITOR_CHROME_SECTION } from "./editorChromeSectionAnchors.js";
import {
  EditorChromeSectionJumpBar,
  type EditorChromeJumpBarItem,
} from "./EditorChromeSectionJumpBar.js";
import { EditorChromeInspector } from "./EditorChromeInspector.js";
import { EditorChromeSelectedMaterialPanel } from "./EditorChromeSelectedMaterialPanel.js";
import { EditorChromeOutliner } from "./EditorChromeOutliner.js";
import { EditorChromeAuthoringIntroAndWorkspace } from "./EditorChromeAuthoringIntroAndWorkspace.js";
import { EditorChromeFpViewmodel } from "./EditorChromeFpViewmodel.js";
import { EditorChromeMyApartment } from "./EditorChromeMyApartment.js";
import { EditorChromeSceneGizmoBlock } from "./EditorChromeSceneGizmoBlock.js";
import { EditorChromeSectionTitleIcon } from "./EditorChromeSectionTitleIcon.js";
import { useEditorChromeDiskPersistence } from "./hooks/useEditorChromeDiskPersistence.js";
import { useEditorChromeSelectionMeta } from "./hooks/useEditorChromeSelectionMeta.js";
export function EditorChrome() {
  const {
    workspace,
    mode,
    building,
    floorDocs,
    interiorDocs,
    cellDocs,
    prefabDefs,
    floorOverrideDocs,
    elevatorCabDef,
    landingKitDef,
    landingKitVariant,
    stairWellDef,
    apartmentUnitLayoutProfiles,
    activeApartmentLayoutSource,
    activeApartmentLayoutProfileId,
    contentIndex,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activeFloorOverrideDocId,
    myApartmentPreviewUnitKey,
    myApartmentAuthoringTarget,
    myApartmentCorridorPreviewKey,
    myApartmentCorridorLevelIndex,
    selectedId,
    dirty,
    collisionArtifactsStatus,
    transformMode,
    gridSnapM,
    stairWellAuthorScope,
    historyPast,
    historyFuture,
    setMode,
    setWorkspace,
    setLandingKitVariant,
    patchElevatorCabDef,
    patchLandingKitDef,
    patchStairWellDef,
    setActiveInteriorDocId,
    setActiveCellDocId,
    setActivePrefabDefId,
    setActiveFloorOverrideDocId,
    setTransformMode,
    setGridSnapM,
    setStairWellAuthorScope,
    setMyApartmentPreviewUnit,
    setMyApartmentCorridorPreviewFloor,
    setActiveApartmentLayoutSource,
    setActiveApartmentLayoutProfileId,
    createApartmentLayoutProfileFromCurrent,
    assignActiveApartmentLayoutProfileToPreviewUnit,
    undo,
    redo,
    updatePlacedObject,
    updateInteriorPlacement,
    updateCellPlacement,
    updatePrefabComponent,
    updateFloorOverrideObjectPatch,
    addFloorObject,
    deleteFloorObject,
    duplicateFloorObject,
    addInteriorPlacement,
    deleteInteriorPlacement,
    duplicateInteriorPlacement,
    addCellPlacement,
    deleteCellPlacement,
    duplicateCellPlacement,
    addPrefabComponent,
    deletePrefabComponent,
    duplicatePrefabComponent,
    setSelectedId,
  } = useEditorStore(useShallow(selectEditorChromeStore));
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const { saveToDiskLabel, onReload, onSaveDisk } =
    useEditorChromeDiskPersistence(setSaveMsg);
  const activeFloorDoc = floorDocs[activeFloorDocId];
  const activeInteriorDoc = interiorDocs[activeInteriorDocId];
  const activeCellDoc = cellDocs[activeCellDocId];
  const activePrefabDef = activePrefabDefId
    ? prefabDefs[activePrefabDefId]
    : undefined;
  const activeFloorOverrideDoc = activeFloorOverrideDocId
    ? floorOverrideDocs[activeFloorOverrideDocId]
    : undefined;
  const {
    selectedFloorObj,
    selectedInteriorPl,
    selectedCellPl,
    selectedPrefabComponent,
    selectedFloorOverridePatch,
    metaText,
    setMetaText,
    metaErr,
    setMetaErr,
  } = useEditorChromeSelectionMeta(
    activeFloorDoc,
    activeInteriorDoc,
    activeCellDoc,
    activePrefabDef,
    activeFloorOverrideDoc,
    selectedId,
  );
  const floorPrefabIds = useMemo(
    () => collectPrefabIdsFromFloors(floorDocs),
    [floorDocs],
  );
  const interiorPrefabIds = useMemo(
    () => collectPrefabIdsFromInteriors(interiorDocs),
    [interiorDocs],
  );
  const cellPrefabIds = useMemo(
    () => collectPrefabIdsFromCells(cellDocs),
    [cellDocs],
  );
  const knownPrefabIds = useMemo(
    () => collectPrefabIdsFromPrefabDefs(prefabDefs),
    [prefabDefs],
  );
  const euler = useMemo(() => {
    if (mode === "my_apartment_layout")
      return [0, 0, 0] as [number, number, number];
    if (mode === "cab" && selectedId) {
      const r = elevatorCabDef.partTransforms?.[selectedId]?.rotation;
      if (r) return quatToEulerDeg(r);
      return [0, 0, 0] as [number, number, number];
    }
    if (
      mode === "landing_preview" &&
      selectedId &&
      selectedId !== "landing_door_kit" &&
      selectedId !== LANDING_DOOR_OPENING_PROXY_ID
    ) {
      const r = landingKitDef.partTransforms?.[selectedId]?.rotation;
      if (r) return quatToEulerDeg(r);
      return [0, 0, 0] as [number, number, number];
    }
    if (
      mode === "stairwell_preview" &&
      selectedId &&
      isStairWellCeilingPropEditorId(selectedId)
    ) {
      const propId = parseStairWellCeilingPropEditorId(selectedId);
      const props = resolveStairWellCeilingPropsForScope(stairWellDef, stairWellAuthorScope);
      const prop = propId ? props.find((entry) => entry.id === propId) : undefined;
      const yawRad = prop?.anchor.yawRad ?? 0;
      return [0, (yawRad * 180) / Math.PI, 0] as [number, number, number];
    }
    if (
      mode === "stairwell_preview" &&
      selectedId &&
      !isStairWellOpeningProxyId(selectedId)
    ) {
      const r =
        stairWellAuthorScope === "ground"
          ? stairWellDef.groundPartTransforms?.[selectedId]?.rotation
          : stairWellDef.partTransforms?.[selectedId]?.rotation;
      if (r) return quatToEulerDeg(r);
      return [0, 0, 0] as [number, number, number];
    }
    if (selectedFloorObj) return quatToEulerDeg(selectedFloorObj.rotation);
    if (selectedInteriorPl) return quatToEulerDeg(selectedInteriorPl.rotation);
    if (selectedCellPl) return quatToEulerDeg(selectedCellPl.rotation);
    if (selectedPrefabComponent)
      return quatToEulerDeg(selectedPrefabComponent.rotation);
    return [0, 0, 0] as [number, number, number];
  }, [
    mode,
    selectedId,
    elevatorCabDef,
    landingKitDef,
    stairWellDef,
    stairWellAuthorScope,
    selectedFloorObj,
    selectedInteriorPl,
    selectedCellPl,
    selectedPrefabComponent,
  ]);
  const updateEuler = (ix: 0 | 1 | 2, v: number) => {
    if (mode === "my_apartment_layout") return;
    const base = euler;
    const next: [number, number, number] = [...base] as [
      number,
      number,
      number,
    ];
    next[ix] = v;
    const q = eulerDegToQuat(next[0], next[1], next[2]);
    if (mode === "cab" && selectedId) {
      patchElevatorCabDef((d) => ({
        ...d,
        partTransforms: {
          ...d.partTransforms,
          [selectedId]: {
            ...d.partTransforms?.[selectedId],
            rotation: q,
          },
        },
      }));
      return;
    }
    if (
      mode === "landing_preview" &&
      selectedId &&
      selectedId !== "landing_door_kit" &&
      selectedId !== LANDING_DOOR_OPENING_PROXY_ID
    ) {
      patchLandingKitDef((d) => ({
        ...d,
        partTransforms: {
          ...d.partTransforms,
          [selectedId]: {
            ...d.partTransforms?.[selectedId],
            rotation: q,
          },
        },
      }));
      return;
    }
    if (
      mode === "stairwell_preview" &&
      selectedId &&
      isStairWellCeilingPropEditorId(selectedId)
    ) {
      const propId = parseStairWellCeilingPropEditorId(selectedId);
      if (!propId) return;
      patchStairWellDef((d) =>
        patchStairWellCeilingPropAnchorInDef(d, stairWellAuthorScope, propId, {
          yawRad: (next[1] * Math.PI) / 180,
        }),
      );
      return;
    }
    if (
      mode === "stairwell_preview" &&
      selectedId &&
      !isStairWellOpeningProxyId(selectedId)
    ) {
      patchStairWellDef((d) => ({
        ...d,
        ...(stairWellAuthorScope === "ground"
          ? {
              groundPartTransforms: {
                ...d.groundPartTransforms,
                [selectedId]: {
                  ...d.groundPartTransforms?.[selectedId],
                  rotation: q,
                },
              },
            }
          : {
              partTransforms: {
                ...d.partTransforms,
                [selectedId]: {
                  ...d.partTransforms?.[selectedId],
                  rotation: q,
                },
              },
            }),
      }));
      return;
    }
    if (mode === "floor" && selectedId) {
      updatePlacedObject(activeFloorDocId, selectedId, { rotation: q });
    } else if (mode === "interior" && selectedId) {
      updateInteriorPlacement(activeInteriorDocId, selectedId, { rotation: q });
    } else if (mode === "cell" && selectedId) {
      updateCellPlacement(activeCellDocId, selectedId, { rotation: q });
    } else if (mode === "prefab" && selectedId && activePrefabDefId) {
      updatePrefabComponent(activePrefabDefId, selectedId, { rotation: q });
    } else if (
      mode === "floor_override" &&
      selectedId &&
      activeFloorOverrideDocId
    ) {
      updateFloorOverrideObjectPatch(activeFloorOverrideDocId, selectedId, {
        rotation: q,
      });
    }
  };
  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;
  const isUnassignedApartmentLayoutDraft =
    mode === "my_apartment_layout" &&
    workspace === "apartment" &&
    activeApartmentLayoutSource === "unassigned";
  const isNonPersistedCorridorFloor =
    mode === "my_apartment_layout" &&
    workspace === "corridor" &&
    myApartmentCorridorLevelIndex !== FLOOR_19_GAMEPLAY_LEVEL_INDEX;
  const canSaveContentToDisk =
    mode !== "fp_viewmodel" &&
    mode !== "fp_consumable" &&
    !isUnassignedApartmentLayoutDraft &&
    !isNonPersistedCorridorFloor;
  const paletteIds =
    mode === "floor"
      ? floorPrefabIds
      : mode === "interior"
        ? interiorPrefabIds
        : mode === "cell"
          ? cellPrefabIds
          : knownPrefabIds;

  const chromeJumpItems = useMemo((): EditorChromeJumpBarItem[] => {
    const items: EditorChromeJumpBarItem[] = [
      { id: EDITOR_CHROME_SECTION.authoringTop, label: "Authoring", icon: faAnglesUp },
      { id: EDITOR_CHROME_SECTION.workspace, label: "Workspace", icon: faSitemap },
    ];
    if (workspace === "apartment") {
      items.push({
        id: EDITOR_CHROME_SECTION.apartmentUnit,
        label: "Apartment unit",
        icon: faBuilding,
      });
    }
    if (mode === "my_apartment_layout") {
      items.push(
        { id: EDITOR_CHROME_SECTION.importDecor, label: "Import décor", icon: faCloudArrowDown },
        { id: EDITOR_CHROME_SECTION.modelOptimize, label: "Model optimize", icon: faWandMagicSparkles },
        { id: EDITOR_CHROME_SECTION.aptSceneGizmo, label: "Scene & gizmo", icon: faArrowsRotate },
        { id: EDITOR_CHROME_SECTION.placedDecor, label: "Placed décor", icon: faTableCells },
        { id: EDITOR_CHROME_SECTION.savedGroups, label: "Saved groups", icon: faObjectGroup },
        { id: EDITOR_CHROME_SECTION.mirrors, label: "Mirrors", icon: faWindowRestore },
        { id: EDITOR_CHROME_SECTION.partitionWalls, label: "Partition walls", icon: faGripLinesVertical },
      );
    }
    if (mode === "fp_viewmodel" || mode === "fp_consumable") {
      items.push({
        id: EDITOR_CHROME_SECTION.fpAuthoring,
        label: "First-person authoring",
        icon: faCrosshairs,
      });
    }
    if (
      mode === "interior" ||
      mode === "cell" ||
      mode === "prefab" ||
      mode === "floor_override"
    ) {
      items.push({
        id: EDITOR_CHROME_SECTION.activeDocument,
        label: "Active document",
        icon: faFileLines,
      });
    }
    if (mode !== "fp_viewmodel" && mode !== "fp_consumable" && mode !== "my_apartment_layout") {
      items.push({
        id: EDITOR_CHROME_SECTION.sceneTransform,
        label: "Scene & transform",
        icon: faArrowsRotate,
      });
    }
    if (workspace !== "apartment") {
      items.push({
        id: EDITOR_CHROME_SECTION.saveCollision,
        label: "Save & collision",
        icon: faDatabase,
      });
    }
    if (mode !== "fp_viewmodel" && mode !== "fp_consumable" && mode !== "my_apartment_layout") {
      items.push({
        id: EDITOR_CHROME_SECTION.outliner,
        label: "Outliner",
        icon: faListUl,
      });
    }
    if (
      mode !== "cab" &&
      mode !== "landing_preview" &&
      mode !== "stairwell_preview" &&
      mode !== "my_apartment_layout" &&
      mode !== "fp_viewmodel" &&
      mode !== "fp_consumable"
    ) {
      items.push({
        id: EDITOR_CHROME_SECTION.prefabPalette,
        label: "Prefab palette",
        icon: faCubes,
      });
    }
    if (mode !== "fp_viewmodel" && mode !== "fp_consumable") {
      items.push({
        id: EDITOR_CHROME_SECTION.inspector,
        label: "Inspector",
        icon: faSliders,
      });
    }
    return items;
  }, [workspace, mode]);

  return (
    <>
      <EditorChromeSelectedMaterialPanel
        mode={mode}
        selectedId={selectedId}
        contentIndex={contentIndex}
        elevatorCabDef={elevatorCabDef}
        landingKitDef={landingKitDef}
        patchElevatorCabDef={patchElevatorCabDef}
        patchLandingKitDef={patchLandingKitDef}
        input={input}
      />
      <div style={editorChromePanel}>
        <div style={editorChromePanelJumpBarWrap}>
          <EditorChromeSectionJumpBar items={chromeJumpItems} />
        </div>
        <div style={editorChromePanelBody}>
        <EditorChromeAuthoringIntroAndWorkspace
          contentIndex={contentIndex}
          workspace={workspace}
          setWorkspace={setWorkspace}
          mode={mode}
          setMode={setMode}
          stairWellAuthorScope={stairWellAuthorScope}
          setStairWellAuthorScope={setStairWellAuthorScope}
          building={building}
          floorDocs={floorDocs}
          apartmentUnitLayoutProfiles={apartmentUnitLayoutProfiles}
          activeApartmentLayoutSource={activeApartmentLayoutSource}
          activeApartmentLayoutProfileId={activeApartmentLayoutProfileId}
          myApartmentPreviewUnitKey={myApartmentPreviewUnitKey}
          myApartmentCorridorPreviewKey={myApartmentCorridorPreviewKey}
          setMyApartmentPreviewUnit={setMyApartmentPreviewUnit}
          setMyApartmentCorridorPreviewFloor={setMyApartmentCorridorPreviewFloor}
          setActiveApartmentLayoutSource={setActiveApartmentLayoutSource}
          setActiveApartmentLayoutProfileId={setActiveApartmentLayoutProfileId}
          createApartmentLayoutProfileFromCurrent={createApartmentLayoutProfileFromCurrent}
          assignActiveApartmentLayoutProfileToPreviewUnit={
            assignActiveApartmentLayoutProfileToPreviewUnit
          }
          saveToDiskLabel={saveToDiskLabel}
          canSaveContentToDisk={canSaveContentToDisk}
          onSaveDisk={onSaveDisk}
          saveMsg={saveMsg}
          dirty={dirty}
          collisionArtifactsStatus={collisionArtifactsStatus}
          historyPastLength={historyPast.length}
          historyFutureLength={historyFuture.length}
          undo={undo}
          redo={redo}
        />
        <EditorChromeMyApartment
          mode={mode}
          setWorkspace={setWorkspace}
          contentIndex={contentIndex}
        />
        {mode === "fp_viewmodel" || mode === "fp_consumable" ? (
          <div
            id={EDITOR_CHROME_SECTION.fpAuthoring}
            style={{ ...editorChromeSection, scrollMarginTop: 6 }}
          >
            <EditorChromeSectionTitleIcon icon={faCrosshairs}>First-person authoring</EditorChromeSectionTitleIcon>
            <EditorChromeFpViewmodel
              transformMode={transformMode}
              setTransformMode={setTransformMode}
              gridSnapM={gridSnapM}
              setGridSnapM={setGridSnapM}
            />
          </div>
        ) : null}
        {mode === "interior" ||
        mode === "cell" ||
        mode === "prefab" ||
        mode === "floor_override" ? (
          <div
            id={EDITOR_CHROME_SECTION.activeDocument}
            style={{ ...editorChromeSection, scrollMarginTop: 6 }}
          >
            {mode === "interior" ? (
              <>
                <span style={{ ...label, marginTop: 0 }}>Interior document</span>
                <select
                  style={input}
                  value={activeInteriorDocId}
                  onChange={(e) => setActiveInteriorDocId(e.target.value)}
                >
                  {Object.keys(interiorDocs).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </>
            ) : mode === "cell" ? (
              <>
                <span style={{ ...label, marginTop: 0 }}>Cell document</span>
                <select
                  style={input}
                  value={activeCellDocId}
                  onChange={(e) => setActiveCellDocId(e.target.value)}
                >
                  {Object.keys(cellDocs).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </>
            ) : mode === "prefab" ? (
              <>
                <span style={{ ...label, marginTop: 0 }}>Prefab definition</span>
                <select
                  style={input}
                  value={activePrefabDefId ?? ""}
                  onChange={(e) => setActivePrefabDefId(e.target.value || null)}
                >
                  <option value="">— pick prefab —</option>
                  {Object.keys(prefabDefs).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </>
            ) : mode === "floor_override" ? (
              <>
                <span style={{ ...label, marginTop: 0 }}>Floor override document</span>
                <select
                  style={input}
                  value={activeFloorOverrideDocId ?? ""}
                  onChange={(e) =>
                    setActiveFloorOverrideDocId(e.target.value || null)
                  }
                >
                  <option value="">— pick override —</option>
                  {Object.keys(floorOverrideDocs).map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
        ) : null}
        {mode !== "fp_viewmodel" &&
        mode !== "fp_consumable" &&
        mode !== "my_apartment_layout" ? (
          <div
            id={EDITOR_CHROME_SECTION.sceneTransform}
            style={{ ...editorChromeSection, scrollMarginTop: 6 }}
          >
            <EditorChromeSceneGizmoBlock
              omitSectionHeading
              transformMode={transformMode}
              setTransformMode={setTransformMode}
              gridSnapM={gridSnapM}
              setGridSnapM={setGridSnapM}
            />
          </div>
        ) : null}
        {workspace !== "apartment" ? (
          <div
            id={EDITOR_CHROME_SECTION.saveCollision}
            style={{ ...editorChromeSection, scrollMarginTop: 6 }}
          >
            <span style={editorChromeSubsectionLabelFirst}>History</span>
            <div>
              <button
                type="button"
                style={rowBtn}
                disabled={historyPast.length === 0}
                onClick={() => undo()}
                title="Undo (Ctrl+Z)"
              >
                Undo
              </button>
              <button
                type="button"
                style={rowBtn}
                disabled={historyFuture.length === 0}
                onClick={() => redo()}
                title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
              >
                Redo
              </button>
            </div>
            <span style={editorChromeSubsectionLabel}>Content (JSON on disk)</span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
              }}
            >
              <button
                type="button"
                style={rowBtn}
                onClick={() => onReload()}
                title="Reload every authoring document from content/ (discards unsaved editor changes)."
              >
                Reload from disk
              </button>
              {canSaveContentToDisk ? (
                <button
                  type="button"
                  style={editorChromeDiskSaveBtn}
                  onClick={() => onSaveDisk()}
                >
                  {saveToDiskLabel}
                </button>
              ) : null}
            </div>
            {isUnassignedApartmentLayoutDraft ? (
              <p style={editorChromeHelp}>
                Use <strong>Save as new profile</strong> above before writing this apartment draft to
                disk.
              </p>
            ) : null}
            <span style={editorChromeSubsectionLabel}>Server collision (Rust)</span>
            <p style={{ ...editorChromeHelp, marginTop: 0 }}>
              Full collision regeneration is intentionally script-only. After saving collision-affecting
              changes, run <code style={{ fontSize: 10 }}>pnpm content:gen-walk-aabbs</code> from the repo
              root.
            </p>
            {dirty ? (
              <p style={{ color: "#fa0", margin: "8px 0 0", fontSize: 12 }}>
                {isUnassignedApartmentLayoutDraft
                  ? "Unsaved draft — save as a profile before running the collision generation script"
                  : "Unsaved edits — save before running the collision generation script"}
              </p>
            ) : null}
            {saveMsg ? (
              <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.9 }}>
                {saveMsg}
              </p>
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
          </div>
        ) : null}
        {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
          <>
            {mode !== "my_apartment_layout" ? (
              <div
                id={EDITOR_CHROME_SECTION.outliner}
                style={{ ...editorChromeSection, scrollMarginTop: 6 }}
              >
                <EditorChromeOutliner
                  mode={mode}
                  stairWellAuthorScope={stairWellAuthorScope}
                  stairWellDef={stairWellDef}
                  landingKitVariant={landingKitVariant}
                  setLandingKitVariant={setLandingKitVariant}
                  activeFloorDoc={activeFloorDoc}
                  activeInteriorDoc={activeInteriorDoc}
                  activeCellDoc={activeCellDoc}
                  activePrefabDef={activePrefabDef}
                  activeFloorOverrideDoc={activeFloorOverrideDoc}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                />
              </div>
            ) : null}
            {mode !== "cab" &&
            mode !== "landing_preview" &&
            mode !== "stairwell_preview" &&
            mode !== "my_apartment_layout" ? (
              <div
                id={EDITOR_CHROME_SECTION.prefabPalette}
                style={{ ...editorChromeSection, scrollMarginTop: 6 }}
              >
                <EditorChromeSectionTitleIcon icon={faCubes}>Prefab palette</EditorChromeSectionTitleIcon>
                <select
                  style={{ ...input, marginBottom: 6 }}
                  id="editor-prefab-palette"
                  defaultValue=""
                  onChange={() => {}}
                >
                  <option value="">— pick prefab —</option>
                  {paletteIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
                <div>
                  <button
                    type="button"
                    style={rowBtn}
                    onClick={() => {
                      const sel = document.getElementById(
                        "editor-prefab-palette",
                      ) as HTMLSelectElement | null;
                      const prefabId =
                        sel?.value || paletteIds[0] || "corridor_segment_a";
                      const pos = spawnInFrontOfCamera(16);
                      if (mode === "floor") {
                        addFloorObject(activeFloorDocId, {
                          id: crypto.randomUUID(),
                          prefabId,
                          position: pos,
                          scale: [1, 1, 1],
                        });
                      } else {
                        if (mode === "cell") {
                          addCellPlacement(activeCellDocId, {
                            entityId: crypto.randomUUID(),
                            prefabId,
                            position: pos,
                            scale: [1, 1, 1],
                          });
                          return;
                        }
                        if (mode === "prefab" && activePrefabDefId) {
                          addPrefabComponent(activePrefabDefId, {
                            id: crypto.randomUUID(),
                            prefabId,
                            position: pos,
                            scale: [1, 1, 1],
                            sockets: [],
                            tags: [],
                          });
                          return;
                        }
                        addInteriorPlacement(activeInteriorDocId, {
                          entityId: crypto.randomUUID(),
                          prefabId,
                          position: pos,
                          scale: [1, 1, 1],
                        });
                      }
                    }}
                  >
                    Add object
                  </button>
                  <button
                    type="button"
                    style={rowBtn}
                    disabled={!selectedId}
                    onClick={() => {
                      if (!selectedId) return;
                      if (mode === "floor")
                        duplicateFloorObject(activeFloorDocId, selectedId);
                      else if (mode === "interior")
                        duplicateInteriorPlacement(
                          activeInteriorDocId,
                          selectedId,
                        );
                      else if (mode === "cell")
                        duplicateCellPlacement(activeCellDocId, selectedId);
                      else if (mode === "prefab" && activePrefabDefId)
                        duplicatePrefabComponent(activePrefabDefId, selectedId);
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    style={rowBtn}
                    disabled={!selectedId}
                    onClick={() => {
                      if (!selectedId) return;
                      if (mode === "floor")
                        deleteFloorObject(activeFloorDocId, selectedId);
                      else if (mode === "interior")
                        deleteInteriorPlacement(
                          activeInteriorDocId,
                          selectedId,
                        );
                      else if (mode === "cell")
                        deleteCellPlacement(activeCellDocId, selectedId);
                      else if (mode === "prefab" && activePrefabDefId)
                        deletePrefabComponent(activePrefabDefId, selectedId);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : null}
            <div
              id={EDITOR_CHROME_SECTION.inspector}
              style={{ ...editorChromeSection, scrollMarginTop: 6 }}
            >
              <EditorChromeInspector
                workspace={workspace}
                mode={mode}
                contentIndex={contentIndex}
                landingKitVariant={landingKitVariant}
                elevatorCabDef={elevatorCabDef}
                landingKitDef={landingKitDef}
                stairWellDef={stairWellDef}
                stairWellAuthorScope={stairWellAuthorScope}
                patchElevatorCabDef={patchElevatorCabDef}
                patchLandingKitDef={patchLandingKitDef}
                patchStairWellDef={patchStairWellDef}
                selectedId={selectedId}
                selectedFloorObj={selectedFloorObj}
                selectedInteriorPl={selectedInteriorPl}
                selectedCellPl={selectedCellPl}
                selectedPrefabComponent={selectedPrefabComponent}
                selectedFloorOverridePatch={selectedFloorOverridePatch}
                activeFloorDocId={activeFloorDocId}
                activeInteriorDocId={activeInteriorDocId}
                activeCellDocId={activeCellDocId}
                activePrefabDefId={activePrefabDefId}
                activeFloorOverrideDocId={activeFloorOverrideDocId}
                metaText={metaText}
                setMetaText={setMetaText}
                metaErr={metaErr}
                setMetaErr={setMetaErr}
                euler={euler}
                updateEuler={updateEuler}
                updatePlacedObject={updatePlacedObject}
                updateInteriorPlacement={updateInteriorPlacement}
                updateCellPlacement={updateCellPlacement}
                updatePrefabComponent={updatePrefabComponent}
                updateFloorOverrideObjectPatch={updateFloorOverrideObjectPatch}
                label={label}
                input={input}
              />
            </div>
          </>
        ) : null}
        </div>
      </div>
    </>
  );
}
