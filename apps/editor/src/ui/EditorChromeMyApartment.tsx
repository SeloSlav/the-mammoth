import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  faArrowsRotate,
  faCloudArrowDown,
  faGripLinesVertical,
  faObjectGroup,
  faTableCells,
  faWindowRestore,
} from "@fortawesome/free-solid-svg-icons";
import {
  defaultOwnedApartmentDecorScaleForModel,
  ownedApartmentPlacedItemKindFromModelRelPath,
  type OwnedApartmentWallMaterial,
} from "@the-mammoth/schemas";
import {
  APARTMENT_PLANAR_MIRROR_DEFAULT_HEIGHT_M,
  APARTMENT_PLANAR_MIRROR_DEFAULT_WIDTH_M,
  clampOwnedApartmentWallOpeningsForLength,
  defaultOwnedApartmentWallDoorOpening,
  readOwnedApartmentPartitionWallLocalExtents,
} from "@the-mammoth/world";
import type { EditorMode, EditorWorkspace } from "../state/editorStoreTypes.js";
import { useEditorStore } from "../state/editorStore.js";
import type { EditorContentIndex } from "../editor/content/editorContentDiscovery.js";
import {
  editorChromeHelp,
  editorChromeInput,
  editorChromeLabel,
  editorChromeRowBtn,
  editorChromeRowBtnCompact,
  editorChromeSection,
} from "./editorChromeStyles.js";
import { EditorChromeSceneGizmoBlock } from "./EditorChromeSceneGizmoBlock.js";
import { EditorChromeSectionTitleIcon } from "./EditorChromeSectionTitleIcon.js";
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
  parseMyApartmentLayoutWallOpeningSelectedId,
  editorMyApartmentSelectedIdForWallOpening,
} from "../editor/myApartment/editorMyApartmentSelection.js";
import {
  getEditorMyApartmentStaticSelectionGroupsMap,
  requestEditorFillWallOpening,
} from "../editor/myApartment/editorMyApartmentPieceGroupBridge.js";
import { deleteMyApartmentLayoutPlacementsInDoc } from "../editor/myApartment/deleteMyApartmentLayoutPlacements.js";
import { replaceMyApartmentPlacedDecorModelInDoc } from "../editor/myApartment/replaceMyApartmentPlacedDecorModel.js";

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

function normalizedSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function searchHaystackMatches(haystack: readonly string[], query: string): boolean {
  const q = normalizedSearchText(query);
  if (!q) return true;
  return haystack.some((value) => value.toLocaleLowerCase().includes(q));
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
  setWorkspace: (w: EditorWorkspace) => void;
  contentIndex: EditorContentIndex;
}) {
  const { mode, setWorkspace, contentIndex } = props;
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
    cloneMyApartmentLayoutSelection,
    deleteMyApartmentObjectGroupMembers,
    selectMyApartmentSavedObjectGroup,
    transformMode,
    setTransformMode,
    gridSnapM,
    setGridSnapM,
    decorNeighborAlignSnap,
    setDecorNeighborAlignSnap,
    apartmentBakedFloorShadowsEnabled,
    setApartmentBakedFloorShadowsEnabled,
    myApartmentLayoutHidePickMode,
    setMyApartmentLayoutHidePickMode,
    myApartmentLayoutHiddenPlacementIds,
    clearMyApartmentLayoutHiddenPlacements,
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
      cloneMyApartmentLayoutSelection: s.cloneMyApartmentLayoutSelection,
      deleteMyApartmentObjectGroupMembers: s.deleteMyApartmentObjectGroupMembers,
      selectMyApartmentSavedObjectGroup: s.selectMyApartmentSavedObjectGroup,
      transformMode: s.transformMode,
      setTransformMode: s.setTransformMode,
      gridSnapM: s.gridSnapM,
      setGridSnapM: s.setGridSnapM,
      decorNeighborAlignSnap: s.decorNeighborAlignSnap,
      setDecorNeighborAlignSnap: s.setDecorNeighborAlignSnap,
      apartmentBakedFloorShadowsEnabled: s.apartmentBakedFloorShadowsEnabled,
      setApartmentBakedFloorShadowsEnabled: s.setApartmentBakedFloorShadowsEnabled,
      myApartmentLayoutHidePickMode: s.myApartmentLayoutHidePickMode,
      setMyApartmentLayoutHidePickMode: s.setMyApartmentLayoutHidePickMode,
      myApartmentLayoutHiddenPlacementIds: s.myApartmentLayoutHiddenPlacementIds,
      clearMyApartmentLayoutHiddenPlacements: s.clearMyApartmentLayoutHiddenPlacements,
    })),
  );
  const [catalog, setCatalog] = useState<ApartmentDecorCatalogEntry[]>([]);
  const [catalogStatus, setCatalogStatus] = useState("Loading decor catalog...");
  const [selectedCatalogModelRelPath, setSelectedCatalogModelRelPath] = useState<string | null>(null);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [placedItemsSearchQuery, setPlacedItemsSearchQuery] = useState("");
  const [objectGroupsSearchQuery, setObjectGroupsSearchQuery] = useState("");
  const [groupRenameDraftById, setGroupRenameDraftById] = useState<Record<string, string>>({});

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
  const selectedOpeningSel = parseMyApartmentLayoutWallOpeningSelectedId(selectedId);
  const selectedMirrorId = parseMyApartmentLayoutMirrorSelectedId(selectedId);
  const placedItems = useMemo(
    () => [...placedItemsFromStore].sort((a, b) => a.id.localeCompare(b.id)),
    [placedItemsFromStore],
  );
  const filteredCatalog = useMemo(
    () =>
      catalog.filter((entry) =>
        searchHaystackMatches([entry.label, entry.modelRelPath], catalogSearchQuery),
      ),
    [catalog, catalogSearchQuery],
  );
  const filteredPlacedItems = useMemo(
    () =>
      placedItems.filter((item) =>
        searchHaystackMatches(
          [
            item.id,
            item.modelRelPath,
            decorCatalogLabel(item.modelRelPath),
            item.itemKind,
          ],
          placedItemsSearchQuery,
        ),
      ),
    [placedItems, placedItemsSearchQuery],
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
  const selectedOpeningWall = selectedOpeningSel
    ? (wallById.get(selectedOpeningSel.wallId) ?? null)
    : null;
  const activeWallForDoors = selectedWall ?? selectedOpeningWall;

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

  useEffect(() => {
    const valid = new Set(objectGroups.map((g) => g.id));
    setGroupRenameDraftById((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [id, v] of Object.entries(prev)) {
        if (valid.has(id)) {
          next[id] = v;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [objectGroups]);

  const filteredLayoutObjectGroups = useMemo(
    () =>
      sortedLayoutObjectGroups.filter((g) =>
        searchHaystackMatches([g.name, g.id], objectGroupsSearchQuery),
      ),
    [sortedLayoutObjectGroups, objectGroupsSearchQuery],
  );

  function importSelectedDecor(): void {
    if (!selectedCatalogModelRelPath) return;
    const nextIndex = placedItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `decor_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    const { uniformScale, verticalScaleMul } = defaultOwnedApartmentDecorScaleForModel(
      selectedCatalogModelRelPath,
    );
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
          uniformScale,
          verticalScaleMul,
          ignoreSupportSurfaces: false,
          itemKind: ownedApartmentPlacedItemKindFromModelRelPath(selectedCatalogModelRelPath),
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForDecor(id));
  }

  function cloneSelectedDecor(): void {
    if (!selectedDecor) return;
    cloneMyApartmentLayoutSelection();
  }

  function replaceSelectedDecorModel(modelRelPath = selectedCatalogModelRelPath): void {
    if (!selectedDecorId || !modelRelPath) return;
    patchOwnedApartmentBuiltins((doc) => {
      const next = replaceMyApartmentPlacedDecorModelInDoc(doc, selectedDecorId, modelRelPath);
      return next?.doc ?? doc;
    });
  }

  const replaceDecorDisabled =
    !selectedDecor ||
    !selectedCatalogModelRelPath ||
    selectedDecor.modelRelPath === selectedCatalogModelRelPath;

  function clearGroupRenameDraft(groupId: string): void {
    setGroupRenameDraftById((prev) => {
      if (!(groupId in prev)) return prev;
      const { [groupId]: _, ...rest } = prev;
      return rest;
    });
  }

  function applySavedGroupRename(groupId: string, canonicalName: string): void {
    const raw = groupRenameDraftById[groupId] ?? canonicalName;
    const next = raw.trim();
    if (next.length === 0) return;
    if (next === canonicalName) {
      clearGroupRenameDraft(groupId);
      return;
    }
    renameMyApartmentObjectGroup(groupId, next);
    clearGroupRenameDraft(groupId);
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
    cloneMyApartmentLayoutSelection();
  }

  function deleteSelectedWall(): void {
    if (!selectedWallId) return;
    deleteLayoutPlacements([editorMyApartmentSelectedIdForWall(selectedWallId)]);
  }

  function addDoorToWall(wallId: string): void {
    const wall = wallById.get(wallId);
    if (!wall) return;
    const openingId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `door_${Date.now()}`;
    const opening = defaultOwnedApartmentWallDoorOpening(openingId);
    const wallGroup =
      getEditorMyApartmentStaticSelectionGroupsMap()?.[
        editorMyApartmentSelectedIdForWall(wallId)
      ];
    const runLengthM =
      (wallGroup && readOwnedApartmentPartitionWallLocalExtents(wallGroup)?.sizeX) ??
      wall.sizeX;
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      wallItems: doc.wallItems.map((item) =>
        item.id === wallId
          ? {
              ...item,
              openings: clampOwnedApartmentWallOpeningsForLength(runLengthM, [
                ...(item.openings ?? []),
                opening,
              ]),
            }
          : item,
      ),
    }));
    setSelectedId(editorMyApartmentSelectedIdForWallOpening(wallId, openingId));
  }

  function removeWallOpening(wallId: string, openingId: string): void {
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      wallItems: doc.wallItems.map((item) =>
        item.id === wallId
          ? {
              ...item,
              openings: (item.openings ?? []).filter((o) => o.id !== openingId),
            }
          : item,
      ),
    }));
    setSelectedId(editorMyApartmentSelectedIdForWall(wallId));
  }

  function deleteSelectedOpening(): void {
    if (!selectedOpeningSel) return;
    removeWallOpening(selectedOpeningSel.wallId, selectedOpeningSel.openingId);
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
    cloneMyApartmentLayoutSelection();
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
  if (mode !== "my_apartment_layout") {
    return null;
  }
  body = (
      <>
        <div style={editorChromeSection}>
          <EditorChromeSectionTitleIcon icon={faCloudArrowDown}>Import décor</EditorChromeSectionTitleIcon>
          <p style={{ ...editorChromeHelp, marginTop: 0 }}>
            Click a model from <code>public/static/models/objects/</code>, import it into the preview
            unit, then move it with the gizmo and save the apartment layout JSON. Select a placed décor
            and use <strong>Replace selected décor</strong> (or double-click a catalog model) to swap
            its GLB without moving it.
          </p>
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.72 }}>{catalogStatus}</div>
        <input
          type="search"
          value={catalogSearchQuery}
          onChange={(e) => setCatalogSearchQuery(e.target.value)}
          placeholder="Search import decor..."
          style={{ ...editorChromeInput, width: "100%", marginTop: 8 }}
        />
        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 8,
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          {filteredCatalog.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>
              {catalog.length === 0
                ? "No importable decor models yet."
                : `No import decor matches "${catalogSearchQuery}".`}
            </div>
          ) : (
            filteredCatalog.map((entry) => (
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
                onDoubleClick={() => {
                  setSelectedCatalogModelRelPath(entry.modelRelPath);
                  if (selectedDecorId) replaceSelectedDecorModel(entry.modelRelPath);
                }}
                title={
                  selectedDecorId
                    ? `${entry.modelRelPath} — double-click to replace selected décor`
                    : entry.modelRelPath
                }
              >
                {entry.label}
              </button>
            ))
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={importSelectedDecor}
            disabled={!selectedCatalogModelRelPath}
          >
            Import selected model
          </button>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={() => replaceSelectedDecorModel()}
            disabled={replaceDecorDisabled}
            title={
              selectedDecor
                ? "Replace model and gameplay role (itemKind) — same position, rotation, and scale. Unknown GLBs become plain décor (no stash)."
                : "Select a placed décor in the scene or list first."
            }
          >
            Replace selected décor
          </button>
        </div>
        </div>
        <div style={editorChromeSection}>
          <EditorChromeSectionTitleIcon icon={faArrowsRotate}>Scene & gizmo</EditorChromeSectionTitleIcon>
          <EditorChromeSceneGizmoBlock
            omitSectionHeading
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            gridSnapM={gridSnapM}
            setGridSnapM={setGridSnapM}
            decorNeighborAlignSnap={decorNeighborAlignSnap}
            setDecorNeighborAlignSnap={setDecorNeighborAlignSnap}
            apartmentBakedFloorShadowsEnabled={apartmentBakedFloorShadowsEnabled}
            setApartmentBakedFloorShadowsEnabled={setApartmentBakedFloorShadowsEnabled}
            myApartmentLayoutHidePickMode={myApartmentLayoutHidePickMode}
            setMyApartmentLayoutHidePickMode={setMyApartmentLayoutHidePickMode}
            myApartmentLayoutHiddenCount={myApartmentLayoutHiddenPlacementIds.length}
            clearMyApartmentLayoutHiddenPlacements={clearMyApartmentLayoutHiddenPlacements}
            myApartmentLayoutHints={apartmentSceneGizmoHints}
            decorIgnoreSupportSurfacesWhileTranslating={
              selectedDecor
                ? {
                    checked: selectedDecor.ignoreSupportSurfaces === true,
                    onCheckedChange: (ignoreSupportSurfaces) => {
                      const decorId = selectedDecor.id;
                      patchOwnedApartmentBuiltins((doc) => ({
                        ...doc,
                        placedItems: doc.placedItems.map((item) =>
                          item.id === decorId ? { ...item, ignoreSupportSurfaces } : item,
                        ),
                      }));
                    },
                  }
                : undefined
            }
          />
        </div>
        <div style={editorChromeSection}>
          <EditorChromeSectionTitleIcon icon={faObjectGroup}>Saved object groups</EditorChromeSectionTitleIcon>
          <p style={{ ...editorChromeHelp, marginTop: 0 }}>
          <strong>Ctrl/Cmd-click</strong> multiple imported decor, wall slabs, or mirrors in the scene
          or lists, enter a label, then save a group so you can move/rotate/scale them together later.
          Edit an existing name and press <strong>Save name</strong> to apply it.{" "}
          <strong>Ctrl/Cmd+C</strong> clones the selection (décor, wall slab, mirror, or saved group).{" "}
          <strong>Ctrl/Cmd+X</strong> or <strong>Delete</strong> removes it, including every member of a
          saved group. <strong>Ctrl+Z</strong> / <strong>Ctrl+Y</strong> undo and redo layout edits.{" "}
          <span style={{ opacity: 0.9 }}>
            Saving, renaming, or ungrouping tries to write{" "}
            <code style={{ fontSize: 10 }}>content/apartment/owned_apartment_builtins.json</code>{" "}
            immediately (Vite dev middleware with <code style={{ fontSize: 10 }}>EDITOR_SAVE=1</code>) so
            a refresh keeps groups. If that fails, use the <strong>Disk</strong> buttons in the
            Apartment unit card.
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
            placeholder="New group name…"
            style={{ ...editorChromeInput, flex: "1 1 140px", minWidth: 100, padding: "3px 6px", fontSize: 11 }}
          />
          <button
            type="button"
            style={editorChromeRowBtnCompact}
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
        <input
          type="search"
          value={objectGroupsSearchQuery}
          onChange={(e) => setObjectGroupsSearchQuery(e.target.value)}
          placeholder="Search groups by name…"
          aria-label="Filter saved groups by name"
          style={{
            ...editorChromeInput,
            width: "100%",
            marginTop: 8,
            padding: "3px 6px",
            fontSize: 11,
          }}
        />
        <div
          style={{
            display: "grid",
            gap: 6,
            marginTop: 6,
            maxHeight: 172,
            overflowY: "auto",
          }}
        >
          {sortedLayoutObjectGroups.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>
              No saved groups yet — multiselect at least two decor or wall slabs, then Save group.
            </div>
          ) : filteredLayoutObjectGroups.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>
              No groups match &quot;{objectGroupsSearchQuery}&quot;.
            </div>
          ) : (
            filteredLayoutObjectGroups.map((g) => {
              const isActive = parsedSavedLayoutObjectGroupId === g.id;
              const nameField = groupRenameDraftById[g.id] ?? g.name;
              const trimmedName = nameField.trim();
              const canApplyRename =
                trimmedName.length > 0 && trimmedName !== g.name.trim();
              return (
                <div
                  key={g.id}
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "6px 7px",
                    borderRadius: 6,
                    background: isActive ? "rgba(53,81,114,0.35)" : "rgba(255,255,255,0.055)",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <input
                      aria-label={`Name for saved group (${g.memberSelectedIds.length} members)`}
                      value={nameField}
                      style={{
                        ...editorChromeInput,
                        flex: "1 1 120px",
                        minWidth: 0,
                        padding: "3px 6px",
                        fontSize: 11,
                      }}
                      onChange={(e) =>
                        setGroupRenameDraftById((prev) => ({
                          ...prev,
                          [g.id]: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      style={editorChromeRowBtnCompact}
                      disabled={!canApplyRename}
                      title={
                        canApplyRename
                          ? "Apply the name above to this saved group"
                          : "Change the name text to something different from the current name"
                      }
                      onClick={() => applySavedGroupRename(g.id, g.name)}
                    >
                      Save name
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      style={editorChromeRowBtnCompact}
                      onClick={() => selectMyApartmentSavedObjectGroup(g.id)}
                      title="Select this group"
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      style={editorChromeRowBtnCompact}
                      onClick={() => cloneMyApartmentObjectGroup(g.id)}
                      title="Duplicate all members and save as a new group (offset slightly from the original)"
                    >
                      Clone
                    </button>
                    <button
                      type="button"
                      style={editorChromeRowBtnCompact}
                      onClick={() => deleteMyApartmentObjectGroupMembers(g.id)}
                      title="Delete every member in this group and remove the saved group"
                    >
                      Del all
                    </button>
                    <button
                      type="button"
                      style={editorChromeRowBtnCompact}
                      onClick={() => deleteMyApartmentObjectGroup(g.id)}
                      title="Remove the grouping (objects stay in the layout)"
                    >
                      Ungroup
                    </button>
                    <span style={{ fontSize: 10, opacity: 0.62, marginLeft: "auto" }}>
                      {g.memberSelectedIds.length} member{g.memberSelectedIds.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {parsedSavedLayoutObjectGroupId ? (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              style={editorChromeRowBtnCompact}
              onClick={() => deleteMyApartmentObjectGroupMembers(parsedSavedLayoutObjectGroupId)}
              title="Delete every member in this group and remove the saved group (Delete key)"
            >
              Delete group and all members
            </button>
          </div>
        ) : null}
        </div>
        <div style={editorChromeSection}>
          <EditorChromeSectionTitleIcon icon={faTableCells}>Placed décor</EditorChromeSectionTitleIcon>
        <input
          type="search"
          value={placedItemsSearchQuery}
          onChange={(e) => setPlacedItemsSearchQuery(e.target.value)}
          placeholder="Search placed items..."
          style={{ ...editorChromeInput, width: "100%", marginTop: 6 }}
        />
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
          ) : filteredPlacedItems.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>
              No placed items match "{placedItemsSearchQuery}".
            </div>
          ) : (
            filteredPlacedItems.map((item) => {
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
          <p style={{ margin: "10px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
            Current: <code style={{ fontSize: 10 }}>{selectedDecor.modelRelPath}</code>
            {" · "}
            role <code style={{ fontSize: 10 }}>{selectedDecor.itemKind}</code>
            {selectedCatalogModelRelPath && selectedCatalogModelRelPath !== selectedDecor.modelRelPath ? (
              <>
                {" "}
                → <code style={{ fontSize: 10 }}>{selectedCatalogModelRelPath}</code>
                {` (${ownedApartmentPlacedItemKindFromModelRelPath(selectedCatalogModelRelPath)} after replace)`}
              </>
            ) : null}
          </p>
        ) : null}
        </div>
        <div style={editorChromeSection}>
          <EditorChromeSectionTitleIcon icon={faWindowRestore}>Mirrors (planar)</EditorChromeSectionTitleIcon>
          <p style={{ ...editorChromeHelp, marginTop: 0 }}>
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
        </div>
        <div style={editorChromeSection}>
          <EditorChromeSectionTitleIcon icon={faGripLinesVertical}>
            Partition walls (thin slabs)
          </EditorChromeSectionTitleIcon>
          <p style={{ ...editorChromeHelp, marginTop: 0 }}>
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
            onClick={() => {
              if (selectedWallId) requestEditorFillWallOpening(selectedWallId);
            }}
            disabled={!selectedWall}
            title="Stretch length to the nearest authored slab and unit shell walls on each end of the run axis (e.g. south slab + north apartment wall)."
          >
            Fill gap
          </button>
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
        {activeWallForDoors ? (
          <div style={{ marginTop: 10 }}>
            <span style={{ ...editorChromeLabel, display: "block" }}>Door openings</span>
            <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.78, lineHeight: 1.35 }}>
              Standard doorway (0.9×2.1 m). Drag along the wall with the translate gizmo.
            </p>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                style={editorChromeRowBtn}
                onClick={() => addDoorToWall(activeWallForDoors.id)}
              >
                Add door
              </button>
              <button
                type="button"
                style={editorChromeRowBtn}
                onClick={deleteSelectedOpening}
                disabled={!selectedOpeningSel}
              >
                Remove selected door
              </button>
            </div>
            {(activeWallForDoors.openings ?? []).length === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.68, marginTop: 8 }}>No doors on this wall.</div>
            ) : (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {(activeWallForDoors.openings ?? []).map((opening) => {
                  const fullId = editorMyApartmentSelectedIdForWallOpening(
                    activeWallForDoors.id,
                    opening.id,
                  );
                  return (
                    <button
                      key={opening.id}
                      type="button"
                      style={{
                        ...editorChromeRowBtn,
                        textAlign: "left",
                        background:
                          selectedId === fullId ? "#355172" : "#2a2a34",
                      }}
                      onClick={() => setSelectedId(fullId)}
                    >
                      Door {opening.id.slice(0, 8)}… — offset{" "}
                      {opening.tangentOffsetM.toFixed(2)} m
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
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
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={() => setWorkspace("stairwell")}
          >
            Switch to stairwell workspace
          </button>
        </div>
        </div>
      </>
  );

  return <div style={{ marginTop: 8 }}>{body}</div>;
}
