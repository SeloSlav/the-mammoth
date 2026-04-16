const MATERIALS_PREFIX = "/static/materials/";

function titleCaseSegment(segment: string): string {
  return segment
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function materialTextureOptionLabel(url: string): string {
  const normalized = url.trim();
  if (!normalized.startsWith(MATERIALS_PREFIX)) return normalized;

  const relative = normalized.slice(MATERIALS_PREFIX.length);
  const parts = relative.split("/").filter(Boolean);
  if (parts.length === 0) return normalized;

  const fileName = parts[parts.length - 1] ?? "";
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const folderParts = parts.slice(0, -1).map(titleCaseSegment);
  const label = titleCaseSegment(baseName);

  if (folderParts.length === 0) return label || normalized;
  return `${label} (${folderParts.join(" / ")})`;
}
