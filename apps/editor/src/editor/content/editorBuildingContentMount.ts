import * as THREE from "three";
import type {
  BuildingDoc,
  CellDoc,
  ElevatorCabDef,
  FloorDoc,
  FloorOverrideDoc,
  InteriorDoc,
  LandingKitDef,
  OwnedApartmentBuiltinsDoc,
  PrefabDef,
  StairWellDef,
} from "@the-mammoth/schemas";
import {
  buildFloorShortLabelMap,
  buildCellMeshes,
  buildStairWellPreviewRoot,
  buildElevatorCabCarPreviewRoot,
  buildInteriorMeshes,
  buildLandingDoorPreviewRoot,
  type BuildStairWellPreviewRootArgs,
  exteriorFacesForPlacedObjectInFloor,
  elevatorHoistwayInnerHalfExtents,
  instantiateBuildingFloorStack,
  listElevatorShaftLayouts,
  mergeShaftExteriorHints,
  resolveLandingDims,
  readShaftFacadeHintFaces,
  maxBuildingLevelIndex,
  shaftFacesTowardAdjacentElevatorHoistways,
  shaftDoorTowardPointFromFloorCorridors,
} from "@the-mammoth/world";
import { applyEditorMaterialsToFloorPlacement } from "./applyEditorMaterials.js";
import type { EditorMode, EditorWorkspace } from "../../state/editorStore.js";
import type { StairWellAuthoringScope } from "@the-mammoth/world";
import { buildOwnedApartmentAuthoringShell } from "../myApartment/editorMyApartmentAuthoringShell.js";

function buildPrefabPreview(def: PrefabDef): THREE.Group {
  const root = new THREE.Group();
  root.name = `prefab:${def.id}`;
  for (const component of def.components) {
    const color = component.prefabId ? 0x6f8fb8 : 0x8e7a9a;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.name = component.id;
    mesh.userData.placedObjectId = component.id;
    mesh.position.set(component.position[0], component.position[1], component.position[2]);
    if (component.rotation) {
      mesh.quaternion.set(
        component.rotation[0],
        component.rotation[1],
        component.rotation[2],
        component.rotation[3],
      );
    }
    if (component.scale) {
      mesh.scale.set(component.scale[0], component.scale[1], component.scale[2]);
    }
    root.add(mesh);
  }
  return root;
}

function isStairPrefab(prefabId: string): boolean {
  const pid = prefabId.toLowerCase();
  return pid.includes("stair_well") || pid.includes("stairwell");
}

export function buildEditorStructuralRoot(args: {
  mode: EditorMode;
  workspace: EditorWorkspace;
  ownedApartmentBuiltins: OwnedApartmentBuiltinsDoc;
  building: BuildingDoc;
  floorDocs: Record<string, FloorDoc>;
  floorOverrideDocs: Record<string, FloorOverrideDoc>;
  activeInteriorDocId: string;
  interiorDocs: Record<string, InteriorDoc>;
  activeCellDocId: string;
  cellDocs: Record<string, CellDoc>;
  activePrefabDefId: string | null;
  prefabDefs: Record<string, PrefabDef>;
  activeFloorOverrideDocId: string | null;
  elevatorCabDef: ElevatorCabDef;
  landingKitDef: LandingKitDef;
  stairWellDef: StairWellDef;
  stairWellAuthorScope: StairWellAuthoringScope;
  textureLoader: THREE.TextureLoader;
  emptyFloorDoc: (floorDocId: string) => FloorDoc;
}): THREE.Group {
  if (args.mode === "cab") {
    const root = new THREE.Group();
    root.name = "editor_workspace:cab";
    const layouts = listElevatorShaftLayouts(args.building, (floorDocId) => {
      return args.floorDocs[floorDocId] ?? args.emptyFloorDoc(floorDocId);
    });
    const layout = layouts[0];
    if (!layout) return root;
    const cab = buildElevatorCabCarPreviewRoot({
      layout,
      def: args.elevatorCabDef,
      maxLevel: maxBuildingLevelIndex(args.building),
      floorLabelByLevel: buildFloorShortLabelMap(args.building),
      includeDoors: false,
      doorClearWidthM: resolveLandingDims(args.landingKitDef).panelW,
    });
    root.add(cab);
    return root;
  }

  if (args.mode === "landing_preview") {
    const root = new THREE.Group();
    root.name = "editor_workspace:landing_kit";
    const layouts = listElevatorShaftLayouts(args.building, (floorDocId) => {
      return args.floorDocs[floorDocId] ?? args.emptyFloorDoc(floorDocId);
    });
    const layout = layouts[0];
    if (!layout) return root;
    const { halfX, halfZ } = elevatorHoistwayInnerHalfExtents(layout.sx, layout.sz);
    const door = buildLandingDoorPreviewRoot({
      face: layout.doorFace,
      hx: halfX,
      hz: halfZ,
      def: args.landingKitDef,
      swingOpen01: 0.4,
    });
    root.add(door);
    return root;
  }

  if (args.mode === "stairwell_preview") {
    const root = new THREE.Group();
    root.name = "editor_workspace:stairwell";
    const sortedRefs = [...args.building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
    const preferredRefs =
      args.stairWellAuthorScope === "ground"
        ? sortedRefs.filter((ref) => ref.levelIndex === 1)
        : sortedRefs.filter((ref) => ref.levelIndex !== 1);
    const stairEntry =
      preferredRefs
        .flatMap((ref) => {
          const doc = args.floorDocs[ref.floorDocId] ?? args.emptyFloorDoc(ref.floorDocId);
          return doc.objects.map((obj) => ({ doc, obj }));
        })
        .find(({ obj }) => isStairPrefab(obj.prefabId)) ??
      sortedRefs
        .flatMap((ref) => {
          const doc = args.floorDocs[ref.floorDocId] ?? args.emptyFloorDoc(ref.floorDocId);
          return doc.objects.map((obj) => ({ doc, obj }));
        })
        .find(({ obj }) => isStairPrefab(obj.prefabId));
    if (!stairEntry) return root;
    const { doc: stairDoc, obj: stairObj } = stairEntry;
    const sx = stairObj.scale?.[0] ?? 4.2;
    const sy = stairObj.scale?.[1] ?? 3.2;
    const sz = stairObj.scale?.[2] ?? 4.2;
    const towardPlateXZ = (() => {
      if (stairDoc.objects.length === 0) {
        return [stairObj.position[0], stairObj.position[2]] as const;
      }
      let sumX = 0;
      let sumZ = 0;
      for (const obj of stairDoc.objects) {
        sumX += obj.position[0];
        sumZ += obj.position[2];
      }
      return shaftDoorTowardPointFromFloorCorridors(
        stairObj.position[0],
        stairObj.position[2],
        stairDoc,
        sumX / stairDoc.objects.length,
        sumZ / stairDoc.objects.length,
      );
    })();
    const previewArgs: BuildStairWellPreviewRootArgs = {
      sx,
      sy,
      sz,
      def: args.stairWellDef,
      authoringScope: args.stairWellAuthorScope,
      towardPlateXZ,
      shaftPlateXZ: [stairObj.position[0], stairObj.position[2]],
      shaftExteriorFaces: [
        ...new Set([
          ...mergeShaftExteriorHints(
            exteriorFacesForPlacedObjectInFloor(stairDoc, stairObj),
            readShaftFacadeHintFaces(stairObj.metadata),
          ),
          ...shaftFacesTowardAdjacentElevatorHoistways(stairDoc, stairObj),
        ]),
      ],
    };
    const preview = buildStairWellPreviewRoot(previewArgs);
    root.add(preview);
    return root;
  }

  if (args.mode === "my_apartment_layout") {
    return buildOwnedApartmentAuthoringShell(args.ownedApartmentBuiltins.previewSizeM);
  }

  if (args.mode === "floor" || args.mode === "floor_override") {
    const buildingRoot = instantiateBuildingFloorStack(args.building, (floorDocId) => {
      return args.floorDocs[floorDocId] ?? args.emptyFloorDoc(floorDocId);
    }, {
      getFloorOverrideDoc: (id) => args.floorOverrideDocs[id],
      stairWellDef: args.stairWellDef,
    });
    for (const doc of Object.values(args.floorDocs)) {
      for (const obj of doc.objects) {
        applyEditorMaterialsToFloorPlacement(
          buildingRoot,
          doc.id,
          obj,
          args.textureLoader,
        );
      }
    }
    if (args.workspace === "world") {
      const wrap = new THREE.Group();
      wrap.name = "editor_world_with_cell";
      wrap.add(buildingRoot);
      const cellDoc = args.cellDocs[args.activeCellDocId];
      if (cellDoc) {
        const cellRoot = buildCellMeshes(cellDoc);
        cellRoot.name = `cell:${cellDoc.id}`;
        wrap.add(cellRoot);
      }
      return wrap;
    }
    return buildingRoot;
  }
  if (args.mode === "interior") {
    const doc = args.interiorDocs[args.activeInteriorDocId];
    return doc ? buildInteriorMeshes(doc) : new THREE.Group();
  }
  if (args.mode === "cell") {
    const doc = args.cellDocs[args.activeCellDocId];
    return doc ? buildCellMeshes(doc) : new THREE.Group();
  }
  if (args.mode === "prefab") {
    const doc = args.activePrefabDefId ? args.prefabDefs[args.activePrefabDefId] : undefined;
    return doc ? buildPrefabPreview(doc) : new THREE.Group();
  }
  return new THREE.Group();
}
