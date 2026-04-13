/**
 * RMS-match the FP footstep set + shared peak ceiling (≈ −0.13 dBFS).
 * Run from repo root: `pnpm content:normalize-footsteps` or `pnpm content:normalize-footsteps -- --dry-run`
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { WaveFile } from "wavefile";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const UI_DIR = path.join(REPO_ROOT, "apps", "client", "public", "audio", "ui");

const FOOTSTEP_FILES = [
  "footstep.wav",
  "footstep-2.wav",
  "footstep-3.wav",
  "footstep-4.wav",
  "footstep-5.wav",
  "footstep-6.wav",
] as const;

/** Ignore near-silence when computing per-file RMS (noise floor). */
const MIN_RMS = 0.0009;
/** Clamp per-file RMS gain so we do not explode noise beds. */
const RMS_GAIN_MIN = 0.35;
const RMS_GAIN_MAX = 4.2;
/** Final inter-sample peak target (linear). */
const PEAK_TARGET = 0.986;

type ParsedTrack = {
  rel: string;
  abs: string;
  sampleRate: number;
  numChannels: number;
  /** One Float64Array per channel, same frame count. */
  channels: Float64Array[];
};

function loadTrack(abs: string, rel: string): ParsedTrack {
  const wav = new WaveFile(fs.readFileSync(abs));
  wav.toBitDepth("32f");
  const raw = wav.getSamples(false, Float64Array);
  const nc = wav.fmt.numChannels;
  const sr = wav.fmt.sampleRate;
  const channels: Float64Array[] = Array.isArray(raw)
    ? (raw as Float64Array[]).map((ch) => Float64Array.from(ch))
    : [Float64Array.from(raw as Float64Array)];
  if (channels.length !== nc) {
    throw new Error(`${rel}: channel count mismatch (${channels.length} vs ${nc})`);
  }
  return { rel, abs, sampleRate: sr, numChannels: nc, channels };
}

function rmsAllChannels(channels: Float64Array[]): number {
  let sum = 0;
  let n = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i]!;
      sum += x * x;
      n++;
    }
  }
  return Math.sqrt(sum / n);
}

function maxAbsAll(channels: Float64Array[]): number {
  let m = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i]!));
  }
  return m;
}

function scaleChannels(channels: Float64Array[], g: number): void {
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c]!;
    for (let i = 0; i < ch.length; i++) ch[i]! *= g;
  }
}

function writeTrack(t: ParsedTrack): void {
  const out = new WaveFile();
  const sampleArrays =
    t.numChannels === 1
      ? Array.from(t.channels[0]!)
      : t.channels.map((ch) => Array.from(ch));
  if (t.numChannels === 1) {
    out.fromScratch(1, t.sampleRate, "32f", sampleArrays as unknown as number[]);
  } else {
    out.fromScratch(
      t.numChannels,
      t.sampleRate,
      "32f",
      sampleArrays as unknown as number[][],
    );
  }
  out.toBitDepth("16");
  fs.writeFileSync(t.abs, Buffer.from(out.toBuffer()));
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");

  const tracks: ParsedTrack[] = [];
  for (const rel of FOOTSTEP_FILES) {
    const abs = path.join(UI_DIR, rel);
    if (!fs.existsSync(abs)) continue;
    tracks.push(loadTrack(abs, rel));
  }

  if (tracks.length === 0) {
    console.error(`No files found under ${UI_DIR}`);
    process.exit(1);
  }

  const rmsBefore = tracks.map((t) => rmsAllChannels(t.channels));
  const targetRms =
    rmsBefore.reduce((a, b) => a + b, 0) / Math.max(1, rmsBefore.length);

  console.log(`Target RMS (mean of set): ${targetRms.toFixed(6)}`);

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    const r = Math.max(rmsBefore[i]!, MIN_RMS);
    let g = targetRms / r;
    g = Math.min(RMS_GAIN_MAX, Math.max(RMS_GAIN_MIN, g));
    scaleChannels(t.channels, g);
    console.log(
      `  ${t.rel}: RMS ${rmsBefore[i]!.toFixed(6)} × ${g.toFixed(3)} (RMS-match)`,
    );
  }

  let peak = 0;
  for (const t of tracks) peak = Math.max(peak, maxAbsAll(t.channels));
  const finalG = peak > 1e-9 ? PEAK_TARGET / peak : 1;
  for (const t of tracks) scaleChannels(t.channels, finalG);

  const rmsAfter = tracks.map((t) => rmsAllChannels(t.channels));
  console.log(
    `  Global peak ${peak.toFixed(5)} × ${finalG.toFixed(4)} → peak ≈ ${PEAK_TARGET}`,
  );
  for (let i = 0; i < tracks.length; i++) {
    console.log(
      `  ${tracks[i]!.rel}: RMS after ${rmsAfter[i]!.toFixed(6)}`,
    );
  }

  if (dryRun) {
    console.log("[dry-run] no files written.");
    return;
  }

  for (const t of tracks) writeTrack(t);
  console.log("Normalized WAVs written.");
}

main();
