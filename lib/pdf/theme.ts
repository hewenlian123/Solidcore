import { rgb } from "pdf-lib";
import { COMPANY_SETTINGS } from "@/lib/company-settings";

type RgbColor = { r: number; g: number; b: number };

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex: string, fallback: RgbColor): RgbColor {
  const raw = String(hex || "").trim().replace("#", "");
  if (!/^[\da-fA-F]{6}$/.test(raw)) return fallback;
  const n = Number.parseInt(raw, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

const defaults = {
  primary: { r: 0.13, g: 0.32, b: 0.55 },
  title: { r: 0.1, g: 0.1, b: 0.1 },
  text: { r: 0.15, g: 0.16, b: 0.2 },
  muted: { r: 0.42, g: 0.45, b: 0.5 },
};

export function getPdfThemeColors() {
  const primary = hexToRgb(COMPANY_SETTINGS.pdf_theme_primary || "", defaults.primary);
  const title = hexToRgb(COMPANY_SETTINGS.pdf_theme_title || "", defaults.title);
  const text = hexToRgb(COMPANY_SETTINGS.pdf_theme_text || "", defaults.text);
  const muted = hexToRgb(COMPANY_SETTINGS.pdf_theme_muted || "", defaults.muted);

  return {
    primary,
    title,
    text,
    muted,
    rgbPrimary: rgb(primary.r, primary.g, primary.b),
    rgbTitle: rgb(title.r, title.g, title.b),
    rgbText: rgb(text.r, text.g, text.b),
    rgbMuted: rgb(muted.r, muted.g, muted.b),
  };
}
