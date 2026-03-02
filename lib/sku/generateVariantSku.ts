import { GlassFinish } from "@/lib/specs/glass";

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function colorCodeFromColor(color: string) {
  const normalized = String(color ?? "").trim().toLowerCase();
  if (!normalized) return "";
  const map: Record<string, string> = {
    white: "W",
    black: "B",
    gray: "G",
    grey: "G",
    bronze: "Z",
  };
  return map[normalized] ?? normalized.slice(0, 1).toUpperCase();
}

export function generateVariantSku(input: {
  skuPrefix: string;
  width: number;
  height: number;
  color?: string | null;
  glassFinish?: GlassFinish | null;
  manualSkuOverride?: string | null;
}) {
  const manualSku = normalizeSkuValue(String(input.manualSkuOverride ?? ""));
  if (manualSku) {
    return {
      effectiveSku: manualSku,
      baseAutoSku: "",
      suffix: "",
      isManual: true,
    };
  }

  const prefix = normalizeSkuValue(String(input.skuPrefix ?? ""));
  const width = Number.isFinite(input.width) ? Math.trunc(input.width) : 0;
  const height = Number.isFinite(input.height) ? Math.trunc(input.height) : 0;
  const colorCode = colorCodeFromColor(String(input.color ?? ""));
  const finish = input.glassFinish ?? "CLEAR";
  const suffix = finish === "FROSTED" ? "F" : "";
  const baseAutoSku = prefix && width > 0 && height > 0 ? `${prefix}${width}${height}${colorCode}` : "";
  return {
    effectiveSku: normalizeSkuValue(`${baseAutoSku}${suffix}`),
    baseAutoSku: normalizeSkuValue(baseAutoSku),
    suffix,
    isManual: false,
  };
}

