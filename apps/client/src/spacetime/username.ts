/** Decode `Option<String>` or plain string from subscription row shapes. */
export function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "tag" in value) {
    const v = value as { tag: string; value?: unknown };
    if (v.tag === "some" && typeof v.value === "string") return v.value;
  }
  return undefined;
}
