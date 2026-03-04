import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDisplayStatus(status: string) {
  if (status === "DRAFT") return "Draft";
  if (status === "APPROVED") return "Approved";
  if (status === "RECEIVED") return "Received";
  if (status === "REFUNDED") return "Refunded";
  if (status === "CLOSED") return "Closed";
  if (status === "VOID") return "Void";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  return status;
}

type ReturnDomain = "after-sales" | "legacy" | "all";

function resolveDomain(raw: string, salesOrderId: string) {
  const key = raw.trim().toLowerCase();
  if (key === "after-sales" || key === "aftersales" || key === "after_sales") return "after-sales" as ReturnDomain;
  if (key === "legacy") return "legacy" as ReturnDomain;
  if (key === "all") return "all" as ReturnDomain;
  // Backward-compat: historical /api/returns?salesOrderId calls target legacy flow.
  if (salesOrderId) return "legacy" as ReturnDomain;
  return "after-sales" as ReturnDomain;
}

async function generateNextAfterSalesReturnNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getUTCFullYear();
  const prefix = `R-${year}-`;
  const latest = await tx.afterSalesReturn.findFirst({
    where: { returnNumber: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { returnNumber: true },
  });
  const lastSerial = Number(String(latest?.returnNumber ?? "").split("-").pop() ?? 0);
  const nextSerial = Number.isFinite(lastSerial) ? lastSerial + 1 : 1;
  return `${prefix}${String(nextSerial).padStart(4, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const salesOrderId = String(request.nextUrl.searchParams.get("salesOrderId") ?? "").trim();
    const invoiceId = String(request.nextUrl.searchParams.get("invoiceId") ?? "").trim();
    const search = String(request.nextUrl.searchParams.get("search") ?? "").trim();
    const statusFilter = String(request.nextUrl.searchParams.get("status") ?? "").trim().toUpperCase();
    const domain = resolveDomain(String(request.nextUrl.searchParams.get("domain") ?? ""), salesOrderId);
    if (domain !== "legacy") {
      const allowedStatuses = ["DRAFT", "APPROVED", "RECEIVED", "REFUNDED", "CLOSED", "VOID"] as const;
      const normalizedStatus = allowedStatuses.includes(statusFilter as (typeof allowedStatuses)[number])
        ? (statusFilter as (typeof allowedStatuses)[number])
        : null;
      const rows = await prisma.afterSalesReturn.findMany({
        where: {
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
          ...(salesOrderId ? { salesOrderId } : {}),
          ...(invoiceId ? { invoiceId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          customer: { select: { id: true, name: true } },
          salesOrder: { select: { id: true, orderNumber: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      });
      const data = rows
        .map((row) => ({
          id: row.id,
          returnNumber: row.returnNumber,
          customerName: row.customer.name,
          salesOrderId: row.salesOrder?.id ?? null,
          salesOrderNumber: row.salesOrder?.orderNumber ?? null,
          invoiceId: row.invoice?.id ?? null,
          invoiceNumber: row.invoice?.invoiceNumber ?? null,
          type: row.type,
          status: row.status,
          statusLabel: toDisplayStatus(row.status),
          domain: "AFTER_SALES" as const,
          refundTotal: round2(Number(row.refundTotal ?? 0)),
          createdAt: row.createdAt,
        }))
        .filter((row) => {
          if (!search) return true;
          const q = search.toLowerCase();
          return (
            row.returnNumber.toLowerCase().includes(q) ||
            row.customerName.toLowerCase().includes(q) ||
            String(row.salesOrderNumber ?? "").toLowerCase().includes(q) ||
            String(row.invoiceNumber ?? "").toLowerCase().includes(q)
          );
        });
      if (domain === "after-sales") {
        return NextResponse.json({ data }, { status: 200 });
      }
      const legacyRows = await prisma.salesReturn.findMany({
        where: {
          ...(salesOrderId ? { salesOrderId } : {}),
          ...(statusFilter === "DRAFT" || statusFilter === "COMPLETED" || statusFilter === "CANCELLED"
            ? { status: statusFilter as "DRAFT" | "COMPLETED" | "CANCELLED" }
            : {}),
        },
        include: {
          salesOrder: { select: { id: true, orderNumber: true, customer: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      const merged = [
        ...data,
        ...legacyRows.map((row) => ({
          id: row.id,
          returnNumber: row.id,
          customerName: row.salesOrder.customer?.name ?? "Unknown",
          salesOrderId: row.salesOrderId,
          salesOrderNumber: row.salesOrder.orderNumber,
          invoiceId: null,
          invoiceNumber: null,
          type: "RETURN",
          status: row.status,
          statusLabel: toDisplayStatus(row.status),
          domain: "LEGACY" as const,
          refundTotal: 0,
          createdAt: row.createdAt,
        })),
      ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      return NextResponse.json({ data: merged }, { status: 200 });
    }

    const data = await prisma.salesReturn.findMany({
      where: {
        ...(salesOrderId ? { salesOrderId } : {}),
        ...(statusFilter === "DRAFT" || statusFilter === "COMPLETED" || statusFilter === "CANCELLED"
          ? { status: statusFilter as "DRAFT" | "COMPLETED" | "CANCELLED" }
          : {}),
      },
      include: {
        salesOrder: { select: { id: true, orderNumber: true, customer: { select: { name: true } } } },
        fulfillment: { select: { id: true, status: true, type: true } },
        items: { select: { id: true, qty: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const rows = data
      .map((row) => ({
        id: row.id,
        returnNumber: row.id,
        customerName: row.salesOrder.customer?.name ?? "Unknown",
        salesOrderId: row.salesOrderId,
        salesOrderNumber: row.salesOrder.orderNumber,
        invoiceId: null,
        invoiceNumber: null,
        type: "RETURN",
        status: row.status,
        statusLabel: toDisplayStatus(row.status),
        domain: "LEGACY" as const,
        refundTotal: 0,
        createdAt: row.createdAt,
        fulfillment: row.fulfillment,
        items: row.items,
      }))
      .filter((row) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          row.returnNumber.toLowerCase().includes(q) ||
          row.customerName.toLowerCase().includes(q) ||
          String(row.salesOrderNumber ?? "").toLowerCase().includes(q)
        );
      });
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (error) {
    console.error("GET /api/returns error:", error);
    return NextResponse.json({ error: "Failed to load returns." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const payload = await request.json();
    const customerId = String(payload?.customerId ?? "").trim();
    const domain = resolveDomain(String(payload?.domain ?? ""), String(payload?.salesOrderId ?? "").trim());
    const invoiceId = String(payload?.invoiceId ?? "").trim();
    const normalizedType = String(payload?.type ?? payload?.returnType ?? "RETURN").trim().toUpperCase() === "EXCHANGE"
      ? "EXCHANGE"
      : "RETURN";
    const incomingItemsRaw = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.draftItems)
        ? payload.draftItems
        : [];
    const incomingItems = incomingItemsRaw.map((item: any) => ({
      variantId: item?.variantId ? String(item.variantId) : null,
      lineItemId: item?.lineItemId ? String(item.lineItemId) : item?.itemId ? String(item.itemId) : null,
      title: item?.title ? String(item.title) : null,
      sku: item?.sku ? String(item.sku) : null,
      qtyPurchased: Number(item?.qtyPurchased ?? 0),
      qtyReturn: Number(item?.qtyReturn ?? 0),
      unitPrice: Number(item?.unitPrice ?? 0),
      reason: item?.reason ? String(item.reason) : "",
      condition: item?.condition ? String(item.condition) : "",
    }));

    if (domain === "after-sales" && !customerId) {
      return NextResponse.json({ error: "Customer is required." }, { status: 400 });
    }

    if (domain !== "legacy" && customerId) {
      const created = await prisma.$transaction(async (tx) => {
        let linkedInvoice: {
          id: string;
          salesOrderId: string;
          customerId: string | null;
          items: Array<{
            id: string;
            variantId: string | null;
            titleSnapshot: string | null;
            skuSnapshot: string | null;
            qty: Prisma.Decimal;
            unitPrice: Prisma.Decimal;
          }>;
        } | null = null;
        if (invoiceId) {
          linkedInvoice = await tx.invoice.findUnique({
            where: { id: invoiceId },
            select: {
              id: true,
              salesOrderId: true,
              customerId: true,
              items: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  variantId: true,
                  titleSnapshot: true,
                  skuSnapshot: true,
                  qty: true,
                  unitPrice: true,
                },
              },
            },
          });
          if (!linkedInvoice) throw new Error("INVOICE_NOT_FOUND");
        }

        const salesOrderIdRaw = String(payload?.salesOrderId ?? "").trim();
        const salesOrderId = salesOrderIdRaw || linkedInvoice?.salesOrderId || null;
        const so = salesOrderId
          ? await tx.salesOrder.findUnique({
              where: { id: salesOrderId },
              select: {
                id: true,
                customerId: true,
                items: {
                  orderBy: { createdAt: "asc" },
                  select: {
                    id: true,
                    variantId: true,
                    productTitle: true,
                    productSku: true,
                    quantity: true,
                    unitPrice: true,
                  },
                },
              },
            })
          : null;
        if (salesOrderId && !so) throw new Error("SALES_ORDER_NOT_FOUND");
        if (so && so.customerId !== customerId) throw new Error("CUSTOMER_MISMATCH");

        const returnNumber = await generateNextAfterSalesReturnNumber(tx);
        const nextReturn = await tx.afterSalesReturn.create({
          data: {
            returnNumber,
            customerId,
            salesOrderId: so?.id ?? null,
            invoiceId: linkedInvoice?.id ?? null,
            type: normalizedType,
            refundMethod:
              String(payload?.refundMethod ?? "NO_REFUND").trim().toUpperCase() === "STORE_CREDIT"
                ? "STORE_CREDIT"
                : String(payload?.refundMethod ?? "NO_REFUND").trim().toUpperCase() === "REFUND_PAYMENT"
                  ? "REFUND_PAYMENT"
                  : "NO_REFUND",
            notes: String(payload?.notes ?? "").trim() || null,
            status: "DRAFT",
          },
        });

        const sourceItems =
          incomingItems.length > 0
            ? incomingItems
            : linkedInvoice?.items.length
              ? linkedInvoice.items.map((item) => ({
                  lineItemId: item.id,
                  variantId: item.variantId,
                  title: item.titleSnapshot || "Invoice Item",
                  sku: item.skuSnapshot || null,
                  qtyPurchased: Number(item.qty ?? 0),
                  qtyReturn: 0,
                  unitPrice: Number(item.unitPrice ?? 0),
                  reason: "",
                  condition: "",
                }))
              : so?.items.map((item) => ({
                  lineItemId: item.id,
                  variantId: item.variantId,
                  title: item.productTitle || "Sales Order Item",
                  sku: item.productSku || null,
                  qtyPurchased: Number(item.quantity ?? 0),
                  qtyReturn: 0,
                  unitPrice: Number(item.unitPrice ?? 0),
                  reason: "",
                  condition: "",
                })) ?? [];

        if (sourceItems.length > 0) {
          await tx.afterSalesReturnItem.createMany({
            data: sourceItems.map((item: any) => {
              const qtyPurchased = Number(item.qtyPurchased ?? 0);
              const qtyReturn = Number(item.qtyReturn ?? 0);
              const clampedQtyReturn = Math.max(0, Math.min(qtyReturn, qtyPurchased > 0 ? qtyPurchased : qtyReturn));
              const unitPrice = Number(item.unitPrice ?? 0);
              return {
                returnId: nextReturn.id,
                lineItemId: item.lineItemId ? String(item.lineItemId) : null,
                variantId: item.variantId ? String(item.variantId) : null,
                title: String(item.title ?? "Item"),
                sku: item.sku ? String(item.sku) : null,
                qtyPurchased: qtyPurchased > 0 ? qtyPurchased : null,
                qtyReturn: clampedQtyReturn,
                unitPrice: unitPrice >= 0 ? unitPrice : 0,
                reason: item.reason ? String(item.reason) : null,
                condition: item.condition ? String(item.condition) : null,
                lineRefund: round2((unitPrice >= 0 ? unitPrice : 0) * clampedQtyReturn),
              };
            }),
          });
        }

        const aggregates = await tx.afterSalesReturnItem.aggregate({
          where: { returnId: nextReturn.id },
          _sum: { lineRefund: true },
        });
        await tx.afterSalesReturn.update({
          where: { id: nextReturn.id },
          data: { refundTotal: round2(Number(aggregates._sum.lineRefund ?? 0)) },
        });
        await tx.afterSalesReturnEvent.create({
          data: { returnId: nextReturn.id, status: "DRAFT", note: "Return draft created." },
        });
        return nextReturn;
      });
      return NextResponse.json({ data: created }, { status: 201 });
    }

    const salesOrderId = String(payload?.salesOrderId ?? "").trim();
    const requestedFulfillmentId = String(payload?.fulfillmentId ?? "").trim();
    const reason = String(payload?.reason ?? "").trim() || null;
    if (!salesOrderId) {
      return NextResponse.json({ error: "salesOrderId is required." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({
        where: { id: salesOrderId },
        select: { id: true },
      });
      if (!so) throw new Error("SALES_ORDER_NOT_FOUND");

      let fulfillmentId: string | null = null;
      if (requestedFulfillmentId) {
        const fulfillment = await tx.salesOrderFulfillment.findFirst({
          where: { id: requestedFulfillmentId, salesOrderId },
          select: { id: true },
        });
        if (!fulfillment) throw new Error("FULFILLMENT_NOT_FOUND");
        fulfillmentId = fulfillment.id;
      } else {
        const fulfillment = await tx.salesOrderFulfillment.findUnique({
          where: { salesOrderId },
          select: { id: true },
        });
        fulfillmentId = fulfillment?.id ?? null;
      }

      const nextReturn = await tx.salesReturn.create({
        data: {
          salesOrderId,
          fulfillmentId,
          status: "DRAFT",
          reason,
        },
      });

      if (fulfillmentId) {
        const fulfillmentItems = await tx.salesOrderFulfillmentItem.findMany({
          where: { fulfillmentId, variantId: { not: null } },
          select: { id: true, variantId: true },
          orderBy: { createdAt: "asc" },
        });
        if (fulfillmentItems.length > 0) {
          await tx.salesReturnItem.createMany({
            data: fulfillmentItems.map((item) => ({
              returnId: nextReturn.id,
              fulfillmentItemId: item.id,
              variantId: String(item.variantId),
              qty: 0,
            })),
          });
        }
      }

      return nextReturn;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "SALES_ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "FULFILLMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Fulfillment not found for this sales order." }, { status: 404 });
    }
    console.error("POST /api/returns error:", error);
    return NextResponse.json({ error: "Failed to create return." }, { status: 500 });
  }
}
