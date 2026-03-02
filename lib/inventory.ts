export const LOW_STOCK_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_LOW_STOCK_THRESHOLD ?? process.env.LOW_STOCK_THRESHOLD ?? 10,
);

export const CATEGORY_OPTIONS = [
  { label: "Windows", value: "WINDOW" },
  { label: "Flooring", value: "FLOOR" },
  { label: "Mirrors", value: "MIRROR" },
  { label: "Doors", value: "DOOR" },
  { label: "Warehouse Supplies", value: "WAREHOUSE_SUPPLY" },
  { label: "Other", value: "OTHER" },
] as const;

export const UNIT_OPTIONS = [
  { label: "sq ft", value: "SQM" },
  { label: "set", value: "SET" },
  { label: "piece", value: "PIECE" },
  { label: "sheet", value: "SHEET" },
] as const;

export const CATEGORY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((item) => [item.value, item.label]),
);

export const UNIT_LABEL_MAP: Record<string, string> = Object.fromEntries(
  UNIT_OPTIONS.map((item) => [item.value, item.label]),
);
