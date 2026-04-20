import type { CSSProperties } from "react";
import type { ElevatorCabDef, LandingKitDef, StairWellDef } from "@the-mammoth/schemas";
import { LANDING_DOOR_OPENING_PROXY_ID } from "@the-mammoth/world";
import type { EditorContentIndex } from "../editor/editorContentDiscovery.js";
import type { EditorMode, EditorState } from "../state/editorStore.js";
import { editorChromePanel } from "./editorChromeStyles.js";
import { materialTextureOptionLabel } from "./materialTextureOptionLabel.js";

type AuthoringMaterialSlot = {
  colorHex?: string;
  roughness?: number;
  metalness?: number;
  mapUrl?: string;
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  metalnessMapUrl?: string;
  bumpMapUrl?: string;
  transmission?: number;
};

function filterMaterialTextureUrls(
  urls: readonly string[],
  folderNames: readonly string[],
): string[] {
  const preferred = urls.filter((url) =>
    folderNames.some((folder) => url.startsWith(`/static/materials/${folder}/`)),
  );
  const shared = urls.filter((url) => url.startsWith("/static/materials/shared/"));
  const remainder = urls.filter((url) => !preferred.includes(url) && !shared.includes(url));
  return [...preferred, ...shared, ...remainder];
}

function OptionalTextureMapRow(props: {
  label: string;
  url: string | undefined;
  textureOptions: readonly string[];
  input: CSSProperties;
  onUrl: (next: string | undefined) => void;
}) {
  const { label, url, textureOptions, input, onUrl } = props;
  const v = url ?? "";
  const selectValue = v.length === 0 ? "" : textureOptions.includes(v) ? v : "__custom__";
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, opacity: 0.78, marginBottom: 4 }}>{label}</div>
      <select
        style={input}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "__custom__") return;
          onUrl(next || undefined);
        }}
      >
        <option value="">None</option>
        {textureOptions.map((u) => (
          <option key={u} value={u}>
            {materialTextureOptionLabel(u)}
          </option>
        ))}
        {selectValue === "__custom__" ? <option value="__custom__">Custom URL below</option> : null}
      </select>
      <input
        style={{ ...input, marginTop: 6 }}
        placeholder="/static/materials/..."
        value={v}
        onChange={(e) => {
          const t = e.target.value.trim();
          onUrl(t || undefined);
        }}
      />
    </div>
  );
}

function MaterialSlotEditor(props: {
  slot: AuthoringMaterialSlot | undefined;
  textureOptions: readonly string[];
  input: CSSProperties;
  onPatch: (patch: Partial<AuthoringMaterialSlot>) => void;
  transmissionLabel?: string;
}) {
  const { slot, textureOptions, input, onPatch, transmissionLabel } = props;
  const mapUrl = slot?.mapUrl ?? "";
  const selectValue =
    mapUrl.length === 0 ? "" : textureOptions.includes(mapUrl) ? mapUrl : "__custom__";
  return (
    <>
      <select
        style={input}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "__custom__") return;
          onPatch({ mapUrl: next || undefined });
        }}
      >
        <option value="">No texture map</option>
        {textureOptions.map((url) => (
          <option key={url} value={url}>
            {materialTextureOptionLabel(url)}
          </option>
        ))}
        {selectValue === "__custom__" ? <option value="__custom__">Custom URL below</option> : null}
      </select>
      <input
        style={{ ...input, marginTop: 8 }}
        placeholder="/static/materials/..."
        value={mapUrl}
        onChange={(e) => {
          const v = e.target.value.trim();
          onPatch({ mapUrl: v || undefined });
        }}
      />
      <OptionalTextureMapRow
        label="Normal map"
        url={slot?.normalMapUrl}
        textureOptions={textureOptions}
        input={input}
        onUrl={(next) => onPatch({ normalMapUrl: next })}
      />
      <OptionalTextureMapRow
        label="Roughness map"
        url={slot?.roughnessMapUrl}
        textureOptions={textureOptions}
        input={input}
        onUrl={(next) => onPatch({ roughnessMapUrl: next })}
      />
      <OptionalTextureMapRow
        label="Metalness map"
        url={slot?.metalnessMapUrl}
        textureOptions={textureOptions}
        input={input}
        onUrl={(next) => onPatch({ metalnessMapUrl: next })}
      />
      <OptionalTextureMapRow
        label="Height → bump map"
        url={slot?.bumpMapUrl}
        textureOptions={textureOptions}
        input={input}
        onUrl={(next) => onPatch({ bumpMapUrl: next })}
      />
      <input
        style={{ ...input, marginTop: 8 }}
        placeholder="colorHex"
        value={slot?.colorHex ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          onPatch({ colorHex: v || undefined });
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: transmissionLabel ? "1fr 1fr 1fr" : "1fr 1fr",
          gap: 8,
          marginTop: 8,
        }}
      >
        <input
          style={input}
          type="number"
          step={0.05}
          min={0}
          max={1}
          placeholder="roughness"
          value={slot?.roughness ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            onPatch({ roughness: Number.isFinite(v) ? v : undefined });
          }}
        />
        <input
          style={input}
          type="number"
          step={0.05}
          min={0}
          max={1}
          placeholder="metalness"
          value={slot?.metalness ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            onPatch({ metalness: Number.isFinite(v) ? v : undefined });
          }}
        />
        {transmissionLabel ? (
          <input
            style={input}
            type="number"
            step={0.05}
            min={0}
            max={1}
            placeholder={transmissionLabel}
            value={slot?.transmission ?? ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              onPatch({ transmission: Number.isFinite(v) ? v : undefined });
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function cabSlotForSelectedId(
  selectedId: string | null,
): "wall" | "floor" | "ceiling" | "panel" | "button" | null {
  if (selectedId === "cab_floor") return "floor";
  if (selectedId === "cab_ceiling") return "ceiling";
  if (selectedId === "cab_floor_panel") return "panel";
  if (selectedId === "cab_floor_button") return "button";
  if (
    selectedId === "cab_wall_back" ||
    selectedId === "cab_wall_front_top" ||
    selectedId === "cab_wall_front_n" ||
    selectedId === "cab_wall_front_s" ||
    selectedId === "cab_wall_front_e" ||
    selectedId === "cab_wall_front_w" ||
    selectedId === "cab_wall_side_n" ||
    selectedId === "cab_wall_side_s" ||
    selectedId === "cab_wall_side_e" ||
    selectedId === "cab_wall_side_w"
  ) {
    return "wall";
  }
  return null;
}

function stairSlotForSelectedId(
  selectedId: string | null,
): "wall" | "floor" | "tread" | "landing" | null {
  if (selectedId === "shaft_wall") return "wall";
  if (selectedId === "shaft_floor") return "floor";
  if (
    selectedId === "stair_flights" ||
    selectedId === "stair_flight_lower" ||
    selectedId === "stair_flight_upper"
  ) {
    return "tread";
  }
  if (selectedId === "stair_landing_lower" || selectedId === "stair_landing_upper") {
    return "landing";
  }
  return null;
}

type MaterialPanelState = {
  title: string;
  detail: string;
  slot: AuthoringMaterialSlot | undefined;
  textureOptions: readonly string[];
  transmissionLabel?: string;
  onPatch: (patch: Partial<AuthoringMaterialSlot>) => void;
};

export function EditorChromeSelectedMaterialPanel(props: {
  mode: EditorMode;
  selectedId: string | null;
  contentIndex: EditorContentIndex;
  elevatorCabDef: ElevatorCabDef;
  landingKitDef: LandingKitDef;
  stairWellDef: StairWellDef;
  patchElevatorCabDef: EditorState["patchElevatorCabDef"];
  patchLandingKitDef: EditorState["patchLandingKitDef"];
  patchStairWellDef: EditorState["patchStairWellDef"];
  input: CSSProperties;
}) {
  const {
    mode,
    selectedId,
    contentIndex,
    elevatorCabDef,
    landingKitDef,
    stairWellDef,
    patchElevatorCabDef,
    patchLandingKitDef,
    patchStairWellDef,
    input,
  } = props;

  if (mode !== "cab" && mode !== "landing_preview" && mode !== "stairwell_preview") return null;

  const cabTextureOptions = filterMaterialTextureUrls(contentIndex.materialTextureUrls, ["cab"]);
  const corridorDoorTextureOptions = filterMaterialTextureUrls(contentIndex.materialTextureUrls, [
    "corridor-door",
  ]);
  const stairwellTextureOptions = filterMaterialTextureUrls(contentIndex.materialTextureUrls, [
    "stairwell",
  ]);

  let materialPanelState: MaterialPanelState | null = null;
  let emptyMessage = "Pick a volume to edit its material.";

  if (mode === "cab") {
    const slot = cabSlotForSelectedId(selectedId);
    if (slot) {
      materialPanelState = {
        title: selectedId ?? "cab part",
        detail: `Editing shared cab ${slot} material.`,
        slot: elevatorCabDef.materials?.[slot],
        textureOptions: cabTextureOptions,
        onPatch: (patch) => {
          patchElevatorCabDef((d) => ({
            ...d,
            materials: {
              ...d.materials,
              [slot]: { ...d.materials?.[slot], ...patch },
            },
          }));
        },
      };
    }
  } else if (mode === "landing_preview") {
    const isGlass =
      selectedId === LANDING_DOOR_OPENING_PROXY_ID || selectedId === "landing_glass_lite";
    const isFrame =
      selectedId === "landing_frame_top_rail" ||
      selectedId === "landing_frame_bottom_rail" ||
      selectedId === "landing_frame_left_stile" ||
      selectedId === "landing_frame_right_stile";
    if (isGlass) {
      materialPanelState = {
        title: selectedId === LANDING_DOOR_OPENING_PROXY_ID ? "landing glass" : selectedId ?? "glass",
        detail: "Editing shared corridor-door glass material.",
        slot: landingKitDef.materials?.glass,
        textureOptions: corridorDoorTextureOptions,
        transmissionLabel: "transmission",
        onPatch: (patch) => {
          patchLandingKitDef((d) => ({
            ...d,
            materials: {
              ...d.materials,
              glass: { ...d.materials?.glass, ...patch },
            },
          }));
        },
      };
    } else if (isFrame) {
      materialPanelState = {
        title: selectedId ?? "landing frame",
        detail: "Editing shared corridor-door frame material.",
        slot: landingKitDef.materials?.frame,
        textureOptions: corridorDoorTextureOptions,
        onPatch: (patch) => {
          patchLandingKitDef((d) => ({
            ...d,
            materials: {
              ...d.materials,
              frame: { ...d.materials?.frame, ...patch },
            },
          }));
        },
      };
    } else if (selectedId === "landing_door_kit") {
      emptyMessage = "Select the corridor-door frame or glass in the viewport to edit its material.";
    }
  } else if (mode === "stairwell_preview") {
    const slot = stairSlotForSelectedId(selectedId);
    if (slot) {
      materialPanelState = {
        title: selectedId ?? "stair part",
        detail: `Editing shared stairwell ${slot} material.`,
        slot: stairWellDef.materials?.[slot],
        textureOptions: stairwellTextureOptions,
        onPatch: (patch) => {
          patchStairWellDef((d) => ({
            ...d,
            materials: {
              ...d.materials,
              [slot]: { ...d.materials?.[slot], ...patch },
            },
          }));
        },
      };
    } else if (selectedId) {
      emptyMessage =
        selectedId === "stair_entry_opening_proxy"
          ? "The opening proxy edits geometry only. Select a wall, floor, flight, or landing to edit material."
          : "That selected stairwell item does not have its own material slot.";
    }
  }

  return (
    <div
      style={{
        ...editorChromePanel,
        left: 0,
        right: "auto",
        width: 320,
      }}
    >
      <strong style={{ fontSize: 15 }}>Selected Material</strong>
      {materialPanelState ? (
        <>
          <p style={{ opacity: 0.82, fontSize: 12, lineHeight: 1.45, margin: "8px 0 0" }}>
            <strong>{materialPanelState.title}</strong>
            <br />
            {materialPanelState.detail}
          </p>
          <div style={{ marginTop: 12 }}>
            <MaterialSlotEditor
              slot={materialPanelState.slot}
              textureOptions={materialPanelState.textureOptions}
              input={input}
              transmissionLabel={materialPanelState.transmissionLabel}
              onPatch={materialPanelState.onPatch}
            />
          </div>
        </>
      ) : (
        <p style={{ opacity: 0.75, fontSize: 12, lineHeight: 1.45, margin: "8px 0 0" }}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
