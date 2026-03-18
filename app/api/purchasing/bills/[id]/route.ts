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
    const status = typeof body.status === "string" ? body.status.trim() : undefined;
    const paidAmount = body.paidAmount != null ? Number(body.paidAmount) : undefined;

    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) return NextResponse.json({ error: "Bill not found." }, { status: 404 });

    // paid_amount column not in DB; persist only status (e.g. PAID when user marks paid)
    const updates: { status?: string } = {};
    if (status) updates.status = status;
    else if (typeof paidAmount === "number" && paidAmount >= 0) {
      const total = Number(po.totalCost);
      updates.status = paidAmount >= total ? "PAID" : paidAmount > 0 ? "PARTIAL_PAID" : po.status;
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: updates,
      include: { supplier: { select: { name: true } } },
    });

    const amount = Number(updated.totalCost);
    const paid = 0; // paid_amount column not in DB
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
