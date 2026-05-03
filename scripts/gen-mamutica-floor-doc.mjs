#!/usr/bin/env node
/**
 * Generates Mamutica-inspired building + floor JSON:
 * - `mammoth.json` — floor stack references (PR + generated residential plates).
 * - `floor_mamutica_typical.json` — double-loaded residential plate with **symmetric** vertical
 *   cores (stair + elevator) along the spine and **segmented** corridors (no single 240 m tube).
 * - `floor_mamutica_ground.json` — podium / lobby: shell matches residential bar width, **elevator banks**, stair wells.
 *
 * Published references (hr.wikipedia infobox): ~240 m, ~60 m, 19 floors, 1169 apartments.
 * Cross-section is inferred, not surveyed.
 *
 * Usage: `pnpm content:gen-mamutica-floor` (or `node scripts/gen-mamutica-floor-doc.mjs`)
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

/** Total stack count, including PR / ground. Change this one number, then run `pnpm content:gen-mamutica-floor`. */
const TOTAL_BUILDING_FLOORS = 20;
const FLOOR_TO_CEILING_M = 3.05;
/** Must match `DEFAULT_BUILDING_FLOOR_SPACING_M` in `packages/world/src/index.ts` (stacked plates). */
const STOREY_SPACING_M = 60 / 19;
const CORRIDOR_WIDTH_M = 3.85;
const UNIT_DEPTH_M = 9.0;
const UNIT_ALONG_Z_M = 7.2;
const BAY_GAP_M = 0.1;

/** Distance (m) between core station centres along ±Z (symmetric about 0). */
const CORE_STATION_SPACING_M = 46;
const szBay = UNIT_ALONG_Z_M - BAY_GAP_M;
const unitFootprintM2 = UNIT_DEPTH_M * szBay;
const barWidthM = CORRIDOR_WIDTH_M + 2 * UNIT_DEPTH_M;

/** Spine / lobby shell length along Z: match occupied unit row so façades do not step past apartment shells. */
function shellCorridorLenFromUnitCenters(unitCentersZ) {
  if (unitCentersZ.length === 0) return halfLen * 2;
  const zMin = Math.min(...unitCentersZ) - szBay * 0.5;
  const zMax = Math.max(...unitCentersZ) + szBay * 0.5;
  return Math.round((zMax - zMin) * 1e6) / 1e6;
}
const PY_CENTER = FLOOR_TO_CEILING_M * 0.5 + 0.08;
/** Vertical centre for cores whose box height matches one full storey climb. */
const CORE_PY = STOREY_SPACING_M * 0.5 + 0.08;

const unitXEast = CORRIDOR_WIDTH_M * 0.5 + UNIT_DEPTH_M * 0.5;

/** Stair well outer box (m). Clamped so the shaft stays inside the residential bar, not past the façade. */
const STAIR_SX_RAW = 3.55 * 3;
const STAIR_SZ_RAW = 4.65 * 3;
const STAIR_SX = Math.min(STAIR_SX_RAW, UNIT_DEPTH_M - 0.65);
const STAIR_SZ = Math.min(STAIR_SZ_RAW, CORE_STATION_SPACING_M - 1.45);
/** Elevator hoistway (m). */
const ELEV_SX = 2.38;
/** Along Z for west-bank E-facing doors: must clear FP door slide (see `DOOR_SLIDE_M` + `DOOR_W`). */
const ELEV_SZ = 4.0;
/**
 * Units must never intrude into the stair/elevator station void. The station itself clears the
 * shaft footprint; per-segment centering below adds the larger balcony / landing breathing room.
 */
const CORE_CLEAR_HALF_Z = Math.max(2.85, STAIR_SZ * 0.5 + 0.45, ELEV_SZ * 0.5 + 0.45);
/** Minimum clear margin (m) from a core void or bar end to the first apartment shell. */
const UNIT_SEGMENT_EDGE_CLEAR_M = 2.2;
/**
 * Trim off the far north/south residential wings: the old ±92 m core stations plus the two
 * apartment bays beyond each station. Keeping the new ends at the old inner edge of those core
 * voids preserves every remaining unit/core coordinate instead of recentering the plan.
 */
const TRIMMED_HALF_LEN_M = CORE_STATION_SPACING_M * 2 - CORE_CLEAR_HALF_Z;
/** Two apartment bays were removed before the first surviving south unit; keep old unit IDs stable. */
const TRIMMED_SOUTH_UNIT_BAYS = 2;
/** Drives core placement + unit segmentation along Z. */
const halfLen = TRIMMED_HALF_LEN_M;

function collectCoreCentersZ() {
  const centers = [0];
  let d = CORE_STATION_SPACING_M;
  while (d < halfLen - STAIR_SZ * 0.5 - 6) {
    centers.push(d, -d);
    d += CORE_STATION_SPACING_M;
  }
  return [...new Set(centers)].sort((a, b) => a - b);
}

function collectSegmentedUnitCentersZ(coreZs) {
  const sortedCoreZs = [...coreZs].sort((a, b) => a - b);
  const segments = [];
  let segStart = -halfLen;

  for (const cz of sortedCoreZs) {
    const segEnd = cz - CORE_CLEAR_HALF_Z;
    if (segEnd > segStart + szBay) segments.push([segStart, segEnd]);
    segStart = cz + CORE_CLEAR_HALF_Z;
  }

  if (segStart < halfLen - szBay) segments.push([segStart, halfLen]);

  const out = [];
  for (const [z0, z1] of segments) {
    const segLen = z1 - z0;
    const maxUnits = Math.max(0, Math.floor((segLen - szBay) / UNIT_ALONG_Z_M) + 1);
    let count = 0;
    for (let n = maxUnits; n >= 1; n--) {
      const occupiedLen = szBay + (n - 1) * UNIT_ALONG_Z_M;
      if (occupiedLen <= segLen - UNIT_SEGMENT_EDGE_CLEAR_M * 2 + 1e-6) {
        count = n;
        break;
      }
    }
    if (count <= 0) continue;
    const center = (z0 + z1) * 0.5;
    const first = center - ((count - 1) * UNIT_ALONG_Z_M) * 0.5;
    for (let i = 0; i < count; i++) out.push(first + i * UNIT_ALONG_Z_M);
  }

  return out;
}

function typicalCoreStationNumber(cz) {
  return Math.round(cz / CORE_STATION_SPACING_M) + 3;
}

function groundRemoteElevatorNumber(cz) {
  if (cz === 0) return 0;
  return cz < 0
    ? Math.round(cz / CORE_STATION_SPACING_M) + 3
    : Math.round(cz / CORE_STATION_SPACING_M) + 2;
}

function residentialFloorCount() {
  if (!Number.isInteger(TOTAL_BUILDING_FLOORS) || TOTAL_BUILDING_FLOORS < 1) {
    throw new Error("TOTAL_BUILDING_FLOORS must be an integer >= 1");
  }
  return Math.max(0, TOTAL_BUILDING_FLOORS - 1);
}

function floorRefsForBuilding(totalFloors) {
  const refs = [
    {
      levelIndex: 1,
      floorDocId: "floor_mamutica_ground",
      displayLabel: totalFloors === 1 ? "PR / ground / top" : "PR / ground",
      shortLabel: "PR",
    },
  ];

  for (let residentialFloor = 1; residentialFloor < totalFloors; residentialFloor += 1) {
    const levelIndex = residentialFloor + 1;
    const isTop = levelIndex === totalFloors;
    refs.push({
      levelIndex,
      floorDocId: "floor_mamutica_typical",
      displayLabel: `Floor ${residentialFloor}${isTop ? " / top" : ""}`,
      shortLabel: String(residentialFloor),
    });
  }

  return refs;
}

function writeBuildingDoc() {
  const residentialFloors = residentialFloorCount();
  const residentialUnitsPerFloor = collectSegmentedUnitCentersZ(collectCoreCentersZ()).length * 2;
  const doc = {
    id: "mammoth_main",
    version: 1,
    displayName: "The Mammoth (Mamutica-scale target)",
    exteriorCellId: "cell_0_0",
    cores: [
      {
        id: "core_stair_east",
        kind: "stair",
        interiorDocId: "lobby_central",
        notes: "Placeholder until dedicated stair/interior docs exist.",
      },
    ],
    floorRefs: floorRefsForBuilding(TOTAL_BUILDING_FLOORS),
    units: [
      {
        address: { wingId: "E", floorIndex: 1, unitIndex: 1 },
        interiorTemplateId: "lobby_central",
        notes: "Dev slice until per-bay interiors exist.",
      },
      {
        address: { wingId: "E", floorIndex: 1, unitIndex: 2 },
        interiorTemplateId: "lobby_central",
        notes: "Second slot.",
      },
    ],
    slotTemplates: [
      {
        wingId: "E",
        floorRange: residentialFloors > 0 ? [2, TOTAL_BUILDING_FLOORS] : [1, 1],
        unitIndexRange: [1, residentialUnitsPerFloor],
        interiorTemplateId: "lobby_central",
      },
    ],
    metadata: {
      mamutica_reference: {
        source: "https://hr.wikipedia.org/wiki/Mamutica (infobox)",
        length_m_about: 240,
        height_m_about: 60,
        inhabited_floors: 19,
        apartments_total: 1169,
        gross_floor_area_m2_about: 100000,
        cross_section_note:
          "Wikipedia cites length/height/apartment count, not slab width. Generated floors use inferred dimensions; cores are schematic.",
      },
      generated_total_floors: TOTAL_BUILDING_FLOORS,
      generated_residential_floors: residentialFloors,
      gameplay_numbering_note: `Authored stack keeps original storey spacing; labels are PR + typical floors 1..${residentialFloors} (levelIndex 1..${TOTAL_BUILDING_FLOORS}).`,
      authored_floor_note:
        "Change TOTAL_BUILDING_FLOORS in scripts/gen-mamutica-floor-doc.mjs, then run `pnpm content:gen-mamutica-floor`, `pnpm content:gen-apartment-doors`, and `pnpm content:gen-walk-aabbs`.",
      building_access_note:
        "Hub stairs ~±13 m X; upper stories repeat cores. Placeholder hollow shells punch floor+ceiling plates at every elevator/stair footprint so shafts read as continuous vertical cuts. Walk AABBs: `pnpm content:gen-walk-aabbs` after floor edits.",
      targetResidentialUnits: residentialUnitsPerFloor * residentialFloors,
    },
  };

  const outPath = join(repoRoot, "content/building/mammoth.json");
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath} (${TOTAL_BUILDING_FLOORS} total floors).`);
}

function writeTypicalFloor() {
  const coreZs = collectCoreCentersZ();
  const unitCentersZ = collectSegmentedUnitCentersZ(coreZs);
  const shellCorridorLen = shellCorridorLenFromUnitCenters(unitCentersZ);
  const objects = [];

  /** One spine; cores sit in ±X unit columns and do not overlap this X band. */
  objects.push({
    id: "corridor_main",
    prefabId: "corridor_segment_a",
    position: [0, PY_CENTER, 0],
    scale: [CORRIDOR_WIDTH_M, FLOOR_TO_CEILING_M, shellCorridorLen],
    metadata: { note: "Residential corridor; vertical cores offset in unit bays." },
  });

  for (const [i, z] of unitCentersZ.entries()) {
    const unitNumber = i + 1 + TRIMMED_SOUTH_UNIT_BAYS;
    objects.push({
      id: `unit_e_${String(unitNumber).padStart(3, "0")}`,
      prefabId: "apartment_unit_small_a",
      position: [unitXEast, PY_CENTER, z],
      scale: [UNIT_DEPTH_M, FLOOR_TO_CEILING_M, szBay],
    });
  }
  for (const [i, z] of unitCentersZ.entries()) {
    const unitNumber = i + 1 + TRIMMED_SOUTH_UNIT_BAYS;
    objects.push({
      id: `unit_w_${String(unitNumber).padStart(3, "0")}`,
      prefabId: "apartment_unit_small_a",
      position: [-unitXEast, PY_CENTER, z],
      scale: [UNIT_DEPTH_M, FLOOR_TO_CEILING_M, szBay],
    });
  }

  for (const cz of coreZs) {
    const stationNumber = typicalCoreStationNumber(cz);
    const stairX = CORRIDOR_WIDTH_M * 0.5 + STAIR_SX * 0.5 + 0.06;
    const elevX = -(CORRIDOR_WIDTH_M * 0.5 + ELEV_SX * 0.5 + 0.06);
    objects.push({
      id: `stair_well_${String(stationNumber).padStart(2, "0")}_e`,
      prefabId: "stair_well_a",
      position: [stairX, CORE_PY, cz],
      scale: [STAIR_SX, STOREY_SPACING_M, STAIR_SZ],
      metadata: { coreZ: cz, side: "east" },
    });
    objects.push({
      id: `elevator_shaft_${String(stationNumber).padStart(2, "0")}_w`,
      prefabId: "elevator_shaft_a",
      position: [elevX, CORE_PY, cz],
      scale: [ELEV_SX, STOREY_SPACING_M, ELEV_SZ],
      metadata: { coreZ: cz, side: "west" },
    });
  }

  const doc = {
    id: "floor_mamutica_typical",
    version: 1,
    displayName: "Mamutica typical residential plate (generated)",
    metadata: {
      mamutica_reference:
        "Zagreb Mamutica: ~240 m length, ~60 m height, 19 inhabited floors, 1169 apartments (hr.wikipedia).",
      generated_corridor_length_m: shellCorridorLen,
      inferred_double_loaded_bar_width_m: barWidthM,
      unit_bay_footprint_about_m2: Math.round(unitFootprintM2 * 100) / 100,
      core_station_centers_z_m: coreZs,
      core_spacing_m: CORE_STATION_SPACING_M,
      stair_prefab: "stair_well_a",
      elevator_prefab: "elevator_shaft_a",
      symmetry: "Each station: stair east (+X), elevator west (−X); stations mirrored in ±Z from centre.",
    },
    objects,
  };

  const outPath = join(repoRoot, "content/building/floors/floor_mamutica_typical.json");
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${outPath} (${objects.length} objects). Core stations: ${coreZs.length}.`,
  );
}

function writeGroundFloor() {
  const coreZs = collectCoreCentersZ();
  const unitCentersZ = collectSegmentedUnitCentersZ(coreZs);
  /** Match typical residential plate XZ footprint so podium façades align with storey-2+ apartment shells. */
  const shellCorridorLen = shellCorridorLenFromUnitCenters(unitCentersZ);
  const lobbyLen = shellCorridorLen;
  /** Same width as double-loaded bar (`barWidthM`): hub cores stay inside without a wide perimeter ring. */
  const lobbyWide = barWidthM;
  const objects = [];

  objects.push({
    id: "lobby_main_ns",
    prefabId: "lobby_hall_a",
    position: [0, PY_CENTER, 0],
    scale: [lobbyWide, FLOOR_TO_CEILING_M, lobbyLen],
    metadata: {
      note: "Single podium hall: elevators + stairs all inside this shell so they are visible from x=z=0.",
    },
  });

  /** Same X/Z grid as `writeTypicalFloor` cores so podium hoistways stack with slab + shell holes. */
  const stairXHub = CORRIDOR_WIDTH_M * 0.5 + STAIR_SX * 0.5 + 0.06;
  const elevX = -(CORRIDOR_WIDTH_M * 0.5 + ELEV_SX * 0.5 + 0.06);
  const elevScale = [ELEV_SX, STOREY_SPACING_M, ELEV_SZ];
  const stairScale = [STAIR_SX, STOREY_SPACING_M, STAIR_SZ];
  const hubZ = 0;

  /** West bank only at z=0 — east bank would overlap the hub stair footprint (same X band). */
  objects.push(
    {
      id: "elev_hub_w",
      prefabId: "elevator_shaft_a",
      position: [elevX, CORE_PY, hubZ],
      scale: elevScale,
      metadata: { role: "primary_bank", side: "west" },
    },
    {
      id: "stair_hub_e",
      prefabId: "stair_well_a",
      position: [stairXHub, CORE_PY, hubZ],
      scale: stairScale,
      metadata: { role: "primary_stair", side: "east" },
    },
  );

  /**
   * Peripheral west-bank hoistways at every residential core Z **except** z=0 (hub).
   * Must match typical `elevator_shaft_*` stations or upper slabs cap the shaft (solid underside).
   */
  for (const cz of coreZs) {
    if (cz === hubZ) continue;
    const remoteNumber = groundRemoteElevatorNumber(cz);
    objects.push({
      id: `elev_remote_${String(remoteNumber).padStart(2, "0")}`,
      prefabId: "elevator_shaft_a",
      position: [elevX, CORE_PY, cz],
      scale: elevScale,
      metadata: { role: "peripheral_bank", coreZ: cz },
    });
  }

  const doc = {
    id: "floor_mamutica_ground",
    version: 1,
    displayName: "Mamutica ground / podium (generated)",
    metadata: {
      note: "Hub at z=0; satellite lifts share Z (and west X) with typical-floor hoistways so stacked slabs stay open.",
      lobby_length_m: lobbyLen,
      lobby_width_m: lobbyWide,
      recommended_spawn_xz_m: [0, 0],
    },
    objects,
  };

  const outPath = join(repoRoot, "content/building/floors/floor_mamutica_ground.json");
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath} (${objects.length} objects).`);
}

writeBuildingDoc();
writeTypicalFloor();
writeGroundFloor();
