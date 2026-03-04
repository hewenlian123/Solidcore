import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  applyCompletedReturnInventory,
  ensureStoreCreditForCompletedReturn,
  ReturnError,
} from "@/lib/returns";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

const STATUS_MAP: Record<string, "DRAFT" | "COMPLETED" | "CANCELLED"> = {
  draft: "DRAFT",
  completed: "COMPLETED",
  canceled: "CANCELLED",
  cancelled: "CANCELLED",
};

const AFTER_SALES_STATUS_MAP: Record<
  string,
  "DRAFT" | "APPROVED" | "RECEIVED" | "REFUNDED" | "CLOSED" | "VOID"
> = {
  draft: "DRAFT",
  approved: "APPROVED",
  received: "RECEIVED",
  refunded: "REFUNDED",
  closed: "CLOSED",
  void: "VOID",
  completed: "CLOSED",
  cancelled: "VOID",
  canceled: "VOID",
};

const NEXT_AFTER_SALES_STATUS: Record<
  "DRAFT" | "APPROVED" | "RECEIVED" | "REFUNDED" | "CLOSED" | "VOID",
  Array<"DRAFT" | "APPROVED" | "RECEIVED" | "REFUNDED" | "CLOSED" | "VOID">
> = {
  DRAFT: ["APPROVED", "VOID"],
  APPROVED: ["RECEIVED", "VOID"],
  RECEIVED: ["REFUNDED", "CLOSED", "VOID"],
  REFUNDED: ["CLOSED"],
  CLOSED: [],
  VOID: [],
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const afterSales = await prisma.afterSalesReturn.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        salesOrder: { select: { id: true, orderNumber: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        items: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (afterSales) return NextResponse.json({ data: afterSales }, { status: 200 });

    const data = await prisma.salesReturn.findUnique({
      where: { id },
      include: {
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        fulfillment: {
          select: { id: true, status: true, type: true },
        },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            fulfillmentItem: {
              select: {
                id: true,
                title: true,
                sku: true,
                unit: true,
                orderedQty: true,
                fulfilledQty: true,
              },
            },
            variant: { select: { id: true, sku: true, displayName: true } },
          },
        },
      },
    });
    if (!data) return NextResponse.json({ error: "Return not found." }, { status: 404 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/returns/[id] error:", error);
    return NextResponse.json({ error: "Failed to load return." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const existingAfterSales = await prisma.afterSalesReturn.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    const afterSalesStatus =
      payload.status !== undefined
        ? AFTER_SALES_STATUS_MAP[String(payload.status).toLowerCase()]
        : undefined;
    if (existingAfterSales) {
      if (payload.status !== undefined && !afterSalesStatus) {
        throw new Error("AFTER_SALES_STATUS_INVALID");
      }
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      const data = await prisma.$transaction(async (tx) => {
        if (
          afterSalesStatus &&
          afterSalesStatus !== existingAfterSales.status &&
          !NEXT_AFTER_SALES_STATUS[existingAfterSales.status].includes(afterSalesStatus)
        ) {
          throw new Error("AFTER_SALES_STATUS_FLOW_INVALID");
        }
        if (nextItems.length > 0) {
          for (const item of nextItems) {
            const itemId = String(item.id ?? "").trim();
            const qtyPurchased = Number(item.qtyPurchased ?? 0);
            const qtyReturn = Number(item.qtyReturn ?? 0);
            const unitPrice = Number(item.unitPrice ?? 0);
            if (!itemId) throw new Error("RETURN_ITEM_ID_REQUIRED");
            if (!Number.isFinite(qtyReturn) || qtyReturn < 0) throw new Error("RETURN_ITEM_QTY_INVALID");
            if (Number.isFinite(qtyPurchased) && qtyPurchased >= 0 && qtyReturn > qtyPurchased + 0.0001) {
              throw new Error("RETURN_ITEM_QTY_EXCEED_PURCHASED");
            }
            const clampedQtyReturn = Number.isFinite(qtyPurchased)
              ? Math.max(0, Math.min(qtyReturn, qtyPurchased))
              : Math.max(0, qtyReturn);
            await tx.afterSalesReturnItem.update({
              where: { id: itemId },
              data: {
                qtyReturn: clampedQtyReturn,
                reason: item.reason !== undefined ? String(item.reason || "").trim() || null : undefined,
                condition: item.condition !== undefined ? String(item.condition || "").trim() || null : undefined,
                unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined,
                lineRefund: round2((Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0) * clampedQtyReturn),
              },
            });
          }
        }

        const aggregates = await tx.afterSalesReturnItem.aggregate({
          where: { returnId: id },
          _sum: { lineRefund: true },
        });
        const refundTotal = round2(Number(aggregates._sum.lineRefund ?? 0));
        const isClosingTransition =
          afterSalesStatus === "CLOSED" && existingAfterSales.status !== "CLOSED";
        const updated = await tx.afterSalesReturn.update({
          where: { id },
          data: {
            status: afterSalesStatus ?? undefined,
            notes: payload.notes !== undefined ? String(payload.notes || "").trim() || null : undefined,
            refundTotal,
          },
        });
        if (isClosingTransition) {
          const restockItems = await tx.afterSalesReturnItem.findMany({
            where: {
              returnId: id,
              variantId: { not: null },
              qtyReturn: { gt: 0 },
            },
            select: {
              variantId: true,
              qtyReturn: true,
              sku: true,
              title: true,
            },
          });
          for (const row of restockItems) {
            if (!row.variantId) continue;
            const qty = new Prisma.Decimal(row.qtyReturn ?? 0);
            if (qty.lte(0)) continue;
            await tx.inventoryStock.upsert({
              where: { variantId: row.variantId },
              create: { variantId: row.variantId, onHand: qty, reserved: new Prisma.Decimal(0) },
              update: { onHand: { increment: qty } },
            });
            await tx.inventoryMovement.create({
              data: {
                variantId: row.variantId,
                type: "RETURN_ADD",
                qty,
                unit: "piece",
                note: `After-sales return ${id}: Closed - ${row.sku || row.title || row.variantId}`,
              },
            });
          }
        }
        if (afterSalesStatus) {
          await tx.afterSalesReturnEvent.create({
            data: {
              returnId: id,
              status: afterSalesStatus,
              note: payload.statusNote ? String(payload.statusNote) : `Status moved to ${afterSalesStatus}.`,
            },
          });
        }
        return updated;
      });
      return NextResponse.json({ data }, { status: 200 });
    }

    const nextStatus = payload.status !== undefined ? STATUS_MAP[String(payload.status).toLowerCase()] : undefined;
    if (payload.status !== undefined && !nextStatus) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const reason = payload.reason !== undefined ? String(payload.reason || "").trim() || null : undefined;
    const issueStoreCredit =
      payload.issueStoreCredit !== undefined ? Boolean(payload.issueStoreCredit) : undefined;
    const creditAmount =
      payload.creditAmount !== undefined ? Number(payload.creditAmount ?? 0) : undefined;
    const nextItems: Array<{ id: string; qty: number }> = Array.isArray(payload.items) ? payload.items : [];

    const data = await prisma.$transaction(async (tx) => {
      const existing = await tx.salesReturn.findUnique({
        where: { id },
        select: { id: true, status: true, completedAt: true, issueStoreCredit: true, creditAmount: true },
      });
      if (!existing) throw new Error("RETURN_NOT_FOUND");
      const isLocked = existing.status === "COMPLETED" || existing.status === "CANCELLED";
      if (isLocked && nextItems.length > 0) throw new Error("RETURN_LOCKED");
      if (creditAmount !== undefined && (!Number.isFinite(creditAmount) || creditAmount < 0)) {
        throw new Error("CREDIT_AMOUNT_INVALID");
      }

      if (nextItems.length > 0) {
        for (const item of nextItems) {
          const itemId = String(item.id ?? "").trim();
          const qty = Number(item.qty ?? 0);
          if (!itemId) throw new Error("RETURN_ITEM_ID_REQUIRED");
          if (!Number.isFinite(qty) || qty < 0) throw new Error("RETURN_ITEM_QTY_INVALID");
          await tx.salesReturnItem.update({
            where: { id: itemId },
            data: { qty },
          });
        }
      }

      const updated = await tx.salesReturn.update({
        where: { id },
        data: {
          status: nextStatus,
          reason,
          issueStoreCredit,
          creditAmount: creditAmount !== undefined ? creditAmount : undefined,
        },
      });

      if (updated.status === "COMPLETED") {
        await applyCompletedReturnInventory(tx, { returnId: updated.id });
        await ensureStoreCreditForCompletedReturn(tx, { returnId: updated.id });
      }

      return tx.salesReturn.findUnique({
        where: { id: updated.id },
        include: {
          salesOrder: { select: { id: true, orderNumber: true } },
          fulfillment: { select: { id: true, status: true, type: true } },
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              fulfillmentItem: { select: { id: true, title: true, sku: true, unit: true } },
              variant: { select: { id: true, sku: true, displayName: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof ReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "RETURN_NOT_FOUND") {
      return NextResponse.json({ error: "Return not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "RETURN_LOCKED") {
      return NextResponse.json({ error: "Cannot edit items when return is completed/cancelled." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "RETURN_ITEM_ID_REQUIRED") {
      return NextResponse.json({ error: "Return item id is required." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "RETURN_ITEM_QTY_INVALID") {
      return NextResponse.json({ error: "Return item qty must be >= 0." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "RETURN_ITEM_QTY_EXCEED_PURCHASED") {
      return NextResponse.json({ error: "Return qty cannot exceed purchased qty." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "AFTER_SALES_RETURN_NOT_FOUND") {
      return NextResponse.json({ error: "After-sales return not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "AFTER_SALES_STATUS_INVALID") {
      return NextResponse.json({ error: "Invalid after-sales return status." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "AFTER_SALES_STATUS_FLOW_INVALID") {
      return NextResponse.json({ error: "Invalid status transition." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "CREDIT_AMOUNT_INVALID") {
      return NextResponse.json({ error: "Credit amount must be >= 0." }, { status: 400 });
    }
    console.error("PATCH /api/returns/[id] error:", error);
    return NextResponse.json({ error: "Failed to update return." }, { status: 500 });
  }
}
