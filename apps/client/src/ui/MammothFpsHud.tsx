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
  exportFpPerfRecordingReport,
  getFpPerfTimeline,
  getLastRendererInfo,
  type FpPerfStats,
  type FpPerfTimelineSample,
} from "../game/fpSession/fpSessionPerfStore";
import { formatFpPerfSpikeCorrelationReport } from "../game/fpSession/fpSessionPerfSpikeCorrelation";
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
import type { DbConnection } from "../module_bindings";
import { MammothWorldDayHud } from "./MammothWorldDayHud";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_OPTIONS = [1, 5, 30] as const;
type WindowSec = (typeof WINDOW_OPTIONS)[number];

const RECORD_DURATION_OPTIONS = [5, 10, 30] as const;
type RecordDurationSec = (typeof RECORD_DURATION_OPTIONS)[number];

const TIMELINE_CHART_W = 278;
const TIMELINE_CHART_H = 34;

const SECTION_COLORS: Record<string, string> = {
  physics: "#7bcf9a",
  elevator: "#6b8cae",
  present: "#b89f6b",
  render: "#e87878",
  "render·preEnv": "#e8a0a0",
  "render·fpEnv": "#e8a0a0",
  "render·fpEnvSky": "#f0b3b3",
  "render·fpEnvLight": "#d98e8e",
  "render·setup": "#d96f6f",
  "render·three": "#e87878",
  "render·GPU": "#9b8cff",
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

/** Forward-filled yaw in degrees for sparklines when some frames omit yaw. */
function yawDegHeldSeries(samples: readonly FpPerfTimelineSample[]): Float64Array {
  const out = new Float64Array(samples.length);
  let last = 0;
  let seeded = false;
  for (let i = 0; i < samples.length; i++) {
    const y = samples[i]!.cameraYawRad;
    if (y != null) {
      last = (y * 180) / Math.PI;
      seeded = true;
    }
    out[i] = seeded ? last : Number.NaN;
  }
  return out;
}

function TimelineSparklineRow({
  samples,
  label,
  color,
  pick,
}: {
  samples: readonly FpPerfTimelineSample[];
  label: string;
  color: string;
  pick: (s: FpPerfTimelineSample, index: number) => number;
}) {
  const w = TIMELINE_CHART_W;
  const h = TIMELINE_CHART_H;
  const pad = 3;
  if (samples.length < 2) {
    return (
      <div style={{ fontSize: 10, color: THEME_TEXT_FAINT, marginBottom: 4 }}>
        {label}: (need ≥2 samples)
      </div>
    );
  }
  const vals: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    vals.push(pick(samples[i]!, i));
  }
  const finite = vals.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return (
      <div style={{ fontSize: 10, color: THEME_TEXT_FAINT, marginBottom: 4 }}>
        {label}: (no data)
      </div>
    );
  }
  let minV = Math.min(...finite);
  let maxV = Math.max(...finite);
  if (maxV - minV < 1e-9) {
    minV -= 1;
    maxV += 1;
  }
  const pts = samples
    .map((s, i) => {
      const x = pad + (i / (samples.length - 1)) * (w - pad * 2);
      const v = pick(s, i);
      const vn = Number.isFinite(v) ? v : minV;
      const y = h - pad - ((vn - minV) / (maxV - minV)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lo = minV.toPrecision(3);
  const hi = maxV.toPrecision(3);
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 10, color: THEME_TEXT_MUTED, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 9, color: THEME_TEXT_FAINT, fontFamily: UI_FONT_MONO }}>
          {lo} → {hi}
        </span>
      </div>
      <svg width={w} height={h} style={{ display: "block" }}>
        <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function FpPerfRecordedTimelines({ samples }: { samples: readonly FpPerfTimelineSample[] }) {
  const yawHeld = yawDegHeldSeries(samples);
  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      <TimelineSparklineRow samples={samples} label="Total frame ms" color="#e87878" pick={(s) => s.totalMs} />
      <TimelineSparklineRow samples={samples} label="three.js ms" color="#f0b3b3" pick={(s) => s.renderThreeMs} />
      <TimelineSparklineRow
        samples={samples}
        label="Frustum unit interior"
        color={THEME_ACCENT}
        pick={(s) => s.frustumUnitInteriorMeshes}
      />
      <TimelineSparklineRow
        samples={samples}
        label="Frustum apartment props"
        color="#7bcf9a"
        pick={(s) => s.frustumApartmentPropMeshes}
      />
      <TimelineSparklineRow
        samples={samples}
        label="Frustum decor floor shadows"
        color="#6b9e7a"
        pick={(s) => s.frustumApartmentDecorFloorShadowMeshes}
      />
      <TimelineSparklineRow
        samples={samples}
        label="Frustum decor TV lights"
        color="#7bcf9a"
        pick={(s) => s.frustumPracticalDecorTvLights}
      />
      <TimelineSparklineRow
        samples={samples}
        label="Frustum decor ceiling lights"
        color="#e8c47a"
        pick={(s) => s.frustumPracticalDecorCeilingLights}
      />
      <TimelineSparklineRow
        samples={samples}
        label="Frustum decor practical lights"
        color="#e8c47a"
        pick={(s) => s.frustumPracticalDecorLights}
      />
      <TimelineSparklineRow samples={samples} label="Draw calls" color="#b89f6b" pick={(s) => s.drawCalls} />
      <TimelineSparklineRow
        samples={samples}
        label="Triangles (k)"
        color="#9b8cff"
        pick={(s) => s.triangles / 1000}
      />
      <TimelineSparklineRow
        samples={samples}
        label="Camera yaw (deg, held)"
        color="#6b8cae"
        pick={(_s, i) => yawHeld[i]!}
      />
    </div>
  );
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

export function MammothFpsHud(props: { conn: DbConnection | null }) {
  const fps = useSyncExternalStore(
    subscribeFpSessionDisplayedFps,
    getFpSessionDisplayedFps,
    getFpSessionDisplayedFps,
  );
  /** Live draw calls / decor instancing on the collapsed card (~10 Hz, no `?fpdebug=1`). */
  const rendererInfo = useSyncExternalStore(
    subscribeFpPerf,
    getLastRendererInfo,
    getLastRendererInfo,
  );

  const [open, setOpen] = useState(false);
  const [windowSec, setWindowSec] = useState<WindowSec>(5);
  const [stats, setStats] = useState<FpPerfStats | null>(null);
  const [copiedRolling, setCopiedRolling] = useState(false);
  const [copiedRecording, setCopiedRecording] = useState(false);
  const copyRollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [recordDurationSec, setRecordDurationSec] = useState<RecordDurationSec>(5);
  const [recordingEndsAtMs, setRecordingEndsAtMs] = useState<number | null>(null);
  const [capture, setCapture] = useState<{
    samples: FpPerfTimelineSample[];
    windowSec: RecordDurationSec;
  } | null>(null);
  const captureWindowSecRef = useRef<RecordDurationSec>(5);
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

  useEffect(() => {
    if (recordingEndsAtMs == null) return;
    const win = captureWindowSecRef.current;
    let raf = 0;
    const step = () => {
      const now = performance.now();
      if (now >= recordingEndsAtMs) {
        const samples = getFpPerfTimeline(now, win);
        setCapture({ samples, windowSec: win });
        setRecordingEndsAtMs(null);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [recordingEndsAtMs]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  const handleCopyRollingWindow = useCallback(async () => {
    const text = exportFpPerfReport(performance.now(), windowSec);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRolling(true);
      setCopiedRecording(false);
      if (copyRollingTimerRef.current) clearTimeout(copyRollingTimerRef.current);
      copyRollingTimerRef.current = setTimeout(() => setCopiedRolling(false), 2000);
    } catch {
      console.info("[MammothFpsHud] copy window fallback:\n" + text);
    }
  }, [windowSec]);

  const handleCopyRecording = useCallback(async () => {
    if (!capture) return;
    const text = exportFpPerfRecordingReport(capture.samples, capture.windowSec);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRecording(true);
      setCopiedRolling(false);
      if (copyRecordingTimerRef.current) clearTimeout(copyRecordingTimerRef.current);
      copyRecordingTimerRef.current = setTimeout(() => setCopiedRecording(false), 2000);
    } catch {
      console.info("[MammothFpsHud] copy recording fallback:\n" + text);
    }
  }, [capture]);

  const handleStartRecording = useCallback(() => {
    captureWindowSecRef.current = recordDurationSec;
    setCapture(null);
    setRecordingEndsAtMs(performance.now() + recordDurationSec * 1000);
  }, [recordDurationSec]);

  const handleClearCapture = useCallback(() => {
    setCapture(null);
  }, []);

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
    minWidth: 320,
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

  const isRecording = recordingEndsAtMs !== null;
  const recordStatusLabel = isRecording
    ? "recording"
    : capture
      ? `captured (${capture.samples.length})`
      : "idle";

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
        {!open && (
            <>
              {rendererInfo.drawCalls > 0 ? (
                <span style={{ ...monoStyle, fontSize: 10, color: THEME_TEXT_FAINT }}>
                  {rendererInfo.drawCalls}dc
                </span>
              ) : null}
              {rendererInfo.frustumPracticalDecorLights > 0 ? (
                <span
                  style={{
                    ...monoStyle,
                    fontSize: 10,
                    color:
                      rendererInfo.frustumPracticalDecorLights > 12
                        ? THEME_ERROR
                        : rendererInfo.frustumPracticalDecorLights > 6
                          ? "#e8c47a"
                          : THEME_TEXT_FAINT,
                  }}
                  title={`Active decor lights: ${rendererInfo.visiblePracticalDecorLights} visible / ${rendererInfo.frustumPracticalDecorLights} in frustum\nvis: ${rendererInfo.practicalDecorLightBreakdownVis}\nfr: ${rendererInfo.practicalDecorLightBreakdownFr}`}
                >
                  {rendererInfo.frustumPracticalDecorLights}L
                </span>
              ) : null}
              {rendererInfo.decorInstancedBatchesVisible > 0 ? (
                <span
                  style={{ ...monoStyle, fontSize: 10, color: THEME_SUCCESS }}
                  title={`Decor instancing: ${rendererInfo.decorInstancedBatchesVisible} batches, ${rendererInfo.decorInstancedInstancesVisible} instances\nhidden placements: ${rendererInfo.decorInstancedHiddenPlacements}\nest. draw savings: ~${rendererInfo.decorInstancedEstDrawSavings}\nlast rebuild: ${rendererInfo.decorInstancingLastRebuild || "(n/a)"}`}
                >
                  {rendererInfo.decorInstancedInstancesVisible}inst
                </span>
              ) : null}
            </>
        )}
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
        <span>Music</span>
        <span style={{ ...monoStyle, color: backgroundMusicEnabled ? THEME_ACCENT : THEME_TEXT_FAINT }}>
          {backgroundMusicEnabled ? "ON" : "OFF"}
        </span>
      </button>

      <MammothWorldDayHud conn={props.conn} />

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
                type="button"
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
              type="button"
              onClick={handleCopyRollingWindow}
              title={`Rolling-window summary only (${windowSec}s · matches FPS breakdown below)`}
              style={{
                padding: "2px 9px",
                borderRadius: 4,
                border: `1px solid ${copiedRolling ? THEME_SUCCESS : THEME_CARD_BORDER}`,
                background: copiedRolling ? "rgba(123,207,154,0.15)" : "transparent",
                color: copiedRolling ? THEME_SUCCESS : THEME_TEXT_MUTED,
                cursor: "pointer",
                fontSize: 11,
                fontFamily: UI_FONT_SANS,
              }}
            >
              {copiedRolling ? "✓ Copied" : "Copy window"}
            </button>
          </div>

          <div style={{ ...sectionHeaderStyle, marginTop: 4 }}>Recording</div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ color: THEME_TEXT_FAINT, fontSize: 10 }}>Dur</span>
            {RECORD_DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                disabled={isRecording}
                onClick={() => setRecordDurationSec(d)}
                style={{
                  padding: "2px 7px",
                  borderRadius: 4,
                  border: `1px solid ${d === recordDurationSec ? THEME_ACCENT : THEME_CARD_BORDER}`,
                  background:
                    d === recordDurationSec ? "rgba(107,140,174,0.2)" : "transparent",
                  color: d === recordDurationSec ? THEME_ACCENT : THEME_TEXT_MUTED,
                  cursor: isRecording ? "not-allowed" : "pointer",
                  opacity: isRecording ? 0.55 : 1,
                  fontSize: 11,
                  fontFamily: UI_FONT_SANS,
                }}
              >
                {d}s
              </button>
            ))}
            <button
              type="button"
              disabled={isRecording}
              onClick={handleStartRecording}
              style={{
                padding: "2px 10px",
                borderRadius: 4,
                border: `1px solid ${THEME_ERROR}`,
                background: isRecording ? "transparent" : "rgba(232,120,120,0.12)",
                color: THEME_ERROR,
                cursor: isRecording ? "not-allowed" : "pointer",
                opacity: isRecording ? 0.55 : 1,
                fontSize: 11,
                fontFamily: UI_FONT_SANS,
                fontWeight: 600,
              }}
              title={isRecording ? "Already recording" : "Capture profiler timeline"}
            >
              Record
            </button>
            {capture ? (
              <button
                type="button"
                onClick={handleClearCapture}
                disabled={isRecording}
                style={{
                  padding: "2px 9px",
                  borderRadius: 4,
                  border: `1px solid ${THEME_CARD_BORDER}`,
                  background: "transparent",
                  color: THEME_TEXT_MUTED,
                  cursor: isRecording ? "not-allowed" : "pointer",
                  fontSize: 11,
                  fontFamily: UI_FONT_SANS,
                }}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              disabled={!capture || isRecording}
              onClick={handleCopyRecording}
              title={
                capture
                  ? `Copy frozen ${capture.windowSec}s recording (summary + timeline TSV)`
                  : "Finish a recording first"
              }
              style={{
                padding: "2px 9px",
                borderRadius: 4,
                border: `1px solid ${copiedRecording ? THEME_SUCCESS : THEME_CARD_BORDER}`,
                background:
                  copiedRecording ? "rgba(123,207,154,0.15)" : !capture ? "rgba(0,0,0,0.12)" : "transparent",
                color: copiedRecording ? THEME_SUCCESS : !capture ? THEME_TEXT_FAINT : THEME_TEXT_MUTED,
                cursor: !capture || isRecording ? "not-allowed" : "pointer",
                opacity: !capture ? 0.65 : 1,
                fontSize: 11,
                fontFamily: UI_FONT_SANS,
              }}
            >
              {copiedRecording ? "✓ Copied" : "Copy recording"}
            </button>
            <span
              style={{
                ...monoStyle,
                fontSize: 10,
                color: isRecording ? THEME_ERROR : capture ? THEME_SUCCESS : THEME_TEXT_FAINT,
              }}
            >
              {recordStatusLabel}
            </span>
          </div>

          {capture ? (
            <>
              <div style={{ ...sectionHeaderStyle, marginTop: 2 }}>Recorded timeline</div>
              <FpPerfRecordedTimelines samples={capture.samples} />
              <div style={{ ...sectionHeaderStyle, marginTop: 2 }}>Spike correlation</div>
              <pre
                style={{
                  ...monoStyle,
                  fontSize: 10,
                  color: THEME_TEXT_MUTED,
                  whiteSpace: "pre-wrap",
                  margin: "0 0 8px",
                }}
              >
                {formatFpPerfSpikeCorrelationReport(capture.samples)}
              </pre>
            </>
          ) : null}

          {stats === null ? (
            <div style={{ color: THEME_TEXT_FAINT, padding: "8px 0", textAlign: "center" }}>
              Collecting data…
            </div>
          ) : (
            <>
              {/* Renderer counters */}
              <>
                    <div style={{ ...monoStyle, ...dimStyle, fontSize: 11, marginBottom: 2 }}>
                      <span
                        style={{
                          color:
                            rendererInfo.drawCalls > 200 ? THEME_ERROR : rendererInfo.drawCalls > 80 ? "#e8c47a" : THEME_SUCCESS,
                        }}
                      >
                        {rendererInfo.drawCalls} draw calls
                      </span>
                      {"  "}
                      <span>{(rendererInfo.triangles / 1000).toFixed(1)}k tris</span>
                    </div>
                    <div style={{ ...monoStyle, ...dimStyle, fontSize: 10, marginBottom: 4 }}>
                      plates {rendererInfo.visibleFloorPlates}/{rendererInfo.frustumFloorPlates}
                      {"  "}
                      interior {rendererInfo.visibleUnitInteriorMeshes}/{rendererInfo.frustumUnitInteriorMeshes}
                      {"  "}
                      props {rendererInfo.visibleApartmentPropMeshes}/{rendererInfo.frustumApartmentPropMeshes}
                      {"  "}
                      decorLights {rendererInfo.visiblePracticalDecorLights}/{rendererInfo.frustumPracticalDecorLights}
                      {"  "}
                      windowLights {rendererInfo.visiblePracticalWindowLights}/{rendererInfo.frustumPracticalWindowLights}
                    </div>
                    <div style={{ ...monoStyle, ...dimStyle, fontSize: 10, marginBottom: 4 }}>
                      kinds vis {rendererInfo.practicalDecorLightBreakdownVis}
                    </div>
                    <div style={{ ...monoStyle, ...dimStyle, fontSize: 10, marginBottom: 4 }}>
                      kinds fr {rendererInfo.practicalDecorLightBreakdownFr}
                      {"  "}
                      transparent {rendererInfo.visibleTransparentMeshes}/{rendererInfo.frustumTransparentMeshes}
                    </div>
                    {rendererInfo.decorInstancedBatchesVisible > 0 || rendererInfo.decorInstancedHiddenPlacements > 0 ? (
                      <div style={{ ...monoStyle, ...dimStyle, fontSize: 10, marginBottom: 4 }}>
                        decor inst{" "}
                        <span style={{ color: THEME_SUCCESS }}>
                          {rendererInfo.decorInstancedBatchesVisible} batches · {rendererInfo.decorInstancedInstancesVisible} inst
                        </span>
                        {"  "}
                        hidden {rendererInfo.decorInstancedHiddenPlacements}
                        {"  "}
                        ~{rendererInfo.decorInstancedEstDrawSavings} dc saved
                        {"  "}
                        fr {rendererInfo.decorInstancedBatchesFrustum}/{rendererInfo.decorInstancedInstancesFrustum}
                      </div>
                    ) : null}
                    {rendererInfo.decorInstancingLastRebuild.length > 0 ? (
                      <div
                        style={{ ...monoStyle, ...dimStyle, fontSize: 9, marginBottom: 4 }}
                        title="Last cross-placement instancing rebuild"
                      >
                        inst rebuild: {rendererInfo.decorInstancingLastRebuild}
                      </div>
                    ) : null}
              </>

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
                  ["render·preEnv", stats.sections.renderFloorPlateVisMs],
                  ["render·fpEnv", stats.sections.renderFpEnvironmentMs],
                  ["render·fpEnvSky", stats.sections.renderFpEnvironmentSkyMs],
                  ["render·fpEnvLight", stats.sections.renderFpEnvironmentLightingMs],
                  ["render·setup", stats.sections.renderSetupMs],
                  ["render·three", stats.sections.renderThreeMs],
                  ...(stats.sections.renderThreeGpuMs != null
                    ? ([["render·GPU", stats.sections.renderThreeGpuMs]] as [string, number][])
                    : []),
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
              <div style={sectionHeaderStyle}>Scene Content (Avg / Frame)</div>
              {(
                [
                  [
                    "floorPlates",
                    stats.sceneCounts.visibleFloorPlates,
                    stats.sceneCounts.frustumFloorPlates,
                  ],
                  [
                    "unitInterior",
                    stats.sceneCounts.visibleUnitInteriorMeshes,
                    stats.sceneCounts.frustumUnitInteriorMeshes,
                  ],
                  [
                    "apartmentProps",
                    stats.sceneCounts.visibleApartmentPropMeshes,
                    stats.sceneCounts.frustumApartmentPropMeshes,
                  ],
                  [
                    "decorFloorShadows",
                    stats.sceneCounts.visibleApartmentDecorFloorShadowMeshes,
                    stats.sceneCounts.frustumApartmentDecorFloorShadowMeshes,
                  ],
                  [
                    "decorLights",
                    stats.sceneCounts.visiblePracticalDecorLights,
                    stats.sceneCounts.frustumPracticalDecorLights,
                  ],
                  [
                    "windowLights",
                    stats.sceneCounts.visiblePracticalWindowLights,
                    stats.sceneCounts.frustumPracticalWindowLights,
                  ],
                  [
                    "decorTv",
                    stats.sceneCounts.visiblePracticalDecorTvLights,
                    stats.sceneCounts.frustumPracticalDecorTvLights,
                  ],
                  [
                    "decorCeiling",
                    stats.sceneCounts.visiblePracticalDecorCeilingLights,
                    stats.sceneCounts.frustumPracticalDecorCeilingLights,
                  ],
                  [
                    "decorStanding",
                    stats.sceneCounts.visiblePracticalDecorStandingLights,
                    stats.sceneCounts.frustumPracticalDecorStandingLights,
                  ],
                  [
                    "decorGrowOp",
                    stats.sceneCounts.visiblePracticalDecorGrowOpLights,
                    stats.sceneCounts.frustumPracticalDecorGrowOpLights,
                  ],
                  [
                    "transparent",
                    stats.sceneCounts.visibleTransparentMeshes,
                    stats.sceneCounts.frustumTransparentMeshes,
                  ],
                ] as [string, number, number][]
              ).map(([name, visibleValue, frustumValue]) => (
                <div key={name} style={{ ...rowStyle, ...monoStyle }}>
                  <span style={{ color: THEME_TEXT_MUTED, minWidth: 88, fontSize: 11 }}>{name}</span>
                  <span style={{ color: THEME_TEXT_MUTED, minWidth: 20, textAlign: "right" }}>
                    vis
                  </span>
                  <span style={{ color: THEME_TEXT_PRIMARY, minWidth: 42, textAlign: "right" }}>
                    {visibleValue.toFixed(1)}
                  </span>
                  <span style={{ color: THEME_TEXT_MUTED, minWidth: 18, textAlign: "right" }}>
                    fr
                  </span>
                  <span style={{ color: THEME_ACCENT, minWidth: 42, textAlign: "right" }}>
                    {frustumValue.toFixed(1)}
                  </span>
                </div>
              ))}

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
