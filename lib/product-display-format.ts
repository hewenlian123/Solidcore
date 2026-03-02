type SpecPair = { label: string; value: string };

function parseSpecPairs(detailText: string | null | undefined): SpecPair[] {
  const lines = String(detailText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx <= 0) return null;
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter((row): row is SpecPair => Boolean(row));
}

function pickSpecValue(pairs: SpecPair[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  const row = pairs.find((pair) => normalizedAliases.includes(pair.label.toLowerCase()));
  return row?.value ?? "";
}

function cleanDimensionPart(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/['"″”“]/g, "")
    .replace(/\s+/g, "");
}

function toSizeText(rawWidth: string, rawHeight: string) {
  const width = cleanDimensionPart(rawWidth);
  const height = cleanDimensionPart(rawHeight);
  if (!width || !height) return "";
  return `${width}''x${height}''`;
}

function extractSize(pairs: SpecPair[]) {
  const width = pickSpecValue(pairs, ["width", "w"]);
  const height = pickSpecValue(pairs, ["height", "h"]);
  if (width && height) return toSizeText(width, height);

  const singleSize = pickSpecValue(pairs, ["size", "dimension", "dimensions"]);
  if (!singleSize) return "";
  const compact = singleSize.replace(/\s+/g, "");
  const parts = compact.split(/x|×/i);
  if (parts.length < 2) return "";
  return toSizeText(parts[0], parts[1]);
}

export function buildPublicSpecLines(detailText: string | null | undefined) {
  const pairs = parseSpecPairs(detailText);
  const size = extractSize(pairs);
  const color = pickSpecValue(pairs, ["color", "colour", "finish", "finish/color"]);
  const type = pickSpecValue(pairs, ["type", "variant type", "variant_type"]);
  const glass = pickSpecValue(pairs, ["glass"]);

  const lines: string[] = [];
  if (size) lines.push(`Size: ${size}`);
  if (color) lines.push(`Color: ${color}`);
  if (type) lines.push(`Type: ${type}`);
  if (glass) lines.push(`Glass: ${glass}`);
  return lines;
}

export function buildPdfPrimaryLine(baseName: string | null | undefined, detailText: string | null | undefined) {
  const base = String(baseName ?? "").trim() || "-";
  const pairs = parseSpecPairs(detailText);
  const size = extractSize(pairs).replace(/''/g, '"');
  const color = pickSpecValue(pairs, ["color", "colour", "finish", "finish/color"]);
  if (size && color) return `${base} ${size} (${color})`;
  if (size) return `${base} ${size}`;
  if (color) return `${base} (${color})`;
  return base;
}

export function buildCompactSpecLine(detailText: string | null | undefined) {
  const pairs = parseSpecPairs(detailText);
  const glass = pickSpecValue(pairs, ["glass"]);
  const type = pickSpecValue(pairs, ["type", "variant type", "variant_type"]);
  const frameMaterial = pickSpecValue(pairs, ["material", "frame", "frame material"]);
  return [glass, frameMaterial, type].filter(Boolean).join(" · ");
}

export function buildProductDisplayName(baseName: string | null | undefined, detailText: string | null | undefined) {
  const base = String(baseName ?? "").trim() || "-";
  const pairs = parseSpecPairs(detailText);
  const size = extractSize(pairs);
  const color = pickSpecValue(pairs, ["color", "colour", "finish", "finish/color"]);

  if (size && color) return `${base}-${size}(${color})`;
  if (size) return `${base}-${size}`;
  if (color) return `${base}(${color})`;
  return base;
}

type LineDisplayInput = {
  variantTitle?: string | null;
  detailText?: string | null;
  width?: string | number | null;
  height?: string | number | null;
  color?: string | null;
};

export function getLineDisplayTitle(input: LineDisplayInput) {
  const variantTitle = String(input.variantTitle ?? "").trim();
  const variantHasSizeOrColor = /(\d+\s*["']?\s*[x×]\s*\d+)|\([^)]+\)/.test(variantTitle);
  if (variantTitle && variantHasSizeOrColor) return variantTitle;

  const pairs = parseSpecPairs(input.detailText);
  const fallbackColor = pickSpecValue(pairs, ["color", "colour", "finish", "finish/color"]);
  const color = String(input.color ?? fallbackColor ?? "").trim();

  const widthRaw =
    input.width !== null && input.width !== undefined && String(input.width).trim()
      ? String(input.width)
      : pickSpecValue(pairs, ["width", "w"]);
  const heightRaw =
    input.height !== null && input.height !== undefined && String(input.height).trim()
      ? String(input.height)
      : pickSpecValue(pairs, ["height", "h"]);

  const width = cleanDimensionPart(widthRaw);
  const height = cleanDimensionPart(heightRaw);
  const parsedSize = extractSize(pairs)
    .replace(/''/g, '"')
    .replace(/\s*x\s*/i, "×");
  const sizeText = width && height ? `${width}"×${height}"` : parsedSize;

  if (sizeText && color) return `${sizeText} (${color})`;
  if (sizeText) return sizeText;
  if (color) return color;
  if (variantTitle) return variantTitle;
  return "-";
}
