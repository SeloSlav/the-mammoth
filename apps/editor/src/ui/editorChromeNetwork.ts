export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function postSaveFloor(
  floorDocId: string,
  json: string,
): Promise<string> {
  const res = await fetch("/__editor/save-floor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floorDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return t;
}

export async function postSaveInterior(
  interiorDocId: string,
  json: string,
): Promise<string> {
  const res = await fetch("/__editor/save-interior", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interiorDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return t;
}

export async function postSaveBuilding(json: string): Promise<string> {
  const res = await fetch("/__editor/save-building", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return t;
}
