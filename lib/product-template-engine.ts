export type TemplateData = Record<string, string | number | null | undefined>;

export type ProductTemplateShape = {
  titleTemplate: string;
  skuTemplate: string;
};

const FIELD_ALIASES: Record<string, string> = {
  w: "size_w",
  h: "size_h",
  thk: "thickness_mm",
  hand: "handing",
};

function normalizeValue(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "number") return Number.isFinite(input) ? String(input) : "";
  return String(input).trim();
}

function firstLetters(value: string, len: number): string {
  const words = value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "X".repeat(len);
  const merged = words.join("");
  return merged.slice(0, len).padEnd(len, "X");
}

function getBaseFieldValue(token: string, data: TemplateData): string {
  const mapped = FIELD_ALIASES[token] ?? token;
  return normalizeValue(data[mapped] ?? data[token]);
}

export function renderTemplateText(template: string, data: TemplateData): string {
  return template.replace(/\{([a-z_]+)(\?)?\}/gi, (_, rawToken: string, optional: string | undefined) => {
    const token = rawToken.toLowerCase();
    const value = getBaseFieldValue(token, data);
    if (!value) return "";
    if (optional) return ` ${value}`;
    return value;
  }).replace(/\s+/g, " ").trim();
}

type DictionaryCodeMap = Record<string, string>;

export function buildDictionaryMap(
  rows: Array<{ attribute: string; value: string; code: string }>,
): DictionaryCodeMap {
  const map: DictionaryCodeMap = {};
  for (const row of rows) {
    const key = `${row.attribute.toLowerCase()}::${row.value.toLowerCase()}`;
    map[key] = row.code.toUpperCase();
  }
  return map;
}

function resolveSkuToken(token: string, data: TemplateData, dict: DictionaryCodeMap): string {
  const lowered = token.toLowerCase();
  const directValue = getBaseFieldValue(lowered, data);
  if (["w", "h", "thk"].includes(lowered)) {
    return directValue.replace(/[^\d.]/g, "") || "0";
  }

  const shortMatch = lowered.match(/^([a-z_]+?)(\d)$/);
  const baseKey = shortMatch ? shortMatch[1] : lowered;
  const len = shortMatch ? Number(shortMatch[2]) : 3;
  const fieldName = FIELD_ALIASES[baseKey] ?? baseKey;
  const fieldValue = getBaseFieldValue(fieldName, data);
  if (!fieldValue) return "X".repeat(Math.max(1, len));

  const dictKey = `${fieldName.toLowerCase()}::${fieldValue.toLowerCase()}`;
  const fromDict = dict[dictKey];
  if (fromDict) return fromDict.slice(0, len).padEnd(len, "X");
  return firstLetters(fieldValue, len);
}

export function renderTemplateSku(
  template: string,
  data: TemplateData,
  dictionaryRows: Array<{ attribute: string; value: string; code: string }>,
): string {
  const dict = buildDictionaryMap(dictionaryRows);
  return template
    .replace(/\{([a-z0-9_]+)\}/gi, (_, rawToken: string) => resolveSkuToken(rawToken, data, dict))
    .replace(/[^A-Z0-9\-_.]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}
