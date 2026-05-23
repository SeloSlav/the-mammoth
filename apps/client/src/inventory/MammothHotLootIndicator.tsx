import { THEME_ACCENT } from "@the-mammoth/ui-theme";

type Props = {
  progress: number;
  size?: number;
};

/** Circular progress ring shown on a slot after hot-loot processes it. */
export function MammothHotLootIndicator({ progress, size = 24 }: Props) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 8,
        pointerEvents: "none",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={THEME_ACCENT}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {progress >= 1 ? (
        <div
          style={{
            position: "absolute",
            fontSize: 12,
            fontWeight: 800,
            color: "#7dffb8",
            textShadow: "0 0 4px rgba(80,255,160,0.8)",
          }}
        >
          ✓
        </div>
      ) : null}
    </div>
  );
}
