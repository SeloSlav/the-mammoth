import { mergeApartmentDecorManifestPaths } from "@the-mammoth/world";

const APARTMENT_DECOR_MODEL_ROOT = "static/models/";
const APARTMENT_DECOR_OBJECTS_ROOT = "static/models/objects/";
const APARTMENT_DECOR_MODEL_EXTENSIONS = [".glb", ".obj"] as const;
const APARTMENT_DECOR_OBJECTS_MANIFEST_PATH = "/static/models/objects/index.json";

export type ApartmentDecorModelExtension = (typeof APARTMENT_DECOR_MODEL_EXTENSIONS)[number];
export type ApartmentDecorCatalogEntry = {
  modelRelPath: string;
  label: string;
};

export function apartmentDecorModelExtension(
  modelRelPath: string,
): ApartmentDecorModelExtension | null {
  const lower = modelRelPath.trim().toLowerCase();
  for (const ext of APARTMENT_DECOR_MODEL_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

export function apartmentDecorFetchPath(modelRelPath: string): string {
  const trimmed = modelRelPath.trim().replace(/^\/+/u, "");
  const relPath = trimmed.startsWith(APARTMENT_DECOR_MODEL_ROOT)
    ? trimmed
    : `${APARTMENT_DECOR_MODEL_ROOT}${trimmed}`;
  return `/${relPath}`;
}

export function normalizeApartmentDecorModelRelPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/+/u, "");
  if (trimmed.includes("..")) return null;
  if (apartmentDecorModelExtension(trimmed) === null) return null;

  const full = trimmed.startsWith(APARTMENT_DECOR_MODEL_ROOT)
    ? trimmed
    : `${APARTMENT_DECOR_MODEL_ROOT}${trimmed}`;
  if (!full.startsWith(APARTMENT_DECOR_MODEL_ROOT)) return null;
  if (full.length < 14 || full.length > 210) return null;
  if (!/^[a-zA-Z0-9/._-]+$/u.test(full)) return null;
  return full;
}

export function apartmentDecorCatalogLabel(modelRelPath: string): string {
  const normalized = normalizeApartmentDecorModelRelPath(modelRelPath) ?? modelRelPath.trim();
  const leaf = normalized.split("/").at(-1) ?? normalized;
  const stem = leaf.replace(/\.[^.]+$/u, "");
  const words = stem
    .split(/[-_.]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.join(" ") || leaf;
}

function apartmentDecorCatalogFromModelRelPaths(modelRelPaths: readonly string[]): ApartmentDecorCatalogEntry[] {
  const entries: ApartmentDecorCatalogEntry[] = [];
  for (const modelRelPath of modelRelPaths) {
    const normalized = normalizeApartmentDecorModelRelPath(modelRelPath);
    if (!normalized || !normalized.startsWith(APARTMENT_DECOR_OBJECTS_ROOT)) continue;
    entries.push({
      modelRelPath: normalized,
      label: apartmentDecorCatalogLabel(normalized),
    });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label) || a.modelRelPath.localeCompare(b.modelRelPath));
  return entries;
}

export async function fetchApartmentDecorCatalog(): Promise<ApartmentDecorCatalogEntry[]> {
  let payload: unknown = [];
  try {
    const response = await fetch(APARTMENT_DECOR_OBJECTS_MANIFEST_PATH, { cache: "no-store" });
    if (!response.ok) {
      return apartmentDecorCatalogFromModelRelPaths(mergeApartmentDecorManifestPaths([]));
    }
    payload = await response.json();
  } catch {
    return apartmentDecorCatalogFromModelRelPaths(mergeApartmentDecorManifestPaths([]));
  }

  const rawEntries = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { entries?: unknown }).entries)
      ? (payload as { entries: unknown[] }).entries
      : [];

  const manifestPaths: string[] = [];
  for (const rawEntry of rawEntries) {
    if (typeof rawEntry !== "string") continue;
    const normalized = normalizeApartmentDecorModelRelPath(rawEntry);
    if (!normalized || !normalized.startsWith(APARTMENT_DECOR_OBJECTS_ROOT)) continue;
    manifestPaths.push(normalized);
  }

  return apartmentDecorCatalogFromModelRelPaths(mergeApartmentDecorManifestPaths(manifestPaths));
}
