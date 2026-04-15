import type { CSSProperties } from "react";
import { useState } from "react";
import type {
  CellPlacement,
  ElevatorCabDef,
  FloorOverrideObjectPatch,
  LandingKitDef,
  PlacedObject,
  PrefabComponent,
  StairWellDef,
} from "@the-mammoth/schemas";
import {
  LANDING_DOOR_OPENING_PROXY_ID,
  resolveGlassOpening,
  STAIR_WELL_OPENING_PROXY_ID,
} from "@the-mammoth/world";
import { describeEditorSaveTarget } from "../editor/editorOwnershipResolve.js";
import type { EditorState, EditorMode, EditorWorkspace } from "../state/editorStore.js";

function readScale(s: [number, number, number] | undefined): [number, number, number] {
  return [s?.[0] ?? 1, s?.[1] ?? 1, s?.[2] ?? 1];
}

type ElevatorDoorFace = "e" | "w" | "n" | "s";

function isElevatorFace(value: unknown): value is ElevatorDoorFace {
  return value === "e" || value === "w" || value === "n" || value === "s";
}

function stairOpeningForScope(
  def: StairWellDef,
  scope: "typical" | "ground",
): NonNullable<StairWellDef["entryOpening"]> | undefined {
  return scope === "ground" ? (def.groundEntryOpening ?? def.entryOpening) : def.entryOpening;
}

export function EditorChromeInspector(props: {
  workspace: EditorWorkspace;
  mode: EditorMode;
  elevatorCabDef: ElevatorCabDef;
  landingKitDef: LandingKitDef;
  stairWellDef: StairWellDef;
  stairWellAuthorScope: "typical" | "ground";
  patchElevatorCabDef: EditorState["patchElevatorCabDef"];
  patchLandingKitDef: EditorState["patchLandingKitDef"];
  patchStairWellDef: EditorState["patchStairWellDef"];
  selectedId: string | null;
  selectedFloorObj: PlacedObject | null;
  selectedInteriorPl: CellPlacement | null;
  selectedCellPl: CellPlacement | null;
  selectedPrefabComponent: PrefabComponent | null;
  selectedFloorOverridePatch: FloorOverrideObjectPatch | null;
  activeFloorDocId: string;
  activeInteriorDocId: string;
  activeCellDocId: string;
  activePrefabDefId: string | null;
  activeFloorOverrideDocId: string | null;
  metaText: string;
  setMetaText: (t: string) => void;
  metaErr: string | null;
  setMetaErr: (e: string | null) => void;
  euler: [number, number, number];
  updateEuler: (ix: 0 | 1 | 2, v: number) => void;
  updatePlacedObject: EditorState["updatePlacedObject"];
  updateInteriorPlacement: EditorState["updateInteriorPlacement"];
  updateCellPlacement: EditorState["updateCellPlacement"];
  updatePrefabComponent: EditorState["updatePrefabComponent"];
  updateFloorOverrideObjectPatch: EditorState["updateFloorOverrideObjectPatch"];
  label: CSSProperties;
  input: CSSProperties;
}) {
  const {
    workspace,
    mode,
    elevatorCabDef,
    landingKitDef,
    stairWellDef,
    stairWellAuthorScope,
    patchElevatorCabDef,
    patchLandingKitDef,
    patchStairWellDef,
    selectedId,
    selectedFloorObj,
    selectedInteriorPl,
    selectedCellPl,
    selectedPrefabComponent,
    selectedFloorOverridePatch,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activeFloorOverrideDocId,
    metaText,
    setMetaText,
    metaErr,
    setMetaErr,
    euler,
    updateEuler,
    updatePlacedObject,
    updateInteriorPlacement,
    updateCellPlacement,
    updatePrefabComponent,
    updateFloorOverrideObjectPatch,
    label,
    input,
  } = props;

  const [uniformScale, setUniformScale] = useState(false);
  const elevatorDoorFaceOverride = isElevatorFace(selectedFloorObj?.metadata?.elevatorDoorFace)
    ? selectedFloorObj.metadata.elevatorDoorFace
    : "auto";

  const saveTarget = describeEditorSaveTarget({
    workspace,
    mode,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activeFloorOverrideDocId,
  });
  const resolvedGlassOpening = resolveGlassOpening(landingKitDef);

  const patchSelectedFloorMetadata = (mutate: (next: Record<string, unknown>) => void) => {
    if (!selectedFloorObj) return;
    const next = { ...(selectedFloorObj.metadata ?? {}) } as Record<string, unknown>;
    mutate(next);
    if (Object.keys(next).length === 0) {
      updatePlacedObject(activeFloorDocId, selectedFloorObj.id, { metadata: undefined });
      setMetaText("");
      setMetaErr(null);
      return;
    }
    updatePlacedObject(activeFloorDocId, selectedFloorObj.id, { metadata: next });
    setMetaText(JSON.stringify(next, null, 2));
    setMetaErr(null);
  };

  return (
    <>
      <span style={label}>Inspector</span>
      <div
        style={{
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 4,
          background:
            saveTarget.kind === "shared"
              ? "rgba(80,120,160,0.22)"
              : saveTarget.kind === "local"
                ? "rgba(60,110,70,0.2)"
                : "rgba(50,50,55,0.35)",
          border: "1px solid #333",
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          Save target:{" "}
          {saveTarget.kind === "shared"
            ? "Shared"
            : saveTarget.kind === "local"
              ? "Local"
              : "—"}
        </div>
        <div style={{ opacity: 0.92 }}>{saveTarget.title}</div>
        <div style={{ opacity: 0.72, fontSize: 11 }}>{saveTarget.detail}</div>
      </div>

      {mode === "cab" ? (
        <>
          <label style={label}>ElevatorCabDef — material slots</label>
          <p style={{ margin: "4px 0 8px", fontSize: 11, opacity: 0.75 }}>
            Author color plus optional <code>mapUrl</code>. Rebuilds the shared cab look in preview and gameplay.
          </p>
          {(["wall", "floor", "door", "ceiling"] as const).map((slot) => (
            <div key={slot} style={{ marginBottom: 10 }}>
              <label style={{ ...label, textTransform: "none" }}>{slot}</label>
              <input
                style={input}
                placeholder="mapUrl"
                value={elevatorCabDef.materials?.[slot]?.mapUrl ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  patchElevatorCabDef((d) => ({
                    ...d,
                    materials: {
                      ...d.materials,
                      [slot]: { ...d.materials?.[slot], mapUrl: v || undefined },
                    },
                  }));
                }}
              />
              <input
                style={{ ...input, marginTop: 6 }}
                placeholder="colorHex"
                value={elevatorCabDef.materials?.[slot]?.colorHex ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  patchElevatorCabDef((d) => ({
                    ...d,
                    materials: {
                      ...d.materials,
                      [slot]: { ...d.materials?.[slot], colorHex: v || undefined },
                    },
                  }));
                }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                <input
                  style={input}
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  placeholder="roughness"
                  value={elevatorCabDef.materials?.[slot]?.roughness ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    patchElevatorCabDef((d) => ({
                      ...d,
                      materials: {
                        ...d.materials,
                        [slot]: {
                          ...d.materials?.[slot],
                          roughness: Number.isFinite(v) ? v : undefined,
                        },
                      },
                    }));
                  }}
                />
                <input
                  style={input}
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  placeholder="metalness"
                  value={elevatorCabDef.materials?.[slot]?.metalness ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    patchElevatorCabDef((d) => ({
                      ...d,
                      materials: {
                        ...d.materials,
                        [slot]: {
                          ...d.materials?.[slot],
                          metalness: Number.isFinite(v) ? v : undefined,
                        },
                      },
                    }));
                  }}
                />
              </div>
            </div>
          ))}
        </>
      ) : null}

      {mode === "landing_preview" ? (
        <>
          <label style={label}>
            Corridor door kit (<code>LandingKitDef</code>) — material slots
          </label>
          <p style={{ margin: "4px 0 8px", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
            Author optional <code>mapUrl</code> textures for the frame and glass so preview and gameplay use the same corridor-door look.
          </p>
          <label style={{ ...label, textTransform: "none" }}>frame</label>
          <input
            style={input}
            placeholder="frame mapUrl"
            value={landingKitDef.materials?.frame?.mapUrl ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              patchLandingKitDef((d) => ({
                ...d,
                materials: {
                  ...d.materials,
                  frame: { ...d.materials?.frame, mapUrl: v || undefined },
                },
              }));
            }}
          />
          <input
            style={{ ...input, marginTop: 6 }}
            placeholder="frame colorHex"
            value={landingKitDef.materials?.frame?.colorHex ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              patchLandingKitDef((d) => ({
                ...d,
                materials: {
                  ...d.materials,
                  frame: { ...d.materials?.frame, colorHex: v || undefined },
                },
              }));
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
            <input
              style={input}
              type="number"
              step={0.05}
              min={0}
              max={1}
              placeholder="frame roughness"
              value={landingKitDef.materials?.frame?.roughness ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                patchLandingKitDef((d) => ({
                  ...d,
                  materials: {
                    ...d.materials,
                    frame: {
                      ...d.materials?.frame,
                      roughness: Number.isFinite(v) ? v : undefined,
                    },
                  },
                }));
              }}
            />
            <input
              style={input}
              type="number"
              step={0.05}
              min={0}
              max={1}
              placeholder="frame metalness"
              value={landingKitDef.materials?.frame?.metalness ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                patchLandingKitDef((d) => ({
                  ...d,
                  materials: {
                    ...d.materials,
                    frame: {
                      ...d.materials?.frame,
                      metalness: Number.isFinite(v) ? v : undefined,
                    },
                  },
                }));
              }}
            />
          </div>
          <label style={{ ...label, marginTop: 8, textTransform: "none" }}>glass</label>
          <input
            style={input}
            placeholder="glass mapUrl"
            value={landingKitDef.materials?.glass?.mapUrl ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              patchLandingKitDef((d) => ({
                ...d,
                materials: {
                  ...d.materials,
                  glass: { ...d.materials?.glass, mapUrl: v || undefined },
                },
              }));
            }}
          />
          <input
            style={{ ...input, marginTop: 6 }}
            placeholder="glass colorHex"
            value={landingKitDef.materials?.glass?.colorHex ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              patchLandingKitDef((d) => ({
                ...d,
                materials: {
                  ...d.materials,
                  glass: { ...d.materials?.glass, colorHex: v || undefined },
                },
              }));
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
            <label style={{ ...label, textTransform: "none" }}>
              glass roughness
              <input
                style={{ ...input, marginTop: 4 }}
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={landingKitDef.materials?.glass?.roughness ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  patchLandingKitDef((d) => ({
                    ...d,
                    materials: {
                      ...d.materials,
                      glass: {
                        ...d.materials?.glass,
                        roughness: Number.isFinite(v) ? v : undefined,
                      },
                    },
                  }));
                }}
              />
            </label>
            <label style={{ ...label, textTransform: "none" }}>
              glass transmission
              <input
                style={{ ...input, marginTop: 4 }}
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={landingKitDef.materials?.glass?.transmission ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  patchLandingKitDef((d) => ({
                    ...d,
                    materials: {
                      ...d.materials,
                      glass: {
                        ...d.materials?.glass,
                        transmission: Number.isFinite(v) ? v : undefined,
                      },
                    },
                  }));
                }}
              />
            </label>
            <label style={{ ...label, textTransform: "none" }}>
              glass metalness
              <input
                style={{ ...input, marginTop: 4 }}
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={landingKitDef.materials?.glass?.metalness ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  patchLandingKitDef((d) => ({
                    ...d,
                    materials: {
                      ...d.materials,
                      glass: {
                        ...d.materials?.glass,
                        metalness: Number.isFinite(v) ? v : undefined,
                      },
                    },
                  }));
                }}
              />
            </label>
            <label style={{ ...label, textTransform: "none" }}>
              exterior swing (rad)
              <input
                style={{ ...input, marginTop: 4 }}
                type="number"
                step={0.05}
                min={0.1}
                value={landingKitDef.exteriorSwingMaxRad ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  patchLandingKitDef((d) => ({
                    ...d,
                    exteriorSwingMaxRad: Number.isFinite(v) ? v : undefined,
                  }));
                }}
              />
            </label>
          </div>
          <label style={{ ...label, marginTop: 8 }}>Glass opening (m)</label>
          <p style={{ margin: "4px 0 6px", fontSize: 11, opacity: 0.75, lineHeight: 1.35 }}>
            Outer size of the framed hole; rails/stiles and glass rebuild from these values. You can
            also edit with the viewport gizmo on <code>{LANDING_DOOR_OPENING_PROXY_ID}</code>.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {(
              [
                ["widthM", "width", 0.02] as const,
                ["heightM", "height", 0.02] as const,
                ["centerYM", "center Y", 0.02] as const,
              ] as const
            ).map(([key, labelText, step]) => (
              <label key={key} style={{ ...label, textTransform: "none" }}>
                {labelText}
                <input
                  style={{ ...input, marginTop: 4 }}
                  type="number"
                                   step={step}
                  value={(() => {
                    if (key === "widthM") return resolvedGlassOpening.widthM;
                    if (key === "heightM") return resolvedGlassOpening.heightM;
                    return resolvedGlassOpening.centerYM;
                  })()}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    patchLandingKitDef((d) => ({
                      ...d,
                      glassOpening: {
                        ...d.glassOpening,
                        [key]: Number.isFinite(v) ? v : undefined,
                      },
                    }));
                  }}
                />
              </label>
            ))}
          </div>
        </>
      ) : null}

      {mode === "stairwell_preview" ? (
        <>
          <label style={label}>StairWellDef — material slots</label>
          <p style={{ margin: "4px 0 8px", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
            Shared stairwell visuals. Author optional <code>mapUrl</code> textures here; material edits rebuild the preview and apply to gameplay too.
          </p>
          {(["wall", "floor", "tread", "landing", "railing"] as const).map((slot) => (
            <div key={slot} style={{ marginBottom: 10 }}>
              <label style={{ ...label, textTransform: "none" }}>{slot}</label>
              <input
                style={input}
                placeholder="mapUrl"
                value={stairWellDef.materials?.[slot]?.mapUrl ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  patchStairWellDef((d) => ({
                    ...d,
                    materials: {
                      ...d.materials,
                      [slot]: { ...d.materials?.[slot], mapUrl: v || undefined },
                    },
                  }));
                }}
              />
              <input
                style={{ ...input, marginTop: 6 }}
                placeholder="colorHex"
                value={stairWellDef.materials?.[slot]?.colorHex ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  patchStairWellDef((d) => ({
                    ...d,
                    materials: {
                      ...d.materials,
                      [slot]: { ...d.materials?.[slot], colorHex: v || undefined },
                    },
                  }));
                }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                <input
                  style={input}
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  placeholder="roughness"
                  value={stairWellDef.materials?.[slot]?.roughness ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    patchStairWellDef((d) => ({
                      ...d,
                      materials: {
                        ...d.materials,
                        [slot]: {
                          ...d.materials?.[slot],
                          roughness: Number.isFinite(v) ? v : undefined,
                        },
                      },
                    }));
                  }}
                />
                <input
                  style={input}
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  placeholder="metalness"
                  value={stairWellDef.materials?.[slot]?.metalness ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    patchStairWellDef((d) => ({
                      ...d,
                      materials: {
                        ...d.materials,
                        [slot]: {
                          ...d.materials?.[slot],
                          metalness: Number.isFinite(v) ? v : undefined,
                        },
                      },
                    }));
                  }}
                />
              </div>
            </div>
          ))}
        </>
      ) : null}

      {mode === "stairwell_preview" ? (
        <>
          <label style={label}>
            Stair entry opening - {stairWellAuthorScope}
          </label>
          <p style={{ margin: "4px 0 8px", fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
            The stairwell hole/door frame is authored once here and reused by preview, world render,
            and collision. Translate the proxy in the viewport to slide it along the wall; scale it
            to change width/height.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <select
              style={input}
              value={stairOpeningForScope(stairWellDef, stairWellAuthorScope)?.face ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                patchStairWellDef((d) => ({
                  ...d,
                  ...(stairWellAuthorScope === "ground"
                    ? {
                        groundEntryOpening: {
                          ...d.groundEntryOpening,
                          face: isElevatorFace(v) ? v : undefined,
                        },
                      }
                    : {
                        entryOpening: {
                          ...d.entryOpening,
                          face: isElevatorFace(v) ? v : undefined,
                        },
                      }),
                }));
              }}
            >
              <option value="">auto face</option>
              <option value="e">east</option>
              <option value="w">west</option>
              <option value="n">north</option>
              <option value="s">south</option>
            </select>
            <input
              style={input}
              type="number"
              step={0.01}
              placeholder="offset along wall (m)"
              value={stairOpeningForScope(stairWellDef, stairWellAuthorScope)?.tangentOffsetAlongWallM ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                patchStairWellDef((d) => ({
                  ...d,
                  ...(stairWellAuthorScope === "ground"
                    ? {
                        groundEntryOpening: {
                          ...d.groundEntryOpening,
                          tangentOffsetAlongWallM: Number.isFinite(v) ? v : undefined,
                        },
                      }
                    : {
                        entryOpening: {
                          ...d.entryOpening,
                          tangentOffsetAlongWallM: Number.isFinite(v) ? v : undefined,
                        },
                      }),
                }));
              }}
            />
            <input
              style={input}
              type="number"
              step={0.01}
              min={0.4}
              placeholder="width (m)"
              value={stairOpeningForScope(stairWellDef, stairWellAuthorScope)?.widthM ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                patchStairWellDef((d) => ({
                  ...d,
                  ...(stairWellAuthorScope === "ground"
                    ? {
                        groundEntryOpening: {
                          ...d.groundEntryOpening,
                          widthM: Number.isFinite(v) ? v : undefined,
                        },
                      }
                    : {
                        entryOpening: {
                          ...d.entryOpening,
                          widthM: Number.isFinite(v) ? v : undefined,
                        },
                      }),
                }));
              }}
            />
            <input
              style={input}
              type="number"
              step={0.01}
              min={0.4}
              placeholder="height (m)"
              value={stairOpeningForScope(stairWellDef, stairWellAuthorScope)?.heightM ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                patchStairWellDef((d) => ({
                  ...d,
                  ...(stairWellAuthorScope === "ground"
                    ? {
                        groundEntryOpening: {
                          ...d.groundEntryOpening,
                          heightM: Number.isFinite(v) ? v : undefined,
                        },
                      }
                    : {
                        entryOpening: {
                          ...d.entryOpening,
                          heightM: Number.isFinite(v) ? v : undefined,
                        },
                      }),
                }));
              }}
            />
            <input
              style={input}
              type="number"
              step={0.01}
              placeholder="center Y (m)"
              value={stairOpeningForScope(stairWellDef, stairWellAuthorScope)?.centerYM ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                patchStairWellDef((d) => ({
                  ...d,
                  ...(stairWellAuthorScope === "ground"
                    ? {
                        groundEntryOpening: {
                          ...d.groundEntryOpening,
                          centerYM: Number.isFinite(v) ? v : undefined,
                        },
                      }
                    : {
                        entryOpening: {
                          ...d.entryOpening,
                          centerYM: Number.isFinite(v) ? v : undefined,
                        },
                      }),
                }));
              }}
            />
          </div>
        </>
      ) : null}

      {mode === "cab" && selectedId ? (
        <>
          <label style={label}>Cab part rotation (° YXZ)</label>
          <p style={{ margin: "4px 0 8px", fontSize: 11, opacity: 0.75 }}>
            Use the gizmo for move/scale; set precise yaw/pitch/roll here.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={1}
                value={euler[i].toFixed(2)}
                onChange={(e) => updateEuler(i, Number(e.target.value) || 0)}
              />
            ))}
          </div>
        </>
      ) : null}

      {mode === "stairwell_preview" &&
      selectedId &&
      selectedId !== STAIR_WELL_OPENING_PROXY_ID ? (
        <>
          <label style={label}>
            Stair part delta rotation (° YXZ) - {stairWellAuthorScope}
          </label>
          <p style={{ margin: "4px 0 8px", fontSize: 11, opacity: 0.75 }}>
            Relative to the generated part. One tweak propagates to every matching tread / wall / post
            in the {stairWellAuthorScope} stairwell scope.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={1}
                value={euler[i].toFixed(2)}
                onChange={(e) => updateEuler(i, Number(e.target.value) || 0)}
              />
            ))}
          </div>
        </>
      ) : null}

      {mode === "landing_preview" && selectedId === "landing_door_kit" ? (
        <p style={{ fontSize: 12, opacity: 0.8, margin: "8px 0 0" }}>
          Full door overview (no transform gizmo). Select <code>{LANDING_DOOR_OPENING_PROXY_ID}</code>{" "}
          in the outliner or click the glass / wireframe in the viewport: translate moves the opening
          vertically; scale mode with axis handles changes width (Z) and height (Y).
        </p>
      ) : null}

      {mode === "landing_preview" && selectedId === LANDING_DOOR_OPENING_PROXY_ID ? (
        <p style={{ fontSize: 12, opacity: 0.8, margin: "8px 0 0" }}>
          Gizmo edits <code>glassOpening</code> (hole size + vertical position). Rotation is not
          saved—use numeric fields above if you need exact numbers.
        </p>
      ) : null}

      {!selectedId &&
      mode !== "cab" &&
      mode !== "landing_preview" &&
      mode !== "stairwell_preview" ? (
        <p style={{ opacity: 0.7 }}>Click a volume in the 3D view or outliner.</p>
      ) : null}
      {!selectedId && mode === "cab" ? (
        <p style={{ opacity: 0.65, fontSize: 12 }}>
          Pick a cab part in the outliner to edit rotation (gizmo moves/scales the part).
        </p>
      ) : null}
      {!selectedId && mode === "landing_preview" ? (
        <p style={{ opacity: 0.65, fontSize: 12 }}>
          Pick <code>landing_door_kit</code> in the outliner to focus the assembly (materials above).
        </p>
      ) : null}
      {!selectedId && mode === "stairwell_preview" ? (
        <p style={{ opacity: 0.65, fontSize: 12 }}>
          Pick a shared stairwell part in the outliner to author a delta transform for the{" "}
          {stairWellAuthorScope} stairwell scope.
        </p>
      ) : null}
      {mode === "stairwell_preview" && selectedId === STAIR_WELL_OPENING_PROXY_ID ? (
        <p style={{ opacity: 0.65, fontSize: 12 }}>
          Gizmo edits the stair entry hole for the {stairWellAuthorScope} scope. Translate slides it
          along the selected wall; scale changes width and height.
        </p>
      ) : null}

      {selectedFloorObj ? (
        <>
          <label style={label}>prefabId</label>
          <input
            style={input}
            value={selectedFloorObj.prefabId}
            onChange={(e) =>
              updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                prefabId: e.target.value,
              })
            }
          />
          <label style={label}>position</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.1}
                value={selectedFloorObj.position[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [...selectedFloorObj.position] as [
                    number,
                    number,
                    number,
                  ];
                  p[i] = Number.isFinite(v) ? v : 0;
                  updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                    position: p,
                  });
                }}
              />
            ))}
          </div>
          <label style={label}>scale</label>
          <label
            style={{
              ...label,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              marginBottom: 4,
            }}
          >
            <input
              type="checkbox"
              checked={uniformScale}
              onChange={(e) => setUniformScale(e.target.checked)}
            />
            Uniform (lock X/Y/Z)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.05}
                value={readScale(selectedFloorObj.scale)[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const t = Number.isFinite(v) ? v : 1;
                  const prev = readScale(selectedFloorObj.scale);
                  const p = uniformScale
                    ? ([t, t, t] as [number, number, number])
                    : ([...prev] as [number, number, number]);
                  if (!uniformScale) p[i] = t;
                  updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                    scale: p,
                  });
                }}
              />
            ))}
          </div>
          <label style={label}>rotation (Euler °, YXZ)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={1}
                value={euler[i].toFixed(2)}
                onChange={(e) => updateEuler(i, Number(e.target.value) || 0)}
              />
            ))}
          </div>
          {selectedFloorObj.prefabId.toLowerCase().includes("elevator") ? (
            <>
              <label style={label}>Elevator</label>
              <p style={{ margin: "4px 0 8px", fontSize: 12, opacity: 0.78, lineHeight: 1.4 }}>
                Shaft position and scale stay fully draggable. Door face can stay on auto or be
                forced for this shaft.
              </p>
              <label style={label}>door face</label>
              <select
                style={input}
                value={elevatorDoorFaceOverride}
                onChange={(e) => {
                  const next = e.target.value;
                  patchSelectedFloorMetadata((metadata) => {
                    if (next === "auto") delete metadata.elevatorDoorFace;
                    else metadata.elevatorDoorFace = next;
                  });
                }}
              >
                <option value="auto">Auto from corridor/lobby</option>
                <option value="n">North</option>
                <option value="s">South</option>
                <option value="e">East</option>
                <option value="w">West</option>
              </select>
            </>
          ) : null}
          <label style={label}>metadata (JSON) — use editorMaterial.mapUrl etc.</label>
          <textarea
            style={{ ...input, minHeight: 100, fontFamily: "monospace", fontSize: 11 }}
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            onBlur={() => {
              const t = metaText.trim();
              if (!t) {
                updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                  metadata: undefined,
                });
                setMetaErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(t) as Record<string, unknown>;
                updatePlacedObject(activeFloorDocId, selectedFloorObj.id, {
                  metadata: parsed,
                });
                setMetaErr(null);
              } catch {
                setMetaErr("Invalid JSON");
              }
            }}
          />
          {metaErr ? <p style={{ color: "#f66", fontSize: 12 }}>{metaErr}</p> : null}
        </>
      ) : null}

      {selectedInteriorPl ? (
        <>
          <label style={label}>prefabId</label>
          <input
            style={input}
            value={selectedInteriorPl.prefabId ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              updateInteriorPlacement(
                activeInteriorDocId,
                selectedInteriorPl.entityId,
                {
                  prefabId: v.length > 0 ? v : selectedInteriorPl.prefabId,
                },
              );
            }}
          />
          <label style={label}>position</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.1}
                value={selectedInteriorPl.position[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [...selectedInteriorPl.position] as [
                    number,
                    number,
                    number,
                  ];
                  p[i] = Number.isFinite(v) ? v : 0;
                  updateInteriorPlacement(
                    activeInteriorDocId,
                    selectedInteriorPl.entityId,
                    { position: p },
                  );
                }}
              />
            ))}
          </div>
          <label style={label}>scale</label>
          <label
            style={{
              ...label,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              marginBottom: 4,
            }}
          >
            <input
              type="checkbox"
              checked={uniformScale}
              onChange={(e) => setUniformScale(e.target.checked)}
            />
            Uniform (lock X/Y/Z)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.05}
                value={readScale(selectedInteriorPl.scale)[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const t = Number.isFinite(v) ? v : 1;
                  const prev = readScale(selectedInteriorPl.scale);
                  const p = uniformScale
                    ? ([t, t, t] as [number, number, number])
                    : ([...prev] as [number, number, number]);
                  if (!uniformScale) p[i] = t;
                  updateInteriorPlacement(
                    activeInteriorDocId,
                    selectedInteriorPl.entityId,
                    { scale: p },
                  );
                }}
              />
            ))}
          </div>
          <label style={label}>rotation (Euler °, YXZ)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={1}
                value={euler[i].toFixed(2)}
                onChange={(e) => updateEuler(i, Number(e.target.value) || 0)}
              />
            ))}
          </div>
          <label style={label}>overrides (JSON)</label>
          <textarea
            style={{ ...input, minHeight: 80, fontFamily: "monospace", fontSize: 11 }}
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            onBlur={() => {
              const t = metaText.trim();
              if (!t) {
                updateInteriorPlacement(
                  activeInteriorDocId,
                  selectedInteriorPl.entityId,
                  { overrides: undefined },
                );
                setMetaErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(t) as Record<string, unknown>;
                updateInteriorPlacement(
                  activeInteriorDocId,
                  selectedInteriorPl.entityId,
                  { overrides: parsed },
                );
                setMetaErr(null);
              } catch {
                setMetaErr("Invalid JSON");
              }
            }}
          />
          {metaErr ? <p style={{ color: "#f66", fontSize: 12 }}>{metaErr}</p> : null}
        </>
      ) : null}

      {selectedCellPl ? (
        <>
          <label style={label}>prefabId</label>
          <input
            style={input}
            value={selectedCellPl.prefabId ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              updateCellPlacement(activeCellDocId, selectedCellPl.entityId, {
                prefabId: v.length > 0 ? v : selectedCellPl.prefabId,
              });
            }}
          />
          <label style={label}>position</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.1}
                value={selectedCellPl.position[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [...selectedCellPl.position] as [number, number, number];
                  p[i] = Number.isFinite(v) ? v : 0;
                  updateCellPlacement(activeCellDocId, selectedCellPl.entityId, { position: p });
                }}
              />
            ))}
          </div>
          <label style={label}>overrides (JSON)</label>
          <textarea
            style={{ ...input, minHeight: 80, fontFamily: "monospace", fontSize: 11 }}
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            onBlur={() => {
              const t = metaText.trim();
              if (!t) {
                updateCellPlacement(activeCellDocId, selectedCellPl.entityId, {
                  overrides: undefined,
                });
                setMetaErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(t) as Record<string, unknown>;
                updateCellPlacement(activeCellDocId, selectedCellPl.entityId, {
                  overrides: parsed,
                });
                setMetaErr(null);
              } catch {
                setMetaErr("Invalid JSON");
              }
            }}
          />
          {metaErr ? <p style={{ color: "#f66", fontSize: 12 }}>{metaErr}</p> : null}
        </>
      ) : null}

      {selectedPrefabComponent && activePrefabDefId ? (
        <>
          <label style={label}>child ref</label>
          <input
            style={input}
            value={selectedPrefabComponent.prefabId ?? selectedPrefabComponent.assetId ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              updatePrefabComponent(activePrefabDefId, selectedPrefabComponent.id, {
                prefabId: v.length > 0 ? v : selectedPrefabComponent.prefabId ?? "",
              });
            }}
          />
          <label style={label}>position</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([0, 1, 2] as const).map((i) => (
              <input
                key={i}
                style={input}
                type="number"
                step={0.1}
                value={selectedPrefabComponent.position[i]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const p = [...selectedPrefabComponent.position] as [number, number, number];
                  p[i] = Number.isFinite(v) ? v : 0;
                  updatePrefabComponent(activePrefabDefId, selectedPrefabComponent.id, {
                    position: p,
                  });
                }}
              />
            ))}
          </div>
          <label style={label}>metadata (JSON)</label>
          <textarea
            style={{ ...input, minHeight: 80, fontFamily: "monospace", fontSize: 11 }}
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            onBlur={() => {
              const t = metaText.trim();
              if (!t) {
                updatePrefabComponent(activePrefabDefId, selectedPrefabComponent.id, {
                  metadata: undefined,
                });
                setMetaErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(t) as Record<string, unknown>;
                updatePrefabComponent(activePrefabDefId, selectedPrefabComponent.id, {
                  metadata: parsed,
                });
                setMetaErr(null);
              } catch {
                setMetaErr("Invalid JSON");
              }
            }}
          />
          {metaErr ? <p style={{ color: "#f66", fontSize: 12 }}>{metaErr}</p> : null}
        </>
      ) : null}

      {selectedFloorOverridePatch && activeFloorOverrideDocId ? (
        <>
          <label style={label}>override target</label>
          <input style={input} value={selectedFloorOverridePatch.targetObjectId} readOnly />
          <label style={label}>metadata override (JSON)</label>
          <textarea
            style={{ ...input, minHeight: 80, fontFamily: "monospace", fontSize: 11 }}
            value={metaText}
            onChange={(e) => setMetaText(e.target.value)}
            onBlur={() => {
              const t = metaText.trim();
              if (!t) {
                updateFloorOverrideObjectPatch(
                  activeFloorOverrideDocId,
                  selectedFloorOverridePatch.targetObjectId,
                  { metadata: undefined },
                );
                setMetaErr(null);
                return;
              }
              try {
                const parsed = JSON.parse(t) as Record<string, unknown>;
                updateFloorOverrideObjectPatch(
                  activeFloorOverrideDocId,
                  selectedFloorOverridePatch.targetObjectId,
                  { metadata: parsed },
                );
                setMetaErr(null);
              } catch {
                setMetaErr("Invalid JSON");
              }
            }}
          />
          {metaErr ? <p style={{ color: "#f66", fontSize: 12 }}>{metaErr}</p> : null}
        </>
      ) : null}
    </>
  );
}
