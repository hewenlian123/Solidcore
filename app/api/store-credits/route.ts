import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const rows = await prisma.storeCredit.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        customer: { select: { id: true, name: true } },
        salesReturn: { select: { id: true } },
      },
    });

    const data = rows.map((row) => {
      const amount = round2(Number(row.amount ?? 0));
      const usedAmount = round2(Number(row.usedAmount ?? 0));
      const remainingAmount = round2(Math.max(amount - usedAmount, 0));
      return {
        id: row.id,
        customerId: row.customerId,
        customerName: row.customer?.name ?? "-",
        returnId: row.returnId,
        returnNumber: row.salesReturn?.id ?? null,
        amount,
        usedAmount,
        remainingAmount,
        status: row.status,
        notes: row.notes ?? null,
        expiryDate: null as string | null,
        createdAt: row.createdAt,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/store-credits error:", error);
    return NextResponse.json({ error: "Failed to load store credits." }, { status: 500 });
  }
}

