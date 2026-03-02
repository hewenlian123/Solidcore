import { Prisma } from "@prisma/client";

export class InsufficientInventoryError extends Error {
  variantId: string;
  available: number;
  requested: number;

  constructor(args: { variantId: string; available: number; requested: number }) {
    super("INSUFFICIENT_INVENTORY");
    this.name = "InsufficientInventoryError";
    this.variantId = args.variantId;
    this.available = args.available;
    this.requested = args.requested;
  }
}

export async function assertSufficientVariantInventory(
  tx: Prisma.TransactionClient,
  args: { variantId: string; deductionQty: number },
) {
  const deductionQty = Number(args.deductionQty);
  if (!Number.isFinite(deductionQty) || deductionQty <= 0) return;

  const stock = await tx.inventoryStock.findUnique({
    where: { variantId: args.variantId },
    select: { onHand: true, reserved: true },
  });

  const onHand = Number(stock?.onHand ?? 0);
  const reserved = Number(stock?.reserved ?? 0);
  const available = onHand - reserved;

  if (available < deductionQty) {
    throw new InsufficientInventoryError({
      variantId: args.variantId,
      available,
      requested: deductionQty,
    });
  }
}
