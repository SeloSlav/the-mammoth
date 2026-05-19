import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import type { OwnedApartmentWallMaterial } from "@the-mammoth/schemas";
import {
  APARTMENT_PLANAR_MIRROR_DEFAULT_HEIGHT_M,
  APARTMENT_PLANAR_MIRROR_DEFAULT_WIDTH_M,
} from "@the-mammoth/world";
import type { EditorMode } from "../state/editorStoreTypes.js";
import { useEditorStore } from "../state/editorStore.js";
import { workspaceToInitialMode } from "../state/editorWorkspaceMap.js";
import type { EditorContentIndex } from "../editor/content/editorContentDiscovery.js";
import {
  editorChromeInput,
  editorChromeLabel,
  editorChromeRowBtn,
} from "./editorChromeStyles.js";
import { EditorChromeSceneGizmoBlock } from "./EditorChromeSceneGizmoBlock.js";
import {
  filterMaterialTextureUrls,
  MaterialSlotEditor,
  type AuthoringMaterialSlot,
} from "./editorMaterialSlotEditor.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutMirrorSelectedId,
  parseMyApartmentLayoutSavedObjectGroupId,
  parseMyApartmentLayoutWallSelectedId,
} from "../editor/myApartment/editorMyApartmentSelection.js";
import { deleteMyApartmentLayoutPlacementsInDoc } from "../editor/myApartment/deleteMyApartmentLayoutPlacements.js";
import {
  clampOwnedApartmentLayoutFraction,
  MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FX,
  MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FZ,
} from "../editor/myApartment/cloneMyApartmentObjectGroup.js";

type ApartmentDecorCatalogEntry = {
  modelRelPath: string;
  label: string;
};

function decorCatalogLabel(modelRelPath: string): string {
  const leaf = modelRelPath.split("/").at(-1) ?? modelRelPath;
  const stem = leaf.replace(/\.[^.]+$/u, "");
  return (
    stem
      .split(/[-_.]+/u)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || leaf
  );
}

/** Same hull fractions as “Import” so new pieces spawn near room center without stacking. */
function defaultImportedDecorPlacementFractions(nextIndex: number): {
  fx: number;
  fz: number;
} {
  const ringX = ((nextIndex % 4) - 1.5) * 0.08;
  const ringZ = ((Math.floor(nextIndex / 4) % 4) - 1.5) * 0.08;
  return {
    fx: Math.min(0.92, Math.max(0.08, 0.5 + ringX)),
    fz: Math.min(0.92, Math.max(0.08, 0.56 + ringZ)),
  };
}

function wallMaterialToAuthoringSlot(m: OwnedApartmentWallMaterial): AuthoringMaterialSlot {
  return {
    mapUrl: m.mapUrl,
    normalMapUrl: m.normalMapUrl,
    roughnessMapUrl: m.roughnessMapUrl,
    metalnessMapUrl: m.metalnessMapUrl,
    bumpMapUrl: m.bumpMapUrl,
    roughness: m.roughness,
    metalness: m.metalness,
  };
}

function authoringSlotPatchToWallMaterial(
  patch: Partial<AuthoringMaterialSlot>,
): Partial<OwnedApartmentWallMaterial> {
  const o: Partial<OwnedApartmentWallMaterial> = {};
  if (patch.mapUrl !== undefined) o.mapUrl = patch.mapUrl;
  if (patch.normalMapUrl !== undefined) o.normalMapUrl = patch.normalMapUrl;
  if (patch.roughnessMapUrl !== undefined) o.roughnessMapUrl = patch.roughnessMapUrl;
  if (patch.metalnessMapUrl !== undefined) o.metalnessMapUrl = patch.metalnessMapUrl;
  if (patch.bumpMapUrl !== undefined) o.bumpMapUrl = patch.bumpMapUrl;
  if (patch.roughness !== undefined) o.roughness = patch.roughness;
  if (patch.metalness !== undefined) o.metalness = patch.metalness;
  return o;
}

export function EditorChromeMyApartment(props: {
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  setCameraMode: (m: "orbit") => void;
  enterMyApartmentLayoutMode: () => void;
  contentIndex: EditorContentIndex;
}) {
  const {
    mode,
    setMode,
    setCameraMode,
    enterMyApartmentLayoutMode,
    contentIndex,
  } = props;
  const {
    placedItems: placedItemsFromStore,
    wallItems,
    mirrorItems,
    objectGroups,
    selectedId,
    myApartmentMultiselectExtraIds,
    patchOwnedApartmentBuiltins,
    setSelectedId,
    pickMyApartmentLayoutFromCanvas,
    saveMyApartmentObjectGroupFromSelection,
    renameMyApartmentObjectGroup,
    deleteMyApartmentObjectGroup,
    cloneMyApartmentObjectGroup,
    deleteMyApartmentObjectGroupMembers,
    selectMyApartmentSavedObjectGroup,
    transformMode,
    setTransformMode,
    gridSnapM,
    setGridSnapM,
  } = useEditorStore(
    useShallow((s) => ({
      placedItems: s.ownedApartmentBuiltins.placedItems,
      wallItems: s.ownedApartmentBuiltins.wallItems,
      mirrorItems: s.ownedApartmentBuiltins.mirrorItems,
      objectGroups: s.ownedApartmentBuiltins.objectGroups,
      selectedId: s.selectedId,
      myApartmentMultiselectExtraIds: s.myApartmentMultiselectExtraIds,
      patchOwnedApartmentBuiltins: s.patchOwnedApartmentBuiltins,
      setSelectedId: s.setSelectedId,
      pickMyApartmentLayoutFromCanvas: s.pickMyApartmentLayoutFromCanvas,
      saveMyApartmentObjectGroupFromSelection:
        s.saveMyApartmentObjectGroupFromSelection,
      renameMyApartmentObjectGroup: s.renameMyApartmentObjectGroup,
      deleteMyApartmentObjectGroup: s.deleteMyApartmentObjectGroup,
      cloneMyApartmentObjectGroup: s.cloneMyApartmentObjectGroup,
      deleteMyApartmentObjectGroupMembers: s.deleteMyApartmentObjectGroupMembers,
      selectMyApartmentSavedObjectGroup: s.selectMyApartmentSavedObjectGroup,
      transformMode: s.transformMode,
      setTransformMode: s.setTransformMode,
      gridSnapM: s.gridSnapM,
      setGridSnapM: s.setGridSnapM,
    })),
  );
  const [catalog, setCatalog] = useState<ApartmentDecorCatalogEntry[]>([]);
  const [catalogStatus, setCatalogStatus] = useState("Loading decor catalog...");
  const [selectedCatalogModelRelPath, setSelectedCatalogModelRelPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/static/models/objects/index.json", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setCatalogStatus("No decor catalog found under public/static/models/objects/.");
          return;
        }
        const raw = (await res.json()) as unknown;
        const entries = (Array.isArray(raw) ? raw : [])
          .filter((value): value is string => typeof value === "string")
          .map((modelRelPath) => ({
            modelRelPath,
            label: decorCatalogLabel(modelRelPath),
          }))
          .sort((a, b) => a.label.localeCompare(b.label) || a.modelRelPath.localeCompare(b.modelRelPath));
        if (cancelled) return;
        setCatalog(entries);
        setSelectedCatalogModelRelPath((prev) =>
          prev && entries.some((entry) => entry.modelRelPath === prev)
            ? prev
            : (entries[0]?.modelRelPath ?? null),
        );
        setCatalogStatus(
          entries.length > 0
            ? `Loaded ${entries.length} model${entries.length === 1 ? "" : "s"}.`
            : "No .glb or .obj models found in public/static/models/objects/.",
        );
      } catch {
        if (!cancelled) setCatalogStatus("Failed to load decor catalog.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDecorId = parseMyApartmentLayoutDecorSelectedId(selectedId);
  const selectedWallId = parseMyApartmentLayoutWallSelectedId(selectedId);
  const selectedMirrorId = parseMyApartmentLayoutMirrorSelectedId(selectedId);
  const placedItems = useMemo(
    () => [...placedItemsFromStore].sort((a, b) => a.id.localeCompare(b.id)),
    [placedItemsFromStore],
  );

  const wallTextureOptions = useMemo(
    () =>
      filterMaterialTextureUrls(contentIndex.materialTextureUrls, [
        "cab",
        "corridor-door",
        "stairwell",
      ]),
    [contentIndex.materialTextureUrls],
  );
  const decorById = useMemo(
    () => new Map(placedItems.map((item) => [item.id, item] as const)),
    [placedItems],
  );
  const selectedDecor = selectedDecorId ? (decorById.get(selectedDecorId) ?? null) : null;

  const wallById = useMemo(
    () => new Map(wallItems.map((item) => [item.id, item] as const)),
    [wallItems],
  );
  const selectedWall = selectedWallId ? (wallById.get(selectedWallId) ?? null) : null;

  const mirrorById = useMemo(
    () => new Map(mirrorItems.map((item) => [item.id, item] as const)),
    [mirrorItems],
  );
  const selectedMirror = selectedMirrorId ? (mirrorById.get(selectedMirrorId) ?? null) : null;

  const [newObjectGroupName, setNewObjectGroupName] = useState("Saved group");

  const extrasSelSet = useMemo(
    () => new Set(myApartmentMultiselectExtraIds),
    [myApartmentMultiselectExtraIds],
  );

  function isDecorWallPlacementRowSelected(fullPlacementId: string): boolean {
    return selectedId === fullPlacementId || extrasSelSet.has(fullPlacementId);
  }

  function pickDecorWallPlacementFromList(
    fullPlacementId: string,
    ev: Pick<MouseEvent, "ctrlKey" | "metaKey">,
  ): void {
    pickMyApartmentLayoutFromCanvas(fullPlacementId, {
      additive: ev.ctrlKey === true || ev.metaKey === true,
    });
  }

  const apartmentDecorWallMultisetCount = useMemo(() => {
    const s = new Set<string>();
    for (const extra of myApartmentMultiselectExtraIds) {
      const isDecorExtra = parseMyApartmentLayoutDecorSelectedId(extra) !== null;
      const isWallExtra = parseMyApartmentLayoutWallSelectedId(extra) !== null;
      const isMirrorExtra = parseMyApartmentLayoutMirrorSelectedId(extra) !== null;
      if (isDecorExtra || isWallExtra || isMirrorExtra) {
        s.add(extra);
      }
    }
    if (typeof selectedId === "string") {
      const isDecorSel = parseMyApartmentLayoutDecorSelectedId(selectedId) !== null;
      const isWallSel = parseMyApartmentLayoutWallSelectedId(selectedId) !== null;
      const isMirrorSel = parseMyApartmentLayoutMirrorSelectedId(selectedId) !== null;
      if (isDecorSel || isWallSel || isMirrorSel) {
        s.add(selectedId);
      }
    }
    return s.size;
  }, [myApartmentMultiselectExtraIds, selectedId]);

  const parsedSavedLayoutObjectGroupId = parseMyApartmentLayoutSavedObjectGroupId(selectedId);

  const sortedLayoutObjectGroups = useMemo(
    () =>
      [...objectGroups].sort((a, b) =>
        a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      ),
    [objectGroups],
  );

  function importSelectedDecor(): void {
    if (!selectedCatalogModelRelPath) return;
    const nextIndex = placedItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `decor_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      placedItems: [
        ...doc.placedItems,
        {
          id,
          modelRelPath: selectedCatalogModelRelPath,
          fx,
          fz,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForDecor(id));
  }

  function cloneSelectedDecor(): void {
    if (!selectedDecor) return;
    const nextIndex = placedItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `decor_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      placedItems: [
        ...doc.placedItems,
        {
          id,
          modelRelPath: selectedDecor.modelRelPath,
          fx,
          fz,
          dy: selectedDecor.dy,
          yawRad: selectedDecor.yawRad,
          pitchRad: selectedDecor.pitchRad,
          rollRad: selectedDecor.rollRad ?? 0,
          uniformScale: selectedDecor.uniformScale,
          ignoreSupportSurfaces: selectedDecor.ignoreSupportSurfaces,
          itemKind: selectedDecor.itemKind,
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForDecor(id));
  }

  function deleteLayoutPlacements(selectedIds: readonly string[]): void {
    patchOwnedApartmentBuiltins((doc) => {
      return deleteMyApartmentLayoutPlacementsInDoc(doc, selectedIds) ?? doc;
    });
    setSelectedId(null);
  }

  function deleteSelectedDecor(): void {
    if (!selectedDecorId) return;
    deleteLayoutPlacements([editorMyApartmentSelectedIdForDecor(selectedDecorId)]);
  }

  function addWallSlab(): void {
    const nextIndex = wallItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `wall_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      wallItems: [
        ...doc.wallItems,
        {
          id,
          fx,
          fz,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          sizeX: 2.2,
          sizeY: 2.6,
          sizeZ: 0.07,
          material: { useMetalnessMap: false, useHeightMap: false },
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForWall(id));
  }

  function cloneSelectedWall(): void {
    if (!selectedWall) return;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `wall_${Date.now()}_${wallItems.length}`;
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      wallItems: [
        ...doc.wallItems,
        {
          ...selectedWall,
          id,
          fx: clampOwnedApartmentLayoutFraction(
            selectedWall.fx + MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FX,
          ),
          fz: clampOwnedApartmentLayoutFraction(
            selectedWall.fz + MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FZ,
          ),
          material: { ...selectedWall.material },
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForWall(id));
  }

  function deleteSelectedWall(): void {
    if (!selectedWallId) return;
    deleteLayoutPlacements([editorMyApartmentSelectedIdForWall(selectedWallId)]);
  }

  function addMirror(): void {
    const nextIndex = mirrorItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `mirror_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      mirrorItems: [
        ...doc.mirrorItems,
        {
          id,
          fx,
          fz,
          dy: 0.9,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          sizeX: APARTMENT_PLANAR_MIRROR_DEFAULT_WIDTH_M,
          sizeY: APARTMENT_PLANAR_MIRROR_DEFAULT_HEIGHT_M,
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForMirror(id));
  }

  function cloneSelectedMirror(): void {
    if (!selectedMirror) return;
    const nextIndex = mirrorItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `mirror_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      mirrorItems: [
        ...doc.mirrorItems,
        {
          ...selectedMirror,
          id,
          fx,
          fz,
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForMirror(id));
  }

  function deleteSelectedMirror(): void {
    if (!selectedMirrorId) return;
    deleteLayoutPlacements([editorMyApartmentSelectedIdForMirror(selectedMirrorId)]);
  }

  const apartmentSceneGizmoHints: "decor" | "builtins" =
    mode === "my_apartment_layout" &&
      (parsedSavedLayoutObjectGroupId !== null ||
        selectedDecorId !== null ||
        selectedWallId !== null ||
        selectedMirrorId !== null ||
        apartmentDecorWallMultisetCount >= 2)
      ? "decor"
      : "builtins";

  let body: ReactNode = null;
  if (mode === "my_apartment_layout") {
    body = (
      <>
        <span style={{ ...editorChromeLabel, display: "block" }}>
          Import decor
        </span>
        <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
          Click a model from <code>public/static/models/objects/</code>, import it into the
          preview unit, then move it with the gizmo and save the apartment layout JSON.
        </p>
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.72 }}>{catalogStatus}</div>
        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 8,
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          {catalog.map((entry) => (
            <button
              key={entry.modelRelPath}
              type="button"
              style={{
                ...editorChromeRowBtn,
                textAlign: "left",
                background:
                  entry.modelRelPath === selectedCatalogModelRelPath ? "#355172" : "#2a2a34",
              }}
              onClick={() => setSelectedCatalogModelRelPath(entry.modelRelPath)}
              title={entry.modelRelPath}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={importSelectedDecor}
            disabled={!selectedCatalogModelRelPath}
          >
            Import selected model
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <EditorChromeSceneGizmoBlock
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            gridSnapM={gridSnapM}
            setGridSnapM={setGridSnapM}
            myApartmentLayoutHints={apartmentSceneGizmoHints}
          />
        </div>
        <span style={{ ...editorChromeLabel, display: "block", marginTop: 12 }}>
          Saved object groups
        </span>
        <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
          <strong>Ctrl/Cmd-click</strong> multiple imported decor, wall slabs, or mirrors in the scene
          or lists, enter a label, then save a group so you can move/rotate/scale them together later.
          Press <strong>Delete</strong> to remove the current selection, including every member of a
          saved group.{" "}
          <span style={{ opacity: 0.9 }}>
            Saving, renaming, or ungrouping tries to write{" "}
            <code style={{ fontSize: 10 }}>content/apartment/owned_apartment_builtins.json</code>{" "}
            immediately (Vite dev middleware with <code style={{ fontSize: 10 }}>EDITOR_SAVE=1</code>) so
            a refresh keeps groups. If that fails, use <strong>Save owned apartment builtins</strong> in
            the header.
          </span>
        </p>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 8,
            flexWrap: "wrap",
            alignItems: "stretch",
          }}
        >
          <input
            type="text"
            value={newObjectGroupName}
            onChange={(e) => setNewObjectGroupName(e.target.value)}
            placeholder="Group name…"
            style={{ ...editorChromeInput, flex: "1 1 160px", minWidth: 120 }}
          />
          <button
            type="button"
            style={editorChromeRowBtn}
            disabled={apartmentDecorWallMultisetCount < 2}
            title={
              apartmentDecorWallMultisetCount < 2
                ? "Select at least two decor / wall slabs (Ctrl/Cmd-click)."
                : "Save selection as a named group."
            }
            onClick={() =>
              saveMyApartmentObjectGroupFromSelection(
                newObjectGroupName.trim().length > 0 ? newObjectGroupName.trim() : "Saved group",
              )
            }
          >
            Save group ({apartmentDecorWallMultisetCount})
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 8,
            maxHeight: 172,
            overflowY: "auto",
          }}
        >
          {sortedLayoutObjectGroups.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>
              No saved groups yet — multiselect at least two decor or wall slabs, then Save group.
            </div>
          ) : (
            sortedLayoutObjectGroups.map((g) => {
              const isActive = parsedSavedLayoutObjectGroupId === g.id;
              return (
                <div
                  key={g.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 6,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: isActive ? "rgba(53,81,114,0.35)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  <label style={{ fontSize: 11, opacity: 0.88, gridColumn: "1 / -1" }}>
                    <span style={{ display: "block", opacity: 0.72, marginBottom: 4 }}>{g.name}</span>
                    <input
                      aria-label={`Rename saved group ${g.name}`}
                      defaultValue={g.name}
                      key={`${g.id}:${g.name}`}
                      style={{ ...editorChromeInput, width: "100%" }}
                      onBlur={(e) => renameMyApartmentObjectGroup(g.id, e.target.value)}
                    />
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, gridColumn: "1 / -1" }}>
                    <button
                      type="button"
                      style={editorChromeRowBtn}
                      onClick={() => selectMyApartmentSavedObjectGroup(g.id)}
                      title="Select this group"
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      style={editorChromeRowBtn}
                      onClick={() => cloneMyApartmentObjectGroup(g.id)}
                      title="Duplicate all members and save as a new group (offset slightly from the original)"
                    >
                      Clone
                    </button>
                    <button
                      type="button"
                      style={editorChromeRowBtn}
                      onClick={() => deleteMyApartmentObjectGroupMembers(g.id)}
                      title="Delete every member in this group and remove the saved group"
                    >
                      Delete all
                    </button>
                    <button
                      type="button"
                      style={editorChromeRowBtn}
                      onClick={() => deleteMyApartmentObjectGroup(g.id)}
                      title="Remove the grouping (objects stay in the layout)"
                    >
                      Ungroup
                    </button>
                  </div>
                  <span style={{ gridColumn: "1 / -1", fontSize: 10, opacity: 0.62 }}>
                    {g.memberSelectedIds.length} member{g.memberSelectedIds.length === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })
          )}
        </div>
        {parsedSavedLayoutObjectGroupId ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              style={editorChromeRowBtn}
              onClick={() => deleteMyApartmentObjectGroupMembers(parsedSavedLayoutObjectGroupId)}
              title="Delete every member in this group and remove the saved group (Delete key)"
            >
              Delete group and all members
            </button>
          </div>
        ) : null}
        <span style={{ ...editorChromeLabel, display: "block", marginTop: 12 }}>
          Placed items
        </span>
        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 6,
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          {placedItems.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>No placed items yet.</div>
          ) : (
            placedItems.map((item) => {
              const decorFullId = editorMyApartmentSelectedIdForDecor(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  style={{
                    ...editorChromeRowBtn,
                    textAlign: "left",
                    background: isDecorWallPlacementRowSelected(decorFullId)
                      ? "#355172"
                      : "#2a2a34",
                  }}
                  onClick={(ev) => pickDecorWallPlacementFromList(decorFullId, ev)}
                  title={item.modelRelPath}
                >
                  {decorCatalogLabel(item.modelRelPath)}
                </button>
              );
            })
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={cloneSelectedDecor}
            disabled={!selectedDecor}
            title="Same model, scale, yaw/pitch/roll, and vertical offset (dy); new id and center spawn like Import."
          >
            Clone selected decor
          </button>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={deleteSelectedDecor}
            disabled={!selectedDecor}
          >
            Delete selected decor
          </button>
        </div>
        {selectedDecor ? (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={selectedDecor.ignoreSupportSurfaces === true}
              onChange={(e) => {
                const ignoreSupportSurfaces = e.target.checked;
                patchOwnedApartmentBuiltins((doc) => ({
                  ...doc,
                  placedItems: doc.placedItems.map((item) =>
                    item.id === selectedDecor.id ? { ...item, ignoreSupportSurfaces } : item,
                  ),
                }));
              }}
            />
            <span style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.35 }}>
              Ignore support surfaces while translating
              <span style={{ display: "block", opacity: 0.65 }}>
                Use for fine placements like leaning a carton through / against an ashtray.
              </span>
            </span>
          </label>
        ) : null}
        <span style={{ ...editorChromeLabel, display: "block", marginTop: 14 }}>
          Mirrors (planar)
        </span>
        <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
          Rectangle glass with a thin frame, same reflective surface as the elevator cab mirror.
          Move / rotate / scale with the gizmo like décor; axis scale resizes width and height.
        </p>
        <div style={{ marginTop: 8 }}>
          <button type="button" style={editorChromeRowBtn} onClick={addMirror}>
            Add mirror
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 8,
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          {mirrorItems.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>No mirrors yet.</div>
          ) : (
            mirrorItems.map((item) => {
              const mirrorFullId = editorMyApartmentSelectedIdForMirror(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  style={{
                    ...editorChromeRowBtn,
                    textAlign: "left",
                    background: isDecorWallPlacementRowSelected(mirrorFullId)
                      ? "#355172"
                      : "#2a2a34",
                  }}
                  onClick={(ev) => pickDecorWallPlacementFromList(mirrorFullId, ev)}
                  title={item.id}
                >
                  Mirror {item.id.slice(0, 8)}… ({item.sizeX.toFixed(2)}×{item.sizeY.toFixed(2)} m)
                </button>
              );
            })
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={cloneSelectedMirror}
            disabled={!selectedMirror}
          >
            Clone selected mirror
          </button>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={deleteSelectedMirror}
            disabled={!selectedMirror}
          >
            Delete selected mirror
          </button>
        </div>
        <span style={{ ...editorChromeLabel, display: "block", marginTop: 14 }}>
          Partition walls (thin slabs)
        </span>
        <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
          Add boxes, move / rotate / scale with the gizmo, then pick PBR textures (same library as
          other editor materials).
        </p>
        <div style={{ marginTop: 8 }}>
          <button type="button" style={editorChromeRowBtn} onClick={addWallSlab}>
            Add wall slab
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 8,
            maxHeight: 140,
            overflowY: "auto",
          }}
        >
          {wallItems.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>No wall slabs yet.</div>
          ) : (
            wallItems.map((item) => {
              const wallFullId = editorMyApartmentSelectedIdForWall(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  style={{
                    ...editorChromeRowBtn,
                    textAlign: "left",
                    background: isDecorWallPlacementRowSelected(wallFullId)
                      ? "#355172"
                      : "#2a2a34",
                  }}
                  onClick={(ev) => pickDecorWallPlacementFromList(wallFullId, ev)}
                  title={item.id}
                >
                  Wall {item.id.slice(0, 8)}… ({item.sizeX.toFixed(2)}×{item.sizeY.toFixed(2)}×
                  {item.sizeZ.toFixed(2)} m)
                </button>
              );
            })
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={cloneSelectedWall}
            disabled={!selectedWall}
            title="Duplicate dimensions, pose, and material; new id and spawn offset."
          >
            Clone selected wall
          </button>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={deleteSelectedWall}
            disabled={!selectedWall}
          >
            Delete selected wall
          </button>
        </div>
        {selectedWall ? (
          <div style={{ marginTop: 12 }}>
            <span style={{ ...editorChromeLabel, display: "block" }}>Wall material</span>
            <span style={{ fontSize: 10, opacity: 0.62, display: "block", marginTop: 2 }}>
              Choosing a base map fills normal, roughness, metalness, and height URLs when the catalog lists
              matching files in the same folder (common stems: -normal, -roughness, -metalness, -height).
            </span>
            <MaterialSlotEditor
              slot={wallMaterialToAuthoringSlot(selectedWall.material)}
              textureOptions={wallTextureOptions}
              fillCompanionMapsFromCatalog={wallTextureOptions}
              input={editorChromeInput}
              onPatch={(patch) => {
                const mapped = authoringSlotPatchToWallMaterial(patch);
                patchOwnedApartmentBuiltins((doc) => ({
                  ...doc,
                  wallItems: doc.wallItems.map((w) =>
                    w.id === selectedWall.id
                      ? { ...w, material: { ...w.material, ...mapped } }
                      : w,
                  ),
                }));
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={selectedWall.material.useMetalnessMap === true}
                onChange={(e) => {
                  const useMetalnessMap = e.target.checked;
                  patchOwnedApartmentBuiltins((doc) => ({
                    ...doc,
                    wallItems: doc.wallItems.map((w) =>
                      w.id === selectedWall.id
                        ? { ...w, material: { ...w.material, useMetalnessMap } }
                        : w,
                    ),
                  }));
                }}
              />
              <span style={{ fontSize: 11, opacity: 0.85 }}>Use metalness map</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={selectedWall.material.useHeightMap === true}
                onChange={(e) => {
                  const useHeightMap = e.target.checked;
                  patchOwnedApartmentBuiltins((doc) => ({
                    ...doc,
                    wallItems: doc.wallItems.map((w) =>
                      w.id === selectedWall.id
                        ? { ...w, material: { ...w.material, useHeightMap } }
                        : w,
                    ),
                  }));
                }}
              />
              <span style={{ fontSize: 11, opacity: 0.85 }}>Use height as bump map</span>
            </label>
          </div>
        ) : null}
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
        {" — "}use the main <strong>Save</strong> button under Content to write that file (edits stay
        in memory until you save). Built-ins and imported decor map into each unit{"'"}s strict hull
        (`bound_*`) spans. Imported decor and authored wall slabs clamp to the slab top and the
        unit{"'"}s hollow-shell ceiling height (ceiling slab is not drawn in this preview).
      </p>
    </div>
  );
}
