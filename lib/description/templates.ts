import { prisma } from "@/lib/prisma";
import { getDefaultDescriptionTemplates } from "@/lib/description/renderDescription";

export async function ensureDescriptionTemplateSeeds() {
  const defaults = getDefaultDescriptionTemplates();
  const entries = Object.entries(defaults);
  if (entries.length === 0) return;

  await Promise.all(
    entries.map(([category, template]) =>
      prisma.descriptionTemplate.upsert({
        where: { category },
        update: {},
        create: {
          category,
          templateJson: JSON.stringify(template, null, 2),
          enabled: true,
        },
      }),
    ),
  );
}

