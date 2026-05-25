import { useEffect, useRef } from "react";
import {
  getMammothCompassHeadingRad,
  subscribeMammothCompassHeading,
} from "./compassHeading.js";
import {
  THEME_CARD_BORDER,
  THEME_CARD_BG,
  THEME_TEXT_FAINT,
  THEME_TEXT_PRIMARY,
  UI_FONT_MONO,
} from "./uiTheme.js";

const TWO_PI = Math.PI * 2;

/** Degrees between minor ticks — must divide 360. */
const DEG_STEP = 15;

/** Pixels spanning one full 360° on the ticker (must equal `ticksPerCycle * PX_PER_TICK`). */
const CYCLE_PIXELS = 720;

const TICKS_PER_CYCLE = Math.round(360 / DEG_STEP);
const PX_PER_TICK = CYCLE_PIXELS / TICKS_PER_CYCLE;

const MAJOR: ReadonlyArray<{ deg: number; label: string; strong: boolean }> = [
  { deg: 0, label: "N", strong: true },
  { deg: 45, label: "NE", strong: false },
  { deg: 90, label: "E", strong: false },
  { deg: 135, label: "SE", strong: false },
  { deg: 180, label: "S", strong: false },
  { deg: 225, label: "SW", strong: false },
  { deg: 270, label: "W", strong: false },
  { deg: 315, label: "NW", strong: false },
];

/** Total tick columns — symmetric around viewport center enough for panoramic scroll at full speed. */
const TICK_COUNT = TICKS_PER_CYCLE * 13;
const TICK_CENTER_IDX = Math.floor(TICK_COUNT / 2);

function normDegDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

export function MammothCompassHud() {
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;

    const apply = (): void => {
      const heading = getMammothCompassHeadingRad();
      /** Rust-style ticker: scrolling band — forward bearing stays under the caret. */
      const offsetPx = -(heading / TWO_PI) * CYCLE_PIXELS;
      el.style.transform = `translate3d(${offsetPx}px,0,0)`;
    };

    apply();
    return subscribeMammothCompassHeading(apply);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: "50%",
        top: "max(10px, env(safe-area-inset-top, 0px))",
        transform: "translateX(-50%)",
        zIndex: 50,
        width: "min(360px, 88vw)",
        height: 40,
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 6,
          background: THEME_CARD_BG,
          border: `1px solid ${THEME_CARD_BORDER}`,
          boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 6,
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, transparent 14%, transparent 86%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 2,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderBottom: `10px solid ${THEME_TEXT_PRIMARY}`,
          filter: "drop-shadow(0 0 2px rgba(0,0,0,0.6))",
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 12,
          width: "calc(100% + 48px)",
          marginLeft: "calc(-50% - 24px)",
          height: 26,
          overflow: "hidden",
          borderRadius: 4,
          zIndex: 1,
        }}
      >
        <div
          ref={bandRef}
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            marginLeft: `${-(TICK_COUNT * PX_PER_TICK) / 2}px`,
            height: "100%",
            display: "flex",
            alignItems: "flex-end",
            willChange: "transform",
          }}
        >
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const bearingDeg = (i - TICK_CENTER_IDX) * DEG_STEP;
            const mod = normDegDeg(bearingDeg);
            let major: (typeof MAJOR)[number] | undefined;
            for (const m of MAJOR) {
              if (m.deg === mod) {
                major = m;
                break;
              }
            }
            const tickIdxFromNorth = Math.round(mod / DEG_STEP);
            const isHalfStep = tickIdxFromNorth % 2 === 1;
            const tickH = major ? (major.strong ? 14 : 12) : isHalfStep ? 5 : 8;

            return (
              <div
                key={i}
                style={{
                  width: PX_PER_TICK,
                  flex: "none",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  fontFamily: UI_FONT_MONO,
                  boxSizing: "border-box",
                }}
              >
                {major ? (
                  <span
                    style={{
                      fontSize: major.strong ? 13 : 11,
                      fontWeight: major.strong ? 700 : 600,
                      lineHeight: 1,
                      color: major.strong ? "#f6d58a" : THEME_TEXT_PRIMARY,
                      letterSpacing: major.label.length > 2 ? "-0.04em" : "0",
                      textShadow: "0 1px 2px rgba(0,0,0,0.75)",
                      marginBottom: 1,
                    }}
                  >
                    {major.label}
                  </span>
                ) : (
                  <div
                    style={{
                      height: tickH,
                      width: isHalfStep ? 1 : 2,
                      background: THEME_TEXT_FAINT,
                      opacity: isHalfStep ? 0.45 : 0.85,
                      borderRadius: 1,
                      marginBottom: 4,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
