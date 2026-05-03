import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APARTMENT_DOOR_TEMPLATES,
  APARTMENT_DOOR_TEMPLATE_TOTAL,
} from "./generatedApartmentDoors.js";
import { FACE_CODE } from "./swingDoorCollision.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** Project root (packages/world/src → repo root is three levels up). */
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rustPath = path.join(
  repoRoot,
  "apps",
  "server",
  "src",
  "generated_apartment_doors.rs",
);

function parseRustTemplates(source: string): Array<{
  floorDocId: string;
  templates: Array<{
    templateId: string;
    unitId: string;
    face: number;
    hingeX: number;
    hingeZ: number;
    feetYOffset: number;
    panelWidthM: number;
    panelHeightM: number;
  }>;
}> {
  // Sets appear as: static TEMPLATES_<i>: &[...] = &[ ... ];
  // Followed by static TEMPLATE_SETS: &[...] = &[ ... { floor_doc_id: "x", templates: TEMPLATES_<i> }, ... ];
  const setRe = /static TEMPLATES_(\d+): &\[ApartmentDoorTemplate\] = &\[([\s\S]*?)\];/g;
  const blocks: Record<string, string> = {};
  for (const m of source.matchAll(setRe)) {
    blocks[m[1]!] = m[2]!;
  }
  const tmplRe =
    /ApartmentDoorTemplate\s*\{\s*template_id:\s*"([^"]+)",\s*unit_id:\s*"([^"]+)",\s*face:\s*(\d+),\s*hinge_x:\s*([-\d.]+),\s*hinge_z:\s*([-\d.]+),\s*feet_y_offset:\s*([-\d.]+),\s*panel_w_m:\s*([-\d.]+),\s*panel_h_m:\s*([-\d.]+)\s*,\s*\}/g;

  const setsOrderRe =
    /ApartmentDoorTemplateSet\s*\{\s*floor_doc_id:\s*"([^"]+)",\s*templates:\s*TEMPLATES_(\d+)\s*,\s*\}/g;
  const ordered: Array<{ floorDocId: string; idx: string }> = [];
  for (const m of source.matchAll(setsOrderRe)) {
    ordered.push({ floorDocId: m[1]!, idx: m[2]! });
  }

  return ordered.map(({ floorDocId, idx }) => {
    const body = blocks[idx] ?? "";
    const templates = Array.from(body.matchAll(tmplRe)).map((t) => ({
      templateId: t[1]!,
      unitId: t[2]!,
      face: Number(t[3]!),
      hingeX: Number(t[4]!),
      hingeZ: Number(t[5]!),
      feetYOffset: Number(t[6]!),
      panelWidthM: Number(t[7]!),
      panelHeightM: Number(t[8]!),
    }));
    return { floorDocId, templates };
  });
}

describe("generated apartment door templates: TS ↔ Rust parity", () => {
  const rustSrc = fs.readFileSync(rustPath, "utf8");
  const rustSets = parseRustTemplates(rustSrc);

  it("has same floor-doc ordering", () => {
    const tsFloors = APARTMENT_DOOR_TEMPLATES.map((s) => s.floorDocId);
    const rustFloors = rustSets.map((s) => s.floorDocId);
    expect(rustFloors).toEqual(tsFloors);
  });

  it("has same per-floor template counts", () => {
    for (let i = 0; i < APARTMENT_DOOR_TEMPLATES.length; i++) {
      expect(rustSets[i]!.templates.length).toBe(
        APARTMENT_DOOR_TEMPLATES[i]!.templates.length,
      );
    }
  });

  it("each template matches (id, face code, hinge, panel, feet-offset)", () => {
    for (let i = 0; i < APARTMENT_DOOR_TEMPLATES.length; i++) {
      const ts = APARTMENT_DOOR_TEMPLATES[i]!;
      const rs = rustSets[i]!;
      for (let j = 0; j < ts.templates.length; j++) {
        const a = ts.templates[j]!;
        const b = rs.templates[j]!;
        expect(b.templateId).toBe(a.templateId);
        expect(b.unitId).toBe(a.unitId);
        expect(b.face).toBe(FACE_CODE[a.face]);
        expect(b.hingeX).toBeCloseTo(a.hingeX, 4);
        expect(b.hingeZ).toBeCloseTo(a.hingeZ, 4);
        expect(b.feetYOffset).toBeCloseTo(a.feetYOffset, 4);
        expect(b.panelWidthM).toBeCloseTo(a.panelWidthM, 4);
        expect(b.panelHeightM).toBeCloseTo(a.panelHeightM, 4);
      }
    }
  });

  it("TOTAL constant matches summed template count", () => {
    const total = APARTMENT_DOOR_TEMPLATES.reduce(
      (n, s) => n + s.templates.length,
      0,
    );
    expect(total).toBe(APARTMENT_DOOR_TEMPLATE_TOTAL);
  });
});
