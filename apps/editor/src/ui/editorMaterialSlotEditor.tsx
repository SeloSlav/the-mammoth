import type { CSSProperties } from "react";
import { expandAuthoringMaterialPatchWithCompanionMaps } from "./inferPbrCompanionTextureUrls.js";
import { materialTextureOptionLabel } from "./materialTextureOptionLabel.js";

export type AuthoringMaterialSlot = {
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

export function filterMaterialTextureUrls(
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

export function OptionalTextureMapRow(props: {
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

export function MaterialSlotEditor(props: {
  slot: AuthoringMaterialSlot | undefined;
  textureOptions: readonly string[];
  input: CSSProperties;
  onPatch: (patch: Partial<AuthoringMaterialSlot>) => void;
  transmissionLabel?: string;
  /**
   * When set, changing `mapUrl` (dropdown or text field) also assigns matching normal / roughness /
   * metalness / height URLs from the catalog using common filename stems (`-normal`, `_roughness`, …).
   */
  fillCompanionMapsFromCatalog?: readonly string[];
}) {
  const {
    slot,
    textureOptions,
    input,
    onPatch,
    transmissionLabel,
    fillCompanionMapsFromCatalog: companionCatalog,
  } = props;

  const mergeMapPatch = (patch: Partial<AuthoringMaterialSlot>): void => {
    if (companionCatalog?.length) {
      onPatch(
        expandAuthoringMaterialPatchWithCompanionMaps(patch, companionCatalog) as Partial<AuthoringMaterialSlot>,
      );
    } else {
      onPatch(patch);
    }
  };
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
          mergeMapPatch({ mapUrl: next || undefined });
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
          mergeMapPatch({ mapUrl: v || undefined });
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
