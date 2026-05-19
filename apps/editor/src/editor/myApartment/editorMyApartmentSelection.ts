const DECOR_PREFIX = "mammoth_editor_my_apartment_decor:";
const WALL_PREFIX = "mammoth_editor_my_apartment_wall:";
const MIRROR_PREFIX = "mammoth_editor_my_apartment_mirror:";
const GROUP_PREFIX = "mammoth_editor_my_apartment_group:";

export function editorMyApartmentSelectedIdForDecor(
  decorId: string,
): string {
  return `${DECOR_PREFIX}${decorId}`;
}

export function editorMyApartmentSelectedIdForWall(wallId: string): string {
  return `${WALL_PREFIX}${wallId}`;
}

export function editorMyApartmentSelectedIdForMirror(mirrorId: string): string {
  return `${MIRROR_PREFIX}${mirrorId}`;
}

export function parseMyApartmentLayoutWallSelectedId(id: string | null): string | null {
  if (!id || !id.startsWith(WALL_PREFIX)) return null;
  const rest = id.slice(WALL_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

export function parseMyApartmentLayoutDecorSelectedId(
  id: string | null,
): string | null {
  if (!id || !id.startsWith(DECOR_PREFIX)) return null;
  const rest = id.slice(DECOR_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

export function parseMyApartmentLayoutMirrorSelectedId(id: string | null): string | null {
  if (!id || !id.startsWith(MIRROR_PREFIX)) return null;
  const rest = id.slice(MIRROR_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

/** Saved object groups use this synthetic selection id (`…group:<opaque id>`). */
export function editorMyApartmentSelectedIdForSavedObjectGroup(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

export function parseMyApartmentLayoutSavedObjectGroupId(
  id: string | null,
): string | null {
  if (!id || !id.startsWith(GROUP_PREFIX)) return null;
  const rest = id.slice(GROUP_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

/** Only décor, mirrors, and slab walls participate in Ctrl multiselect / grouping. */
export function isMyApartmentLayoutGroupablePlacementSelectedId(
  id: string | null,
): boolean {
  if (!id) return false;
  return (
    id.startsWith(DECOR_PREFIX) ||
    id.startsWith(WALL_PREFIX) ||
    id.startsWith(MIRROR_PREFIX)
  );
}
