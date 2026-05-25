import type { FpPerfTimelineSample } from "./fpSessionPerfStore.js";

export type FpPerfSpikeClassification =
  | "lights+props"
  | "props-only"
  | "lights-only"
  | "other";

export type FpPerfSpikeCorrelationRow = {
  tMs: number;
  totalMs: number;
  renderThreeMs: number;
  frProps: number;
  frDecorLights: number;
  decorKindBreakdownFr: string;
  propsDelta: number;
  lightsDelta: number;
  classification: FpPerfSpikeClassification;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function percentile(values: number[], frac: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(frac * sorted.length));
  return sorted[idx]!;
}

function classifySpike(
  propsDelta: number,
  lightsDelta: number,
): FpPerfSpikeClassification {
  const propsHigh = propsDelta >= 15;
  const lightsHigh = lightsDelta >= 2;
  if (propsHigh && lightsHigh) return "lights+props";
  if (propsHigh) return "props-only";
  if (lightsHigh) return "lights-only";
  return "other";
}

function decorKindBreakdownFromSample(sample: FpPerfTimelineSample): string {
  const parts: string[] = [];
  if (sample.frustumPracticalDecorTvLights > 0) {
    parts.push(`tv:${Math.round(sample.frustumPracticalDecorTvLights)}`);
  }
  if (sample.frustumPracticalDecorComputerLights > 0) {
    parts.push(`computer:${Math.round(sample.frustumPracticalDecorComputerLights)}`);
  }
  if (sample.frustumPracticalDecorCeilingLights > 0) {
    parts.push(`ceiling:${Math.round(sample.frustumPracticalDecorCeilingLights)}`);
  }
  if (sample.frustumPracticalDecorChandelierLights > 0) {
    parts.push(`chandelier:${Math.round(sample.frustumPracticalDecorChandelierLights)}`);
  }
  if (sample.frustumPracticalDecorStandingLights > 0) {
    parts.push(`standing:${Math.round(sample.frustumPracticalDecorStandingLights)}`);
  }
  if (sample.frustumPracticalDecorGrowOpLights > 0) {
    parts.push(`growOp:${Math.round(sample.frustumPracticalDecorGrowOpLights)}`);
  }
  return parts.length > 0 ? parts.join(" ") : "(none)";
}

export function analyzeFpPerfSpikeCorrelation(
  samples: readonly FpPerfTimelineSample[],
): {
  baselineFrProps: number;
  baselineFrDecorLights: number;
  spikeThresholdMs: number;
  spikes: FpPerfSpikeCorrelationRow[];
  summaryLines: string[];
} {
  if (samples.length === 0) {
    return {
      baselineFrProps: 0,
      baselineFrDecorLights: 0,
      spikeThresholdMs: 33,
      spikes: [],
      summaryLines: ["Spike correlation: (no samples)"],
    };
  }

  const totals = samples.map((s) => s.totalMs);
  const frProps = samples.map((s) => s.frustumApartmentPropMeshes);
  const frLights = samples.map((s) => s.frustumPracticalDecorLights);
  const baselineFrProps = median(frProps);
  const baselineFrDecorLights = median(frLights);
  const spikeThresholdMs = Math.max(33, percentile(totals, 0.95));

  const spikes: FpPerfSpikeCorrelationRow[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.totalMs < spikeThresholdMs) continue;
    const propsDelta = s.frustumApartmentPropMeshes - baselineFrProps;
    const lightsDelta = s.frustumPracticalDecorLights - baselineFrDecorLights;
    spikes.push({
      tMs: s.tMs,
      totalMs: s.totalMs,
      renderThreeMs: s.renderThreeMs,
      frProps: s.frustumApartmentPropMeshes,
      frDecorLights: s.frustumPracticalDecorLights,
      decorKindBreakdownFr: decorKindBreakdownFromSample(s),
      propsDelta,
      lightsDelta,
      classification: classifySpike(propsDelta, lightsDelta),
    });
  }

  spikes.sort((a, b) => b.totalMs - a.totalMs);

  const counts: Record<FpPerfSpikeClassification, number> = {
    "lights+props": 0,
    "props-only": 0,
    "lights-only": 0,
    other: 0,
  };
  for (let i = 0; i < spikes.length; i++) {
    counts[spikes[i]!.classification] += 1;
  }

  const summaryLines = [
    "Spike correlation (frames >= threshold):",
    `  baseline frProps=${baselineFrProps.toFixed(1)}  frDecorLights=${baselineFrDecorLights.toFixed(1)}  threshold=${spikeThresholdMs.toFixed(1)}ms  spikes=${spikes.length}`,
    `  lights+props=${counts["lights+props"]}  props-only=${counts["props-only"]}  lights-only=${counts["lights-only"]}  other=${counts.other}`,
  ];

  const top = spikes.slice(0, 8);
  if (top.length === 0) {
    summaryLines.push("  (no frames exceeded spike threshold)");
  } else {
    summaryLines.push("  Top spikes:");
    for (let i = 0; i < top.length; i++) {
      const row = top[i]!;
      summaryLines.push(
        `    ${String(i + 1).padStart(2)}. ${row.totalMs.toFixed(1)}ms  three=${row.renderThreeMs.toFixed(1)}ms  ${row.classification.padEnd(12)}  props=${row.frProps.toFixed(0)} (+${row.propsDelta.toFixed(0)})  lights=${row.frDecorLights.toFixed(0)} (+${row.lightsDelta.toFixed(0)})  kinds=${row.decorKindBreakdownFr}`,
      );
    }
  }

  return {
    baselineFrProps,
    baselineFrDecorLights,
    spikeThresholdMs,
    spikes,
    summaryLines,
  };
}

export function formatFpPerfSpikeCorrelationReport(
  samples: readonly FpPerfTimelineSample[],
): string {
  return analyzeFpPerfSpikeCorrelation(samples).summaryLines.join("\n");
}
