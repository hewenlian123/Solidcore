import { Prisma } from "@prisma/client";

type FulfillmentType = "PICKUP" | "DELIVERY";

type EnsureFulfillmentArgs = {
  salesOrderId: string;
  type?: FulfillmentType;
};

function toNullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function ensureFulfillmentFromSalesOrder(
  tx: Prisma.TransactionClient,
  args: EnsureFulfillmentArgs,
) {
  const salesOrder = await tx.salesOrder.findUnique({
    where: { id: args.salesOrderId },
    select: {
      id: true,
      customer: {
        select: { id: true, name: true, phone: true, address: true },
      },
      customerId: true,
      fulfillmentMethod: true,
      requestedDeliveryAt: true,
      timeWindow: true,
      deliveryName: true,
      deliveryPhone: true,
      deliveryAddress1: true,
      deliveryAddress2: true,
      deliveryCity: true,
      deliveryState: true,
      deliveryZip: true,
      deliveryNotes: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          variantId: true,
          quantity: true,
          uomSnapshot: true,
          productSku: true,
          skuSnapshot: true,
          productTitle: true,
          titleSnapshot: true,
          lineDescription: true,
          notes: true,
        },
      },
    },
  });
  if (!salesOrder) throw new Error("SALES_ORDER_NOT_FOUND");

  const type = (args.type ?? salesOrder.fulfillmentMethod ?? "PICKUP") as FulfillmentType;
  const requestedAt = salesOrder.requestedDeliveryAt ?? null;
  const existing = await tx.salesOrderFulfillment.findUnique({
    where: { salesOrderId: args.salesOrderId },
  });
  const mutableStatuses = new Set(["DRAFT", "SCHEDULED", "PACKING", "READY"]);
  const progressedStatuses = new Set([
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "PICKED_UP",
    "OUT",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]);

  const shiptoSnapshot =
    type === "DELIVERY"
      ? {
          shiptoName: toNullableText(salesOrder.deliveryName ?? salesOrder.customer?.name),
          shiptoPhone: toNullableText(salesOrder.deliveryPhone ?? salesOrder.customer?.phone),
          shiptoAddress1: toNullableText(salesOrder.deliveryAddress1),
          shiptoAddress2: toNullableText(salesOrder.deliveryAddress2),
          shiptoCity: toNullableText(salesOrder.deliveryCity),
          shiptoState: toNullableText(salesOrder.deliveryState),
          shiptoZip: toNullableText(salesOrder.deliveryZip),
          shiptoNotes: toNullableText(salesOrder.deliveryNotes),
        }
      : {
          shiptoName: null,
          shiptoPhone: null,
          shiptoAddress1: null,
          shiptoAddress2: null,
          shiptoCity: null,
          shiptoState: null,
          shiptoZip: null,
          shiptoNotes: null,
        };

  const created = existing
    ? await (async () => {
        const status = String(existing.status ?? "").toUpperCase();
        const canOverwriteSnapshot = mutableStatuses.has(status);
        const shouldTouchScheduledInProgressed = progressedStatuses.has(status) && !existing.scheduledAt;
        if (!canOverwriteSnapshot && !shouldTouchScheduledInProgressed) return existing;
        return tx.salesOrderFulfillment.update({
          where: { id: existing.id },
          data: {
            type: canOverwriteSnapshot ? type : undefined,
            scheduledAt: canOverwriteSnapshot || shouldTouchScheduledInProgressed ? requestedAt : undefined,
            scheduledDate:
              canOverwriteSnapshot || shouldTouchScheduledInProgressed
                ? requestedAt ?? existing.scheduledDate ?? new Date()
                : undefined,
            status:
              canOverwriteSnapshot && status === "DRAFT" && type === "DELIVERY" && requestedAt
                ? "SCHEDULED"
                : undefined,
            shiptoName: canOverwriteSnapshot ? shiptoSnapshot.shiptoName : undefined,
            shiptoPhone: canOverwriteSnapshot ? shiptoSnapshot.shiptoPhone : undefined,
            shiptoAddress1: canOverwriteSnapshot ? shiptoSnapshot.shiptoAddress1 : undefined,
            shiptoAddress2: canOverwriteSnapshot ? shiptoSnapshot.shiptoAddress2 : undefined,
            shiptoCity: canOverwriteSnapshot ? shiptoSnapshot.shiptoCity : undefined,
            shiptoState: canOverwriteSnapshot ? shiptoSnapshot.shiptoState : undefined,
            shiptoZip: canOverwriteSnapshot ? shiptoSnapshot.shiptoZip : undefined,
            shiptoNotes: canOverwriteSnapshot ? shiptoSnapshot.shiptoNotes : undefined,
            deliveryName: canOverwriteSnapshot ? shiptoSnapshot.shiptoName : undefined,
            deliveryPhone: canOverwriteSnapshot ? shiptoSnapshot.shiptoPhone : undefined,
            address1: canOverwriteSnapshot ? shiptoSnapshot.shiptoAddress1 : undefined,
            address2: canOverwriteSnapshot ? shiptoSnapshot.shiptoAddress2 : undefined,
            city: canOverwriteSnapshot ? shiptoSnapshot.shiptoCity : undefined,
            state: canOverwriteSnapshot ? shiptoSnapshot.shiptoState : undefined,
            zip: canOverwriteSnapshot ? shiptoSnapshot.shiptoZip : undefined,
            address:
              canOverwriteSnapshot && type === "DELIVERY"
                ? [shiptoSnapshot.shiptoAddress1, shiptoSnapshot.shiptoAddress2, shiptoSnapshot.shiptoCity, shiptoSnapshot.shiptoState, shiptoSnapshot.shiptoZip]
                    .filter(Boolean)
                    .join(", ") || null
                : undefined,
            notes: canOverwriteSnapshot ? shiptoSnapshot.shiptoNotes : undefined,
            timeWindow: canOverwriteSnapshot && salesOrder.timeWindow != null ? salesOrder.timeWindow : undefined,
            pickupContact: canOverwriteSnapshot && type === "PICKUP" ? toNullableText(salesOrder.customer?.name) : undefined,
          },
        });
      })()
    : await tx.salesOrderFulfillment.create({
        data: {
          salesOrderId: salesOrder.id,
          customerId: salesOrder.customerId ?? salesOrder.customer?.id ?? null,
          type,
          status: type === "DELIVERY" && requestedAt ? "SCHEDULED" : "DRAFT",
          scheduledAt: requestedAt,
          scheduledDate: requestedAt ?? new Date(),
          shiptoName: shiptoSnapshot.shiptoName,
          shiptoPhone: shiptoSnapshot.shiptoPhone,
          shiptoAddress1: shiptoSnapshot.shiptoAddress1,
          shiptoAddress2: shiptoSnapshot.shiptoAddress2,
          shiptoCity: shiptoSnapshot.shiptoCity,
          shiptoState: shiptoSnapshot.shiptoState,
          shiptoZip: shiptoSnapshot.shiptoZip,
          shiptoNotes: shiptoSnapshot.shiptoNotes,
          deliveryName: shiptoSnapshot.shiptoName,
          deliveryPhone: shiptoSnapshot.shiptoPhone,
          address1: shiptoSnapshot.shiptoAddress1,
          address2: shiptoSnapshot.shiptoAddress2,
          city: shiptoSnapshot.shiptoCity,
          state: shiptoSnapshot.shiptoState,
          zip: shiptoSnapshot.shiptoZip,
          address:
            type === "DELIVERY"
              ? [shiptoSnapshot.shiptoAddress1, shiptoSnapshot.shiptoAddress2, shiptoSnapshot.shiptoCity, shiptoSnapshot.shiptoState, shiptoSnapshot.shiptoZip]
                  .filter(Boolean)
                  .join(", ") || null
              : null,
          notes: shiptoSnapshot.shiptoNotes,
          timeWindow: toNullableText(salesOrder.timeWindow),
          pickupContact: type === "PICKUP" ? toNullableText(salesOrder.customer?.name) : null,
        },
      });

  for (const item of salesOrder.items) {
    const title =
      toNullableText(item.titleSnapshot) ??
      toNullableText(item.productTitle) ??
      toNullableText(item.lineDescription) ??
      "Item";
    const sku = toNullableText(item.skuSnapshot) ?? toNullableText(item.productSku) ?? "-";
    const unit = toNullableText(item.uomSnapshot) ?? "unit";
    await tx.salesOrderFulfillmentItem.upsert({
      where: {
        fulfillmentId_salesOrderItemId: {
          fulfillmentId: created.id,
          salesOrderItemId: item.id,
        },
      },
      update: {
        variantId: item.variantId ?? null,
        title,
        sku,
        unit,
        orderedQty: item.quantity,
        notes: toNullableText(item.notes),
      },
      create: {
        fulfillmentId: created.id,
        salesOrderItemId: item.id,
        variantId: item.variantId ?? null,
        title,
        sku,
        unit,
        orderedQty: item.quantity,
        notes: toNullableText(item.notes),
      },
    });
  }

  return {
    fulfillment: created,
    existed: Boolean(existing),
  };
}
