/** Validates the shape of a consumable presentation JSON before writing to disk. */
export function assertValidConsumablePresentationJson(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") throw new Error("consumable presentation: not an object");
  const p = parsed as Record<string, unknown>;
  if (p.version !== 1) throw new Error('consumable presentation: version must be 1');
  const fp = p.firstPerson;
  if (!fp || typeof fp !== "object") {
    throw new Error("consumable presentation: firstPerson must be an object");
  }
  const m = (fp as Record<string, unknown>).mount;
  if (m !== undefined) {
    const mount = m as Record<string, unknown>;
    assertVec3(mount.positionM, "firstPerson.mount.positionM");
    assertVec3(mount.eulerRad, "firstPerson.mount.eulerRad");
    assertVec3(mount.scaleM, "firstPerson.mount.scaleM");
  }
}

function assertVec3(v: unknown, label: string): void {
  if (!v || typeof v !== "object") throw new Error(`${label} must be an object`);
  const vv = v as Record<string, unknown>;
  if (typeof vv.x !== "number" || typeof vv.y !== "number" || typeof vv.z !== "number") {
    throw new Error(`${label} must have numeric x, y, z`);
  }
}
