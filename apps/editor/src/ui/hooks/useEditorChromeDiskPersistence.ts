import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { ownedDefaultApartmentUnitKey } from "@the-mammoth/world";
import type { CollisionArtifactsStatus } from "../../editor/content/editorContentDiscovery.js";
import { reloadEditorFromContent } from "../../editor/bootstrap/editorBootstrap.js";
import {
  useEditorStore,
  serializeCellDocPretty,
  serializeElevatorCabDefPretty,
  serializeFloorDocPretty,
  serializeFloorOverrideDocPretty,
  serializeInteriorDocPretty,
  serializeLandingKitDefPretty,
  serializePrefabDefPretty,
  serializeStairWellDefPretty,
  serializeApartmentUnitLayoutProfilesDocPretty,
  serializeOwnedApartmentBuiltinsDocPretty,
} from "../../state/editorStore.js";
import { requestEditorMyApartmentLayoutPersistFromScene } from "../../editor/myApartment/editorMyApartmentPieceGroupBridge.js";
import {
  fetchCollisionArtifactsStatus,
  postSaveCell,
  postSaveElevatorCab,
  postSaveFloor,
  postSaveFloorOverride,
  postSaveApartmentKit,
  postSaveInterior,
  postSaveLandingKit,
  postSavePrefab,
  postSaveStairWell,
  postSaveApartmentUnitLayoutProfiles,
  postSaveOwnedApartmentBuiltins,
} from "../editorChromeNetwork.js";
import { resolveOwnedApartmentBuiltinsForDiskWrite } from "../../editor/persistence/resolveOwnedApartmentBuiltinsForDiskWrite.js";

export function useEditorChromeDiskPersistence(
  setSaveMsg: (msg: string | null) => void,
): {
  saveToDiskLabel: string;
  refreshCollisionStatus: () => Promise<void>;
  onReload: () => Promise<void>;
  onSaveDisk: () => Promise<void>;
} {
  const setCollisionArtifactsStatus = useEditorStore(
    (s) => s.setCollisionArtifactsStatus,
  );

  const saveLabelSnapshot = useEditorStore(
    useShallow((s) => ({
      mode: s.mode,
      landingKitVariant: s.landingKitVariant,
      activeFloorDocId: s.activeFloorDocId,
      activeInteriorDocId: s.activeInteriorDocId,
      activeCellDocId: s.activeCellDocId,
      activePrefabDefId: s.activePrefabDefId,
      activeFloorOverrideDocId: s.activeFloorOverrideDocId,
      activeApartmentLayoutSource: s.activeApartmentLayoutSource,
      activeApartmentLayoutProfileId: s.activeApartmentLayoutProfileId,
    })),
  );

  const saveToDiskLabel = useMemo(() => {
    switch (saveLabelSnapshot.mode) {
      case "cab":
        return "Save cab.json";
      case "landing_preview":
        return saveLabelSnapshot.landingKitVariant === "apartment"
          ? "Save apartment door kit"
          : "Save landing kit";
      case "stairwell_preview":
        return "Save stairwell.json";
      case "floor":
        return `Save floor ${saveLabelSnapshot.activeFloorDocId}`;
      case "interior":
        return `Save interior ${saveLabelSnapshot.activeInteriorDocId}`;
      case "cell":
        return `Save cell ${saveLabelSnapshot.activeCellDocId}`;
      case "prefab":
        return saveLabelSnapshot.activePrefabDefId
          ? `Save prefab ${saveLabelSnapshot.activePrefabDefId}`
          : "Save prefab";
      case "floor_override":
        return saveLabelSnapshot.activeFloorOverrideDocId
          ? `Save floor override ${saveLabelSnapshot.activeFloorOverrideDocId}`
          : "Save floor override";
      case "my_apartment_layout":
        return saveLabelSnapshot.activeApartmentLayoutSource === "owned_default"
          ? "Save owned default to disk"
          : "Save profile to disk";
      default:
        return "Save to disk";
    }
  }, [saveLabelSnapshot]);

  const refreshCollisionStatus = useCallback(async () => {
    try {
      const next =
        (await fetchCollisionArtifactsStatus()) as CollisionArtifactsStatus | null;
      setCollisionArtifactsStatus(next ?? null);
    } catch {
      /* ignore */
    }
  }, [setCollisionArtifactsStatus]);

  useEffect(() => {
    void refreshCollisionStatus();
  }, [refreshCollisionStatus]);

  const onReload = useCallback(async () => {
    setSaveMsg(null);
    try {
      await reloadEditorFromContent();
      await refreshCollisionStatus();
      setSaveMsg("Reloaded from disk.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [refreshCollisionStatus, setSaveMsg]);

  const onSaveDisk = useCallback(async () => {
    setSaveMsg(null);
    try {
      const s = useEditorStore.getState();
      const needsOwnedAptBuiltinsFlush = s.ownedApartmentBuiltinsNeedsDiskFlush;
      const needsApartmentProfilesFlush = s.apartmentUnitLayoutProfilesNeedsDiskFlush;
      let wroteOwnedApartmentBuiltins = false;
      let wroteApartmentProfiles = false;
      if (s.mode === "cab") {
        await postSaveElevatorCab(
          serializeElevatorCabDefPretty(s.elevatorCabDef),
        );
      } else if (s.mode === "landing_preview") {
        const body = serializeLandingKitDefPretty(s.landingKitDef);
        if (s.landingKitVariant === "apartment") {
          await postSaveApartmentKit(body);
        } else {
          await postSaveLandingKit(body);
        }
      } else if (s.mode === "stairwell_preview") {
        await postSaveStairWell(serializeStairWellDefPretty(s.stairWellDef));
      } else if (s.mode === "floor") {
        const doc = s.floorDocs[s.activeFloorDocId];
        if (!doc) throw new Error("No active floor doc");
        await postSaveFloor(s.activeFloorDocId, serializeFloorDocPretty(doc));
      } else if (s.mode === "interior") {
        const doc = s.interiorDocs[s.activeInteriorDocId];
        if (!doc) throw new Error("No active interior doc");
        await postSaveInterior(
          s.activeInteriorDocId,
          serializeInteriorDocPretty(doc),
        );
      } else if (s.mode === "cell") {
        const doc = s.cellDocs[s.activeCellDocId];
        if (!doc) throw new Error("No active cell doc");
        await postSaveCell(s.activeCellDocId, serializeCellDocPretty(doc));
      } else if (s.mode === "prefab") {
        if (!s.activePrefabDefId || !s.prefabDefs[s.activePrefabDefId]) {
          throw new Error("No active prefab def");
        }
        await postSavePrefab(
          s.activePrefabDefId,
          serializePrefabDefPretty(s.prefabDefs[s.activePrefabDefId]!),
        );
      } else if (s.mode === "floor_override") {
        if (
          !s.activeFloorOverrideDocId ||
          !s.floorOverrideDocs[s.activeFloorOverrideDocId]
        ) {
          throw new Error("No active floor override doc");
        }
        await postSaveFloorOverride(
          s.activeFloorOverrideDocId,
          serializeFloorOverrideDocPretty(
            s.floorOverrideDocs[s.activeFloorOverrideDocId]!,
          ),
        );
      } else if (s.mode === "my_apartment_layout") {
        requestEditorMyApartmentLayoutPersistFromScene();
        const stAfterPersist = useEditorStore.getState();
        if (stAfterPersist.activeApartmentLayoutSource === "unassigned") {
          throw new Error("Create or select an apartment layout profile before saving this apartment.");
        }
        if (stAfterPersist.activeApartmentLayoutSource === "profile") {
          await postSaveApartmentUnitLayoutProfiles(
            serializeApartmentUnitLayoutProfilesDocPretty(
              stAfterPersist.apartmentUnitLayoutProfiles,
            ),
          );
          wroteApartmentProfiles = true;
        } else {
          if (
            stAfterPersist.myApartmentPreviewUnitKey !==
            ownedDefaultApartmentUnitKey(stAfterPersist.building)
          ) {
            throw new Error(
              "Only the player-owned home unit can save owned_apartment_builtins.json. Create this unit's own profile first.",
            );
          }
          await postSaveOwnedApartmentBuiltins(
            serializeOwnedApartmentBuiltinsDocPretty(
              resolveOwnedApartmentBuiltinsForDiskWrite(stAfterPersist),
            ),
          );
          wroteOwnedApartmentBuiltins = true;
        }
      }

      if (!wroteOwnedApartmentBuiltins && needsOwnedAptBuiltinsFlush) {
        requestEditorMyApartmentLayoutPersistFromScene();
        const st = useEditorStore.getState();
        await postSaveOwnedApartmentBuiltins(
          serializeOwnedApartmentBuiltinsDocPretty(
            resolveOwnedApartmentBuiltinsForDiskWrite(st),
          ),
        );
        wroteOwnedApartmentBuiltins = true;
      }

      if (!wroteApartmentProfiles && needsApartmentProfilesFlush) {
        requestEditorMyApartmentLayoutPersistFromScene();
        const st = useEditorStore.getState();
        await postSaveApartmentUnitLayoutProfiles(
          serializeApartmentUnitLayoutProfilesDocPretty(st.apartmentUnitLayoutProfiles),
        );
        wroteApartmentProfiles = true;
      }

      if (wroteOwnedApartmentBuiltins) {
        useEditorStore.getState().clearOwnedApartmentBuiltinsDiskFlushFlag();
      }
      if (wroteApartmentProfiles) {
        useEditorStore.getState().clearApartmentUnitLayoutProfilesDiskFlushFlag();
      }

      useEditorStore.getState().setDirty(false);
      await refreshCollisionStatus();
      const flushedAptLayoutExtra =
        wroteOwnedApartmentBuiltins && s.mode !== "my_apartment_layout";
      if (s.mode === "my_apartment_layout" && wroteApartmentProfiles && !wroteOwnedApartmentBuiltins) {
        setSaveMsg("Saved content/apartment/unit_layout_profiles.json.");
      } else if (s.mode === "my_apartment_layout") {
        setSaveMsg(
          "Saved content/apartment/owned_apartment_builtins.json.",
        );
      } else if (flushedAptLayoutExtra) {
        setSaveMsg(
          "Saved to content/ and content/apartment/owned_apartment_builtins.json (bed / wardrobe / footlocker + imported decor).",
        );
      } else {
        setSaveMsg("Saved to content/.");
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [refreshCollisionStatus, setSaveMsg]);

  return { saveToDiskLabel, refreshCollisionStatus, onReload, onSaveDisk };
}
