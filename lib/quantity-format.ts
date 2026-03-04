export function formatQuantity(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function normalizeUnitAbbr(raw: string | null | undefined) {
  const key = String(raw ?? "").trim().toUpperCase();
  if (!key) return "";
  if (key === "SQM" || key === "SQFT" || key === "SQ FT") return "sqft";
  if (key === "PIECE" || key === "PCS") return "pcs";
  if (key === "SET") return "set";
  if (key === "SHEET") return "sheet";
  if (key === "FT") return "ft";

  const normalized = key.toLowerCase();
  if (normalized === "sq ft") return "sqft";
  return normalized;
}

export function formatQuantityWithUnit(
  value: number | string | null | undefined,
  rawUnit: string | null | undefined,
) {
  const qty = formatQuantity(value);
  const unit = normalizeUnitAbbr(rawUnit);
  return unit ? `${qty} ${unit}` : qty;
}
