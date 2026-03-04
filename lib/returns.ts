import { Prisma } from "@prisma/client";

export class ReturnError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReturnError";
    this.status = status;
  }
}

export async function applyCompletedReturnInventory(
  tx: Prisma.TransactionClient,
  args: { returnId: string },
) {
  const salesReturn = await tx.salesReturn.findUnique({
    where: { id: args.returnId },
    select: {
      id: true,
      status: true,
      completedAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          qty: true,
          fulfillmentItem: {
            select: { unit: true, sku: true, title: true },
          },
        },
      },
    },
  });
  if (!salesReturn) throw new ReturnError("Return not found.", 404);
  if (salesReturn.status !== "COMPLETED") {
    throw new ReturnError("Return status must be completed before applying inventory.");
  }
  if (salesReturn.completedAt) return { applied: false, reason: "already_applied" as const };

  const claim = await tx.salesReturn.updateMany({
    where: { id: salesReturn.id, completedAt: null },
    data: { completedAt: new Date() },
  });
  if (claim.count === 0) return { applied: false, reason: "already_applied" as const };

  for (const item of salesReturn.items) {
    const qty = new Prisma.Decimal(item.qty ?? 0);
    if (!item.variantId || qty.lte(0)) continue;

    await tx.inventoryStock.upsert({
      where: { variantId: item.variantId },
      create: { variantId: item.variantId, onHand: qty, reserved: new Prisma.Decimal(0) },
      update: { onHand: { increment: qty } },
    });

    await tx.inventoryMovement.create({
      data: {
        variantId: item.variantId,
        type: "RETURN_ADD",
        qty,
        unit: item.fulfillmentItem.unit ?? "unit",
        note: `Return ${salesReturn.id}: Return completed - ${item.fulfillmentItem.sku || item.fulfillmentItem.title || item.id}`,
      },
    });
  }

  return { applied: true, reason: "ok" as const };
}

export async function ensureStoreCreditForCompletedReturn(
  tx: Prisma.TransactionClient,
  args: { returnId: string },
) {
  const salesReturn = await tx.salesReturn.findUnique({
    where: { id: args.returnId },
    select: {
      id: true,
      status: true,
      issueStoreCredit: true,
      creditAmount: true,
      salesOrder: { select: { customerId: true } },
    },
  });
  if (!salesReturn) throw new ReturnError("Return not found.", 404);
  if (salesReturn.status !== "COMPLETED") return { created: false, reason: "not_completed" as const };
  if (!salesReturn.issueStoreCredit) return { created: false, reason: "disabled" as const };

  const amount = new Prisma.Decimal(salesReturn.creditAmount ?? 0);
  if (amount.lte(0)) throw new ReturnError("Credit amount must be > 0 when issuing store credit.");

  const existing = await tx.storeCredit.findUnique({
    where: { returnId: salesReturn.id },
    select: { id: true },
  });
  if (existing) return { created: false, reason: "already_exists" as const };

  await tx.storeCredit.create({
    data: {
      customerId: salesReturn.salesOrder.customerId,
      returnId: salesReturn.id,
      amount,
      status: "OPEN",
    },
  });
  return { created: true, reason: "ok" as const };
}
