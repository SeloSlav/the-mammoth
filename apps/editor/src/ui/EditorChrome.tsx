import { useCallback, useMemo, useState } from "react";
import {
  isStairWellOpeningProxyId,
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
  editorChromeInput,
  editorChromeLabel,
  editorChromePanel,
  editorChromeRowBtn,
} from "./editorChromeStyles.js";
import { EditorChromeInspector } from "./EditorChromeInspector.js";
import { EditorChromeSelectedMaterialPanel } from "./EditorChromeSelectedMaterialPanel.js";
import { EditorChromeOutliner } from "./EditorChromeOutliner.js";
import { EditorChromeAuthoringIntroAndWorkspace } from "./EditorChromeAuthoringIntroAndWorkspace.js";
import { EditorChromeFpViewmodel } from "./EditorChromeFpViewmodel.js";
import { EditorChromeMyApartment } from "./EditorChromeMyApartment.js";
import { EditorChromeSceneGizmoBlock } from "./EditorChromeSceneGizmoBlock.js";
import { useEditorChromeDiskPersistence } from "./hooks/useEditorChromeDiskPersistence.js";
import { useEditorChromeSelectionMeta } from "./hooks/useEditorChromeSelectionMeta.js";
export function EditorChrome() {
  const {
    workspace,
    mode,
    floorDocs,
    interiorDocs,
    cellDocs,
    prefabDefs,
    floorOverrideDocs,
    elevatorCabDef,
    landingKitDef,
    landingKitVariant,
    stairWellDef,
    contentIndex,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activeFloorOverrideDocId,
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
    enterMyApartmentLayoutMode,
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
  const paletteIds =
    mode === "floor"
      ? floorPrefabIds
      : mode === "interior"
        ? interiorPrefabIds
        : mode === "cell"
          ? cellPrefabIds
          : knownPrefabIds;
  return (
    <>
      <EditorChromeSelectedMaterialPanel
        mode={mode}
        selectedId={selectedId}
        contentIndex={contentIndex}
        elevatorCabDef={elevatorCabDef}
        landingKitDef={landingKitDef}
        stairWellDef={stairWellDef}
        patchElevatorCabDef={patchElevatorCabDef}
        patchLandingKitDef={patchLandingKitDef}
        patchStairWellDef={patchStairWellDef}
        input={input}
      />
      <div style={editorChromePanel}>
        <EditorChromeAuthoringIntroAndWorkspace
          contentIndex={contentIndex}
          workspace={workspace}
          setWorkspace={setWorkspace}
          mode={mode}
          setMode={setMode}
          stairWellAuthorScope={stairWellAuthorScope}
          setStairWellAuthorScope={setStairWellAuthorScope}
        />
        <EditorChromeMyApartment
          mode={mode}
          setMode={setMode}
          enterMyApartmentLayoutMode={enterMyApartmentLayoutMode}
          contentIndex={contentIndex}
        />
        {mode === "fp_viewmodel" || mode === "fp_consumable" ? (
          <EditorChromeFpViewmodel
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            gridSnapM={gridSnapM}
            setGridSnapM={setGridSnapM}
          />
        ) : null}
        {mode === "my_apartment_layout" ? (
          <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.88, maxWidth: 420 }}>
            Author bed, wardrobe, and footlocker on the preview floor. Poses serialize to disk JSON
            and apply to whichever unit the player occupies in FP.
          </p>
        ) : mode === "interior" ? (
          <>
            <span style={label}>Interior document</span>
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
            <span style={label}>Cell document</span>
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
            <span style={label}>Prefab definition</span>
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
            <span style={label}>Floor override document</span>
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
        {mode !== "fp_viewmodel" &&
        mode !== "fp_consumable" &&
        mode !== "my_apartment_layout" ? (
          <EditorChromeSceneGizmoBlock
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            gridSnapM={gridSnapM}
            setGridSnapM={setGridSnapM}
          />
        ) : null}
        <span style={label}>History</span>
        <div>
          <button
            type="button"
            style={rowBtn}
            disabled={historyPast.length === 0}
            onClick={() => undo()}
          >
            Undo
          </button>
          <button
            type="button"
            style={rowBtn}
            disabled={historyFuture.length === 0}
            onClick={() => redo()}
          >
            Redo
          </button>
        </div>
        <span style={label}>Content (JSON on disk)</span>
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
          {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
            <button
              type="button"
              style={rowBtn}
              onClick={() => onSaveDisk()}
            >
              {saveToDiskLabel}
            </button>
          ) : null}
        </div>
        <span style={{ ...label, marginTop: 10 }}>Server collision (Rust)</span>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            opacity: 0.75,
            lineHeight: 1.35,
          }}
        >
          Full collision regeneration is intentionally script-only. After saving
          collision-affecting changes, run{" "}
          <code style={{ fontSize: 10 }}>pnpm content:gen-walk-aabbs</code> from
          the repo root.
        </p>
        {dirty ? (
          <p style={{ color: "#fa0", margin: "8px 0 0", fontSize: 12 }}>
            Unsaved edits — save before running the collision generation script
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
        {mode !== "fp_viewmodel" && mode !== "fp_consumable" ? (
          <>
            <EditorChromeOutliner
              mode={mode}
              stairWellAuthorScope={stairWellAuthorScope}
              landingKitVariant={landingKitVariant}
              setLandingKitVariant={setLandingKitVariant}
              activeFloorDoc={activeFloorDoc}
              activeInteriorDoc={activeInteriorDoc}
              activeCellDoc={activeCellDoc}
              activePrefabDef={activePrefabDef}
              activeFloorOverrideDoc={activeFloorOverrideDoc}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              label={label}
            />
            {mode !== "cab" &&
            mode !== "landing_preview" &&
            mode !== "stairwell_preview" &&
            mode !== "my_apartment_layout" ? (
              <>
                <span style={label}>Prefab palette</span>
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
              </>
            ) : null}
            <EditorChromeInspector
              workspace={workspace}
              mode={mode}
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
          </>
        ) : null}
      </div>
    </>
  );
}
