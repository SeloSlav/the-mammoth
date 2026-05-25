import type { FpPracticalDecorLightKind } from "./fpSessionPracticalLightCounters.js";
import { FP_PRACTICAL_DECOR_LIGHT_KINDS } from "./fpSessionPracticalLightCounters.js";

/** Flat scalar fields for profiler ring buffer / {@link FpRendererInfo}. */
export type FpPracticalDecorLightKindFields = {
  visiblePracticalDecorTvLights: number;
  frustumPracticalDecorTvLights: number;
  visiblePracticalDecorComputerLights: number;
  frustumPracticalDecorComputerLights: number;
  visiblePracticalDecorCeilingLights: number;
  frustumPracticalDecorCeilingLights: number;
  visiblePracticalDecorChandelierLights: number;
  frustumPracticalDecorChandelierLights: number;
  visiblePracticalDecorStandingLights: number;
  frustumPracticalDecorStandingLights: number;
  visiblePracticalDecorGrowOpLights: number;
  frustumPracticalDecorGrowOpLights: number;
};

const KIND_TO_VISIBLE_KEY: Record<FpPracticalDecorLightKind, keyof FpPracticalDecorLightKindFields> =
  {
    tv: "visiblePracticalDecorTvLights",
    computer: "visiblePracticalDecorComputerLights",
    ceiling: "visiblePracticalDecorCeilingLights",
    chandelier: "visiblePracticalDecorChandelierLights",
    standing: "visiblePracticalDecorStandingLights",
    growOp: "visiblePracticalDecorGrowOpLights",
  };

const KIND_TO_FRUSTUM_KEY: Record<FpPracticalDecorLightKind, keyof FpPracticalDecorLightKindFields> =
  {
    tv: "frustumPracticalDecorTvLights",
    computer: "frustumPracticalDecorComputerLights",
    ceiling: "frustumPracticalDecorCeilingLights",
    chandelier: "frustumPracticalDecorChandelierLights",
    standing: "frustumPracticalDecorStandingLights",
    growOp: "frustumPracticalDecorGrowOpLights",
  };

export function emptyFpPracticalDecorLightKindFields(): FpPracticalDecorLightKindFields {
  return {
    visiblePracticalDecorTvLights: 0,
    frustumPracticalDecorTvLights: 0,
    visiblePracticalDecorComputerLights: 0,
    frustumPracticalDecorComputerLights: 0,
    visiblePracticalDecorCeilingLights: 0,
    frustumPracticalDecorCeilingLights: 0,
    visiblePracticalDecorChandelierLights: 0,
    frustumPracticalDecorChandelierLights: 0,
    visiblePracticalDecorStandingLights: 0,
    frustumPracticalDecorStandingLights: 0,
    visiblePracticalDecorGrowOpLights: 0,
    frustumPracticalDecorGrowOpLights: 0,
  };
}

export function fpPracticalDecorLightKindFieldsFromCounter(
  decorByKind: Record<FpPracticalDecorLightKind, { visible: number; frustum: number }>,
): FpPracticalDecorLightKindFields {
  const out = emptyFpPracticalDecorLightKindFields();
  for (let i = 0; i < FP_PRACTICAL_DECOR_LIGHT_KINDS.length; i++) {
    const kind = FP_PRACTICAL_DECOR_LIGHT_KINDS[i]!;
    out[KIND_TO_VISIBLE_KEY[kind]] = decorByKind[kind].visible;
    out[KIND_TO_FRUSTUM_KEY[kind]] = decorByKind[kind].frustum;
  }
  return out;
}

export function addFpPracticalDecorLightKindFields(
  dst: FpPracticalDecorLightKindFields,
  src: FpPracticalDecorLightKindFields,
): void {
  dst.visiblePracticalDecorTvLights += src.visiblePracticalDecorTvLights;
  dst.frustumPracticalDecorTvLights += src.frustumPracticalDecorTvLights;
  dst.visiblePracticalDecorComputerLights += src.visiblePracticalDecorComputerLights;
  dst.frustumPracticalDecorComputerLights += src.frustumPracticalDecorComputerLights;
  dst.visiblePracticalDecorCeilingLights += src.visiblePracticalDecorCeilingLights;
  dst.frustumPracticalDecorCeilingLights += src.frustumPracticalDecorCeilingLights;
  dst.visiblePracticalDecorChandelierLights += src.visiblePracticalDecorChandelierLights;
  dst.frustumPracticalDecorChandelierLights += src.frustumPracticalDecorChandelierLights;
  dst.visiblePracticalDecorStandingLights += src.visiblePracticalDecorStandingLights;
  dst.frustumPracticalDecorStandingLights += src.frustumPracticalDecorStandingLights;
  dst.visiblePracticalDecorGrowOpLights += src.visiblePracticalDecorGrowOpLights;
  dst.frustumPracticalDecorGrowOpLights += src.frustumPracticalDecorGrowOpLights;
}

export function scaleFpPracticalDecorLightKindFields(
  fields: FpPracticalDecorLightKindFields,
  divisor: number,
): FpPracticalDecorLightKindFields {
  const scale = divisor > 0 ? 1 / divisor : 0;
  const out = emptyFpPracticalDecorLightKindFields();
  (Object.keys(out) as (keyof FpPracticalDecorLightKindFields)[]).forEach((key) => {
    out[key] = Math.round(fields[key] * scale * 10) / 10;
  });
  return out;
}

export function formatFpPracticalDecorLightKindAverages(
  fields: FpPracticalDecorLightKindFields,
  mode: "visible" | "frustum",
): string {
  const parts: string[] = [];
  for (let i = 0; i < FP_PRACTICAL_DECOR_LIGHT_KINDS.length; i++) {
    const kind = FP_PRACTICAL_DECOR_LIGHT_KINDS[i]!;
    const key = mode === "visible" ? KIND_TO_VISIBLE_KEY[kind] : KIND_TO_FRUSTUM_KEY[kind];
    const n = fields[key];
    if (n > 0) parts.push(`${kind}:${n.toFixed(1)}`);
  }
  return parts.length > 0 ? parts.join(" ") : "(none)";
}

export type FpPracticalDecorLightKindRingBuffers = Record<
  keyof FpPracticalDecorLightKindFields,
  Float32Array
>;

export function createFpPracticalDecorLightKindRingBuffers(
  ringSize: number,
): FpPracticalDecorLightKindRingBuffers {
  const empty = emptyFpPracticalDecorLightKindFields();
  const out = {} as FpPracticalDecorLightKindRingBuffers;
  (Object.keys(empty) as (keyof FpPracticalDecorLightKindFields)[]).forEach((key) => {
    out[key] = new Float32Array(ringSize);
  });
  return out;
}

export function writeFpPracticalDecorLightKindFieldsToRing(
  i: number,
  fields: FpPracticalDecorLightKindFields,
  ring: FpPracticalDecorLightKindRingBuffers,
): void {
  const keys = Object.keys(emptyFpPracticalDecorLightKindFields()) as (keyof FpPracticalDecorLightKindFields)[];
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k]!;
    ring[key][i] = fields[key];
  }
}

export function readFpPracticalDecorLightKindFieldsFromRing(
  i: number,
  ring: FpPracticalDecorLightKindRingBuffers,
): FpPracticalDecorLightKindFields {
  const out = emptyFpPracticalDecorLightKindFields();
  const keys = Object.keys(out) as (keyof FpPracticalDecorLightKindFields)[];
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k]!;
    out[key] = ring[key][i] ?? 0;
  }
  return out;
}

export function resetFpPracticalDecorLightKindRingBuffers(
  ring: FpPracticalDecorLightKindRingBuffers,
): void {
  (Object.keys(ring) as (keyof FpPracticalDecorLightKindFields)[]).forEach((key) => {
    ring[key].fill(0);
  });
}
