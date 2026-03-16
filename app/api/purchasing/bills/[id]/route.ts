import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const paidAmount = body.paidAmount != null ? Number(body.paidAmount) : undefined;
    const status = typeof body.status === "string" ? body.status.trim() : undefined;

    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

    const updates: { paidAmount?: number; status?: string } = {};
    if (typeof paidAmount === "number" && paidAmount >= 0) {
      const total = Number(po.totalCost);
      updates.paidAmount = Math.min(paidAmount, total);
      updates.status = updates.paidAmount >= total ? "PAID" : updates.paidAmount > 0 ? "PARTIAL_PAID" : po.status;
    }
    if (status) updates.status = status;

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: updates,
      include: { supplier: { select: { name: true } } },
    });

    const amount = Number(updated.totalCost);
    const paid = Number(updated.paidAmount ?? 0);
    const billStatus = amount - paid <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
    return NextResponse.json({
      data: {
        id: updated.id,
        billNumber: updated.poNumber,
        amount,
        paidAmount: paid,
        balance: amount - paid,
        status: billStatus,
      },
    });
  } catch (err) {
    console.error("PATCH /api/purchasing/bills/[id] error:", err);
    return NextResponse.json({ error: "Failed to update bill." }, { status: 500 });
  }
}
