import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect } from "vite";
import { WEAPON_DEFINITION_ID_SET } from "../../../../packages/engine/src/weapons/weaponRegistry.js";
import { assertValidWeaponPresentationJson } from "../../../editor/src/vite/weaponPresentationSaveValidate.js";

function safeWeaponPresentationFile(repoRoot: string, weaponId: string): string | null {
  const contentRoot = path.resolve(repoRoot, "content");
  const abs = path.resolve(contentRoot, "weapons", `${weaponId}.presentation.json`);
  if (!abs.startsWith(contentRoot)) return null;
  return abs;
}

async function readJsonBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleSaveWeaponPresentation(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { weaponId?: string; json?: string };
    if (typeof body.weaponId !== "string" || !WEAPON_DEFINITION_ID_SET.has(body.weaponId)) {
      res.statusCode = 400;
      res.end("missing or invalid weaponId");
      return;
    }
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json");
      return;
    }
    assertValidWeaponPresentationJson(JSON.parse(body.json));
    const abs = safeWeaponPresentationFile(repoRoot, body.weaponId);
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.writeFile(abs, body.json, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(e instanceof Error ? e.message : "error");
  }
}

/** Dev-only POST `/__dev/save-weapon-presentation` — same contract as the editor save endpoint. */
export function weaponPresentationDevSaveMiddleware(
  repoRoot: string,
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";
    if (url === "/__dev/save-weapon-presentation" && req.method === "POST") {
      await handleSaveWeaponPresentation(repoRoot, req, res);
      return;
    }
    return next();
  };
}
