import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import type { OwnedApartmentWallMaterial } from "@the-mammoth/schemas";
import type { EditorMode, MyApartmentLayoutPiece } from "../state/editorStoreTypes.js";
import { useEditorStore } from "../state/editorStore.js";
import { workspaceToInitialMode } from "../state/editorWorkspaceMap.js";
import type { EditorContentIndex } from "../editor/content/editorContentDiscovery.js";
import {
  editorChromeInput,
  editorChromeLabel,
  editorChromeRowBtn,
} from "./editorChromeStyles.js";
import {
  filterMaterialTextureUrls,
  MaterialSlotEditor,
  type AuthoringMaterialSlot,
} from "./editorMaterialSlotEditor.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForWall,
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutWallSelectedId,
} from "../editor/myApartment/editorMyApartmentSelection.js";

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
  myApartmentLayoutPiece: MyApartmentLayoutPiece;
  setMyApartmentLayoutPiece: (p: MyApartmentLayoutPiece) => void;
  enterMyApartmentLayoutMode: () => void;
  contentIndex: EditorContentIndex;
}) {
  const {
    mode,
    setMode,
    setCameraMode,
    myApartmentLayoutPiece,
    setMyApartmentLayoutPiece,
    enterMyApartmentLayoutMode,
    contentIndex,
  } = props;
  const {
    ownedApartmentBuiltins,
    selectedId,
    patchOwnedApartmentBuiltins,
    setSelectedId,
  } = useEditorStore(
    useShallow((s) => ({
      ownedApartmentBuiltins: s.ownedApartmentBuiltins,
      selectedId: s.selectedId,
      patchOwnedApartmentBuiltins: s.patchOwnedApartmentBuiltins,
      setSelectedId: s.setSelectedId,
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
  const decorItems = ownedApartmentBuiltins.decorItems;
  const wallItems = ownedApartmentBuiltins.wallItems;

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
    () => new Map(decorItems.map((item) => [item.id, item] as const)),
    [decorItems],
  );
  const selectedDecor = selectedDecorId ? (decorById.get(selectedDecorId) ?? null) : null;

  const wallById = useMemo(
    () => new Map(wallItems.map((item) => [item.id, item] as const)),
    [wallItems],
  );
  const selectedWall = selectedWallId ? (wallById.get(selectedWallId) ?? null) : null;

  function importSelectedDecor(): void {
    if (!selectedCatalogModelRelPath) return;
    const nextIndex = ownedApartmentBuiltins.decorItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `decor_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      decorItems: [
        ...doc.decorItems,
        {
          id,
          modelRelPath: selectedCatalogModelRelPath,
          fx,
          fz,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          uniformScale: 1,
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForDecor(id));
  }

  function cloneSelectedDecor(): void {
    if (!selectedDecor) return;
    const nextIndex = ownedApartmentBuiltins.decorItems.length;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `decor_${Date.now()}_${nextIndex}`;
    const { fx, fz } = defaultImportedDecorPlacementFractions(nextIndex);
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      decorItems: [
        ...doc.decorItems,
        {
          id,
          modelRelPath: selectedDecor.modelRelPath,
          fx,
          fz,
          dy: selectedDecor.dy,
          yawRad: selectedDecor.yawRad,
          pitchRad: selectedDecor.pitchRad,
          uniformScale: selectedDecor.uniformScale,
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForDecor(id));
  }

  function deleteSelectedDecor(): void {
    if (!selectedDecorId) return;
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      decorItems: doc.decorItems.filter((item) => item.id !== selectedDecorId),
    }));
    setSelectedId(null);
  }

  function addWallSlab(): void {
    const nextIndex = ownedApartmentBuiltins.wallItems.length;
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
    const nextIndex = ownedApartmentBuiltins.wallItems.length;
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
          ...selectedWall,
          id,
          fx,
          fz,
          material: { ...selectedWall.material },
        },
      ],
    }));
    setSelectedId(editorMyApartmentSelectedIdForWall(id));
  }

  function deleteSelectedWall(): void {
    if (!selectedWallId) return;
    patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      wallItems: doc.wallItems.filter((item) => item.id !== selectedWallId),
    }));
    setSelectedId(null);
  }

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
          <option value="stove">Stove</option>
        </select>
        <span style={{ ...editorChromeLabel, display: "block", marginTop: 12 }}>
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
        <span style={{ ...editorChromeLabel, display: "block", marginTop: 12 }}>
          Imported decor
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
          {decorItems.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.68 }}>No imported decor yet.</div>
          ) : (
            decorItems.map((item) => (
              <button
                key={item.id}
                type="button"
                style={{
                  ...editorChromeRowBtn,
                  textAlign: "left",
                  background:
                    selectedDecorId === item.id ? "#355172" : "#2a2a34",
                }}
                onClick={() => setSelectedId(editorMyApartmentSelectedIdForDecor(item.id))}
                title={item.modelRelPath}
              >
                {decorCatalogLabel(item.modelRelPath)}
              </button>
            ))
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            style={editorChromeRowBtn}
            onClick={cloneSelectedDecor}
            disabled={!selectedDecor}
            title="Same model, scale, yaw, pitch, and vertical offset (dy); new id and center spawn like Import."
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
            wallItems.map((item) => (
              <button
                key={item.id}
                type="button"
                style={{
                  ...editorChromeRowBtn,
                  textAlign: "left",
                  background: selectedWallId === item.id ? "#355172" : "#2a2a34",
                }}
                onClick={() => setSelectedId(editorMyApartmentSelectedIdForWall(item.id))}
                title={item.id}
              >
                Wall {item.id.slice(0, 8)}… ({item.sizeX.toFixed(2)}×{item.sizeY.toFixed(2)}×
                {item.sizeZ.toFixed(2)} m)
              </button>
            ))
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
        {" — "}save writes that file; built-ins and imported decor both map into each unit{"'"}s
        strict hull (`bound_*`) spans. Imported decor and authored wall slabs clamp to the slab top and
        the unit{"'"}s hollow-shell ceiling height (ceiling slab is not drawn in this preview). You can use the main{" "}
        <strong>Save</strong> button under Content after leaving this panel — it still flushes{" "}
        <code style={{ fontSize: 10 }}>owned_apartment_builtins.json</code> when apartment data
        changed in memory.
      </p>
    </div>
  );
}
