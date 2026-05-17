import * as THREE from "three";
import type { EditorState } from "../../state/editorStoreTypes.js";
import {
  parseMyApartmentLayoutSavedObjectGroupId,
  isMyApartmentLayoutGroupablePlacementSelectedId,
} from "./editorMyApartmentSelection.js";
import { getEditorMyApartmentStaticSelectionGroupsMap } from "./editorMyApartmentPieceGroupBridge.js";

/** Targets for preview selection shells in apartment authoring (décor slabs, walls, saved groups). */
export function apartmentLayoutOutlineTargetGroups(st: EditorState): THREE.Group[] {
  const map = getEditorMyApartmentStaticSelectionGroupsMap();
  if (!map || st.mode !== "my_apartment_layout") return [];

  const savedGroupId = parseMyApartmentLayoutSavedObjectGroupId(st.selectedId);
  if (savedGroupId) {
    const def = st.ownedApartmentBuiltins.objectGroups.find((g) => g.id === savedGroupId);
    if (!def) return [];
    const out: THREE.Group[] = [];
    for (const memberId of def.memberSelectedIds) {
      const g = map[memberId];
      if (g instanceof THREE.Group) out.push(g);
    }
    return out;
  }

  const multiset = new Set<string>();
  for (const extra of st.myApartmentMultiselectExtraIds) {
    if (isMyApartmentLayoutGroupablePlacementSelectedId(extra)) multiset.add(extra);
  }
  const primary = st.selectedId;
  if (primary && isMyApartmentLayoutGroupablePlacementSelectedId(primary)) multiset.add(primary);

  if (multiset.size >= 2) {
    const ordered = [...multiset].sort((a, b) => a.localeCompare(b));
    const out: THREE.Group[] = [];
    for (const id of ordered) {
      const g = map[id];
      if (g instanceof THREE.Group) out.push(g);
    }
    return out;
  }

  if (multiset.size === 1) {
    const only = [...multiset][0]!;
    const g = map[only];
    return g instanceof THREE.Group ? [g] : [];
  }

  if (typeof st.selectedId === "string") {
    const g = map[st.selectedId];
    return g instanceof THREE.Group ? [g] : [];
  }

  return [];
}
