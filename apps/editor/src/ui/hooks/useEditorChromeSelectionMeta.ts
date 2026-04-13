import { useEffect, useMemo, useState } from "react";
import type { FloorDoc, InteriorDoc } from "@the-mammoth/schemas";

export function useEditorChromeSelectionMeta(
  activeFloorDoc: FloorDoc | undefined,
  activeInteriorDoc: InteriorDoc | undefined,
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
    } else {
      setMetaText("");
    }
  }, [selectedFloorObj, selectedInteriorPl]);

  return {
    selectedFloorObj,
    selectedInteriorPl,
    metaText,
    setMetaText,
    metaErr,
    setMetaErr,
  };
}
