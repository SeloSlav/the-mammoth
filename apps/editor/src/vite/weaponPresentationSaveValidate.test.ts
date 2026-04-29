import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertValidWeaponPresentationJson } from "./weaponPresentationSaveValidate.js";

const _dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(_dir, "../../../..");
const crowbarPath = join(repoRoot, "content/weapons/crowbar.presentation.json");
const knifePath = join(repoRoot, "content/weapons/knife.presentation.json");
const baseballBatPath = join(repoRoot, "content/weapons/baseball-bat.presentation.json");
const srbosjekPath = join(repoRoot, "content/weapons/srbosjek.presentation.json");

describe("assertValidWeaponPresentationJson", () => {
  it("accepts committed crowbar.presentation.json", () => {
    const parsed = JSON.parse(readFileSync(crowbarPath, "utf8")) as unknown;
    expect(() => assertValidWeaponPresentationJson(parsed)).not.toThrow();
  });

  it("accepts committed knife.presentation.json", () => {
    const parsed = JSON.parse(readFileSync(knifePath, "utf8")) as unknown;
    expect(() => assertValidWeaponPresentationJson(parsed)).not.toThrow();
  });

  it("accepts committed baseball-bat.presentation.json", () => {
    const parsed = JSON.parse(readFileSync(baseballBatPath, "utf8")) as unknown;
    expect(() => assertValidWeaponPresentationJson(parsed)).not.toThrow();
  });

  it("accepts committed srbosjek.presentation.json", () => {
    const parsed = JSON.parse(readFileSync(srbosjekPath, "utf8")) as unknown;
    expect(() => assertValidWeaponPresentationJson(parsed)).not.toThrow();
  });

  it("rejects absurd firstPerson.mount.scaleM", () => {
    const parsed = JSON.parse(readFileSync(crowbarPath, "utf8")) as Record<string, unknown>;
    const first = { ...(parsed.firstPerson as Record<string, unknown>) };
    const mount = { ...(first.mount as Record<string, unknown>), scaleM: { x: 100, y: 1, z: 1 } };
    const tampered = { ...parsed, firstPerson: { ...first, mount } };
    expect(() => assertValidWeaponPresentationJson(tampered)).toThrow(/scaleM/);
  });

  it("rejects fpViewmodel rigRoot pinned to the old ±2.5m clamp face (hand vanishes in FPOV)", () => {
    const parsed = JSON.parse(readFileSync(crowbarPath, "utf8")) as Record<string, unknown>;
    const first = { ...(parsed.firstPerson as Record<string, unknown>) };
    const fp = { ...(first.fpViewmodel as Record<string, unknown>) };
    const rigRoot = {
      ...(fp.rigRoot as Record<string, unknown>),
      positionM: { x: 0.13, y: -2.49, z: -0.32 },
    };
    const tampered = {
      ...parsed,
      firstPerson: { ...first, fpViewmodel: { ...fp, rigRoot } },
    };
    expect(() => assertValidWeaponPresentationJson(tampered)).toThrow(/rigRoot\.positionM/);
  });

  it("rejects rigRoot y deep into shins / ground (symmetric cube used to allow this)", () => {
    const parsed = JSON.parse(readFileSync(crowbarPath, "utf8")) as Record<string, unknown>;
    const first = { ...(parsed.firstPerson as Record<string, unknown>) };
    const fp = { ...(first.fpViewmodel as Record<string, unknown>) };
    const rigRoot = {
      ...(fp.rigRoot as Record<string, unknown>),
      positionM: { x: 0.25, y: -1.05, z: 0.1 },
    };
    const tampered = {
      ...parsed,
      firstPerson: { ...first, fpViewmodel: { ...fp, rigRoot } },
    };
    expect(() => assertValidWeaponPresentationJson(tampered)).toThrow(/rigRoot\.positionM/);
  });
});
