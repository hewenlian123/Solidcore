import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

type ReceiveInput = {
  purchaseOrderItemId: string;
  variantId: string;
  acceptedQty: number;
  damagedQty: number;
  holdQty: number;
  shortageQty: number;
  wrongItemQty: number;
  closedShortQty: number;
  exceptionNote: string;
};

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeUnit(
  rawUnit: string | null | undefined,
  hasBoxCoverage: boolean,
) {
  if (hasBoxCoverage) return "box";
  const unit = String(rawUnit ?? "")
    .trim()
    .toLowerCase();
  if (
    unit.includes("sqft") ||
    unit === "sf" ||
    unit === "ft2" ||
    unit === "sqm"
  ) {
    return "sqft";
  }
  if (unit.includes("piece") || unit.includes("pcs") || unit === "pc") {
    return "piece";
  }
  return unit || "piece";
}

function quantity(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function normalizeItems(raw: unknown): ReceiveInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    purchaseOrderItemId: String(
      (item as { purchaseOrderItemId?: unknown })?.purchaseOrderItemId ?? "",
    ).trim(),
    variantId: String(
      (item as { variantId?: unknown })?.variantId ?? "",
    ).trim(),
    acceptedQty: quantity(
      (item as { acceptedQty?: unknown; qty?: unknown })?.acceptedQty ??
        (item as { qty?: unknown })?.qty,
    ),
    damagedQty: quantity((item as { damagedQty?: unknown })?.damagedQty),
    holdQty: quantity((item as { holdQty?: unknown })?.holdQty),
    shortageQty: quantity((item as { shortageQty?: unknown })?.shortageQty),
    wrongItemQty: quantity((item as { wrongItemQty?: unknown })?.wrongItemQty),
    closedShortQty: quantity(
      (item as { closedShortQty?: unknown })?.closedShortQty,
    ),
    exceptionNote: String(
      (item as { exceptionNote?: unknown })?.exceptionNote ?? "",
    ).trim(),
  }));
}

function fingerprintFor(purchaseOrderId: string, items: ReceiveInput[]) {
  const normalized = items
    .map((item) => ({
      ...item,
      purchaseOrderItemId: item.purchaseOrderItemId,
      variantId: item.variantId,
    }))
    .sort((left, right) =>
      `${left.purchaseOrderItemId}:${left.variantId}`.localeCompare(
        `${right.purchaseOrderItemId}:${right.variantId}`,
      ),
    );
  return createHash("sha256")
    .update(JSON.stringify({ purchaseOrderId, items: normalized }))
    .digest("hex");
}

async function materializeLegacyItems(
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
  notes: string | null,
) {
  const existing = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId },
    orderBy: { createdAt: "asc" },
  });
  if (existing.length > 0) return existing;

  const legacy = safeJsonParse(notes);
  const draftItems = Array.isArray(legacy?.items) ? legacy.items : [];
  const variantIds = draftItems
    .map((item: { variantId?: unknown }) =>
      String(item?.variantId ?? "").trim(),
    )
    .filter(Boolean);
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      sku: true,
      displayName: true,
      description: true,
      boxSqft: true,
      product: { select: { name: true, title: true, unit: true } },
    },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  for (const item of draftItems) {
    const variantId = String(item?.variantId ?? "").trim();
    const variant = byId.get(variantId);
    const expectedQty = quantity(item?.suggestedQtyBoxes);
    if (!variant || !Number.isFinite(expectedQty) || expectedQty <= 0) continue;
    await tx.purchaseOrderItem.create({
      data: {
        purchaseOrderId,
        variantId,
        sku: String(item?.sku ?? variant.sku).trim() || variant.sku,
        title:
          String(item?.variantName ?? "").trim() ||
          variant.displayName ||
          variant.description ||
          variant.product.title ||
          variant.product.name,
        unit: normalizeUnit(
          variant.product.unit,
          Number(variant.boxSqft ?? 0) > 0,
        ),
        expectedQty,
        unitCost: quantity(item?.unitCost) || 0,
        notes: String(item?.lineNotes ?? "").trim() || null,
      },
    });
  }

  return tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId },
    orderBy: { createdAt: "asc" },
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`,
      );
      const po = await tx.purchaseOrder.findUnique({
        where: { id },
        select: { id: true, poNumber: true, status: true, notes: true },
      });
      if (!po) throw new Error("PO_NOT_FOUND");

      let lines = await materializeLegacyItems(tx, po.id, po.notes);
      if (lines.length === 0) throw new Error("NO_ITEMS");
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM purchase_order_items WHERE purchase_order_id = ${po.id} ORDER BY created_at FOR UPDATE`,
      );
      lines = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
        orderBy: { createdAt: "asc" },
      });

      let inputs = normalizeItems(payload?.items);
      if (inputs.length === 0) {
        inputs = lines.map((line) => ({
          purchaseOrderItemId: line.id,
          variantId: line.variantId,
          acceptedQty: Math.max(
            Number(line.expectedQty) -
              Number(line.receivedQty) -
              Number(line.closedShortQty),
            0,
          ),
          damagedQty: 0,
          holdQty: 0,
          shortageQty: 0,
          wrongItemQty: 0,
          closedShortQty: 0,
          exceptionNote: "",
        }));
      }
      if (
        inputs.some((input) =>
          [
            input.acceptedQty,
            input.damagedQty,
            input.holdQty,
            input.shortageQty,
            input.wrongItemQty,
            input.closedShortQty,
          ].some((value) => !Number.isFinite(value) || value < 0),
        )
      ) {
        throw new Error("INVALID_QUANTITY");
      }

      const requestFingerprint = fingerprintFor(po.id, inputs);
      const idempotencyKey =
        String(
          request.headers.get("Idempotency-Key") ??
            payload?.idempotencyKey ??
            "",
        ).trim() || `receipt:${po.id}:${requestFingerprint}`;
      const existingReceipt = await tx.purchaseReceipt.findUnique({
        where: { idempotencyKey },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      if (existingReceipt) {
        if (
          existingReceipt.purchaseOrderId !== po.id ||
          existingReceipt.requestFingerprint !== requestFingerprint
        ) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        return {
          receipt: existingReceipt,
          poId: po.id,
          poNumber: po.poNumber,
          status: po.status,
          idempotent: true,
        };
      }

      const lineById = new Map(lines.map((line) => [line.id, line]));
      const lineByVariant = new Map(
        lines.map((line) => [line.variantId, line]),
      );
      const prepared = inputs.map((input) => {
        const line =
          lineById.get(input.purchaseOrderItemId) ??
          lineByVariant.get(input.variantId);
        if (!line) throw new Error("INVALID_ITEM");
        const expectedQty = Number(line.expectedQty);
        const priorReceivedQty = Number(line.receivedQty);
        const priorClosedShortQty = Number(line.closedShortQty);
        const remainingBefore = Math.max(
          expectedQty - priorReceivedQty - priorClosedShortQty,
          0,
        );
        const physicalQty =
          input.acceptedQty + input.damagedQty + input.holdQty;
        const overageQty = Math.max(physicalQty - remainingBefore, 0);
        const closeableAfterReceipt = Math.max(
          remainingBefore - Math.min(physicalQty, remainingBefore),
          0,
        );
        if (input.closedShortQty > closeableAfterReceipt) {
          throw new Error("CLOSED_SHORT_EXCEEDS_REMAINING");
        }
        const hasException =
          input.damagedQty > 0 ||
          input.holdQty > 0 ||
          input.shortageQty > 0 ||
          input.wrongItemQty > 0 ||
          overageQty > 0 ||
          input.closedShortQty > 0;
        if (hasException && !input.exceptionNote) {
          throw new Error("EXCEPTION_NOTE_REQUIRED");
        }
        if ((overageQty > 0 || input.closedShortQty > 0) && role !== "ADMIN") {
          throw new Error("OWNER_APPROVAL_REQUIRED");
        }
        const newReceivedQty = priorReceivedQty + physicalQty;
        const newClosedShortQty = priorClosedShortQty + input.closedShortQty;
        const remainingQty = Math.max(
          expectedQty - newReceivedQty - newClosedShortQty,
          0,
        );
        return {
          line,
          input,
          expectedQty,
          priorReceivedQty,
          physicalQty,
          overageQty,
          newReceivedQty,
          newClosedShortQty,
          remainingQty,
        };
      });
      if (
        !prepared.some(
          (item) =>
            item.physicalQty > 0 ||
            item.input.shortageQty > 0 ||
            item.input.wrongItemQty > 0 ||
            item.input.closedShortQty > 0,
        )
      ) {
        throw new Error("NO_RECEIPT_EFFECT");
      }

      const approvalRequired = prepared.some(
        (item) => item.overageQty > 0 || item.input.closedShortQty > 0,
      );
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: po.id,
          idempotencyKey,
          requestFingerprint,
          actor: role,
          approvalActor: approvalRequired ? role : null,
          notes: String(payload?.notes ?? "").trim() || null,
        },
      });

      for (const item of prepared) {
        const receiptItem = await tx.purchaseReceiptItem.create({
          data: {
            receiptId: receipt.id,
            purchaseOrderItemId: item.line.id,
            variantId: item.line.variantId,
            sku: item.line.sku,
            title: item.line.title,
            unit: item.line.unit,
            expectedQty: item.expectedQty,
            priorReceivedQty: item.priorReceivedQty,
            acceptedQty: item.input.acceptedQty,
            damagedQty: item.input.damagedQty,
            holdQty: item.input.holdQty,
            overageQty: item.overageQty,
            shortageQty: item.input.shortageQty,
            wrongItemQty: item.input.wrongItemQty,
            closedShortQty: item.input.closedShortQty,
            newReceivedQty: item.newReceivedQty,
            remainingQty: item.remainingQty,
            availableImpact: item.input.acceptedQty,
            exceptionNote: item.input.exceptionNote || null,
          },
        });

        if (item.physicalQty > 0) {
          await tx.$queryRaw(
            Prisma.sql`SELECT variant_id FROM inventory_stock WHERE variant_id = ${item.line.variantId} FOR UPDATE`,
          );
          const currentStock = await tx.inventoryStock.findUnique({
            where: { variantId: item.line.variantId },
            select: { incoming: true },
          });
          await tx.inventoryStock.upsert({
            where: { variantId: item.line.variantId },
            create: {
              variantId: item.line.variantId,
              onHand: item.physicalQty,
              reserved: 0,
              hold: item.input.damagedQty + item.input.holdQty,
              incoming: 0,
              inTransit: 0,
            },
            update: {
              onHand: { increment: item.physicalQty },
              hold: {
                increment: item.input.damagedQty + item.input.holdQty,
              },
              incoming: Math.max(
                Number(currentStock?.incoming ?? 0) -
                  Math.min(item.physicalQty, item.expectedQty),
                0,
              ),
            },
          });
        }

        const movements = [
          {
            type: "RECEIVE_ACCEPTED",
            qty: item.input.acceptedQty,
            note: `PO ${po.poNumber} accepted by ${role}`,
          },
          {
            type: "RECEIVE_HOLD_DAMAGED",
            qty: item.input.damagedQty,
            note: `PO ${po.poNumber} damaged; entered Hold by ${role}`,
          },
          {
            type: "RECEIVE_HOLD",
            qty: item.input.holdQty,
            note: `PO ${po.poNumber} entered Hold by ${role}`,
          },
        ].filter((movement) => movement.qty > 0);
        for (const movement of movements) {
          await tx.inventoryMovement.create({
            data: {
              variantId: item.line.variantId,
              purchaseReceiptItemId: receiptItem.id,
              type: movement.type,
              qty: movement.qty,
              unit: item.line.unit,
              note: movement.note,
            },
          });
        }

        await tx.purchaseOrderItem.update({
          where: { id: item.line.id },
          data: {
            receivedQty: item.newReceivedQty,
            closedShortQty: item.newClosedShortQty,
          },
        });
      }

      const reconciledLines = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
        select: {
          expectedQty: true,
          receivedQty: true,
          closedShortQty: true,
        },
      });
      const complete = reconciledLines.every(
        (line) =>
          Math.max(
            Number(line.expectedQty) -
              Number(line.receivedQty) -
              Number(line.closedShortQty),
            0,
          ) === 0,
      );
      const nextStatus = complete ? "RECEIVED" : "PARTIAL";
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: nextStatus },
      });
      const posted = await tx.purchaseReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      return {
        receipt: posted,
        poId: po.id,
        poNumber: po.poNumber,
        status: nextStatus,
        idempotent: false,
      };
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const mapped: Record<string, { status: number; error: string }> = {
      PO_NOT_FOUND: { status: 404, error: "Purchase order not found." },
      NO_ITEMS: { status: 400, error: "This PO has no receivable items." },
      INVALID_ITEM: {
        status: 400,
        error: "Receipt items must belong to this purchase order.",
      },
      INVALID_QUANTITY: {
        status: 400,
        error:
          "Receiving quantities must be finite numbers greater than or equal to 0.",
      },
      CLOSED_SHORT_EXCEEDS_REMAINING: {
        status: 400,
        error:
          "Closed Short cannot exceed the quantity remaining after this receipt.",
      },
      EXCEPTION_NOTE_REQUIRED: {
        status: 400,
        error:
          "An exception note is required for Damage, Hold, Overage, Shortage, Wrong Item, or Closed Short.",
      },
      OWNER_APPROVAL_REQUIRED: {
        status: 409,
        error:
          "Owner/Manager approval is required to accept an over-receipt or close quantity as Closed Short.",
      },
      NO_RECEIPT_EFFECT: {
        status: 400,
        error: "Enter an accepted quantity or receiving exception.",
      },
      IDEMPOTENCY_CONFLICT: {
        status: 409,
        error:
          "This receipt request key was already used with different quantities.",
      },
    };
    if (mapped[message]) {
      return NextResponse.json(
        { error: mapped[message].error },
        { status: mapped[message].status },
      );
    }
    console.error("POST /api/purchase-orders/[id]/receive error:", error);
    return NextResponse.json(
      { error: "Failed to receive purchase order." },
      { status: 500 },
    );
  }
}
