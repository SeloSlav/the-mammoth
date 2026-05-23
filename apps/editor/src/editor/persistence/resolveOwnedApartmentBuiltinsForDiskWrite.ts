import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  type OwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import type { EditorState } from "../../state/editorStoreTypes.js";

/**
 * Resolves which in-memory doc should be written to
 * `content/apartment/owned_apartment_builtins.json`.
 *
 * While authoring the player-owned default layout, the live buffer is
 * {@link EditorState.ownedApartmentBuiltins}. The separate
 * {@link EditorState.ownedApartmentDefaultBuiltins} snapshot can fall behind
 * (e.g. bootstrap failed to parse disk JSON but a unit profile still loaded).
 */
export function resolveOwnedApartmentBuiltinsForDiskWrite(
  st: Pick<
    EditorState,
    | "mode"
    | "activeApartmentLayoutSource"
    | "ownedApartmentBuiltins"
    | "ownedApartmentDefaultBuiltins"
  >,
): OwnedApartmentBuiltinsDoc {
  const live = st.ownedApartmentBuiltins;
  const defaultSnapshot = st.ownedApartmentDefaultBuiltins;

  if (
    st.mode === "my_apartment_layout" &&
    st.activeApartmentLayoutSource === "owned_default"
  ) {
    return live;
  }

  const defaultBuiltinCount =
    DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems.length;
  const snapshotLooksLikeBuiltinDefault =
    defaultSnapshot.placedItems.length <= defaultBuiltinCount;
  const liveIsRicher = live.placedItems.length > defaultSnapshot.placedItems.length;

  if (
    st.activeApartmentLayoutSource === "owned_default" &&
    snapshotLooksLikeBuiltinDefault &&
    liveIsRicher
  ) {
    console.warn(
      "[editor] ownedApartmentDefaultBuiltins looks stale; saving live owned-default layout instead.",
      {
        livePlaced: live.placedItems.length,
        defaultPlaced: defaultSnapshot.placedItems.length,
      },
    );
    return live;
  }

  return defaultSnapshot;
}

/** Minimum placed-item count on disk before we treat a default-sized save as destructive. */
export const OWNED_APARTMENT_BUILTINS_DESTRUCTIVE_SAVE_MIN_EXISTING_PLACED = 10;

export function isDestructiveOwnedApartmentBuiltinsOverwrite(args: {
  existingPlacedCount: number;
  nextPlacedCount: number;
}): boolean {
  const defaultPlacedCount =
    DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems.length;
  return (
    args.existingPlacedCount >=
      OWNED_APARTMENT_BUILTINS_DESTRUCTIVE_SAVE_MIN_EXISTING_PLACED &&
    args.nextPlacedCount <= defaultPlacedCount
  );
}
