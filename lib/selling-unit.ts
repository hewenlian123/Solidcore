type ProductCategoryLike = string | null | undefined;
type ProductUnitLike = string | null | undefined;

export type SellingUnit = "BOX" | "PIECE" | "SQFT";

export function resolveSellingUnit(category: ProductCategoryLike, unit: ProductUnitLike): SellingUnit {
  const normalizedCategory = String(category ?? "").trim().toUpperCase();
  if (normalizedCategory === "FLOOR") return "BOX";
  const normalizedUnit = String(unit ?? "").trim().toUpperCase();
  if (normalizedUnit === "PIECE") return "PIECE";
  if (normalizedUnit === "SQM" || normalizedUnit === "SQFT") return "SQFT";
  return "PIECE";
}

export function formatSellingUnitLabel(unit: SellingUnit): string {
  if (unit === "BOX") return "Boxes";
  if (unit === "SQFT") return "Sqft";
  return "Qty";
}

export function formatBoxesSqftSummary(boxes: number, sqftPerBox: number): string | null {
  if (!Number.isFinite(boxes) || boxes < 0) return null;
  if (!Number.isFinite(sqftPerBox) || sqftPerBox <= 0) return null;
  const totalSqft = boxes * sqftPerBox;
  const boxesText = Number.isInteger(boxes) ? `${boxes}` : boxes.toFixed(2).replace(/\.?0+$/, "");
  const sqftText = totalSqft.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${boxesText} boxes (${sqftText} sqft)`;
}
