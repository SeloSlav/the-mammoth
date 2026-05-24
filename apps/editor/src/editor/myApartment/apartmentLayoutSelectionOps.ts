import {
  parseMyApartmentLayoutSavedObjectGroupId,
  isMyApartmentLayoutGroupablePlacementSelectedId,
} from "./editorMyApartmentSelection.js";

export type ApartmentPlacementPickOutcome = {
  selectedId: string | null;
  myApartmentMultiselectExtraIds: readonly string[];
};

export type ApartmentPlacementActivationOutcome = ApartmentPlacementPickOutcome & {
  myApartmentLayoutTransformArmed: boolean;
};

/**
 * Two-step apartment placement pick:
 * - 1st click on a placement → select only (no gizmo / pink outline)
 * - 2nd click on the same placement → arm transform + pink wireframe outline
 */
export function resolveApartmentLayoutPlacementActivation(opts: {
  clickedId: string | null;
  additive: boolean;
  selectedId: string | null;
  previousExtras: readonly string[];
  transformArmed: boolean;
}): ApartmentPlacementActivationOutcome {
  const { clickedId, additive, selectedId, previousExtras, transformArmed } = opts;

  if (!clickedId) {
    return {
      selectedId: null,
      myApartmentMultiselectExtraIds: [],
      myApartmentLayoutTransformArmed: false,
    };
  }

  if (additive) {
    const out = computeApartmentPlacementCanvasPick({
      clickedId,
      additive: true,
      previousSelectedId: selectedId,
      previousExtras,
    });
    return { ...out, myApartmentLayoutTransformArmed: false };
  }

  if (clickedId === selectedId) {
    if (!transformArmed) {
      return {
        selectedId,
        myApartmentMultiselectExtraIds: previousExtras,
        myApartmentLayoutTransformArmed: true,
      };
    }
    return {
      selectedId,
      myApartmentMultiselectExtraIds: previousExtras,
      myApartmentLayoutTransformArmed: true,
    };
  }

  const out = computeApartmentPlacementCanvasPick({
    clickedId,
    additive: false,
    previousSelectedId: selectedId,
    previousExtras,
  });
  return { ...out, myApartmentLayoutTransformArmed: false };
}

/** Lex-sort placement ids so history/tests stay deterministic (extras exclude primary). */
function sortExtras(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)].filter(Boolean).slice().sort((a, b) => a.localeCompare(b));
}

/**
 * Applies apartment canvas click selection with optional Ctrl/Cmd additive multiselect
 * over decor/wall placement ids only.
 */
export function computeApartmentPlacementCanvasPick(opts: {
  clickedId: string | null;
  additive: boolean;
  previousSelectedId: string | null;
  previousExtras: readonly string[];
}): ApartmentPlacementPickOutcome {
  const { clickedId, additive, previousSelectedId, previousExtras } = opts;

  /** Empty click — clear placement multiselection. */
  if (!clickedId) {
    return { selectedId: null, myApartmentMultiselectExtraIds: [] };
  }

  if (!additive) {
    return { selectedId: clickedId, myApartmentMultiselectExtraIds: [] };
  }

  if (!isMyApartmentLayoutGroupablePlacementSelectedId(clickedId)) {
    return { selectedId: clickedId, myApartmentMultiselectExtraIds: [] };
  }

  /** Any saved-object-group selection behaves like starting a fresh multiset. */
  let multiset = new Set<string>();
  const groupStale = Boolean(
    previousSelectedId && parseMyApartmentLayoutSavedObjectGroupId(previousSelectedId),
  );

  if (!previousSelectedId || groupStale) {
    multiset.add(clickedId);
  } else if (isMyApartmentLayoutGroupablePlacementSelectedId(previousSelectedId)) {
    multiset = new Set<string>([
      previousSelectedId,
      ...previousExtras.filter(isMyApartmentLayoutGroupablePlacementSelectedId),
    ]);
    if (multiset.has(clickedId)) multiset.delete(clickedId);
    else multiset.add(clickedId);
  } else {
    multiset.add(clickedId);
  }

  if (multiset.size === 0) {
    return { selectedId: null, myApartmentMultiselectExtraIds: [] };
  }

  if (multiset.size === 1) {
    const only = [...multiset][0]!;
    return { selectedId: only, myApartmentMultiselectExtraIds: [] };
  }

  /** Anchor inspector + gizmo-ish behavior on the interacted id when it survives the toggle. */
  let anchor = clickedId;
  if (!multiset.has(anchor)) {
    anchor = [...multiset].slice().sort((a, b) => a.localeCompare(b))[0]!;
  }
  const extras = [...multiset].filter((id) => id !== anchor);

  return {
    selectedId: anchor,
    myApartmentMultiselectExtraIds: sortExtras(extras),
  };
}
