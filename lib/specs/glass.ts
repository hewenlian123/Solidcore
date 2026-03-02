export const GLASS_TYPE_VALUES = [
  "TEMPERED_LOW_E_5MM",
  "TEMPERED_LOW_E_5MM_FROSTED",
  "TEMPERED_CLEAR_5MM",
  "OTHER",
] as const;

export const GLASS_FINISH_VALUES = ["CLEAR", "FROSTED"] as const;

export type GlassType = (typeof GLASS_TYPE_VALUES)[number];
export type GlassFinish = (typeof GLASS_FINISH_VALUES)[number];

type ProductSpecSource = {
  glassTypeDefault?: string | null;
  glassFinishDefault?: string | null;
  screenDefault?: string | null;
  openingTypeDefault?: string | null;
  // legacy fallback fields
  glass?: string | null;
  screenType?: string | null;
  handing?: string | null;
  swing?: string | null;
};

type VariantSpecSource = {
  glassTypeOverride?: string | null;
  glassFinishOverride?: string | null;
  screenOverride?: string | null;
  openingTypeOverride?: string | null;
  // legacy fallback fields
  glassType?: string | null;
  screenType?: string | null;
  slideDirection?: string | null;
  description?: string | null;
};

export type EffectiveSpecs = {
  glassType: GlassType | null;
  glassFinish: GlassFinish | null;
  screen: string | null;
  openingType: string | null;
};

function normalizeText(value: unknown) {
  const out = String(value ?? "").trim();
  return out.length > 0 ? out : null;
}

function normalizeGlassType(value: unknown): GlassType | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (GLASS_TYPE_VALUES.includes(text as GlassType)) return text as GlassType;
  return null;
}

function normalizeGlassFinish(value: unknown): GlassFinish | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (GLASS_FINISH_VALUES.includes(text as GlassFinish)) return text as GlassFinish;
  return null;
}

export function getEffectiveSpecs(
  product?: ProductSpecSource | null,
  variant?: VariantSpecSource | null,
): EffectiveSpecs {
  const p = product ?? {};
  const v = variant ?? {};
  const glassType =
    normalizeGlassType(v.glassTypeOverride) ??
    normalizeGlassType(v.glassType) ??
    normalizeGlassType(p.glassTypeDefault) ??
    null;
  const glassFinish =
    normalizeGlassFinish(v.glassFinishOverride) ??
    normalizeGlassFinish(p.glassFinishDefault) ??
    (glassType === "TEMPERED_LOW_E_5MM_FROSTED" ? "FROSTED" : "CLEAR");
  const screen = normalizeText(v.screenOverride) ?? normalizeText(v.screenType) ?? normalizeText(p.screenDefault) ?? normalizeText(p.screenType);
  const openingType =
    normalizeText(v.openingTypeOverride) ??
    normalizeText(v.slideDirection) ??
    normalizeText(p.openingTypeDefault) ??
    normalizeText(p.handing) ??
    normalizeText(p.swing);

  return {
    glassType,
    glassFinish,
    screen,
    openingType,
  };
}

export function getGlassLabel(glassType: GlassType | null | undefined, glassFinish: GlassFinish | null | undefined) {
  const finish = glassFinish ?? "CLEAR";
  const type = glassType ?? "TEMPERED_LOW_E_5MM";

  if (type === "OTHER") {
    return "Glass: Custom";
  }
  if (type === "TEMPERED_LOW_E_5MM_FROSTED" || finish === "FROSTED") {
    if (type === "TEMPERED_CLEAR_5MM") return "Tempered Clear 5mm Frosted";
    return "Tempered Low-E 5mm Frosted";
  }
  if (type === "TEMPERED_CLEAR_5MM") return "Tempered Clear 5mm";
  return "Tempered Low-E 5mm";
}

export function getCustomerSpecLine(specs: EffectiveSpecs) {
  const parts: string[] = [];
  if (specs.glassType || specs.glassFinish) {
    const glassLabel = getGlassLabel(specs.glassType, specs.glassFinish);
    if (glassLabel.startsWith("Glass: ")) parts.push(glassLabel);
    else parts.push(`Glass: ${glassLabel}`);
  }
  if (specs.screen) parts.push(`Screen: ${specs.screen}`);
  if (specs.openingType) parts.push(`Opening: ${specs.openingType}`);
  return parts.join(" · ");
}

export function getInternalSpecLine(specs: EffectiveSpecs) {
  return getCustomerSpecLine(specs);
}

