import { prisma } from "@/lib/prisma";

const DEFAULT_TEMPLATES = [
  {
    categoryKey: "WINDOW",
    categoryLabel: "Window",
    titleTemplate: "{material} {type} Window - {color} ({w}x{h}){glass?}",
    skuTemplate: "WIN-{mat3}-{type3}-{col2}-{w}x{h}",
    requiredFields: ["material", "type", "color", "size_w", "size_h"],
    fieldOrder: ["material", "type", "style", "color", "glass", "size_w", "size_h", "finish", "rating", "notes"],
  },
  {
    categoryKey: "DOOR",
    categoryLabel: "Door",
    titleTemplate: "{material} {type} Door - {color} ({w}x{h}){swing?}{rating?}",
    skuTemplate: "DOR-{mat3}-{type3}-{col2}-{w}x{h}-{hand3}",
    requiredFields: ["material", "type", "color", "size_w", "size_h"],
    fieldOrder: ["material", "type", "style", "color", "size_w", "size_h", "swing", "handing", "rating", "notes"],
  },
  {
    categoryKey: "FLOOR",
    categoryLabel: "Flooring",
    titleTemplate: "{brand} {collection} - {color} ({thickness_mm}mm){finish?}",
    skuTemplate: "FLR-{brand3}-{col2}-{thk}",
    requiredFields: ["brand", "collection", "color", "thickness_mm"],
    fieldOrder: ["brand", "collection", "model", "color", "thickness_mm", "finish", "notes"],
  },
  {
    categoryKey: "MIRROR",
    categoryLabel: "Mirror",
    titleTemplate: "Mirror - {style} - {color} ({w}x{h})",
    skuTemplate: "MIR-{sty3}-{col2}-{w}x{h}",
    requiredFields: ["style", "color", "size_w", "size_h"],
    fieldOrder: ["style", "color", "size_w", "size_h", "finish", "notes"],
  },
];

export async function ensureProductTemplateSeeds() {
  for (const template of DEFAULT_TEMPLATES) {
    await prisma.productCategoryTemplate.upsert({
      where: { categoryKey: template.categoryKey },
      update: {
        categoryLabel: template.categoryLabel,
        titleTemplate: template.titleTemplate,
        skuTemplate: template.skuTemplate,
        requiredFields: template.requiredFields,
        fieldOrder: template.fieldOrder,
      },
      create: {
        categoryId: crypto.randomUUID(),
        categoryKey: template.categoryKey,
        categoryLabel: template.categoryLabel,
        titleTemplate: template.titleTemplate,
        skuTemplate: template.skuTemplate,
        requiredFields: template.requiredFields,
        fieldOrder: template.fieldOrder,
      },
    });
  }
}
