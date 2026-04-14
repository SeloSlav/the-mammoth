import { useEffect, useMemo, useState } from "react";
import type {
  CellDoc,
  FloorDoc,
  FloorOverrideDoc,
  InteriorDoc,
  PrefabDef,
} from "@the-mammoth/schemas";

export function useEditorChromeSelectionMeta(
  activeFloorDoc: FloorDoc | undefined,
  activeInteriorDoc: InteriorDoc | undefined,
  activeCellDoc: CellDoc | undefined,
  activePrefabDef: PrefabDef | undefined,
  activeFloorOverrideDoc: FloorOverrideDoc | undefined,
  selectedId: string | null,
) {
  const selectedFloorObj = useMemo(() => {
    if (!activeFloorDoc || !selectedId) return null;
    return activeFloorDoc.objects.find((o) => o.id === selectedId) ?? null;
  }, [activeFloorDoc, selectedId]);

  const selectedInteriorPl = useMemo(() => {
    if (!activeInteriorDoc || !selectedId) return null;
    return activeInteriorDoc.placements.find((p) => p.entityId === selectedId) ?? null;
  }, [activeInteriorDoc, selectedId]);

  const selectedCellPl = useMemo(() => {
    if (!activeCellDoc || !selectedId) return null;
    return activeCellDoc.placements.find((p) => p.entityId === selectedId) ?? null;
  }, [activeCellDoc, selectedId]);

  const selectedPrefabComponent = useMemo(() => {
    if (!activePrefabDef || !selectedId) return null;
    return activePrefabDef.components.find((p) => p.id === selectedId) ?? null;
  }, [activePrefabDef, selectedId]);

  const selectedFloorOverridePatch = useMemo(() => {
    if (!activeFloorOverrideDoc || !selectedId) return null;
    return (
      activeFloorOverrideDoc.objectPatches.find((p) => p.targetObjectId === selectedId) ?? null
    );
  }, [activeFloorOverrideDoc, selectedId]);

  const [metaText, setMetaText] = useState("");
  const [metaErr, setMetaErr] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFloorObj) {
      setMetaText(
        selectedFloorObj.metadata
          ? JSON.stringify(selectedFloorObj.metadata, null, 2)
          : "",
      );
      setMetaErr(null);
    } else if (selectedInteriorPl) {
      setMetaText(
        selectedInteriorPl.overrides
          ? JSON.stringify(selectedInteriorPl.overrides, null, 2)
          : "",
      );
      setMetaErr(null);
    } else if (selectedCellPl) {
      setMetaText(
        selectedCellPl.overrides
          ? JSON.stringify(selectedCellPl.overrides, null, 2)
          : "",
      );
      setMetaErr(null);
    } else if (selectedPrefabComponent) {
      setMetaText(
        selectedPrefabComponent.metadata
          ? JSON.stringify(selectedPrefabComponent.metadata, null, 2)
          : "",
      );
      setMetaErr(null);
    } else if (selectedFloorOverridePatch) {
      setMetaText(
        selectedFloorOverridePatch.patch.metadata
          ? JSON.stringify(selectedFloorOverridePatch.patch.metadata, null, 2)
          : "",
      );
      setMetaErr(null);
    } else {
      setMetaText("");
    }
  }, [
    selectedFloorObj,
    selectedInteriorPl,
    selectedCellPl,
    selectedPrefabComponent,
    selectedFloorOverridePatch,
  ]);

  return {
    selectedFloorObj,
    selectedInteriorPl,
    selectedCellPl,
    selectedPrefabComponent,
    selectedFloorOverridePatch,
    metaText,
    setMetaText,
    metaErr,
    setMetaErr,
  };
}
