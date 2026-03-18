import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export const dynamic = "force-dynamic";

export type BillRow = {
  id: string;
  billNumber: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: "unpaid" | "partial" | "paid";
  dueDate: string | null;
  orderDate: string;
};

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const statusFilter = request.nextUrl.searchParams.get("status") ?? "ALL";

    const pos = await prisma.purchaseOrder.findMany({
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const rows: BillRow[] = pos.map((po) => {
      const amount = Number(po.totalCost);
      const paid = 0; // paid_amount column not in DB; use 0 until column exists
      const balance = amount - paid;
      const status: BillRow["status"] =
        po.status === "PAID" ? "paid" : po.status === "PARTIAL_PAID" ? "partial" : balance <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
      return {
        id: po.id,
        billNumber: po.poNumber,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        supplierName: po.supplier?.name ?? "-",
        amount,
        paidAmount: paid,
        balance,
        status,
        dueDate: po.expectedArrival?.toISOString() ?? null,
        orderDate: po.orderDate.toISOString(),
      };
    });

    const filtered = statusFilter === "ALL" ? rows : rows.filter((r) => r.status === statusFilter);
    return NextResponse.json({ data: filtered });
  } catch (err) {
    console.error("GET /api/purchasing/bills error:", err);
    return NextResponse.json({ error: "Failed to fetch vendor bills." }, { status: 500 });
  }
}
