import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

function toNum(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const salesReturn = await prisma.salesReturn.findUnique({
      where: { id },
      select: { id: true, salesOrderId: true, fulfillmentId: true, status: true },
    });
    if (!salesReturn) return NextResponse.json({ error: "Return not found." }, { status: 404 });

    const availableFulfillments = await prisma.salesOrderFulfillment.findMany({
      where: { salesOrderId: salesReturn.salesOrderId },
      select: { id: true, type: true, status: true, scheduledAt: true, scheduledDate: true },
      orderBy: { createdAt: "desc" },
    });

    const requestedFulfillmentId = String(request.nextUrl.searchParams.get("fulfillmentId") ?? "").trim();
    const selectedFulfillmentId = requestedFulfillmentId || salesReturn.fulfillmentId || "";
    if (!selectedFulfillmentId) {
      return NextResponse.json(
        {
          data: {
            fulfillmentId: null,
            availableFulfillments,
            items: [],
          },
        },
        { status: 200 },
      );
    }

    const selectedFulfillment = await prisma.salesOrderFulfillment.findFirst({
      where: { id: selectedFulfillmentId, salesOrderId: salesReturn.salesOrderId },
      select: { id: true },
    });
    if (!selectedFulfillment) {
      return NextResponse.json({ error: "Selected fulfillment does not belong to this sales order." }, { status: 404 });
    }

    const fulfillmentItems = await prisma.salesOrderFulfillmentItem.findMany({
      where: { fulfillmentId: selectedFulfillment.id, variantId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        variantId: true,
        title: true,
        sku: true,
        fulfilledQty: true,
        variant: { select: { displayName: true, sku: true } },
      },
    });
    const fulfillmentItemIds = fulfillmentItems.map((item) => item.id);

    const completedReturnedRows =
      fulfillmentItemIds.length > 0
        ? await prisma.salesReturnItem.findMany({
            where: {
              fulfillmentItemId: { in: fulfillmentItemIds },
              salesReturn: { status: "COMPLETED" },
            },
            select: { fulfillmentItemId: true, qty: true },
          })
        : [];
    const completedReturnedMap = new Map<string, number>();
    for (const row of completedReturnedRows) {
      completedReturnedMap.set(
        row.fulfillmentItemId,
        (completedReturnedMap.get(row.fulfillmentItemId) ?? 0) + toNum(row.qty),
      );
    }

    const currentReturnItems =
      fulfillmentItemIds.length > 0
        ? await prisma.salesReturnItem.findMany({
            where: { returnId: salesReturn.id, fulfillmentItemId: { in: fulfillmentItemIds } },
            select: { fulfillmentItemId: true, qty: true },
          })
        : [];
    const currentReturnMap = new Map<string, number>();
    for (const row of currentReturnItems) {
      currentReturnMap.set(row.fulfillmentItemId, toNum(row.qty));
    }

    const items = fulfillmentItems.map((item) => {
      const fulfilled = toNum(item.fulfilledQty);
      const alreadyReturnedQty = completedReturnedMap.get(item.id) ?? 0;
      const maxReturnable = Math.max(fulfilled - alreadyReturnedQty, 0);
      return {
        fulfillmentItemId: item.id,
        variantId: String(item.variantId),
        title: item.variant?.displayName || item.title || "Item",
        sku: item.sku || item.variant?.sku || "-",
        fulfilledQty: fulfilled,
        alreadyReturnedQty,
        maxReturnable,
        currentReturnQty: currentReturnMap.get(item.id) ?? 0,
      };
    });

    return NextResponse.json(
      {
        data: {
          fulfillmentId: selectedFulfillment.id,
          availableFulfillments,
          items,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/returns/[id]/picker-items error:", error);
    return NextResponse.json({ error: "Failed to load return picker items." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const requestedFulfillmentId = String(payload?.fulfillmentId ?? "").trim();
    const pickedItems: Array<{ fulfillmentItemId: string; qty: number }> = Array.isArray(payload?.items)
      ? payload.items
      : [];

    const data = await prisma.$transaction(async (tx) => {
      const salesReturn = await tx.salesReturn.findUnique({
        where: { id },
        select: { id: true, salesOrderId: true, fulfillmentId: true, status: true },
      });
      if (!salesReturn) throw new Error("RETURN_NOT_FOUND");
      if (salesReturn.status === "COMPLETED" || salesReturn.status === "CANCELLED") throw new Error("RETURN_LOCKED");

      const targetFulfillmentId = requestedFulfillmentId || salesReturn.fulfillmentId || "";
      if (!targetFulfillmentId) throw new Error("FULFILLMENT_REQUIRED");

      const selectedFulfillment = await tx.salesOrderFulfillment.findFirst({
        where: { id: targetFulfillmentId, salesOrderId: salesReturn.salesOrderId },
        select: { id: true },
      });
      if (!selectedFulfillment) throw new Error("FULFILLMENT_NOT_FOUND");

      if (salesReturn.fulfillmentId !== selectedFulfillment.id) {
        await tx.salesReturn.update({
          where: { id: salesReturn.id },
          data: { fulfillmentId: selectedFulfillment.id },
        });
      }

      const candidates = await tx.salesOrderFulfillmentItem.findMany({
        where: { fulfillmentId: selectedFulfillment.id, variantId: { not: null } },
        select: {
          id: true,
          variantId: true,
          fulfilledQty: true,
        },
      });
      const byId = new Map(candidates.map((row) => [row.id, row]));
      const candidateIds = candidates.map((row) => row.id);

      const completedReturnedRows =
        candidateIds.length > 0
          ? await tx.salesReturnItem.findMany({
              where: {
                fulfillmentItemId: { in: candidateIds },
                salesReturn: { status: "COMPLETED" },
              },
              select: { fulfillmentItemId: true, qty: true },
            })
          : [];
      const completedReturnedMap = new Map<string, number>();
      for (const row of completedReturnedRows) {
        completedReturnedMap.set(
          row.fulfillmentItemId,
          (completedReturnedMap.get(row.fulfillmentItemId) ?? 0) + toNum(row.qty),
        );
      }

      const existingCurrentItems =
        candidateIds.length > 0
          ? await tx.salesReturnItem.findMany({
              where: { returnId: salesReturn.id, fulfillmentItemId: { in: candidateIds } },
              select: { id: true, fulfillmentItemId: true, qty: true },
            })
          : [];
      const currentMap = new Map(existingCurrentItems.map((row) => [row.fulfillmentItemId, row]));

      for (const row of pickedItems) {
        const fulfillmentItemId = String(row?.fulfillmentItemId ?? "").trim();
        const qty = Number(row?.qty ?? 0);
        if (!fulfillmentItemId) throw new Error("ITEM_ID_REQUIRED");
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("ITEM_QTY_INVALID");

        const source = byId.get(fulfillmentItemId);
        if (!source || !source.variantId) throw new Error("ITEM_NOT_FOUND");

        const fulfilledQty = toNum(source.fulfilledQty);
        const alreadyReturnedQty = completedReturnedMap.get(fulfillmentItemId) ?? 0;
        const maxReturnable = Math.max(fulfilledQty - alreadyReturnedQty, 0);
        const existingDraftQty = toNum(currentMap.get(fulfillmentItemId)?.qty);
        if (existingDraftQty + qty > maxReturnable + 0.0001) {
          throw new Error(`ITEM_QTY_EXCEEDS_MAX:${fulfillmentItemId}:${maxReturnable}`);
        }

        const existing = currentMap.get(fulfillmentItemId);
        if (existing) {
          const nextQty = existingDraftQty + qty;
          await tx.salesReturnItem.update({
            where: { id: existing.id },
            data: { qty: nextQty },
          });
        } else {
          await tx.salesReturnItem.create({
            data: {
              returnId: salesReturn.id,
              fulfillmentItemId,
              variantId: source.variantId,
              qty,
            },
          });
        }
      }

      return tx.salesReturn.findUnique({
        where: { id: salesReturn.id },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              fulfillmentItem: { select: { id: true, title: true, sku: true, unit: true, fulfilledQty: true } },
              variant: { select: { id: true, sku: true, displayName: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "RETURN_NOT_FOUND") {
      return NextResponse.json({ error: "Return not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "RETURN_LOCKED") {
      return NextResponse.json({ error: "Cannot add items to completed/cancelled return." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "FULFILLMENT_REQUIRED") {
      return NextResponse.json({ error: "Select a fulfillment to add items." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "FULFILLMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Fulfillment not found for this sales order." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ITEM_ID_REQUIRED") {
      return NextResponse.json({ error: "fulfillmentItemId is required." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ITEM_QTY_INVALID") {
      return NextResponse.json({ error: "qty must be > 0." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return NextResponse.json({ error: "Selected item is invalid." }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("ITEM_QTY_EXCEEDS_MAX:")) {
      const parts = error.message.split(":");
      const max = Number(parts[2] ?? 0);
      return NextResponse.json(
        { error: `Return qty exceeds max returnable. Max allowed: ${max.toFixed(2)}.` },
        { status: 400 },
      );
    }
    console.error("POST /api/returns/[id]/picker-items error:", error);
    return NextResponse.json({ error: "Failed to add return items." }, { status: 500 });
  }
}
