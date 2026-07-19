export function parsePositiveQuantity(value: unknown): number | null {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    parsed = Number(trimmed);
  } else {
    return null;
  }

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
