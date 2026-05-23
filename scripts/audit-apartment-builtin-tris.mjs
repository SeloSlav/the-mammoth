import fs from "node:fs";
import path from "node:path";

function countTrianglesInGlb(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  if (buf.length < 20) return null;
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) return null;
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.slice(20, 20 + jsonLen).toString("utf8");
  const gltf = JSON.parse(jsonStr);
  let totalTris = 0;
  let meshCount = 0;
  let primCount = 0;
  for (const mesh of gltf.meshes ?? []) {
    meshCount++;
    for (const prim of mesh.primitives ?? []) {
      const mode = prim.mode ?? 4;
      if (mode !== 4) continue;
      primCount++;
      if (prim.indices !== undefined) {
        totalTris += Math.floor(gltf.accessors[prim.indices].count / 3);
      } else if (prim.attributes?.POSITION !== undefined) {
        totalTris += Math.floor(gltf.accessors[prim.attributes.POSITION].count / 3);
      }
    }
  }
  return { totalTris, meshCount, primCount, fileSize: buf.length };
}

const builtins = JSON.parse(
  fs.readFileSync("content/apartment/owned_apartment_builtins.json", "utf8"),
);
const modelsRoot = "apps/client/public";

/** Procedural stand-ins where GLB was removed (from unit tests / builders). */
const PROCEDURAL_TRIS = {
  "static/models/objects/window-shutter.glb": 800,
};

const byModel = new Map();
const placements = [];

for (const item of builtins.placedItems) {
  const rel = item.modelRelPath.trim().replace(/^\/+/u, "");
  const fullPath = path.join(modelsRoot, rel);
  let info = countTrianglesInGlb(fullPath);
  if (!info && PROCEDURAL_TRIS[rel]) {
    info = {
      totalTris: PROCEDURAL_TRIS[rel],
      meshCount: -1,
      primCount: -1,
      fileSize: 0,
      procedural: true,
    };
  }
  placements.push({
    id: item.id,
    rel,
    tris: info?.totalTris ?? 0,
    missing: !info,
    itemKind: item.itemKind,
  });
  if (!byModel.has(rel)) {
    byModel.set(rel, { ...info, count: 0, totalInstTris: 0 });
  }
  const m = byModel.get(rel);
  m.count++;
  m.totalInstTris += info?.totalTris ?? 0;
}

let grandTotal = 0;
const missing = [];
for (const p of placements) {
  grandTotal += p.tris;
  if (p.missing) missing.push(p.rel);
}

const sortedModels = [...byModel.entries()].sort(
  (a, b) => b[1].totalInstTris - a[1].totalInstTris,
);

console.log("=== PLACEMENT SUMMARY ===");
console.log("Total placements:", placements.length);
console.log("Unique models:", byModel.size);
console.log("Grand total triangles (all instances):", grandTotal.toLocaleString());
console.log("");
console.log("=== BY MODEL (sorted by instance total tris) ===");
console.log(
  "model".padEnd(45),
  "inst",
  "tris/ea",
  "total",
  "fileKB",
  "meshes",
);
for (const [rel, m] of sortedModels) {
  const perInst = m.count > 0 ? Math.round(m.totalInstTris / m.count) : 0;
  const kb = m.fileSize ? Math.round(m.fileSize / 1024) : "proc";
  console.log(
    rel.replace("static/models/objects/", "").padEnd(45),
    String(m.count).padStart(3),
    String(perInst).padStart(7),
    String(m.totalInstTris).padStart(7),
    String(kb).padStart(6),
    String(m.meshCount).padStart(6),
  );
}
console.log("");
console.log("=== TOP 15 HEAVIEST SINGLE GLBs ===");
const byBaseTris = [...byModel.entries()].sort(
  (a, b) => b[1].totalInstTris / b[1].count - a[1].totalInstTris / a[1].count,
);
for (const [rel, m] of byBaseTris.slice(0, 15)) {
  const perInst = Math.round(m.totalInstTris / m.count);
  console.log(
    perInst.toLocaleString().padStart(8),
    "tris",
    rel.replace("static/models/objects/", ""),
    `(${m.count}x → ${m.totalInstTris.toLocaleString()} total)`,
  );
}
if (missing.length) {
  console.log("");
  console.log("MISSING:", [...new Set(missing)]);
}

let totalBytes = 0;
const bloat = [];
const cats = {
  "Hero furniture (>5k tris)": 0,
  "Medium props (2-5k)": 0,
  "Small clutter (<2k)": 0,
};

for (const [, m] of byModel) {
  totalBytes += m.fileSize * m.count;
  const perInst = m.count > 0 ? m.totalInstTris / m.count : 0;
  const kbPerKTri = perInst > 0 ? m.fileSize / 1024 / (perInst / 1000) : 999;
  if (m.fileSize > 500_000 && kbPerKTri > 500) {
    bloat.push({ rel: [...byModel.entries()].find(([, v]) => v === m)?.[0], ...m, kbPerKTri });
  }
  const bucket =
    perInst >= 5000
      ? "Hero furniture (>5k tris)"
      : perInst >= 2000
        ? "Medium props (2-5k)"
        : "Small clutter (<2k)";
  cats[bucket] += m.totalInstTris;
}

console.log("");
console.log("Total disk (all instances, no GPU dedup):", Math.round(totalBytes / 1024 / 1024), "MB");
console.log("");
console.log("=== TRI BUDGET BY CATEGORY ===");
for (const [k, v] of Object.entries(cats)) {
  console.log(k + ":", v.toLocaleString(), `(${Math.round((v / grandTotal) * 100)}%)`);
}

console.log("");
console.log("=== TEXTURE/DISK BLOAT (high KB per 1k tris, >500KB file) ===");
const bloatRows = [...byModel.entries()]
  .map(([rel, m]) => {
    const perInst = m.count > 0 ? m.totalInstTris / m.count : 0;
    return {
      rel,
      fileKB: Math.round(m.fileSize / 1024),
      tris: Math.round(perInst),
      inst: m.count,
      kbPerKTri: perInst > 0 ? Math.round(m.fileSize / 1024 / (perInst / 1000)) : 0,
    };
  })
  .filter((r) => r.fileKB > 500 && r.kbPerKTri > 500)
  .sort((a, b) => b.kbPerKTri - a.kbPerKTri);
for (const r of bloatRows.slice(0, 12)) {
  console.log(
    String(r.fileKB).padStart(6),
    "KB",
    String(r.tris).padStart(6),
    "tris",
    String(r.kbPerKTri).padStart(5),
    "KB/kTri",
    r.rel.replace("static/models/objects/", ""),
    `(×${r.inst})`,
  );
}
