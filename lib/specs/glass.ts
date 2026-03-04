import { formatSubtitle, getEffectiveSpecs, type EffectiveSpecs } from "@/lib/specs/effective";

export type { EffectiveSpecs };
export { getEffectiveSpecs };

export function getCustomerSpecLine(specs: EffectiveSpecs) {
  return formatSubtitle(specs);
}

export function getInternalSpecLine(specs: EffectiveSpecs) {
  return formatSubtitle(specs);
}

export function getGlassLabel(glassType: string | null | undefined, glassFinish: string | null | undefined) {
  const subtitle = formatSubtitle({
    openingType: null,
    slidingConfig: null,
    glassType: glassType ?? null,
    glassCoating: null,
    glassThicknessMm: null,
    glassFinish: glassFinish ?? null,
    screen: null,
  });
  return subtitle || "Custom";
}

