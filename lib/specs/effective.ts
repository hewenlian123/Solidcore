export type ProductSpecSource = {
  frameMaterialDefault?: string | null;
  openingTypeDefault?: string | null;
  slidingConfigDefault?: string | null;
  glassTypeDefault?: string | null;
  glassCoatingDefault?: string | null;
  glassThicknessMmDefault?: number | string | null;
  glassFinishDefault?: string | null;
  screenDefault?: string | null;
};

export type VariantSpecSource = {
  openingTypeOverride?: string | null;
  slidingConfigOverride?: string | null;
  glassTypeOverride?: string | null;
  glassCoatingOverride?: string | null;
  glassThicknessMmOverride?: number | string | null;
  glassFinishOverride?: string | null;
  screenOverride?: string | null;
  glassType?: string | null;
  screenType?: string | null;
  detailText?: string | null;
  description?: string | null;
  // legacy aliases
  slideDirection?: string | null;
};

export type EffectiveSpecs = {
  openingType: string | null;
  slidingConfig: string | null;
  glassType: string | null;
  glassCoating: string | null;
  glassThicknessMm: number | null;
  glassFinish: string | null;
  screen: string | null;
};

export type FlooringSpecSource = {
  flooringMaterial?: string | null;
  flooringWearLayer?: string | null;
  flooringThicknessMm?: number | string | null;
  flooringPlankLengthIn?: number | string | null;
  flooringPlankWidthIn?: number | string | null;
  flooringCoreThicknessMm?: number | string | null;
  flooringInstallation?: string | null;
  flooringUnderlayment?: string | null;
  flooringUnderlaymentType?: string | null;
  flooringUnderlaymentMm?: number | string | null;
  flooringPiecesPerBox?: number | string | null;
  flooringWaterproof?: boolean | null;
  flooringBoxCoverageSqft?: number | string | null;
};

function toText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function toPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const out = Math.trunc(num);
  return out > 0 ? out : null;
}

function normalizeToken(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toUpperCase();
}

function label(value: string | null | undefined) {
  const text = toText(value);
  if (!text) return null;
  if (text === text.toUpperCase() && text.includes("_")) {
    return text
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  if (text === text.toUpperCase() && text.length > 2) {
    return text.charAt(0) + text.slice(1).toLowerCase();
  }
  return text;
}

export function isFrostedFinish(value: string | null | undefined) {
  return normalizeToken(value) === "FROSTED";
}

export function getEffectiveSpecs(
  product?: ProductSpecSource | null,
  variant?: VariantSpecSource | null,
): EffectiveSpecs {
  const p = product ?? {};
  const v = variant ?? {};

  return {
    openingType: label(v.openingTypeOverride) ?? label(p.openingTypeDefault),
    slidingConfig:
      label(v.slidingConfigOverride) ?? label(v.slideDirection) ?? label(p.slidingConfigDefault),
    glassType: label(v.glassTypeOverride) ?? label(v.glassType) ?? label(p.glassTypeDefault),
    glassCoating: label(v.glassCoatingOverride) ?? label(p.glassCoatingDefault),
    glassThicknessMm:
      toPositiveInt(v.glassThicknessMmOverride) ?? toPositiveInt(p.glassThicknessMmDefault),
    glassFinish: label(v.glassFinishOverride) ?? label(p.glassFinishDefault),
    screen: label(v.screenOverride) ?? label(v.screenType) ?? label(p.screenDefault),
  };
}

export function formatSubtitle(effective: EffectiveSpecs) {
  const parts: string[] = [];
  const coatingToken = normalizeToken(effective.glassCoating);
  const glassPart = [
    effective.glassType ?? "",
    coatingToken && coatingToken !== "NONE" ? effective.glassCoating ?? "" : "",
    effective.glassThicknessMm ? `${effective.glassThicknessMm}mm` : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (glassPart) parts.push(glassPart);
  if (effective.glassFinish) parts.push(effective.glassFinish);

  const openingToken = normalizeToken(effective.openingType);
  if (openingToken === "SLIDING" && effective.slidingConfig) {
    parts.push(`Sliding ${effective.slidingConfig}`);
  } else if (effective.openingType) {
    parts.push(effective.openingType);
  }

  if (effective.screen) parts.push(effective.screen);
  return parts.join(" · ");
}

export function formatFlooringSubtitle(source?: FlooringSpecSource | null) {
  const s = source ?? {};
  const asNumText = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "";
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    return Number.isInteger(num) ? String(num) : String(num).replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
  };
  const material = label(s.flooringMaterial);
  const length = asNumText(s.flooringPlankLengthIn);
  const width = asNumText(s.flooringPlankWidthIn);
  const total = asNumText(s.flooringThicknessMm);
  const wear = toText(s.flooringWearLayer);
  const core = asNumText(s.flooringCoreThicknessMm);
  const underlaymentType = toText(s.flooringUnderlaymentType) ?? label(s.flooringUnderlayment);
  const pad = asNumText(s.flooringUnderlaymentMm);

  const parts = [
    material ? `${material}` : "",
    length && width ? `${length}"x${width}"` : "",
    total ? `${total}mm Total` : "",
    wear ? `${wear} Wear Layer` : "",
    core ? `Core ${core}mm` : "",
    underlaymentType && pad ? `${underlaymentType} ${pad}mm Pad` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

