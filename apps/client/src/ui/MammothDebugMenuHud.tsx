import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import {
  resetFpDebugRenderIsolationFlags,
  setAllFpDebugRenderIsolationFlags,
  setFpDebugRenderIsolationFlag,
  subscribeFpDebugRenderIsolation,
  getFpDebugRenderIsolationFlags,
  type FpDebugRenderIsolationKey,
} from "../game/fpDebugRenderIsolation.js";
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import { getFpDebugMenuSessionSnapshot } from "../game/fpDebugMenuSessionBridge.js";
import {
  LS_APARTMENT_UNIT_BOUNDS_DEBUG,
  LS_DOOR_DEBUG_AUTOSTART,
  LS_ELEV_DEBUG_AUTOSTART,
  LS_FP_COLLISION_DEBUG,
  LS_FP_DOOR_ANIM_SKEW_WARN,
  LS_FP_LEGACY_COLLISION,
  LS_FP_LOADING_DEBUG,
  LS_FP_PERF_DEBUG,
  LS_FP_PHYSICS_DEBUG,
  LS_FP_RECONCILE_DEBUG,
  LS_WALL_PROBE_AUTOSTART,
  lsLegacyCollisionIsOn,
  lsLegacyCollisionSet,
  lsToggleIsOn,
  lsToggleSet,
} from "../game/fpDebugMenuStorage.js";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSession/fpSessionGameUiHidden";
import {
  THEME_ACCENT,
  THEME_ACCENT_ON,
  THEME_BACKDROP_SCRIM,
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_DIVIDER,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

/** Above crafting (380); below {@link PlayerDeathOverlay} (400). */
const DEBUG_MENU_Z_INDEX = 390;

type LsFlags = {
  fpCollisionDebug: boolean;
  fpPhysicsDebug: boolean;
  fpReconcileDebug: boolean;
  fpDoorAnimSkewWarn: boolean;
  fpLegacyCollision: boolean;
  fpLoadingDebug: boolean;
  fpPerfDebug: boolean;
  apartmentUnitBounds: boolean;
  doorDebugAutostart: boolean;
  elevDebugAutostart: boolean;
  wallProbeAutostart: boolean;
};

function readLsFlags(): LsFlags {
  return {
    fpCollisionDebug: lsToggleIsOn(LS_FP_COLLISION_DEBUG),
    fpPhysicsDebug: lsToggleIsOn(LS_FP_PHYSICS_DEBUG),
    fpReconcileDebug: lsToggleIsOn(LS_FP_RECONCILE_DEBUG),
    fpDoorAnimSkewWarn: lsToggleIsOn(LS_FP_DOOR_ANIM_SKEW_WARN),
    fpLegacyCollision: lsLegacyCollisionIsOn(),
    fpPerfDebug: lsToggleIsOn(LS_FP_PERF_DEBUG),
    fpLoadingDebug: lsToggleIsOn(LS_FP_LOADING_DEBUG),
    apartmentUnitBounds: lsToggleIsOn(LS_APARTMENT_UNIT_BOUNDS_DEBUG),
    doorDebugAutostart: lsToggleIsOn(LS_DOOR_DEBUG_AUTOSTART),
    elevDebugAutostart: lsToggleIsOn(LS_ELEV_DEBUG_AUTOSTART),
    wallProbeAutostart: lsToggleIsOn(LS_WALL_PROBE_AUTOSTART),
  };
}

type WinDbg = {
  __mmDoorDebug?: { on: (radiusM?: number) => void; off: () => void };
  __mmElevDebug?: { on: () => void; off: () => void };
  __mmWallProbe?: { on: (maxDistanceM?: number) => void; off: () => void };
};

function winDbg(): WinDbg {
  return globalThis as WinDbg;
}

function rowToggle(args: {
  label: string;
  description?: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 0",
        borderBottom: `1px solid ${THEME_DIVIDER}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: THEME_TEXT_PRIMARY }}>{args.label}</div>
        {args.description ? (
          <div style={{ fontSize: 11, color: THEME_TEXT_MUTED, marginTop: 3, lineHeight: 1.35 }}>
            {args.description}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        disabled={args.disabled}
        onClick={args.onToggle}
        style={{
          flexShrink: 0,
          padding: "6px 12px",
          borderRadius: 8,
          border: `1px solid ${THEME_CARD_BORDER}`,
          background: args.on ? THEME_ACCENT : "rgba(0,0,0,0.4)",
          color: args.on ? THEME_ACCENT_ON : THEME_TEXT_PRIMARY,
          cursor: args.disabled ? "not-allowed" : "pointer",
          fontSize: 12,
          fontWeight: 650,
          opacity: args.disabled ? 0.45 : 1,
          minWidth: 52,
        }}
      >
        {args.on ? "On" : "Off"}
      </button>
    </div>
  );
}

function sessionRow(args: {
  label: string;
  description: string;
  active: boolean | null;
  onEnable: () => void;
  onDisable: () => void;
}): ReactElement {
  const unknown = args.active === null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 0",
        borderBottom: `1px solid ${THEME_DIVIDER}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: THEME_TEXT_PRIMARY }}>{args.label}</div>
        <div style={{ fontSize: 11, color: THEME_TEXT_MUTED, marginTop: 3, lineHeight: 1.35 }}>
          {args.description}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          disabled={unknown}
          onClick={args.onDisable}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${THEME_CARD_BORDER}`,
            background: !unknown && !args.active ? THEME_ACCENT : "rgba(0,0,0,0.4)",
            color: !unknown && !args.active ? THEME_ACCENT_ON : THEME_TEXT_PRIMARY,
            cursor: unknown ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 650,
            opacity: unknown ? 0.45 : 1,
          }}
        >
          Off
        </button>
        <button
          type="button"
          disabled={unknown}
          onClick={args.onEnable}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${THEME_CARD_BORDER}`,
            background: !unknown && args.active ? THEME_ACCENT : "rgba(0,0,0,0.4)",
            color: !unknown && args.active ? THEME_ACCENT_ON : THEME_TEXT_PRIMARY,
            cursor: unknown ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 650,
            opacity: unknown ? 0.45 : 1,
          }}
        >
          On
        </button>
      </div>
    </div>
  );
}

export function MammothDebugMenuHud() {
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState<LsFlags>(() => readLsFlags());
  const [, setSessionBump] = useState(0);

  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );

  const renderIsolation = useSyncExternalStore(
    subscribeFpDebugRenderIsolation,
    getFpDebugRenderIsolationFlags,
    getFpDebugRenderIsolationFlags,
  );

  const refreshLs = useCallback(() => {
    setFlags(readLsFlags());
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshLs();
    const id = window.setInterval(() => {
      setSessionBump((n) => n + 1);
    }, 400);
    return () => window.clearInterval(id);
  }, [open, refreshLs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameUiHidden || isTextInputFocused()) return;
      if (e.code !== "KeyM" || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      setOpen((o) => !o);
      if (document.pointerLockElement) void document.exitPointerLock();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [gameUiHidden]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || isTextInputFocused()) return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open]);

  if (gameUiHidden) return null;

  const snap = getFpDebugMenuSessionSnapshot();
  const hasSession = snap !== null;
  const w = winDbg();

  const bumpSession = () => setSessionBump((n) => n + 1);

  const renderIsolationRows: Array<{
    key: FpDebugRenderIsolationKey;
    label: string;
    description: string;
  }> = [
    {
      key: "apartmentDecor",
      label: "Apartment decor",
      description: "All authored decor GLBs, walls, mirrors (apartment_unit_decor_root)",
    },
    {
      key: "apartmentDecorPracticalLights",
      label: "Decor fixture lighting",
      description: "Lamp/TV/ceiling practical lights + emissive glow (decor meshes stay visible)",
    },
    {
      key: "apartmentPracticalLights",
      label: "All apartment practical lights",
      description: "Every interior spot/point light, including window-linked fills",
    },
    {
      key: "environmentSky",
      label: "Sky & clouds",
      description: "Skydome + infinite ground plane updates",
    },
    {
      key: "environmentLighting",
      label: "Scene lighting",
      description: "Sun rig, ambient/fill, apartment bounce lights",
    },
    {
      key: "mirrors",
      label: "Mirrors",
      description: "Cab + apartment planar reflectors (skip GPU re-render)",
    },
    {
      key: "floorPlates",
      label: "Floor plates",
      description: "Per-storey building shell groups",
    },
    {
      key: "unitInteriorShells",
      label: "Unit interior shells",
      description: "Merged residential unit geometry (not props)",
    },
    {
      key: "transparentMeshes",
      label: "Transparent meshes",
      description: "Alpha-tested / transparent building passes",
    },
    {
      key: "lobbyInterior",
      label: "Lobby interior",
      description: "Authored lobby_central interior meshes",
    },
    {
      key: "droppedItems",
      label: "Dropped items",
      description: "World pickup GLBs",
    },
    {
      key: "decals",
      label: "Decals",
      description: "Stairwell graffiti / grime decals",
    },
    {
      key: "localViewmodel",
      label: "Local viewmodel",
      description: "FP hands, weapon, consumable mesh",
    },
  ];

  return createPortal(
    open ? (
      <div
        data-mammoth-debug-menu="open"
        data-mammoth-no-hotbar-wheel="true"
        role="dialog"
        aria-label="Debug menu"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: DEBUG_MENU_Z_INDEX,
          background: THEME_BACKDROP_SCRIM,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "24px 12px",
          fontFamily: UI_FONT_SANS,
          boxSizing: "border-box",
          pointerEvents: "auto",
        }}
      >
        <div
          onMouseDown={(e) => e.stopPropagation()}
          data-mammoth-no-hotbar-wheel="true"
          style={{
            width: "100%",
            maxWidth: 460,
            maxHeight: "min(88vh, 720px)",
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            background: THEME_CARD_BG,
            border: `1px solid ${THEME_CARD_BORDER}`,
            color: THEME_TEXT_PRIMARY,
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              borderBottom: `1px solid ${THEME_DIVIDER}`,
            }}
          >
            <div>
              <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: "0.02em" }}>Debug</div>
              <div style={{ fontSize: 11, color: THEME_TEXT_MUTED, marginTop: 4 }}>
                Dev / QA toggles (localStorage + session APIs). Not for players.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${THEME_CARD_BORDER}`,
                background: "rgba(0,0,0,0.45)",
                color: THEME_TEXT_PRIMARY,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 550,
              }}
            >
              Close · Esc
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "4px 16px 16px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: THEME_TEXT_MUTED, marginTop: 12 }}>
              First-person collision & prediction
            </div>
            {rowToggle({
              label: "Feet ring + velocity arrow",
              description: "mammothFpCollisionDebug",
              on: flags.fpCollisionDebug,
              onToggle: () => {
                lsToggleSet(LS_FP_COLLISION_DEBUG, !flags.fpCollisionDebug);
                refreshLs();
              },
            })}
            {rowToggle({
              label: "Physics wireframe overlay",
              description: "AABBs + capsule guide (mammothFpPhysicsDebug)",
              on: flags.fpPhysicsDebug,
              onToggle: () => {
                lsToggleSet(LS_FP_PHYSICS_DEBUG, !flags.fpPhysicsDebug);
                refreshLs();
              },
            })}
            {rowToggle({
              label: "Reconcile logging",
              description: "Console [mmReconcile] on corrections (mammothFpReconcileDebug)",
              on: flags.fpReconcileDebug,
              onToggle: () => {
                lsToggleSet(LS_FP_RECONCILE_DEBUG, !flags.fpReconcileDebug);
                refreshLs();
              },
            })}
            {rowToggle({
              label: "Door mesh vs blocking skew warns",
              description: "mammothFpDoorAnimSkewWarn",
              on: flags.fpDoorAnimSkewWarn,
              onToggle: () => {
                lsToggleSet(LS_FP_DOOR_ANIM_SKEW_WARN, !flags.fpDoorAnimSkewWarn);
                refreshLs();
              },
            })}
            {rowToggle({
              label: "Legacy axis depenetration",
              description: "Disables character-controller path (mammothFpLegacyCollision)",
              on: flags.fpLegacyCollision,
              onToggle: () => {
                lsLegacyCollisionSet(!flags.fpLegacyCollision);
                refreshLs();
              },
            })}

            <div style={{ fontSize: 12, fontWeight: 700, color: THEME_TEXT_MUTED, marginTop: 16 }}>
              Performance
            </div>
            {rowToggle({
              label: "Loading / hitch debug (console)",
              description:
                "[mmLoadDbg] Spacetime + FP mount timelines, long-task CPU, RAF gaps; ?loaddebug=1 or mammothFpLoadingDebug — refresh to apply observers",
              on: flags.fpLoadingDebug,
              onToggle: () => {
                lsToggleSet(LS_FP_LOADING_DEBUG, !flags.fpLoadingDebug);
                refreshLs();
              },
            })}
            {rowToggle({
              label: "FP render stats (console)",
              description: "FPS · draw calls · triangles (mammothFpDebug)",
              on: flags.fpPerfDebug,
              onToggle: () => {
                lsToggleSet(LS_FP_PERF_DEBUG, !flags.fpPerfDebug);
                refreshLs();
              },
            })}

            <div style={{ fontSize: 12, fontWeight: 700, color: THEME_TEXT_MUTED, marginTop: 16 }}>
              Render isolation
            </div>
            <div style={{ fontSize: 11, color: THEME_TEXT_FAINT, marginBottom: 6, lineHeight: 1.4 }}>
              On = normal rendering. Off = force-hide that subsystem (never force-shows — existing culling still applies when On).
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setAllFpDebugRenderIsolationFlags(true)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${THEME_CARD_BORDER}`,
                  background: "rgba(0,0,0,0.4)",
                  color: THEME_TEXT_PRIMARY,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                All on
              </button>
              <button
                type="button"
                onClick={() => setAllFpDebugRenderIsolationFlags(false)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${THEME_CARD_BORDER}`,
                  background: "rgba(0,0,0,0.4)",
                  color: THEME_TEXT_PRIMARY,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                All off
              </button>
              <button
                type="button"
                onClick={() => resetFpDebugRenderIsolationFlags()}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${THEME_CARD_BORDER}`,
                  background: "rgba(0,0,0,0.4)",
                  color: THEME_TEXT_PRIMARY,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 650,
                }}
              >
                Reset
              </button>
            </div>
            {renderIsolationRows.map((row) =>
              rowToggle({
                label: row.label,
                description: row.description,
                on: renderIsolation[row.key],
                onToggle: () => {
                  setFpDebugRenderIsolationFlag(row.key, !renderIsolation[row.key]);
                },
              }),
            )}

            <div style={{ fontSize: 12, fontWeight: 700, color: THEME_TEXT_MUTED, marginTop: 16 }}>
              Apartment authoring
            </div>
            {rowToggle({
              label: "Unit bounds hulls",
              description: "mammothApartmentUnitBoundsDebug — reload FP session to apply",
              on: flags.apartmentUnitBounds,
              onToggle: () => {
                lsToggleSet(LS_APARTMENT_UNIT_BOUNDS_DEBUG, !flags.apartmentUnitBounds);
                refreshLs();
              },
            })}

            <div style={{ fontSize: 12, fontWeight: 700, color: THEME_TEXT_MUTED, marginTop: 16 }}>
              Session console APIs
            </div>
            <div style={{ fontSize: 11, color: THEME_TEXT_FAINT, marginBottom: 6, lineHeight: 1.4 }}>
              {hasSession
                ? "Uses window.__mmDoorDebug, __mmElevDebug, __mmWallProbe from the active world session."
                : "Enter the FP world to enable door / elevator / wall-probe runtime logging."}
            </div>
            {sessionRow({
              label: "Door collision JSON logs",
              description: "__mmDoorDebug — near-door clamps & reconcile context",
              active: hasSession ? snap!.doorDebugEnabled : null,
              onEnable: () => {
                w.__mmDoorDebug?.on(2.5);
                bumpSession();
              },
              onDisable: () => {
                w.__mmDoorDebug?.off();
                bumpSession();
              },
            })}
            {rowToggle({
              label: "Autostart door debug next session",
              description: "mmDoorDebugAutostart",
              on: flags.doorDebugAutostart,
              onToggle: () => {
                lsToggleSet(LS_DOOR_DEBUG_AUTOSTART, !flags.doorDebugAutostart);
                refreshLs();
              },
            })}
            {sessionRow({
              label: "Elevator hitch debug",
              description: "__mmElevDebug — slow frames & cab samples",
              active: hasSession ? snap!.elevDebugEnabled : null,
              onEnable: () => {
                w.__mmElevDebug?.on();
                bumpSession();
              },
              onDisable: () => {
                w.__mmElevDebug?.off();
                bumpSession();
              },
            })}
            {rowToggle({
              label: "Autostart elevator debug next session",
              description: "mmElevDebugAutostart",
              on: flags.elevDebugAutostart,
              onToggle: () => {
                lsToggleSet(LS_ELEV_DEBUG_AUTOSTART, !flags.elevDebugAutostart);
                refreshLs();
              },
            })}
            {sessionRow({
              label: "Wall probe (crosshair ray)",
              description: "__mmWallProbe — right-click to log hit",
              active: hasSession ? snap!.wallProbeEnabled : null,
              onEnable: () => {
                w.__mmWallProbe?.on(20);
                bumpSession();
              },
              onDisable: () => {
                w.__mmWallProbe?.off();
                bumpSession();
              },
            })}
            {rowToggle({
              label: "Autostart wall probe next session",
              description: "mmWallProbeAutostart",
              on: flags.wallProbeAutostart,
              onToggle: () => {
                lsToggleSet(LS_WALL_PROBE_AUTOSTART, !flags.wallProbeAutostart);
                refreshLs();
              },
            })}
          </div>
        </div>
      </div>
    ) : null,
    document.body,
  );
}
