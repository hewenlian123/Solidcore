export type DescriptionTemplateLine = {
  label?: string;
  key?: string;
  format?: string;
};

export type DescriptionTemplateConfig = {
  titleStyle?: string;
  lines: DescriptionTemplateLine[];
};

type RenderDescriptionInput = {
  category?: string | null;
  product?: Record<string, unknown> | null;
  variant?: Record<string, unknown> | null;
  lineOverrideDescription?: string | null;
  templateJson?: string | null;
};

const DEFAULT_TEMPLATES: Record<string, DescriptionTemplateConfig> = {
  Windows: {
    titleStyle: "product_name_only",
    lines: [
      { label: "Material", key: "material" },
      { label: "Color", key: "color" },
      { label: "Size", format: '{width}" x {height}"' },
      { label: "Glass", key: "glass" },
      { label: "Type", key: "type" },
      { label: "Style", key: "style" },
      { label: "Rating", key: "rating" },
    ],
  },
  Flooring: {
    titleStyle: "product_name_only",
    lines: [
      { label: "Type", key: "type" },
      { label: "Thickness(mm)", key: "thicknessMm" },
      { label: "Wear Layer", key: "wearLayer" },
      { label: "Box Coverage(sqft/box)", key: "boxSqft" },
      { label: "Waterproof", key: "waterproof" },
      { label: "Install", key: "install" },
      { label: "Finish", key: "finish" },
      { label: "Color", key: "color" },
    ],
  },
  Doors: {
    titleStyle: "product_name_only",
    lines: [
      { label: "Type", key: "type" },
      { label: "Material", key: "material" },
      { label: "Size", format: '{width}" x {height}"' },
      { label: "Finish/Color", format: "{finishOrColor}" },
      { label: "Swing/Handing", format: "{swingOrHanding}" },
      { label: "Core", key: "core" },
      { label: "Fire Rating", key: "fireRating" },
    ],
  },
  Mirrors: {
    titleStyle: "product_name_only",
    lines: [
      { label: "Type", key: "type" },
      { label: "Size", format: '{width}" x {height}"' },
      { label: "Finish", key: "finish" },
    ],
  },
};

function normalizeCategory(category: string | null | undefined) {
  const key = String(category ?? "").trim().toLowerCase();
  if (!key) return "";
  if (key === "window" || key === "windows") return "Windows";
  if (key === "floor" || key === "flooring") return "Flooring";
  if (key === "door" || key === "doors") return "Doors";
  if (key === "mirror" || key === "mirrors") return "Mirrors";
  return String(category).trim();
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).trim();
}

function parseTemplate(templateJson: string | null | undefined, category: string) {
  if (templateJson) {
    try {
      const parsed = JSON.parse(templateJson) as DescriptionTemplateConfig;
      if (parsed && Array.isArray(parsed.lines)) return parsed;
    } catch {
      // Fall back to default template if JSON is malformed.
    }
  }
  return DEFAULT_TEMPLATES[category] ?? { titleStyle: "product_name_only", lines: [] };
}

function buildLookup(product: Record<string, unknown>, variant: Record<string, unknown>): Record<string, string> {
  const width = variant.width ?? product.sizeW;
  const height = variant.height ?? product.sizeH;
  const finish = variant.finish ?? product.finish;
  const color = variant.color ?? product.color;
  const swing = variant.swing ?? product.swing;
  const handing = variant.handing ?? product.handing;
  return {
    productName: toText(product.name),
    material: toText(variant.material ?? product.material),
    color: toText(color),
    width: toText(width),
    height: toText(height),
    size: toText(width) && toText(height) ? `${toText(width)}" x ${toText(height)}"` : "",
    glass: toText(variant.glass ?? product.glass),
    type: toText(variant.variantType ?? variant.type ?? product.type),
    style: toText(variant.style ?? product.style),
    rating: toText(variant.rating ?? product.rating),
    thicknessMm: toText(variant.thicknessMm ?? product.thicknessMm),
    wearLayer: toText(variant.wearLayer ?? product.wearLayer),
    boxSqft: toText(variant.boxSqft ?? product.boxSqft),
    waterproof: toText(variant.waterproof ?? product.waterproof),
    install: toText(variant.install ?? product.install),
    finish: toText(finish),
    swingOrHanding: toText(swing || handing),
    finishOrColor: toText(finish || color),
    core: toText(variant.core ?? product.core),
    fireRating: toText(variant.fireRating ?? product.fireRating ?? product.rating),
  };
}

function formatLine(format: string, lookup: Record<string, string>) {
  const rendered = format.replace(/\{([^}]+)\}/g, (_, key) => lookup[String(key).trim()] ?? "");
  return rendered.trim();
}

export function renderDescription(input: RenderDescriptionInput) {
  const override = toText(input.lineOverrideDescription);
  if (override) return override;

  const category = normalizeCategory(input.category);
  const product = (input.product ?? {}) as Record<string, unknown>;
  const variant = (input.variant ?? {}) as Record<string, unknown>;

  const variantDescription = toText(variant.description);
  if (variantDescription) {
    if (variantDescription.includes("\n") || variantDescription.includes(":")) return variantDescription;
    return `Description: ${variantDescription}`;
  }

  const template = parseTemplate(input.templateJson, category);
  const lookup = buildLookup(product, variant);
  const lines: string[] = [];

  for (const line of template.lines ?? []) {
    if (!line) continue;
    let value = "";
    if (line.format) {
      value = formatLine(line.format, lookup);
    } else if (line.key) {
      value = lookup[line.key] ?? "";
    }
    value = value.trim();
    if (!value) continue;
    if (line.label) lines.push(`${line.label}: ${value}`);
    else lines.push(value);
  }

  return lines.join("\n");
}

export function getDefaultDescriptionTemplates() {
  return DEFAULT_TEMPLATES;
}

