import { Prisma, PrismaClient } from "@prisma/client";

type TxLike = Prisma.TransactionClient | PrismaClient;

export async function getDefaultTaxRate(db: TxLike) {
  const row = await db.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", defaultTaxRate: new Prisma.Decimal(0) },
    select: { defaultTaxRate: true },
  });
  return Number(row.defaultTaxRate ?? 0);
}

