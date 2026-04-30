import { useSyncExternalStore } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  getFpSessionDisplayedFps,
  subscribeFpSessionDisplayedFps,
} from "../game/fpSession/fpSessionFpsDisplay";
import { requestGameAudioPrime } from "../game/audio/gameAudioPrime";
import {
  getFpBackgroundMusicEnabled,
  subscribeFpBackgroundMusicEnabled,
  toggleFpBackgroundMusicEnabled,
} from "../game/audio/fpBackgroundMusicState";
import {
  subscribeFpPerf,
  computeFpPerfStats,
  exportFpPerfReport,
  getLastRendererInfo,
  type FpPerfStats,
} from "../game/fpSession/fpSessionPerfStore";
import {
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_TEXT_PRIMARY,
  THEME_TEXT_MUTED,
  THEME_TEXT_FAINT,
  THEME_ACCENT,
  THEME_FOCUS_RING,
  THEME_SUCCESS,
  THEME_ERROR,
  UI_FONT_MONO,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_OPTIONS = [1, 5, 30] as const;
type WindowSec = (typeof WINDOW_OPTIONS)[number];

const SECTION_COLORS: Record<string, string> = {
  physics: "#7bcf9a",
  elevator: "#6b8cae",
  present: "#b89f6b",
  render: "#e87878",
  "render·floorVis": "#e8a0a0",
  "render·fpEnv": "#e8a0a0",
  "render·three": "#e87878",
  other: "#9a9a9a",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fpsColor(fps: number | null): string {
  if (fps === null) return THEME_TEXT_FAINT;
  if (fps >= 55) return THEME_SUCCESS;
  if (fps >= 30) return "#e8c47a";
  return THEME_ERROR;
}

function MiniBar({
  frac,
  color,
  height = 8,
}: {
  frac: number;
  color: string;
  height?: number;
}) {
  return (
    <div
      style={{
        display: "inline-block",
        width: 120,
        height,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 3,
        overflow: "hidden",
        verticalAlign: "middle",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, frac * 100).toFixed(1)}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.15s ease-out",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MammothFpsHud() {
  const fps = useSyncExternalStore(
    subscribeFpSessionDisplayedFps,
    getFpSessionDisplayedFps,
    getFpSessionDisplayedFps,
  );

  const [open, setOpen] = useState(false);
  const [windowSec, setWindowSec] = useState<WindowSec>(5);
  const [stats, setStats] = useState<FpPerfStats | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundMusicEnabled = useSyncExternalStore(
    subscribeFpBackgroundMusicEnabled,
    getFpBackgroundMusicEnabled,
    getFpBackgroundMusicEnabled,
  );

  // Recompute stats whenever the perf store notifies (throttled to ~10 fps).
  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      setStats(computeFpPerfStats(performance.now(), windowSec));
    };
    refresh(); // initial
    const unsub = subscribeFpPerf(refresh);
    return unsub;
  }, [open, windowSec]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  const handleCopy = useCallback(async () => {
    const text = exportFpPerfReport(performance.now(), windowSec);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied — fall back to console
      console.info("[MammothFpsHud] copy fallback:\n" + text);
    }
  }, [windowSec]);

  const handleAudioToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const willEnable = !getFpBackgroundMusicEnabled();
    toggleFpBackgroundMusicEnabled();
    if (willEnable) void requestGameAudioPrime();
  }, []);

  // ---------------------------------------------------------------------------
  // Styles (shared)
  // ---------------------------------------------------------------------------

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    right: "max(12px, env(safe-area-inset-right, 0px))",
    top: "max(12px, env(safe-area-inset-top, 0px))",
    zIndex: 50,
    fontFamily: UI_FONT_SANS,
    fontSize: 12,
    color: THEME_TEXT_PRIMARY,
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  const badgeStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: open ? "8px 8px 0 0" : 8,
    background: THEME_CARD_BG,
    border: `1px solid ${THEME_CARD_BORDER}`,
    borderBottom: open ? "1px solid transparent" : `1px solid ${THEME_CARD_BORDER}`,
    cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };

  const expandedStyle: React.CSSProperties = {
    background: THEME_CARD_BG,
    border: `1px solid ${THEME_CARD_BORDER}`,
    borderRadius: "0 0 10px 10px",
    padding: "10px 12px",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    minWidth: 310,
  };

  const audioButtonStyle: React.CSSProperties = {
    marginTop: 6,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "5px 10px",
    borderRadius: 8,
    border: `1px solid ${backgroundMusicEnabled ? THEME_ACCENT : THEME_CARD_BORDER}`,
    background: backgroundMusicEnabled ? THEME_FOCUS_RING : THEME_CARD_BG,
    color: backgroundMusicEnabled ? THEME_TEXT_PRIMARY : THEME_TEXT_FAINT,
    cursor: "pointer",
    fontFamily: UI_FONT_SANS,
    fontSize: 11,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    color: THEME_TEXT_FAINT,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 5,
    marginTop: 10,
  };

  const monoStyle: React.CSSProperties = {
    fontFamily: UI_FONT_MONO,
    fontVariantNumeric: "tabular-nums",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  };

  const dimStyle: React.CSSProperties = { color: THEME_TEXT_MUTED };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
      {/* Badge / toggle */}
      <div
        style={badgeStyle}
        onClick={handleToggle}
        title={open ? "Close profiler" : "Open profiler"}
      >
        <span
          style={{
            ...monoStyle,
            fontSize: 13,
            color: fpsColor(fps),
            minWidth: 52,
          }}
        >
          {fps === null ? "…" : `${fps} FPS`}
        </span>
        {!open && (() => {
          const ri = getLastRendererInfo();
          return ri.drawCalls > 0 ? (
            <span style={{ ...monoStyle, fontSize: 10, color: THEME_TEXT_FAINT }}>
              {ri.drawCalls}dc
            </span>
          ) : null;
        })()}
        <span style={{ color: THEME_TEXT_FAINT, fontSize: 10 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      <button
        type="button"
        aria-pressed={backgroundMusicEnabled}
        onClick={handleAudioToggle}
        style={audioButtonStyle}
        title={backgroundMusicEnabled ? "Turn background music off" : "Turn background music on"}
      >
        <span>Audio</span>
        <span style={{ ...monoStyle, color: backgroundMusicEnabled ? THEME_ACCENT : THEME_TEXT_FAINT }}>
          {backgroundMusicEnabled ? "ON" : "OFF"}
        </span>
      </button>

      {/* Expanded panel */}
      {open && (
        <div style={expandedStyle}>
          {/* Time-window selector + copy */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
            <span style={{ color: THEME_TEXT_FAINT, fontSize: 10, marginRight: 2 }}>
              Window:
            </span>
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setWindowSec(w)}
                style={{
                  padding: "2px 7px",
                  borderRadius: 4,
                  border: `1px solid ${w === windowSec ? THEME_ACCENT : THEME_CARD_BORDER}`,
                  background: w === windowSec ? "rgba(107,140,174,0.2)" : "transparent",
                  color: w === windowSec ? THEME_ACCENT : THEME_TEXT_MUTED,
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: UI_FONT_SANS,
                }}
              >
                {w}s
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={handleCopy}
              style={{
                padding: "2px 9px",
                borderRadius: 4,
                border: `1px solid ${copied ? THEME_SUCCESS : THEME_CARD_BORDER}`,
                background: copied ? "rgba(123,207,154,0.15)" : "transparent",
                color: copied ? THEME_SUCCESS : THEME_TEXT_MUTED,
                cursor: "pointer",
                fontSize: 11,
                fontFamily: UI_FONT_SANS,
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>

          {stats === null ? (
            <div style={{ color: THEME_TEXT_FAINT, padding: "8px 0", textAlign: "center" }}>
              Collecting data…
            </div>
          ) : (
            <>
              {/* Renderer counters */}
              {(() => {
                const ri = getLastRendererInfo();
                return (
                  <div style={{ ...monoStyle, ...dimStyle, fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: ri.drawCalls > 200 ? THEME_ERROR : ri.drawCalls > 80 ? "#e8c47a" : THEME_SUCCESS }}>
                      {ri.drawCalls} draw calls
                    </span>
                    {"  "}
                    <span>{(ri.triangles / 1000).toFixed(1)}k tris</span>
                  </div>
                );
              })()}

              {/* FPS summary */}
              <div style={sectionHeaderStyle}>Performance</div>
              <div style={{ ...rowStyle, ...monoStyle, gap: 14 }}>
                <span style={{ color: fpsColor(fps), fontSize: 22, fontWeight: 600, minWidth: 50 }}>
                  {stats.fps}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <div>
                    <span style={dimStyle}>avg </span>
                    <span>{stats.frameMs.avg}ms</span>
                    {"  "}
                    <span style={dimStyle}>min </span>
                    <span style={{ color: THEME_SUCCESS }}>{stats.frameMs.min}ms</span>
                    {"  "}
                    <span style={dimStyle}>max </span>
                    <span style={{ color: stats.frameMs.max > 33 ? THEME_ERROR : THEME_TEXT_PRIMARY }}>
                      {stats.frameMs.max}ms
                    </span>
                  </div>
                  <div>
                    <span style={dimStyle}>p50 </span>
                    <span>{stats.frameMs.p50}ms</span>
                    {"  "}
                    <span style={dimStyle}>p95 </span>
                    <span style={{ color: stats.frameMs.p95 > 33 ? THEME_ERROR : THEME_TEXT_PRIMARY }}>
                      {stats.frameMs.p95}ms
                    </span>
                    {"  "}
                    <span style={dimStyle}>p99 </span>
                    <span style={{ color: stats.frameMs.p99 > 50 ? THEME_ERROR : THEME_TEXT_PRIMARY }}>
                      {stats.frameMs.p99}ms
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ ...dimStyle, fontSize: 10, marginTop: 1 }}>
                {stats.samples} frames · {stats.actualElapsedSec.toFixed(1)}s
              </div>

              {/* Section breakdown */}
              <div style={sectionHeaderStyle}>Section breakdown (avg ms/frame)</div>
              {(
                [
                  ["physics", stats.sections.physicsMs],
                  ["elevator", stats.sections.elevatorMs],
                  ["present", stats.sections.presentMs],
                  ["render", stats.sections.renderMs],
                  ["render·floorVis", stats.sections.renderFloorPlateVisMs],
                  ["render·fpEnv", stats.sections.renderFpEnvironmentMs],
                  ["render·three", stats.sections.renderThreeMs],
                  ["other", stats.sections.otherMs],
                ] as [string, number][]
              ).map(([name, ms]) => {
                const frameMax = stats.frameMs.avg;
                const frac = frameMax > 0 ? ms / frameMax : 0;
                const isRenderSplit = name.startsWith("render·");
                return (
                  <div
                    key={name}
                    style={{
                      ...rowStyle,
                      ...monoStyle,
                      ...(isRenderSplit ? { paddingLeft: 10, opacity: 0.92 } : null),
                    }}
                  >
                    <span
                      style={{
                        color: THEME_TEXT_MUTED,
                        minWidth: isRenderSplit ? 88 : 55,
                        fontSize: 11,
                      }}
                    >
                      {name}
                    </span>
                    <MiniBar frac={frac} color={SECTION_COLORS[name] ?? THEME_ACCENT} />
                    <span
                      style={{
                        minWidth: 42,
                        textAlign: "right",
                        color: ms > 8 ? "#e8c47a" : THEME_TEXT_PRIMARY,
                      }}
                    >
                      {ms.toFixed(2)}ms
                    </span>
                  </div>
                );
              })}

              {/* Frame-time histogram */}
              <div style={sectionHeaderStyle}>Frame-time histogram</div>
              {stats.histogram.map((b) => (
                <div key={b.label} style={{ ...rowStyle, ...monoStyle }}>
                  <span style={{ color: THEME_TEXT_MUTED, minWidth: 55, fontSize: 11 }}>
                    {b.label}
                  </span>
                  <MiniBar
                    frac={b.frac}
                    color={
                      b.label.startsWith("<4") || b.label.startsWith("4-8")
                        ? THEME_SUCCESS
                        : b.label.startsWith("8-16")
                          ? THEME_TEXT_MUTED
                          : THEME_ERROR
                    }
                  />
                  <span
                    style={{
                      minWidth: 32,
                      textAlign: "right",
                      color: b.frac > 0.05 && !b.label.startsWith("<4") && !b.label.startsWith("4-8")
                        ? THEME_ERROR
                        : THEME_TEXT_MUTED,
                    }}
                  >
                    {(b.frac * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
