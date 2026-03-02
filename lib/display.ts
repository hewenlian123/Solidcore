type SpecPair = { label: string; value: string };

type VariantInput = {
  title?: string | null;
  sku?: string | null;
  width?: string | number | null;
  height?: string | number | null;
  color?: string | null;
  detailText?: string | null;
};

type LineItemInput = {
  productName?: string | null;
  variant?: VariantInput | null;
};

function cleanDimensionPart(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/['"″”“]/g, "")
    .replace(/\s+/g, "");
}

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

function hasProductPrefix(productName: string, title: string) {
  return title.toLowerCase().startsWith(productName.toLowerCase());
}

function buildSizeLabel(widthValue: string | number | null | undefined, heightValue: string | number | null | undefined) {
  const width = cleanDimensionPart(String(widthValue ?? ""));
  const height = cleanDimensionPart(String(heightValue ?? ""));
  if (!width || !height) return "";
  return `${width}"x${height}"`;
}

function buildColorText(value: unknown) {
  return String(value ?? "").trim();
}

function parseSizeFromDetailText(detailText: string | null | undefined) {
  const pairs = parseSpecPairs(detailText);
  const width = pickSpecValue(pairs, ["width", "w"]);
  const height = pickSpecValue(pairs, ["height", "h"]);
  if (width && height) return buildSizeLabel(width, height);
  const size = pickSpecValue(pairs, ["size", "dimension", "dimensions"]);
  if (!size) return "";
  const compact = size.replace(/\s+/g, "");
  const parts = compact.split(/x|×/i);
  if (parts.length < 2) return "";
  return buildSizeLabel(parts[0], parts[1]);
}

export function formatVariantLabel(variant: VariantInput | null | undefined) {
  const source = variant ?? {};
  const sizeFromFields = buildSizeLabel(source.width, source.height);
  const size = sizeFromFields || parseSizeFromDetailText(source.detailText);
  const colorFromFields = buildColorText(source.color);
  const colorFromSpecs = buildColorText(
    pickSpecValue(parseSpecPairs(source.detailText), ["color", "colour", "finish", "finish/color"]),
  );
  const color = colorFromFields || colorFromSpecs;
  if (size && color) return `${size} (${color})`;
  if (size) return size;
  if (color) return `(${color})`;

  const title = String(source.title ?? "").trim();
  if (title) return title;
  const sku = String(source.sku ?? "").trim();
  if (sku) return `SKU ${sku}`;
  return "-";
}

export function formatLineItemTitle(input: LineItemInput) {
  const productName = String(input.productName ?? "").trim();
  const variant = input.variant ?? {};
  const variantTitle = String(variant.title ?? "").trim();
  const sku = String(variant.sku ?? "").trim();
  const sizeOrColor = formatVariantLabel({
    width: variant.width,
    height: variant.height,
    color: variant.color,
    detailText: variant.detailText,
    title: null,
    sku: null,
  });
  const hasStructuredVariant = sizeOrColor !== "-";

  if (!productName) {
    if (variantTitle) return variantTitle;
    if (hasStructuredVariant) return sizeOrColor;
    if (sku) return `SKU ${sku}`;
    return "-";
  }

  if (hasStructuredVariant) return `${productName} ${sizeOrColor}`;
  if (variantTitle) {
    if (hasProductPrefix(productName, variantTitle)) return variantTitle;
    return `${productName} - ${variantTitle}`;
  }
  if (sku) return `${productName} (SKU ${sku})`;
  return productName;
}

export function formatOptionalLineNote(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const specLike =
    lines.length >= 2 &&
    lines.every((line) => /^[A-Za-z][A-Za-z0-9 /_-]{0,40}:\s*\S+/.test(line));
  if (specLike) return "";
  return raw;
}

export function formatWindowSpecificationSummary(input: {
  category?: string | null;
  detailText?: string | null;
}) {
  const category = String(input.category ?? "").trim().toUpperCase();
  if (category && category !== "WINDOW") return "";

  const pairs = parseSpecPairs(input.detailText);
  const material = buildColorText(pickSpecValue(pairs, ["material"]));
  const glass = buildColorText(pickSpecValue(pairs, ["glass", "glass type", "glass choice"]));
  const screen = buildColorText(pickSpecValue(pairs, ["screen", "screen type", "style"]));
  const openingType = buildColorText(
    pickSpecValue(pairs, ["opening type", "type", "swing", "window type"]),
  );
  const normalizedOpeningType = openingType.replace(/[_\s-]+/g, "").toUpperCase();
  const isSlidingOpening = normalizedOpeningType === "SLIDING";
  const slidingConfiguration = buildColorText(
    pickSpecValue(pairs, [
      "sliding configuration",
      "sliding direction",
      "slide direction",
      "opening direction",
      "handing",
      "hand",
      "sliding",
    ]),
  );

  const segments: string[] = [];
  if (material) segments.push(`Material: ${material}`);
  if (glass) segments.push(`Glass: ${glass}`);
  if (screen) segments.push(`Screen: ${screen}`);
  if (isSlidingOpening && slidingConfiguration) segments.push(`Sliding: ${slidingConfiguration}`);

  return segments.join(" · ");
}

function formatQty(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

export function formatInternalSubtitle(input: {
  variantSku?: string | null;
  available?: number | null;
}) {
  const sku = String(input.variantSku ?? "").trim() || "-";
  if (input.available === null || input.available === undefined || !Number.isFinite(input.available)) {
    return `SKU: ${sku}`;
  }
  return `SKU: ${sku} · Available: ${formatQty(input.available)}`;
}
